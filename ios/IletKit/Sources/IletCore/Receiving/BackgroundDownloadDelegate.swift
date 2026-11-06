import Foundation
import os

/// The downloads session's delegate. iOS may call it in a later run of the app than the one that
/// started a download, so it relies only on each task's record: the pin, the file's name and its
/// size. A file reaches the received files only when it is complete, and only then does the
/// ledger remember it (THREAT_MODEL.md, T46).
final class BackgroundDownloadDelegate: NSObject, URLSessionDownloadDelegate, Sendable {
    /// The PC's error answers are a few hundred bytes of JSON; anything longer is not its answer.
    private static let maxAnswerBytes: Int64 = 64 * 1_024

    private struct State {
        /// What became of each finished download: the name it was saved under, or why not.
        var kept: [Int: Result<String, IletError>] = [:]
        var rejectedTasks: Set<Int> = []
    }

    private let received: ReceivedFiles
    private let ledger: DownloadLedger
    private let handlers: BackgroundDownloadHandlers
    private let state = OSAllocatedUnfairLock(initialState: State())

    init(received: ReceivedFiles, ledger: DownloadLedger, handlers: BackgroundDownloadHandlers) {
        self.received = received
        self.ledger = ledger
        self.handlers = handlers
    }

    /// Only the task-level challenge is implemented, so URLSession asks here for every new TLS
    /// connection too, with the task that needs it and so with that task's pin.
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        // ilet servers never ask for any other kind of authentication.
        guard
            challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
            let trust = challenge.protectionSpace.serverTrust
        else {
            return (.cancelAuthenticationChallenge, nil)
        }
        guard Self.accepts(trust, for: task) else {
            let taskID = task.taskIdentifier
            state.withLock { _ = $0.rejectedTasks.insert(taskID) }
            Log.network.error("server certificate does not match the pinned fingerprint")
            return (.cancelAuthenticationChallenge, nil)
        }
        return (.useCredential, URLCredential(trust: trust))
    }

    /// The PC must present the certificate pinned for this task. A task without a readable
    /// record is refused.
    static func accepts(_ trust: SecTrust, for task: URLSessionTask) -> Bool {
        guard let download = OutboxDownload(task) else {
            return false
        }
        return CertificatePinning.leafCertificate(of: trust, matches: download.fingerprint)
    }

    func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
    ) {
        guard let download = OutboxDownload(downloadTask), download.sizeBytes > 0 else {
            return
        }
        handlers.progress(download, min(1, Double(totalBytesWritten) / Double(download.sizeBytes)))
    }

    /// iOS deletes the file at `location` as soon as this returns, so it is checked, and saved if
    /// it is complete, right here.
    func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard let download = OutboxDownload(downloadTask) else {
            Log.network.error("background download without a readable record")
            return
        }
        let kept = keep(
            location, of: download,
            statusCode: (downloadTask.response as? HTTPURLResponse)?.statusCode,
            redirected: downloadTask.currentRequest?.url != downloadTask.originalRequest?.url)
        let taskID = downloadTask.taskIdentifier
        state.withLock { $0.kept[taskID] = kept }
    }

    /// Saves a finished download only if it is complete: answered with `200`, not redirected, and
    /// of exactly the listed size. An error answer is read for its code; anything else is left
    /// for iOS to delete.
    func keep(
        _ location: URL, of download: OutboxDownload, statusCode: Int?, redirected: Bool
    ) -> Result<String, IletError> {
        let verdict = FinishedDownload.verdict(
            statusCode: statusCode, redirected: redirected, receivedBytes: Self.size(of: location),
            expectedBytes: download.sizeBytes)
        switch verdict {
        case .complete:
            return save(location, as: download)
        case .answer(let errorStatus):
            let answer = Self.answer(at: location)
            return .failure(FinishedDownload.error(statusCode: errorStatus, answer: answer))
        case .unusable:
            Log.network.error("discarded a download that was redirected, cut short or too long")
            return .failure(.unexpectedResponse)
        }
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?
    ) {
        let taskID = task.taskIdentifier
        let kept = state.withLock { $0.kept.removeValue(forKey: taskID) }
        let rejected = state.withLock { $0.rejectedTasks.remove(taskID) != nil }
        guard let download = OutboxDownload(task) else {
            Log.network.error("background download without a readable record")
            return
        }
        if let error, !rejected, kept == nil {
            Log.network.error("background download failed: \(error.logSummary, privacy: .public)")
        }
        let result = FinishedDownload.result(
            kept: kept, error: error, certificateRejected: rejected)
        handlers.completion(download, result)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        handlers.eventsFinished()
    }

    /// The ledger hears of a file only once it is saved: a failure in between brings the file a
    /// second time, rather than never.
    private func save(_ location: URL, as download: OutboxDownload) -> Result<String, IletError> {
        do {
            let fileName = try received.add(location, named: download.fileName)
            ledger.remember(download.fileID, from: download.desktopID)
            return .success(fileName)
        } catch {
            return .failure(.fileNotSaved)
        }
    }

    /// Read from the file's resource values, which do not include its dates.
    private static func size(of file: URL) -> Int64? {
        guard let bytes = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize else {
            return nil
        }
        return Int64(bytes)
    }

    /// The PC's error answer, which iOS wrote to a file like any other body.
    private static func answer(at location: URL) -> Data {
        guard let bytes = size(of: location), bytes <= maxAnswerBytes,
            let answer = try? Data(contentsOf: location)
        else {
            return Data()
        }
        return answer
    }
}

/// What a finished download means, from what iOS reports about it.
enum FinishedDownload {
    enum Verdict: Equatable {
        /// Complete: the file may be saved.
        case complete
        /// The PC answered with an error, whose code is in the body.
        case answer(statusCode: Int)
        /// Redirected, cut short, too long, or an answer that this route does not have.
        case unusable
    }

    private static let okStatusCode = 200
    private static let successStatusCodes = 200..<300

    static func verdict(
        statusCode: Int?, redirected: Bool, receivedBytes: Int64?, expectedBytes: Int64
    ) -> Verdict {
        // The protocol never redirects, but background sessions follow redirects without asking,
        // so a redirected download is discarded (THREAT_MODEL.md, T2).
        guard !redirected, let statusCode else {
            return .unusable
        }
        if statusCode == okStatusCode {
            return receivedBytes == expectedBytes ? .complete : .unusable
        }
        guard !successStatusCodes.contains(statusCode) else {
            return .unusable
        }
        return .answer(statusCode: statusCode)
    }

    static func error(statusCode: Int, answer: Data) -> IletError {
        switch ServerAnswer.check(statusCode: statusCode, body: answer) {
        case .success:
            return .unexpectedResponse
        case .failure(let error):
            return error
        }
    }

    /// A saved file counts, whatever iOS reports after it; otherwise a refused certificate, then
    /// a failed transfer, then what the check of the finished download found.
    static func result(
        kept: Result<String, IletError>?, error: (any Error)?, certificateRejected: Bool
    ) -> BackgroundDownloadResult {
        if case .success(let fileName) = kept {
            return .saved(fileName: fileName)
        }
        if certificateRejected {
            return .failed(.certificateMismatch)
        }
        if let error {
            return .failed(failure(for: error))
        }
        if case .failure(let reason) = kept {
            return .failed(reason)
        }
        return .failed(.unexpectedResponse)
    }

    /// A file that iOS could not write counts as not saved; other failures are the connection's.
    static func failure(for error: any Error) -> IletError {
        guard let code = (error as? URLError)?.code else {
            return IletError(connectionError: error)
        }
        switch code {
        case .cannotCreateFile, .cannotOpenFile, .cannotWriteToFile, .cannotMoveFile:
            return .fileNotSaved
        default:
            return IletError(connectionError: error)
        }
    }
}

import Foundation
import os

/// The background session's delegate. iOS calls it in whichever process holds the session, the
/// share sheet or the app, so it relies on nothing that only one of them knows: each task's pin
/// and copy come from the task's own record.
final class BackgroundUploadDelegate: NSObject, URLSessionDataDelegate, Sendable {
    /// The PC answers with a few hundred bytes of JSON; anything longer is not its answer.
    private static let maxAnswerBytes = 64 * 1024

    private struct State {
        var answers: [Int: Data] = [:]
        var rejectedTasks: Set<Int> = []
        var isClosing = false
        var hasEnded = false
    }

    private let copies: TemporaryFiles
    private let handlers: BackgroundUploadHandlers
    private let state = OSAllocatedUnfairLock(initialState: State())

    init(copies: TemporaryFiles, handlers: BackgroundUploadHandlers) {
        self.copies = copies
        self.handlers = handlers
    }

    /// No new upload may start once the session is letting go.
    var isClosed: Bool {
        state.withLock { $0.isClosing || $0.hasEnded }
    }

    var hasEnded: Bool {
        state.withLock { $0.hasEnded }
    }

    func close() {
        state.withLock { $0.isClosing = true }
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
        guard let record = BackgroundUploadRecord(task) else {
            return false
        }
        return CertificatePinning.leafCertificate(of: trust, matches: record.fingerprint)
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64, totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0, let record = BackgroundUploadRecord(task) else {
            return
        }
        handlers.progress(record.id, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let taskID = dataTask.taskIdentifier
        state.withLock { current in
            let answer = current.answers[taskID, default: Data()]
            guard answer.count + data.count <= Self.maxAnswerBytes else {
                return
            }
            current.answers[taskID] = answer + data
        }
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?
    ) {
        let taskID = task.taskIdentifier
        let answer = state.withLock { $0.answers.removeValue(forKey: taskID) } ?? Data()
        let rejected = state.withLock { $0.rejectedTasks.remove(taskID) != nil }
        guard let record = BackgroundUploadRecord(task) else {
            Log.network.error("background upload without a readable record")
            return
        }
        copies.discardFolder(named: record.folder)
        let finished = FinishedUpload(
            error: error, certificateRejected: rejected,
            statusCode: (task.response as? HTTPURLResponse)?.statusCode,
            redirected: task.currentRequest?.url != task.originalRequest?.url, answer: answer)
        if finished.redirected {
            Log.network.error("the PC redirected a background upload")
        } else if let error, !rejected {
            Log.network.error("background upload failed: \(error.logSummary, privacy: .public)")
        }
        handlers.completion(record.id, finished.result)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        handlers.eventsFinished()
    }

    func urlSession(_ session: URLSession, didBecomeInvalidWithError error: (any Error)?) {
        state.withLock { $0.hasEnded = true }
    }
}

/// What a background upload remembers about itself. It is kept in its task's `taskDescription`,
/// so whichever process hears about the task can check its pin and delete its copy. Nothing in
/// it is secret: the fingerprint is public, and the token stays in the request.
struct BackgroundUploadRecord: Codable, Equatable {
    let id: UUID
    let fingerprint: CertificateFingerprint
    /// The name of the copy's folder among the background copies.
    let folder: String

    func encoded() throws -> String {
        let data: Data
        do {
            data = try JSONEncoder().encode(self)
        } catch {
            throw IletError.unexpectedResponse
        }
        guard let text = String(bytes: data, encoding: .utf8) else {
            throw IletError.unexpectedResponse
        }
        return text
    }
}

extension BackgroundUploadRecord {
    /// The record of a task, or `nil` when it has none or it is unreadable.
    init?(_ task: URLSessionTask) {
        guard let text = task.taskDescription,
            let record = try? JSONDecoder().decode(Self.self, from: Data(text.utf8))
        else {
            return nil
        }
        self = record
    }
}

/// What iOS reports about an ended background upload, and what it means.
struct FinishedUpload {
    var error: (any Error)?
    var certificateRejected = false
    var statusCode: Int?
    var redirected = false
    var answer = Data()

    var result: BackgroundUploadResult {
        if certificateRejected {
            return .failed(.certificateMismatch)
        }
        if let error {
            return .failed(Self.failure(for: error))
        }
        // The protocol never redirects, but background sessions follow redirects without
        // asking, so a redirected upload can only be reported (THREAT_MODEL.md, T2).
        guard !redirected, let statusCode else {
            return .failed(.unexpectedResponse)
        }
        switch ServerAnswer.check(statusCode: statusCode, body: answer) {
        case .success(let body):
            let response = try? JSONDecoder().decode(UploadResponse.self, from: body)
            return .sent(savedAs: response?.fileName)
        case .failure(let error):
            return .failed(error)
        }
    }

    private static func failure(for error: any Error) -> IletError {
        if (error as? URLError)?.code == .backgroundSessionInUseByAnotherProcess {
            return .backgroundUploadsBusy
        }
        return IletError(connectionError: error)
    }
}

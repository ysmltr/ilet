import XCTest

@testable import IletCore

/// Background downloads from the PC's outbox: the record and pin that travel with each task, the
/// PCs that files may come from, and which finished downloads are saved.
final class BackgroundDownloadsTests: XCTestCase {
    private let endpoint = DesktopEndpoint(address: "192.168.1.20", port: 45380)

    func testRecordTravelsWithItsTask() throws {
        let download = try makeDownload()
        let task = try makeTask(described: try download.encoded())
        XCTAssertEqual(OutboxDownload(task), download)
    }

    func testTaskWithoutAUsableRecordHasNone() throws {
        let malformed = try makeDownload(fileID: "../outbox.json")

        XCTAssertNil(OutboxDownload(try makeTask(described: nil)))
        XCTAssertNil(OutboxDownload(try makeTask(described: "not a record")))
        XCTAssertNil(OutboxDownload(try makeTask(described: try malformed.encoded())))
    }

    func testAcceptsOnlyTheCertificatePinnedForTheTask() throws {
        let trust = try Fixtures.serverTrust()
        let other = CertificateFingerprint(certificateData: Data("another certificate".utf8))
        let pinnedTask = try makeTask(described: try makeDownload().encoded())
        let otherTask = try makeTask(described: try makeDownload(pinning: other).encoded())

        XCTAssertTrue(BackgroundDownloadDelegate.accepts(trust, for: pinnedTask))
        XCTAssertFalse(BackgroundDownloadDelegate.accepts(trust, for: otherTask))
        XCTAssertFalse(BackgroundDownloadDelegate.accepts(trust, for: try makeTask(described: nil)))
    }

    /// A PC that the user forgot on this iPhone sends nothing more (THREAT_MODEL.md, T14): the
    /// task's PC must still be paired, with the same ID and the same certificate.
    func testTellsWhenTheTasksPCWasForgotten() throws {
        let desktops = try makePairedDesktopStore()
        let other = CertificateFingerprint(certificateData: Data("another certificate".utf8))
        let download = try makeDownload()
        let pairedTask = try makeTask(described: try download.encoded())
        let otherPCTask = try makeTask(described: try makeDownload(from: UUID()).encoded())
        let otherPinTask = try makeTask(described: try makeDownload(pinning: other).encoded())
        let unreadableTask = try makeTask(described: nil)

        XCTAssertFalse(BackgroundDownloadDelegate.isForgotten(pairedTask, in: desktops))
        XCTAssertTrue(BackgroundDownloadDelegate.isForgotten(otherPCTask, in: desktops))
        XCTAssertTrue(BackgroundDownloadDelegate.isForgotten(otherPinTask, in: desktops))
        // A task without a record is refused by the pin check instead.
        XCTAssertFalse(BackgroundDownloadDelegate.isForgotten(unreadableTask, in: desktops))

        try desktops.remove(desktopID: download.desktopID)
        XCTAssertTrue(BackgroundDownloadDelegate.isForgotten(pairedTask, in: desktops))
    }

    func testRequestNamesTheFileOnlyByItsID() throws {
        let request = try URLRequest(
            downloading: Fixtures.outboxFileID, from: endpoint, token: "token")

        XCTAssertEqual(
            request.url?.absoluteString, "https://192.168.1.20:45380/api/v1/outbox/file")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Ilet-File-Id"), Fixtures.outboxFileID)
        XCTAssertThrowsError(
            try URLRequest(downloading: "../outbox.json", from: endpoint, token: "token"))
    }

    func testKeepsOnlyAnUnredirectedOKOfTheListedSize() {
        XCTAssertEqual(verdict(200), .complete)
        XCTAssertEqual(verdict(200, bytes: 4), .unusable)
        XCTAssertEqual(verdict(200, bytes: 6), .unusable)
        XCTAssertEqual(verdict(200, bytes: nil), .unusable)
        XCTAssertEqual(verdict(200, redirected: true), .unusable)
        XCTAssertEqual(verdict(204), .unusable)
        XCTAssertEqual(verdict(nil), .unusable)
        XCTAssertEqual(verdict(410), .answer(statusCode: 410))
    }

    func testSavesACompleteDownloadAndRemembersIt() throws {
        let received = makeReceivedFiles()
        let ledger = DownloadLedger(defaults: try makeDefaults())
        let delegate = try makeDelegate(received: received, ledger: ledger)
        let download = try makeDownload(fileName: "notes.txt", sizeBytes: 5)
        let file = try makeDownloadedFile(containing: "12345")

        let kept = delegate.keep(file, of: download, statusCode: 200, redirected: false)

        XCTAssertEqual(kept, .success("notes.txt"))
        XCTAssertEqual(try text(of: received.url(of: "notes.txt")), "12345")
        XCTAssertTrue(ledger.contains(download.fileID, from: download.desktopID))
    }

    func testSavesNothingFromAForgottenPC() throws {
        let received = makeReceivedFiles()
        let ledger = DownloadLedger(defaults: try makeDefaults())
        let desktops = try makePairedDesktopStore()
        let delegate = try makeDelegate(received: received, ledger: ledger, desktops: desktops)
        let download = try makeDownload(fileName: "notes.txt", sizeBytes: 5)
        let file = try makeDownloadedFile(containing: "12345")
        // Forgotten while the file was on its way.
        try desktops.remove(desktopID: download.desktopID)

        let kept = delegate.keep(file, of: download, statusCode: 200, redirected: false)

        XCTAssertEqual(kept, .failure(.cancelled))
        XCTAssertFalse(fileExists(received.url(of: "notes.txt")))
        XCTAssertFalse(ledger.contains(download.fileID, from: download.desktopID))
    }

    func testDiscardsAShortOrRedirectedDownload() throws {
        let received = makeReceivedFiles()
        let ledger = DownloadLedger(defaults: try makeDefaults())
        let delegate = try makeDelegate(received: received, ledger: ledger)
        let download = try makeDownload(fileName: "notes.txt", sizeBytes: 5)
        let short = try makeDownloadedFile(containing: "1234")
        let redirected = try makeDownloadedFile(containing: "12345")

        XCTAssertEqual(
            delegate.keep(short, of: download, statusCode: 200, redirected: false),
            .failure(.unexpectedResponse))
        XCTAssertEqual(
            delegate.keep(redirected, of: download, statusCode: 200, redirected: true),
            .failure(.unexpectedResponse))
        XCTAssertFalse(fileExists(received.url(of: "notes.txt")))
        XCTAssertFalse(ledger.contains(download.fileID, from: download.desktopID))
    }

    func testReadsTheCodeOfAnErrorAnswer() throws {
        let received = makeReceivedFiles()
        let delegate = try makeDelegate(
            received: received, ledger: DownloadLedger(defaults: try makeDefaults()))
        let answer = try makeDownloadedFile(containing: #"{"error":"file_gone"}"#)

        let kept = delegate.keep(answer, of: try makeDownload(), statusCode: 410, redirected: false)

        XCTAssertEqual(kept, .failure(.server(.fileGone)))
        XCTAssertFalse(fileExists(received.url(of: "notes.txt")))
    }

    func testMapsHowADownloadEnded() {
        XCTAssertEqual(ended(kept: .success("a.txt")), .saved(fileName: "a.txt"))
        XCTAssertEqual(
            ended(kept: .success("a.txt"), error: URLError(.timedOut)), .saved(fileName: "a.txt"))
        XCTAssertEqual(
            ended(error: URLError(.cancelled), rejected: true), .failed(.certificateMismatch))
        // A forgotten PC's download is cancelled: no certificate warning.
        XCTAssertEqual(ended(error: URLError(.cancelled)), .failed(.cancelled))
        XCTAssertEqual(ended(error: URLError(.timedOut)), .failed(.desktopUnreachable))
        XCTAssertEqual(ended(error: URLError(.cannotWriteToFile)), .failed(.fileNotSaved))
        XCTAssertEqual(ended(kept: .failure(.server(.fileGone))), .failed(.server(.fileGone)))
        XCTAssertEqual(ended(), .failed(.unexpectedResponse))
    }

    private func verdict(
        _ statusCode: Int?, redirected: Bool = false, bytes: Int64? = 5
    ) -> FinishedDownload.Verdict {
        FinishedDownload.verdict(
            statusCode: statusCode, redirected: redirected, receivedBytes: bytes, expectedBytes: 5)
    }

    private func ended(
        kept: Result<String, IletError>? = nil, error: (any Error)? = nil, rejected: Bool = false
    ) -> BackgroundDownloadResult {
        FinishedDownload.result(kept: kept, error: error, certificateRejected: rejected)
    }

    /// A delegate that saves into this folder and ledger. The fixtures' PC is paired, unless
    /// `desktops` is given.
    private func makeDelegate(
        received: ReceivedFiles, ledger: DownloadLedger, desktops: (any DesktopStore)? = nil
    ) throws -> BackgroundDownloadDelegate {
        BackgroundDownloadDelegate(
            received: received, ledger: ledger,
            desktops: try desktops ?? makePairedDesktopStore(),
            handlers: BackgroundDownloadHandlers())
    }

    /// A download from the fixtures' PC, unless another PC is given.
    private func makeDownload(
        fileID: String = Fixtures.outboxFileID, fileName: String = "notes.txt",
        sizeBytes: Int64 = 5, from desktopID: UUID? = nil,
        pinning fingerprint: CertificateFingerprint? = nil
    ) throws
        -> OutboxDownload
    {
        let fixtureID = try XCTUnwrap(UUID(uuidString: Fixtures.desktopID))
        return OutboxDownload(
            fileID: fileID, desktopID: desktopID ?? fixtureID, fileName: fileName,
            sizeBytes: sizeBytes, fingerprint: try fingerprint ?? Fixtures.desktopFingerprint())
    }

    /// A task that is never resumed, described like a background download.
    private func makeTask(described description: String?) throws -> URLSessionTask {
        let session = URLSession(configuration: .ephemeral)
        addTeardownBlock { session.invalidateAndCancel() }
        let request = try URLRequest(
            downloading: Fixtures.outboxFileID, from: endpoint, token: "token")
        let task = session.downloadTask(with: request)
        task.taskDescription = description
        return task
    }
}

import XCTest

@testable import IletCore

/// Background uploads, the app's and the share sheet's: the pin that travels with each task, and
/// how iOS's report about an ended upload is read.
final class BackgroundUploadsTests: XCTestCase {
    private let endpoint = DesktopEndpoint(address: "192.168.1.20", port: 45380)

    /// The app delegate opens the share sheets' sessions when iOS wakes the app for them. Taking
    /// the app's own session for one would open it a second time in the same process.
    func testTellsTheAppsSessionFromTheShareSheets() {
        let shareSheet = "app.ilet.background-uploads.\(UUID().uuidString)"
        let app = BackgroundUploads.appSessionIdentifier

        XCTAssertTrue(BackgroundUploads.isShareSheetSession(shareSheet))
        XCTAssertFalse(BackgroundUploads.isShareSheetSession(app))
        XCTAssertFalse(BackgroundUploads.isShareSheetSession("com.example.uploads"))
    }

    func testRecordTravelsWithItsTask() throws {
        let record = try makeRecord()
        let task = try makeTask(described: try record.encoded())
        XCTAssertEqual(BackgroundUploadRecord(task), record)
    }

    func testTaskWithoutAReadableRecordHasNone() throws {
        XCTAssertNil(BackgroundUploadRecord(try makeTask(described: nil)))
        XCTAssertNil(BackgroundUploadRecord(try makeTask(described: "not a record")))
        XCTAssertNil(BackgroundUploadRecord(try makeTask(described: #"{"id":"6f1c"}"#)))
    }

    func testAcceptsOnlyTheCertificatePinnedForTheTask() throws {
        let trust = try Fixtures.serverTrust()
        let other = CertificateFingerprint(certificateData: Data("another certificate".utf8))
        let pinnedTask = try makeTask(described: try makeRecord().encoded())
        let otherTask = try makeTask(described: try makeRecord(pinning: other).encoded())

        XCTAssertTrue(BackgroundUploadDelegate.accepts(trust, for: pinnedTask))
        XCTAssertFalse(BackgroundUploadDelegate.accepts(trust, for: otherTask))
        XCTAssertFalse(BackgroundUploadDelegate.accepts(trust, for: try makeTask(described: nil)))
    }

    /// A PC that the user forgot on this iPhone gets no more files (THREAT_MODEL.md, T14): a PC
    /// with the task's certificate must still be paired.
    func testTellsWhenTheTasksPCWasForgotten() throws {
        let desktops = try makePairedDesktopStore()
        let other = CertificateFingerprint(certificateData: Data("another certificate".utf8))
        let pairedTask = try makeTask(described: try makeRecord().encoded())
        let otherPinTask = try makeTask(described: try makeRecord(pinning: other).encoded())
        let unreadableTask = try makeTask(described: nil)

        XCTAssertFalse(BackgroundUploadDelegate.isForgotten(pairedTask, in: desktops))
        XCTAssertTrue(BackgroundUploadDelegate.isForgotten(otherPinTask, in: desktops))
        // A task without a record is refused by the pin check instead.
        XCTAssertFalse(BackgroundUploadDelegate.isForgotten(unreadableTask, in: desktops))

        try desktops.remove(desktopID: try XCTUnwrap(UUID(uuidString: Fixtures.desktopID)))
        XCTAssertTrue(BackgroundUploadDelegate.isForgotten(pairedTask, in: desktops))
    }

    func testReadsThePCsAnswer() {
        let savedAnswer = json(#"{"fileName":"IMG_1 (2).jpg"}"#)
        let fullAnswer = json(#"{"error":"insufficient_storage"}"#)
        let unpairedAnswer = json(#"{"error":"unauthorized"}"#)

        XCTAssertEqual(
            FinishedUpload(statusCode: 201, answer: savedAnswer).result,
            .sent(savedAs: "IMG_1 (2).jpg"))
        XCTAssertEqual(FinishedUpload(statusCode: 201).result, .sent(savedAs: nil))
        XCTAssertEqual(
            FinishedUpload(statusCode: 507, answer: fullAnswer).result,
            .failed(.server(.insufficientStorage)))
        XCTAssertEqual(
            FinishedUpload(statusCode: 401, answer: unpairedAnswer).result, .failed(.notPaired))
        XCTAssertEqual(
            FinishedUpload(statusCode: 500, answer: json("<html>")).result,
            .failed(.unexpectedResponse))
    }

    func testNeverTrustsARedirectedOrMissingAnswer() {
        XCTAssertEqual(
            FinishedUpload(statusCode: 201, redirected: true).result, .failed(.unexpectedResponse))
        XCTAssertEqual(FinishedUpload().result, .failed(.unexpectedResponse))
    }

    func testMapsFailures() {
        let rejected = FinishedUpload(error: URLError(.cancelled), certificateRejected: true)
        let busy = FinishedUpload(error: URLError(.backgroundSessionInUseByAnotherProcess))

        XCTAssertEqual(rejected.result, .failed(.certificateMismatch))
        XCTAssertEqual(FinishedUpload(error: URLError(.cancelled)).result, .failed(.cancelled))
        XCTAssertEqual(
            FinishedUpload(error: URLError(.timedOut)).result, .failed(.desktopUnreachable))
        XCTAssertEqual(busy.result, .failed(.backgroundUploadsBusy))
    }

    func testUploadRequestCarriesTheTokenAndTheEncodedName() throws {
        let request = try URLRequest(upload: "Yeşil çay.jpg", to: endpoint, token: "token")

        XCTAssertEqual(request.url?.absoluteString, "https://192.168.1.20:45380/api/v1/files")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Content-Type"), "application/octet-stream")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Ilet-File-Name"), "Ye%C5%9Fil%20%C3%A7ay.jpg")
    }

    private func makeRecord(
        pinning fingerprint: CertificateFingerprint? = nil
    ) throws
        -> BackgroundUploadRecord
    {
        BackgroundUploadRecord(
            id: UUID(), fingerprint: try fingerprint ?? Fixtures.desktopFingerprint(),
            folder: "1730000000-\(UUID().uuidString)")
    }

    /// A task that is never resumed, described like a background upload.
    private func makeTask(described description: String?) throws -> URLSessionTask {
        let session = URLSession(configuration: .ephemeral)
        addTeardownBlock { session.invalidateAndCancel() }
        let request = try URLRequest(upload: "photo.jpg", to: endpoint, token: "token")
        let task = session.uploadTask(with: request, from: Data())
        task.taskDescription = description
        return task
    }

    private func json(_ text: String) -> Data {
        Data(text.utf8)
    }
}

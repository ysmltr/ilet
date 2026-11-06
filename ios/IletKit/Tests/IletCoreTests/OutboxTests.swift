import XCTest

@testable import IletCore

/// Files from the PC: the outbox list as the PC sends it, and what a check does with it.
final class OutboxTests: XCTestCase {
    func testReadsTheListAsThePCSendsIt() throws {
        // The example of PROTOCOL.md section 5.5. The timestamps are not needed.
        let json = """
            {"files": [{"id": "3f9c2a8e5b7d4c1e9a0b6f8d2c4e1a3b", "name": "report.pdf",
            "sizeBytes": 48213, "queuedAt": "2026-11-06T12:00:00.000Z",
            "expiresAt": "2026-11-07T12:00:00.000Z"}]}
            """
        let list = try JSONDecoder().decode(OutboxList.self, from: Data(json.utf8))

        XCTAssertEqual(
            list.usableFiles,
            [OutboxFile(id: Fixtures.outboxFileID, name: "report.pdf", sizeBytes: 48_213)])
    }

    /// An ID is used in requests and records, so only the exact form is accepted.
    func testLeavesOutFilesWithAMalformedIDOrSize() {
        let valid = file(Fixtures.outboxFileID)
        let files = [
            valid,
            file(Fixtures.outboxFileID.uppercased()),
            file(String(Fixtures.outboxFileID.dropLast())),
            file(Fixtures.outboxFileID + "0"),
            file(String(repeating: "g", count: 32)),
            file("../../../outbox.json"),
            OutboxFile(id: Fixtures.outboxFileID, name: "a.txt", sizeBytes: -1),
        ]

        XCTAssertEqual(OutboxList(files: files).usableFiles, [valid])
    }

    func testTakesAtMostTheFilesThatAPCMayList() {
        let files = (0..<201).map { _ in file(Fixtures.outboxFileID) }

        XCTAssertEqual(OutboxList(files: files).usableFiles.count, 200)
    }

    func testKnowsTheOutboxErrorCodes() {
        XCTAssertEqual(ServerErrorCode(rawValue: "file_gone"), .fileGone)
        XCTAssertEqual(ServerErrorCode(rawValue: "too_many_downloads"), .tooManyDownloads)
        XCTAssertEqual(IletError(serverCode: .fileGone), .server(.fileGone))
    }

    func testFetchesNewFilesAndConfirmsSavedOnesAgain() async throws {
        let desktop = try makeDesktop()
        let ledger = DownloadLedger(defaults: try makeDefaults())
        ledger.remember(id("b"), from: desktop.id)
        let client = FakeDesktopClient(
            answers: [:], outbox: .success([file(id("a")), file(id("b")), file(id("c"))]))
        let downloads = FakeDownloads(inProgress: [id("c")])
        let receiver = makeReceiver(client, downloads, ledger)

        let started = try await receiver.check(
            desktop, over: try Fixtures.connection(), skipping: [])

        XCTAssertEqual(started.map(\.fileID), [id("a")])
        XCTAssertEqual(started.first?.desktopID, desktop.id)
        XCTAssertEqual(downloads.startedIDs, [id("a")])
        let confirmed = await client.confirmed
        XCTAssertEqual(confirmed, [id("b")])
    }

    /// File IDs are random, but a file saved from one PC never stops another PC's from coming.
    func testASavedFileCountsOnlyForItsPC() async throws {
        let desktop = try makeDesktop()
        let ledger = DownloadLedger(defaults: try makeDefaults())
        ledger.remember(id("a"), from: UUID())
        let client = FakeDesktopClient(answers: [:], outbox: .success([file(id("a"))]))
        let downloads = FakeDownloads()

        _ = try await makeReceiver(client, downloads, ledger).check(
            desktop, over: try Fixtures.connection(), skipping: [])

        XCTAssertEqual(downloads.startedIDs, [id("a")])
        let confirmed = await client.confirmed
        XCTAssertEqual(confirmed, [])
    }

    func testLeavesFilesThatFailedTooOftenForLater() async throws {
        let client = FakeDesktopClient(answers: [:], outbox: .success([file(id("a"))]))
        let downloads = FakeDownloads()
        let receiver = makeReceiver(client, downloads, DownloadLedger(defaults: try makeDefaults()))

        let started = try await receiver.check(
            try makeDesktop(), over: try Fixtures.connection(), skipping: [id("a")])

        XCTAssertEqual(started, [])
        XCTAssertEqual(downloads.startedIDs, [])
    }

    func testAnOlderPCCannotSendFiles() async throws {
        let client = FakeDesktopClient(answers: [:], outbox: .failure(.server(.notFound)))
        let receiver = makeReceiver(
            client, FakeDownloads(), DownloadLedger(defaults: try makeDefaults()))
        let desktop = try makeDesktop()
        let connection = try Fixtures.connection()

        await assertThrows(.server(.notFound)) {
            _ = try await receiver.check(desktop, over: connection, skipping: [])
        }
    }

    func testConfirmsASavedDownload() async throws {
        let client = FakeDesktopClient(answers: [:])
        let receiver = makeReceiver(
            client, FakeDownloads(), DownloadLedger(defaults: try makeDefaults()))
        let connection = try Fixtures.connection()
        let download = OutboxDownload(
            fileID: id("a"), desktopID: UUID(), fileName: "a.txt", sizeBytes: 5,
            fingerprint: connection.fingerprint)

        await receiver.confirm(download, over: connection)

        let confirmed = await client.confirmed
        XCTAssertEqual(confirmed, [id("a")])
    }

    private func makeReceiver(
        _ client: FakeDesktopClient, _ downloads: FakeDownloads, _ ledger: DownloadLedger
    ) -> OutboxReceiver {
        OutboxReceiver(
            clientFactory: FakeClientFactory(client: client), downloads: downloads, ledger: ledger)
    }

    private func makeDesktop() throws -> Desktop {
        Desktop(pairing: try Fixtures.payload(), pairedAt: Date())
    }

    /// A valid entry ID made of one hexadecimal digit.
    private func id(_ digit: Character) -> String {
        String(repeating: digit, count: 32)
    }

    private func file(_ id: String) -> OutboxFile {
        OutboxFile(id: id, name: "file.txt", sizeBytes: 5)
    }
}

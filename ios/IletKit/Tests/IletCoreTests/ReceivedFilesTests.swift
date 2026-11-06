import XCTest

@testable import IletCore

/// Saving files from the PC: their names, and the ledger that keeps a file from coming twice.
final class ReceivedFilesTests: XCTestCase {
    func testNumbersATakenNameAndNeverReplacesAFile() throws {
        let received = makeReceivedFiles()
        let first = try makeDownloadedFile(containing: "first")
        let second = try makeDownloadedFile(containing: "second")

        XCTAssertEqual(try received.add(first, named: "report.pdf"), "report.pdf")
        XCTAssertEqual(try received.add(second, named: "report.pdf"), "report (1).pdf")

        XCTAssertEqual(try text(of: received.url(of: "report.pdf")), "first")
        XCTAssertEqual(try text(of: received.url(of: "report (1).pdf")), "second")
    }

    func testPutsTheNumberBeforeTheExtension() {
        XCTAssertEqual(ReceivedFiles.name("report.pdf", numbered: 0), "report.pdf")
        XCTAssertEqual(ReceivedFiles.name("report.pdf", numbered: 2), "report (2).pdf")
        XCTAssertEqual(ReceivedFiles.name("archive.tar.gz", numbered: 1), "archive.tar (1).gz")
        XCTAssertEqual(ReceivedFiles.name("README", numbered: 1), "README (1)")
    }

    func testCleansNamesFromThePC() {
        XCTAssertEqual(ReceivedFileName.clean("../../Library/Preferences/x.plist"), "x.plist")
        XCTAssertEqual(ReceivedFileName.clean("photo\u{202E}gpj.exe"), "photogpj.exe")
        XCTAssertEqual(ReceivedFileName.clean(".Trash"), "Trash")
        XCTAssertEqual(ReceivedFileName.clean("..hidden.txt"), "hidden.txt")
        XCTAssertEqual(ReceivedFileName.clean("..."), "file")
    }

    func testRemembersSavedFilesPerPCForTwoDays() throws {
        let defaults = try makeDefaults()
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        let pc = UUID()
        DownloadLedger(defaults: defaults, now: { start }).remember(Fixtures.outboxFileID, from: pc)

        let soon = DownloadLedger(defaults: defaults, now: { start + DownloadLedger.retention - 1 })
        let late = DownloadLedger(defaults: defaults, now: { start + DownloadLedger.retention + 1 })

        XCTAssertTrue(soon.contains(Fixtures.outboxFileID, from: pc))
        XCTAssertFalse(soon.contains(Fixtures.outboxFileID, from: UUID()))
        XCTAssertFalse(late.contains(Fixtures.outboxFileID, from: pc))
    }

    func testAnUnreadableLedgerCountsAsEmpty() throws {
        let defaults = try makeDefaults()
        defaults.set(Data("not a list".utf8), forKey: DownloadLedger.defaultsKey)
        let ledger = DownloadLedger(defaults: defaults)
        let pc = UUID()

        XCTAssertFalse(ledger.contains(Fixtures.outboxFileID, from: pc))
        ledger.remember(Fixtures.outboxFileID, from: pc)
        XCTAssertTrue(ledger.contains(Fixtures.outboxFileID, from: pc))
    }
}

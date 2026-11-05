import XCTest

@testable import IletCore

/// The store of copies deletes only what it made, because folder names come back from
/// background uploads' records.
final class TemporaryFilesTests: XCTestCase {
    private static let day: TimeInterval = 24 * 60 * 60

    func testSweepsWhatIsOlderThanTheCutoff() throws {
        let store = makeTemporaryStore()
        let now = Date()
        let old = try store.makeFolder(now: now.addingTimeInterval(-3 * Self.day))
        let recent = try store.makeFolder(now: now)
        let stray = store.root.appending(path: "stray.txt")
        try Data("stray".utf8).write(to: stray)

        store.removeFolders(madeBefore: now.addingTimeInterval(-BackgroundUploads.leftoverAge))

        XCTAssertFalse(exists(old))
        XCTAssertTrue(exists(recent))
        XCTAssertFalse(exists(stray))
    }

    func testDiscardsOnlyFoldersThatItMade() throws {
        let store = makeTemporaryStore()
        let folder = try store.makeFolder()
        let outside = store.root.deletingLastPathComponent().appending(
            path: "outside", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)

        store.discardFolder(named: "../outside")
        store.discardFolder(named: "outside")
        store.discardFolder(named: folder.lastPathComponent)

        XCTAssertTrue(exists(outside))
        XCTAssertFalse(exists(folder))
    }

    func testReadsTheTimeOnlyFromNamesItWrites() {
        let id = UUID().uuidString
        let made = Date(timeIntervalSince1970: 1_730_000_000)

        XCTAssertEqual(TemporaryFiles.creationTime(ofFolderNamed: "1730000000-\(id)"), made)
        XCTAssertNil(TemporaryFiles.creationTime(ofFolderNamed: "+1730000000-\(id)"))
        XCTAssertNil(TemporaryFiles.creationTime(ofFolderNamed: "1730000000-\(id.lowercased())"))
        XCTAssertNil(TemporaryFiles.creationTime(ofFolderNamed: "../1730000000-\(id)"))
        XCTAssertNil(TemporaryFiles.creationTime(ofFolderNamed: id))
    }

    private func exists(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
    }
}

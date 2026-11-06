import Foundation
import XCTest

@testable import IletCore

/// A desktop API whose answers are set per address.
actor FakeDesktopClient: DesktopClient {
    enum Answer {
        case desktop(id: String, protocolVersion: Int)
        case failure(IletError)
    }

    private let answers: [String: Answer]
    private let pairResult: Result<String, IletError>
    private let outboxResult: Result<[OutboxFile], IletError>
    /// The IDs of the files that were confirmed, in order.
    private(set) var confirmed: [String] = []

    init(
        answers: [String: Answer], pairResult: Result<String, IletError> = .success("token"),
        outbox: Result<[OutboxFile], IletError> = .success([])
    ) {
        self.answers = answers
        self.pairResult = pairResult
        outboxResult = outbox
    }

    func info(at endpoint: DesktopEndpoint) async throws -> ServerInfo {
        switch answers[endpoint.address] {
        case .desktop(let id, let protocolVersion):
            return ServerInfo(protocolVersion: protocolVersion, deviceId: id, displayName: "PC")
        case .failure(let error):
            throw error
        case nil:
            throw IletError.desktopUnreachable
        }
    }

    func pair(
        at endpoint: DesktopEndpoint, secret: String, deviceName: String
    ) async throws
        -> String
    {
        try pairResult.get()
    }

    func status(at endpoint: DesktopEndpoint, token: String) async throws -> DeviceStatus {
        DeviceStatus(limits: UploadLimits(maxFileSizeBytes: 1_000, maxConcurrentUploads: 2))
    }

    func outbox(at endpoint: DesktopEndpoint, token: String) async throws -> [OutboxFile] {
        try outboxResult.get()
    }

    func confirmReceived(fileID: String, at endpoint: DesktopEndpoint, token: String) async throws {
        confirmed.append(fileID)
    }
}

/// Downloads that are only recorded. Which files are in progress is set per test.
final class FakeDownloads: OutboxDownloading, @unchecked Sendable {
    private let lock = NSLock()
    private let inProgress: Set<String>
    private var started: [String] = []

    init(inProgress: Set<String> = []) {
        self.inProgress = inProgress
    }

    /// The IDs of the files whose downloads were started, in order.
    var startedIDs: [String] {
        lock.withLock { started }
    }

    func fileIDsInProgress() async -> Set<String> {
        inProgress
    }

    func start(
        _ file: OutboxFile, from desktopID: UUID, over connection: DesktopConnection
    ) throws
        -> OutboxDownload
    {
        lock.withLock { started.append(file.id) }
        return OutboxDownload(
            fileID: file.id, desktopID: desktopID, fileName: file.name, sizeBytes: file.sizeBytes,
            fingerprint: connection.fingerprint)
    }
}

/// An announcement that names these endpoints. It counts the searches, so tests can tell when
/// none was needed.
actor FakeDesktopFinder: DesktopFinding {
    private let found: [DesktopEndpoint]
    private(set) var searches = 0

    init(found: [DesktopEndpoint] = []) {
        self.found = found
    }

    func endpoints(of desktopID: UUID) async -> [DesktopEndpoint] {
        searches += 1
        return found
    }
}

struct FakeClientFactory: DesktopClientFactory {
    let client: FakeDesktopClient

    func makeClient(pinnedTo fingerprint: CertificateFingerprint) -> any DesktopClient {
        client
    }
}

/// Stands in for the Keychain, which needs entitlements that `swift test` does not have.
final class InMemoryCredentialStore: CredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: [UUID: String] = [:]

    func saveToken(_ token: String, for desktopID: UUID) throws {
        lock.withLock { tokens[desktopID] = token }
    }

    func token(for desktopID: UUID) throws -> String? {
        lock.withLock { tokens[desktopID] }
    }

    func deleteToken(for desktopID: UUID) throws {
        _ = lock.withLock { tokens.removeValue(forKey: desktopID) }
    }
}

extension XCTestCase {
    /// A fresh, private user defaults domain, which is deleted after the test.
    func makeDefaults() throws -> UserDefaults {
        let suiteName = "ilet-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        // Only the name goes into the teardown block, which must be Sendable; UserDefaults is not.
        addTeardownBlock { UserDefaults.standard.removePersistentDomain(forName: suiteName) }
        return defaults
    }

    /// A desktop store backed by a fresh, private user defaults domain.
    func makeDesktopStore() throws -> AppGroupDesktopStore {
        AppGroupDesktopStore(defaults: try makeDefaults())
    }

    /// An empty store of copies in a fresh folder, which is deleted after the test.
    func makeTemporaryStore() -> TemporaryFiles {
        let base = FileManager.default.temporaryDirectory.appending(
            path: "ilet-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        addTeardownBlock { _ = try? FileManager.default.removeItem(at: base) }
        return TemporaryFiles(root: base.appending(path: "store", directoryHint: .isDirectory))
    }

    /// An empty folder for received files, which is deleted after the test.
    func makeReceivedFiles() -> ReceivedFiles {
        let folder = FileManager.default.temporaryDirectory.appending(
            path: "ilet-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        addTeardownBlock { _ = try? FileManager.default.removeItem(at: folder) }
        return ReceivedFiles(folder: folder)
    }

    /// A file with this text, where iOS would leave a finished download.
    func makeDownloadedFile(containing text: String) throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appending(
            path: "ilet-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { _ = try? FileManager.default.removeItem(at: folder) }
        let file = folder.appending(path: "download.tmp")
        try Data(text.utf8).write(to: file)
        return file
    }

    func text(of file: URL) throws -> String {
        try String(contentsOf: file, encoding: .utf8)
    }

    func fileExists(_ file: URL) -> Bool {
        FileManager.default.fileExists(atPath: file.path(percentEncoded: false))
    }

    func assertThrows(
        _ expected: IletError, file: StaticString = #filePath, line: UInt = #line,
        _ body: () async throws -> Void
    ) async {
        do {
            try await body()
            XCTFail("expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? IletError, expected, file: file, line: line)
        }
    }
}

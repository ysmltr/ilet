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

    init(answers: [String: Answer], pairResult: Result<String, IletError> = .success("token")) {
        self.answers = answers
        self.pairResult = pairResult
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

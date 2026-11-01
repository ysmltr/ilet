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
    private(set) var uploads: [String] = []

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

    func pair(at endpoint: DesktopEndpoint, secret: String, deviceName: String) async throws
        -> String
    {
        try pairResult.get()
    }

    func status(at endpoint: DesktopEndpoint, token: String) async throws -> DeviceStatus {
        DeviceStatus(limits: UploadLimits(maxFileSizeBytes: 1_000, maxConcurrentUploads: 2))
    }

    func upload(
        _ file: PreparedFile, to endpoint: DesktopEndpoint, token: String,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> String {
        uploads.append(file.fileName)
        progress(1)
        return file.fileName
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
    /// A desktop store backed by a fresh, private user defaults domain.
    func makeDesktopStore() throws -> AppGroupDesktopStore {
        let suiteName = "ilet-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        addTeardownBlock { defaults.removePersistentDomain(forName: suiteName) }
        return AppGroupDesktopStore(defaults: defaults)
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

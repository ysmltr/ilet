import Foundation

public struct PinnedClientFactory: DesktopClientFactory {
    public init() {}

    public func makeClient(pinnedTo fingerprint: CertificateFingerprint) -> any DesktopClient {
        PinnedDesktopClient(fingerprint: fingerprint)
    }
}

/// `DesktopClient` over URLSession. Each request carries a `PinningTaskDelegate`, which accepts
/// the TLS connection only if the server presents the pinned certificate.
final class PinnedDesktopClient: DesktopClient {
    /// `/api/info` is used to find a working address, so unreachable ones must fail fast.
    private static let infoTimeout: TimeInterval = 4
    /// Longest silence before a request fails.
    private static let idleTimeout: TimeInterval = 30

    private let session: URLSession
    private let fingerprint: CertificateFingerprint

    init(fingerprint: CertificateFingerprint) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
        configuration.timeoutIntervalForRequest = Self.idleTimeout
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        session = URLSession(configuration: configuration)
        self.fingerprint = fingerprint
    }

    deinit {
        session.finishTasksAndInvalidate()
    }

    func info(at endpoint: DesktopEndpoint) async throws -> ServerInfo {
        var request = URLRequest(url: try endpoint.url(path: ProtocolConstants.Path.info))
        request.timeoutInterval = Self.infoTimeout
        return try decode(ServerInfo.self, from: try await send(request))
    }

    func pair(
        at endpoint: DesktopEndpoint, secret: String, deviceName: String
    ) async throws
        -> String
    {
        var request = URLRequest(url: try endpoint.url(path: ProtocolConstants.Path.pair))
        request.httpMethod = ProtocolConstants.Method.post
        request.setValue(
            ProtocolConstants.MediaType.json,
            forHTTPHeaderField: ProtocolConstants.Header.contentType)
        request.httpBody = try encode(PairRequest(secret: secret, deviceName: deviceName))
        return try decode(PairResponse.self, from: try await send(request)).token
    }

    func status(at endpoint: DesktopEndpoint, token: String) async throws -> DeviceStatus {
        var request = URLRequest(url: try endpoint.url(path: ProtocolConstants.Path.status))
        request.setValue(bearer(token), forHTTPHeaderField: ProtocolConstants.Header.authorization)
        return try decode(DeviceStatus.self, from: try await send(request))
    }

    func outbox(at endpoint: DesktopEndpoint, token: String) async throws -> [OutboxFile] {
        var request = URLRequest(url: try endpoint.url(path: ProtocolConstants.Path.outbox))
        request.setValue(bearer(token), forHTTPHeaderField: ProtocolConstants.Header.authorization)
        return try decode(OutboxList.self, from: try await send(request)).usableFiles
    }

    func confirmReceived(fileID: String, at endpoint: DesktopEndpoint, token: String) async throws {
        guard OutboxFile.isValidID(fileID) else {
            throw IletError.unexpectedResponse
        }
        var request = URLRequest(url: try endpoint.url(path: ProtocolConstants.Path.outboxReceived))
        request.httpMethod = ProtocolConstants.Method.post
        request.setValue(bearer(token), forHTTPHeaderField: ProtocolConstants.Header.authorization)
        request.setValue(
            ProtocolConstants.MediaType.json,
            forHTTPHeaderField: ProtocolConstants.Header.contentType)
        request.httpBody = try encode(ReceivedRequest(id: fileID))
        _ = try await send(request)
    }

    /// Sends a request and returns the body of a successful response. Every failure is mapped to
    /// an `IletError`.
    private func send(_ request: URLRequest) async throws -> Data {
        let delegate = PinningTaskDelegate(pinnedFingerprint: fingerprint)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request, delegate: delegate)
        } catch {
            if delegate.rejectedCertificate {
                throw IletError.certificateMismatch
            }
            Log.network.error("request failed: \(error.logSummary, privacy: .public)")
            throw IletError(connectionError: error)
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw IletError.unexpectedResponse
        }
        return try ServerAnswer.check(statusCode: httpResponse.statusCode, body: data).get()
    }

    private func bearer(_ token: String) -> String {
        ProtocolConstants.bearerPrefix + token
    }

    private func encode(_ value: some Encodable) throws -> Data {
        do {
            return try JSONEncoder().encode(value)
        } catch {
            throw IletError.unexpectedResponse
        }
    }

    private func decode<Value: Decodable>(_ type: Value.Type, from data: Data) throws -> Value {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            Log.network.error("unexpected response: \(error.logSummary, privacy: .public)")
            throw IletError.unexpectedResponse
        }
    }
}

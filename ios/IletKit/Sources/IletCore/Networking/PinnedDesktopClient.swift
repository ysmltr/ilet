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
    private enum HTTPMethod {
        static let post = "POST"
    }

    /// `/api/info` is used to find a working address, so unreachable ones must fail fast.
    private static let infoTimeout: TimeInterval = 4
    /// Longest silence before a request fails; an upload in progress keeps resetting it.
    private static let idleTimeout: TimeInterval = 30
    private static let successStatusCodes = 200..<300

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
        request.httpMethod = HTTPMethod.post
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

    func upload(
        _ file: PreparedFile, to endpoint: DesktopEndpoint, token: String,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> String {
        var request = URLRequest(url: try endpoint.url(path: ProtocolConstants.Path.files))
        request.httpMethod = HTTPMethod.post
        request.setValue(bearer(token), forHTTPHeaderField: ProtocolConstants.Header.authorization)
        request.setValue(
            ProtocolConstants.MediaType.upload,
            forHTTPHeaderField: ProtocolConstants.Header.contentType)
        request.setValue(
            try FileNameHeader.encode(file.fileName),
            forHTTPHeaderField: ProtocolConstants.Header.fileName)
        let data = try await send(request, uploading: file.url, progress: progress)
        return try decode(UploadResponse.self, from: data).fileName
    }

    /// Sends a request (streaming `fileURL` as the body, if given) and returns the body of a
    /// successful response. Every failure is mapped to an `IletError`.
    private func send(
        _ request: URLRequest, uploading fileURL: URL? = nil,
        progress: (@Sendable (Double) -> Void)? = nil
    ) async throws -> Data {
        let delegate = PinningTaskDelegate(pinnedFingerprint: fingerprint, onProgress: progress)
        let data: Data
        let response: URLResponse
        do {
            if let fileURL {
                (data, response) = try await session.upload(
                    for: request, fromFile: fileURL, delegate: delegate)
            } else {
                (data, response) = try await session.data(for: request, delegate: delegate)
            }
        } catch {
            if delegate.rejectedCertificate {
                throw IletError.certificateMismatch
            }
            Log.network.error("request failed: \(error.localizedDescription, privacy: .public)")
            throw IletError(connectionError: error)
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw IletError.unexpectedResponse
        }
        guard Self.successStatusCodes.contains(httpResponse.statusCode) else {
            throw serverError(statusCode: httpResponse.statusCode, body: data)
        }
        return data
    }

    private func serverError(statusCode: Int, body: Data) -> IletError {
        guard let response = try? JSONDecoder().decode(ErrorResponse.self, from: body) else {
            Log.network.error("unreadable error response, status \(statusCode, privacy: .public)")
            return .unexpectedResponse
        }
        return IletError(serverCode: ServerErrorCode(rawValue: response.error) ?? .unknown)
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
            Log.network.error(
                "unexpected response: \(error.localizedDescription, privacy: .public)")
            throw IletError.unexpectedResponse
        }
    }
}

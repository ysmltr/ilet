/// The desktop's HTTPS API (PROTOCOL.md section 5), apart from uploads, which go through
/// `BackgroundUploads`. Every implementation is pinned to one certificate; requests to a server
/// with any other certificate fail with `IletError.certificateMismatch` before any request data
/// is sent.
public protocol DesktopClient: Sendable {
    func info(at endpoint: DesktopEndpoint) async throws -> ServerInfo
    /// Returns the access token.
    func pair(
        at endpoint: DesktopEndpoint, secret: String, deviceName: String
    ) async throws
        -> String
    func status(at endpoint: DesktopEndpoint, token: String) async throws -> DeviceStatus
}

public protocol DesktopClientFactory: Sendable {
    func makeClient(pinnedTo fingerprint: CertificateFingerprint) -> any DesktopClient
}

/// The desktop's HTTPS API (PROTOCOL.md section 5). Every implementation is pinned to one
/// certificate; requests to a server with any other certificate fail with
/// `IletError.certificateMismatch` before any request data is sent.
public protocol DesktopClient: Sendable {
    func info(at endpoint: DesktopEndpoint) async throws -> ServerInfo
    /// Returns the access token.
    func pair(at endpoint: DesktopEndpoint, secret: String, deviceName: String) async throws
        -> String
    func status(at endpoint: DesktopEndpoint, token: String) async throws -> DeviceStatus
    /// Returns the name the PC saved the file under.
    func upload(
        _ file: PreparedFile, to endpoint: DesktopEndpoint, token: String,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> String
}

public protocol DesktopClientFactory: Sendable {
    func makeClient(pinnedTo fingerprint: CertificateFingerprint) -> any DesktopClient
}

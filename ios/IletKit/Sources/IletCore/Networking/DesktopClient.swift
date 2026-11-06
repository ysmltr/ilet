/// The desktop's HTTPS API (PROTOCOL.md section 5), apart from uploads and downloads, which go
/// through `BackgroundUploads` and `BackgroundDownloads`. Every implementation is pinned to one
/// certificate; requests to a server with any other certificate fail with
/// `IletError.certificateMismatch` before any request data is sent.
public protocol DesktopClient: Sendable {
    func info(at endpoint: DesktopEndpoint) async throws -> ServerInfo
    /// Returns the access token.
    func pair(
        at endpoint: DesktopEndpoint, secret: String, deviceName: String
    ) async throws
        -> String
    func status(at endpoint: DesktopEndpoint, token: String) async throws -> DeviceStatus
    /// The files that wait for this iPhone (section 5.5), without any whose ID or size is
    /// malformed. A PC with an older ilet answers `IletError.server(.notFound)`.
    func outbox(at endpoint: DesktopEndpoint, token: String) async throws -> [OutboxFile]
    /// Tells the PC that a file is saved, so it deletes its copy (section 5.7). Telling it again
    /// is harmless.
    func confirmReceived(fileID: String, at endpoint: DesktopEndpoint, token: String) async throws
}

public protocol DesktopClientFactory: Sendable {
    func makeClient(pinnedTo fingerprint: CertificateFingerprint) -> any DesktopClient
}

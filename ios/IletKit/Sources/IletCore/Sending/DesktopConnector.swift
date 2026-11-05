import Foundation

public protocol DesktopConnecting: Sendable {
    func connect(to desktop: Desktop) async throws -> DesktopConnection
}

/// Opens a verified connection to a paired PC: finds a working address, checks that the PC
/// still accepts this iPhone, and reads its upload limits.
public struct DesktopConnector: DesktopConnecting {
    private let clientFactory: any DesktopClientFactory
    private let desktopStore: any DesktopStore
    private let credentialStore: any CredentialStore

    public init(
        clientFactory: any DesktopClientFactory, desktopStore: any DesktopStore,
        credentialStore: any CredentialStore
    ) {
        self.clientFactory = clientFactory
        self.desktopStore = desktopStore
        self.credentialStore = credentialStore
    }

    public func connect(to desktop: Desktop) async throws -> DesktopConnection {
        guard let token = try credentialStore.token(for: desktop.id) else {
            throw IletError.notPaired
        }
        let client = clientFactory.makeClient(pinnedTo: desktop.fingerprint)
        let endpoint = try await EndpointResolver(client: client).resolve(
            desktopID: desktop.id, addresses: desktop.addresses, port: desktop.port)
        let status = try await client.status(at: endpoint, token: token)
        var updated = desktop
        updated.prefer(endpoint.address)
        try desktopStore.save(updated)
        return DesktopConnection(
            limits: status.limits, endpoint: endpoint, token: token,
            fingerprint: desktop.fingerprint)
    }
}

/// A checked route to a paired PC, ready for background uploads.
public struct DesktopConnection: Sendable {
    public let limits: UploadLimits
    let endpoint: DesktopEndpoint
    let token: String
    /// The PC's pinned certificate, which background uploads check on every new connection.
    let fingerprint: CertificateFingerprint

    /// Refuses a file over the PC's limit, before any byte of it is sent.
    func checkSize(of file: PreparedFile) throws {
        guard file.sizeBytes <= limits.maxFileSizeBytes else {
            throw IletError.fileTooLarge(limitBytes: limits.maxFileSizeBytes)
        }
    }
}

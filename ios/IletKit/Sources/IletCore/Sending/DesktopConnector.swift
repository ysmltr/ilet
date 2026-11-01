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
            limits: status.limits, endpoint: endpoint, token: token, client: client)
    }
}

/// A checked route to a paired PC, ready for uploads.
public struct DesktopConnection: Sendable {
    public let limits: UploadLimits
    let endpoint: DesktopEndpoint
    let token: String
    let client: any DesktopClient

    /// Uploads one file and returns the name the PC saved it under. Files over the PC's limit
    /// are refused here, before any byte is sent.
    public func upload(
        _ file: PreparedFile, progress: @escaping @Sendable (Double) -> Void
    )
        async throws -> String
    {
        guard file.sizeBytes <= limits.maxFileSizeBytes else {
            throw IletError.fileTooLarge(limitBytes: limits.maxFileSizeBytes)
        }
        return try await client.upload(file, to: endpoint, token: token, progress: progress)
    }
}

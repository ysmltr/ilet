import Foundation

public protocol Pairing: Sendable {
    func pair(using payload: PairingPayload, deviceName: String) async throws -> Desktop
}

/// Pairs with a PC from a scanned QR code (PROTOCOL.md section 4.3). The certificate pin comes
/// from the QR code, so even the very first connection is protected against interception.
public struct PairingService: Pairing {
    private let clientFactory: any DesktopClientFactory
    private let desktopStore: any DesktopStore
    private let credentialStore: any CredentialStore
    private let now: @Sendable () -> Date

    public init(
        clientFactory: any DesktopClientFactory, desktopStore: any DesktopStore,
        credentialStore: any CredentialStore, now: @escaping @Sendable () -> Date
    ) {
        self.clientFactory = clientFactory
        self.desktopStore = desktopStore
        self.credentialStore = credentialStore
        self.now = now
    }

    public func pair(using payload: PairingPayload, deviceName: String) async throws -> Desktop {
        let client = clientFactory.makeClient(pinnedTo: payload.fingerprint)
        let endpoint = try await EndpointResolver(client: client).resolve(
            desktopID: payload.desktopID, addresses: payload.addresses, port: payload.port)
        let token = try await client.pair(
            at: endpoint, secret: payload.secret, deviceName: deviceName)
        var desktop = Desktop(pairing: payload, pairedAt: now())
        desktop.remember(endpoint)
        try credentialStore.saveToken(token, for: desktop.id)
        try desktopStore.save(desktop)
        return desktop
    }
}

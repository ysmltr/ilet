import Foundation

/// A paired PC as this iPhone remembers it. Its access token is kept apart, in the Keychain.
public struct Desktop: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    /// Last known addresses, the most recently working one first.
    public var addresses: [String]
    public var port: Int
    /// The pinned certificate: every connection to this PC must present exactly this one.
    public let fingerprint: CertificateFingerprint
    public let pairedAt: Date

    public init(pairing payload: PairingPayload, pairedAt: Date) {
        id = payload.desktopID
        name = payload.desktopName
        addresses = payload.addresses
        port = payload.port
        fingerprint = payload.fingerprint
        self.pairedAt = pairedAt
    }

    /// Moves an address that just worked to the front, so it is tried first next time.
    mutating func prefer(_ address: String) {
        addresses.removeAll { $0 == address }
        addresses.insert(address, at: 0)
    }
}

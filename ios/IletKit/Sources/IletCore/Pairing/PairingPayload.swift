import Foundation

/// The content of a pairing QR code (PROTOCOL.md section 4.2), validated.
public struct PairingPayload: Equatable, Sendable {
    /// Far above a real payload (about 300 bytes), but bounds the work for hostile codes.
    private static let maxTextBytes = 2048
    private static let base64URLCharacters = Set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    private static let validPorts = 1...65_535
    private static let validAddressCounts = 1...ProtocolConstants.maxPairingAddresses
    private static let validNameLengths = 1...ProtocolConstants.maxDisplayNameLength

    public let desktopID: UUID
    public let desktopName: String
    public let addresses: [String]
    public let port: Int
    public let fingerprint: CertificateFingerprint
    public let secret: String

    /// Accepts only a complete, valid ilet pairing code; anything else throws
    /// `IletError.invalidPairingCode`. Unknown keys are ignored, as the protocol requires.
    public static func parse(_ text: String) throws -> PairingPayload {
        guard text.utf8.count <= maxTextBytes else {
            throw IletError.invalidPairingCode
        }
        let fields: Fields
        do {
            fields = try JSONDecoder().decode(Fields.self, from: Data(text.utf8))
        } catch {
            throw IletError.invalidPairingCode
        }
        guard fields.ilet == ProtocolConstants.pairingPayloadVersion,
            fields.id == fields.id.lowercased(),
            let desktopID = UUID(uuidString: fields.id),
            validNameLengths.contains(fields.name.utf16.count),
            !fields.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            isVisibleText(fields.name),
            validAddressCounts.contains(fields.addresses.count),
            fields.addresses.allSatisfy(LocalNetworkAddress.isAllowed),
            validPorts.contains(fields.port),
            let fingerprint = CertificateFingerprint(hex: fields.fingerprint),
            isWellFormedSecret(fields.secret)
        else {
            throw IletError.invalidPairingCode
        }
        return PairingPayload(
            desktopID: desktopID, desktopName: fields.name, addresses: fields.addresses,
            port: fields.port, fingerprint: fingerprint, secret: fields.secret)
    }

    /// Control, format (such as the right-to-left override) and line separator characters. The PC
    /// never puts them into its name, and the user relies on the name to recognize the PC, so a
    /// code with one is forged.
    private static let invisibleCategories: Set<Unicode.GeneralCategory> = [
        .control, .format, .surrogate, .lineSeparator, .paragraphSeparator,
    ]

    private static func isVisibleText(_ text: String) -> Bool {
        text.unicodeScalars.allSatisfy {
            !invisibleCategories.contains($0.properties.generalCategory)
        }
    }

    private static func isWellFormedSecret(_ secret: String) -> Bool {
        secret.count == ProtocolConstants.encodedSecretLength
            && secret.allSatisfy(base64URLCharacters.contains)
    }

    /// The JSON keys of PROTOCOL.md section 4.2.
    private struct Fields: Decodable {
        let ilet: Int
        let id: String
        let name: String
        let addresses: [String]
        let port: Int
        let fingerprint: String
        let secret: String
    }
}

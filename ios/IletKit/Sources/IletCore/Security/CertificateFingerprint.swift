import CryptoKit
import Foundation

/// SHA-256 of a DER-encoded certificate (PROTOCOL.md section 2.2). It is public information,
/// so plain equality is fine for comparing it.
public struct CertificateFingerprint: Hashable, Sendable {
    private static let lowercaseHexDigits = Set("0123456789abcdef")
    private static let hexDigitsPerByte = 2
    private static let hexRadix = 16

    public let bytes: Data

    public init(certificateData: Data) {
        bytes = Data(SHA256.hash(data: certificateData))
    }

    /// Accepts exactly the protocol's form: 64 lowercase hexadecimal characters.
    public init?(hex: String) {
        guard hex.count == ProtocolConstants.fingerprintHexLength,
            hex.allSatisfy(Self.lowercaseHexDigits.contains)
        else {
            return nil
        }
        var bytes = Data()
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: Self.hexDigitsPerByte)
            guard let byte = UInt8(hex[index..<next], radix: Self.hexRadix) else {
                return nil
            }
            bytes.append(byte)
            index = next
        }
        self.bytes = bytes
    }

    public var hex: String {
        bytes.map { String(format: "%02x", $0) }.joined()
    }
}

extension CertificateFingerprint: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        guard let fingerprint = CertificateFingerprint(hex: try container.decode(String.self))
        else {
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "not a certificate fingerprint")
        }
        self = fingerprint
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(hex)
    }
}

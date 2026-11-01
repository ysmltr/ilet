import Network

/// The addresses a pairing code may name (PROTOCOL.md section 4.2): private IPv4 (RFC 1918) and
/// unique local IPv6 (RFC 4193) literals. Host names and public addresses are refused, so a
/// forged QR code cannot point the app at a server on the internet.
public enum LocalNetworkAddress {
    private struct Subnet {
        let network: [UInt8]
        let prefixLength: Int
    }

    private static let ipv6ByteCount = 16
    private static let bitsPerByte = 8
    private static let allBitsSet: UInt8 = 0xFF
    /// Only these characters can appear in an IP literal; a zone ID ("%en0") or a host name cannot.
    private static let literalCharacters = Set("0123456789abcdefABCDEF.:")

    private static let allowedSubnets = [
        Subnet(network: [10, 0, 0, 0], prefixLength: 8),
        Subnet(network: [172, 16, 0, 0], prefixLength: 12),
        Subnet(network: [192, 168, 0, 0], prefixLength: 16),
        Subnet(network: [0xFC] + Array(repeating: 0, count: ipv6ByteCount - 1), prefixLength: 7),
    ]

    public static func isAllowed(_ address: String) -> Bool {
        guard !address.isEmpty, address.allSatisfy(literalCharacters.contains),
            let bytes = rawBytes(of: address)
        else {
            return false
        }
        return allowedSubnets.contains { subnet in contains(subnet, bytes) }
    }

    private static func rawBytes(of address: String) -> [UInt8]? {
        if let ipv4 = IPv4Address(address) {
            return [UInt8](ipv4.rawValue)
        }
        if let ipv6 = IPv6Address(address) {
            return [UInt8](ipv6.rawValue)
        }
        return nil
    }

    private static func contains(_ subnet: Subnet, _ address: [UInt8]) -> Bool {
        guard address.count == subnet.network.count else {
            return false
        }
        let wholeBytes = subnet.prefixLength / bitsPerByte
        let remainingBits = subnet.prefixLength % bitsPerByte
        guard address.prefix(wholeBytes) == subnet.network.prefix(wholeBytes) else {
            return false
        }
        guard remainingBits > 0 else {
            return true
        }
        let mask = allBitsSet << (bitsPerByte - remainingBits)
        return address[wholeBytes] & mask == subnet.network[wholeBytes] & mask
    }
}

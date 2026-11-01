import Foundation

/// One address of a PC: where requests go.
public struct DesktopEndpoint: Hashable, Sendable {
    public let address: String
    public let port: Int

    /// IPv6 literals need brackets in URLs. Addresses are validated IP literals (see
    /// `LocalNetworkAddress`), so nothing else can end up in the host part of the URL.
    func url(path: String) throws -> URL {
        let host = address.contains(":") ? "[\(address)]" : address
        guard let url = URL(string: "\(ProtocolConstants.scheme)://\(host):\(port)\(path)") else {
            throw IletError.desktopUnreachable
        }
        return url
    }
}

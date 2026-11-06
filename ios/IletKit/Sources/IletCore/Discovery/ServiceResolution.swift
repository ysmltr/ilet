import Darwin
import Dispatch
import dnssd

/// Looks up the numeric addresses and the port of Bonjour services with DNS-SD, without
/// connecting to them. Network framework can only reach a service by connecting to it, and ilet
/// checks every address before it connects anywhere (PROTOCOL.md section 6).
///
/// Confined to one serial queue: create it, call it and cancel it there. DNS-SD calls back on
/// that queue too.
final class ServiceResolution {
    typealias Found = (_ address: String, _ port: Int) -> Void

    private static let noError = DNSServiceErrorType(kDNSServiceErr_NoError)
    private static let added = DNSServiceFlags(kDNSServiceFlagsAdd)
    private static let ipv4AndIPv6 = DNSServiceProtocol(
        kDNSServiceProtocol_IPv4 | kDNSServiceProtocol_IPv6)
    /// `kDNSServiceInterfaceIndexAny`.
    private static let anyInterface: UInt32 = 0
    /// Anyone on the network can announce services, so the lookups of one search are limited.
    private static let maxOperations = 16

    private let queue: DispatchQueue
    private let found: Found
    private var operations: [DNSServiceRef] = []
    /// For each address lookup, the port that its service announced.
    private var ports: [DNSServiceRef: Int] = [:]
    /// Host names, with port and interface, whose addresses are being looked up.
    private var hosts: Set<String> = []

    init(queue: DispatchQueue, found: @escaping Found) {
        self.queue = queue
        self.found = found
    }

    /// An address as a numeric literal, such as "192.168.1.20" or "fd12::20". A link-local IPv6
    /// address keeps its zone ("fe80::1%en0"), which the address rules then refuse.
    static func numericHost(of address: UnsafePointer<sockaddr>) -> String? {
        let capacity = Int(NI_MAXHOST)
        var host = [CChar](repeating: 0, count: capacity)
        let length = socklen_t(address.pointee.sa_len)
        guard
            getnameinfo(address, length, &host, socklen_t(capacity), nil, 0, NI_NUMERICHOST) == 0
        else {
            return nil
        }
        let end = host.firstIndex(of: 0) ?? capacity
        return String(decoding: host[..<end].map { UInt8(bitPattern: $0) }, as: UTF8.self)
    }

    /// Whether a host name is in `.local`, which only Multicast DNS answers. The PC's always is;
    /// the network's DNS server would look up any other name, beyond the local network.
    static func isLocal(_ host: String) -> Bool {
        let name = host.lowercased()
        return name.hasSuffix(".local.") || name.hasSuffix(".local")
    }

    /// Resolves a service from a browse result. Its addresses arrive through `found`, until
    /// `cancel()`.
    func resolve(name: String, type: String, domain: String, interfaceIndex: Int?) {
        guard operations.count < Self.maxOperations else {
            return
        }
        let index = interfaceIndex.flatMap { UInt32(exactly: $0) } ?? Self.anyInterface
        var service: DNSServiceRef?
        let status = DNSServiceResolve(
            &service, 0, index, name, type, domain,
            { _, _, interface, error, _, host, port, _, _, context in
                guard let host, let context else {
                    return
                }
                Unmanaged<ServiceResolution>.fromOpaque(context).takeUnretainedValue().resolved(
                    error: error, host: String(cString: host), port: Int(UInt16(bigEndian: port)),
                    interface: interface)
            }, Unmanaged.passUnretained(self).toOpaque())
        start(service, status)
    }

    /// Ends every lookup; DNS-SD calls back no more.
    func cancel() {
        for operation in operations {
            DNSServiceRefDeallocate(operation)
        }
        operations = []
        ports = [:]
    }

    /// A service resolved to a host name and a port: looks up the host's addresses. Whoever
    /// announced the service chose the name, so only names in `.local` are looked up.
    private func resolved(error: DNSServiceErrorType, host: String, port: Int, interface: UInt32) {
        guard error == Self.noError, Self.isLocal(host), operations.count < Self.maxOperations,
            hosts.insert("\(host) \(port) \(interface)").inserted
        else {
            return
        }
        var lookup: DNSServiceRef?
        let status = DNSServiceGetAddrInfo(
            &lookup, 0, interface, Self.ipv4AndIPv6, host,
            { operation, flags, _, error, _, address, _, context in
                guard let operation, let address, let context else {
                    return
                }
                Unmanaged<ServiceResolution>.fromOpaque(context).takeUnretainedValue()
                    .addressFound(by: operation, error: error, flags: flags, address: address)
            }, Unmanaged.passUnretained(self).toOpaque())
        if let lookup = start(lookup, status) {
            ports[lookup] = port
        }
    }

    private func addressFound(
        by lookup: DNSServiceRef, error: DNSServiceErrorType, flags: DNSServiceFlags,
        address: UnsafePointer<sockaddr>
    ) {
        guard error == Self.noError, flags & Self.added != 0, let port = ports[lookup],
            let host = Self.numericHost(of: address)
        else {
            return
        }
        found(host, port)
    }

    /// Has DNS-SD call back on the queue, or ends an operation that did not start.
    @discardableResult
    private func start(
        _ operation: DNSServiceRef?, _ status: DNSServiceErrorType
    ) -> DNSServiceRef? {
        guard status == Self.noError, let operation else {
            return nil
        }
        guard DNSServiceSetDispatchQueue(operation, queue) == Self.noError else {
            DNSServiceRefDeallocate(operation)
            return nil
        }
        operations.append(operation)
        return operation
    }
}

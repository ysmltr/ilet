import Darwin
import Network
import XCTest

@testable import IletCore

/// The parts of finding a PC again that need no PC on the network: which announcements count,
/// how DNS-SD's addresses become IP literals for the address rules, and ending a search.
final class DiscoveryTests: XCTestCase {
    func testMatchesOnlyTheAnnouncementOfThePairedPC() throws {
        let desktopID = try XCTUnwrap(UUID(uuidString: Fixtures.desktopID))

        XCTAssertTrue(announces(desktopID, ["id": Fixtures.desktopID, "name": "DESKTOP-4F2K"]))
        XCTAssertTrue(announces(desktopID, ["id": Fixtures.desktopID.uppercased()]))
        XCTAssertFalse(announces(desktopID, ["id": UUID().uuidString.lowercased()]))
        XCTAssertFalse(announces(desktopID, ["name": "DESKTOP-4F2K"]))
        XCTAssertFalse(announces(desktopID, ["id": "DESKTOP-4F2K"]))
    }

    func testWritesAddressesAsIPLiterals() {
        var ipv4 = sockaddr_in()
        ipv4.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        ipv4.sin_family = sa_family_t(AF_INET)
        let ipv4Converted = inet_pton(AF_INET, "172.20.10.3", &ipv4.sin_addr)
        var ipv6 = sockaddr_in6()
        ipv6.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.size)
        ipv6.sin6_family = sa_family_t(AF_INET6)
        let ipv6Converted = inet_pton(AF_INET6, "fd12:3456::20", &ipv6.sin6_addr)

        XCTAssertEqual(ipv4Converted, 1)
        XCTAssertEqual(ipv6Converted, 1)
        XCTAssertEqual(numericHost(of: ipv4), "172.20.10.3")
        XCTAssertEqual(numericHost(of: ipv6), "fd12:3456::20")
    }

    /// A link-local IPv6 address works only with its zone, and the address rules refuse it.
    func testRefusesLinkLocalIPv6Addresses() throws {
        var ipv6 = sockaddr_in6()
        ipv6.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.size)
        ipv6.sin6_family = sa_family_t(AF_INET6)
        ipv6.sin6_scope_id = if_nametoindex("lo0")
        let converted = inet_pton(AF_INET6, "fe80::1", &ipv6.sin6_addr)

        let host = try XCTUnwrap(numericHost(of: ipv6))

        XCTAssertEqual(converted, 1)
        XCTAssertTrue(host.hasPrefix("fe80::1"), host)
        XCTAssertFalse(LocalNetworkAddress.isAllowed(host), host)
    }

    /// A fake announcement may name any host; a name outside .local would go to the network's
    /// DNS server, beyond the local network.
    func testLooksUpOnlyHostNamesInLocal() {
        XCTAssertTrue(ServiceResolution.isLocal("ilet-6f1c2a8e.local."))
        XCTAssertTrue(ServiceResolution.isLocal("ILET-6F1C2A8E.LOCAL"))
        XCTAssertFalse(ServiceResolution.isLocal("attacker.example."))
        XCTAssertFalse(ServiceResolution.isLocal("ilet.local.attacker.example."))
        XCTAssertFalse(ServiceResolution.isLocal("local."))
    }

    /// A send that is cancelled must not wait for the search's time limit.
    func testACancelledSearchEndsAtOnce() async {
        let started = ContinuousClock.now
        let search = Task { await BonjourDesktopFinder().endpoints(of: UUID()) }
        search.cancel()

        let found = await search.value

        XCTAssertEqual(found, [])
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2))
    }

    private func announces(_ desktopID: UUID, _ txt: [String: String]) -> Bool {
        BonjourSearch.announces(desktopID, in: NWTXTRecord(txt))
    }

    private func numericHost<Address>(of address: Address) -> String? {
        withUnsafePointer(to: address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                ServiceResolution.numericHost(of: $0)
            }
        }
    }
}

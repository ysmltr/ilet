import XCTest

@testable import IletCore

final class EndpointResolverTests: XCTestCase {
    private let desktopID = UUID()

    func testPicksTheAddressWhereThePairedDesktopAnswers() async throws {
        let client = FakeDesktopClient(answers: [
            "192.168.1.20": .failure(.desktopUnreachable),
            "10.0.0.8": .desktop(id: desktopID.uuidString.lowercased(), protocolVersion: 1),
        ])
        let endpoint = try await resolve(with: client, addresses: ["192.168.1.20", "10.0.0.8"])
        XCTAssertEqual(endpoint, DesktopEndpoint(address: "10.0.0.8", port: 45380))
    }

    func testIgnoresAnotherDesktopAtAKnownAddress() async {
        let client = FakeDesktopClient(answers: [
            "192.168.1.20": .desktop(id: UUID().uuidString.lowercased(), protocolVersion: 1)
        ])
        await assertThrows(.wrongDesktop) {
            _ = try await self.resolve(with: client, addresses: ["192.168.1.20"])
        }
    }

    func testReportsACertificateMismatchOverEverythingElse() async {
        let client = FakeDesktopClient(answers: [
            "192.168.1.20": .failure(.certificateMismatch),
            "10.0.0.8": .failure(.desktopUnreachable),
        ])
        await assertThrows(.certificateMismatch) {
            _ = try await self.resolve(with: client, addresses: ["192.168.1.20", "10.0.0.8"])
        }
    }

    func testPrefersAWorkingAddressOverOneWithAnotherCertificate() async throws {
        let client = FakeDesktopClient(answers: [
            "192.168.1.20": .failure(.certificateMismatch),
            "10.0.0.8": .desktop(id: desktopID.uuidString.lowercased(), protocolVersion: 1),
        ])
        let endpoint = try await resolve(with: client, addresses: ["192.168.1.20", "10.0.0.8"])
        XCTAssertEqual(endpoint.address, "10.0.0.8")
    }

    func testRefusesAnUnsupportedProtocolVersion() async {
        let client = FakeDesktopClient(answers: [
            "192.168.1.20": .desktop(id: desktopID.uuidString.lowercased(), protocolVersion: 2)
        ])
        await assertThrows(.unsupportedProtocolVersion(2)) {
            _ = try await self.resolve(with: client, addresses: ["192.168.1.20"])
        }
    }

    func testReportsAnUnreachableDesktop() async {
        let client = FakeDesktopClient(answers: [:])
        await assertThrows(.desktopUnreachable) {
            _ = try await self.resolve(with: client, addresses: ["192.168.1.20", "10.0.0.8"])
        }
    }

    /// The PC moved, for example to the iPhone's hotspot: its announcement names where it is now.
    func testFindsThePCThroughItsAnnouncementWhenNoKnownAddressAnswers() async throws {
        let client = FakeDesktopClient(answers: [
            "172.20.10.3": .desktop(id: desktopID.uuidString.lowercased(), protocolVersion: 1)
        ])
        let finder = FakeDesktopFinder(found: [
            DesktopEndpoint(address: "172.20.10.3", port: 45381)
        ])

        let endpoint = try await resolve(with: client, addresses: ["192.168.1.20"], finder: finder)

        XCTAssertEqual(endpoint, DesktopEndpoint(address: "172.20.10.3", port: 45381))
    }

    /// While a known address answers, nothing is sent to the network to look for the PC.
    func testDoesNotSearchWhileAKnownAddressAnswers() async throws {
        let client = FakeDesktopClient(answers: [
            "192.168.1.20": .desktop(id: desktopID.uuidString.lowercased(), protocolVersion: 1)
        ])
        let finder = FakeDesktopFinder()

        _ = try await EndpointResolver(client: client, finder: finder, searchDelay: .seconds(60))
            .resolve(desktopID: desktopID, addresses: ["192.168.1.20"], port: 45380)

        let searches = await finder.searches
        XCTAssertEqual(searches, 0)
    }

    /// Anyone can announce the PC's ID. These addresses would even answer as the paired PC, but
    /// a pairing code could never name them, so ilet never connects to them.
    func testTriesOnlyAnnouncedAddressesThatAPairingCodeCouldName() async {
        let paired = FakeDesktopClient.Answer.desktop(
            id: desktopID.uuidString.lowercased(), protocolVersion: 1)
        let client = FakeDesktopClient(answers: [
            "8.8.8.8": paired,
            "fe80::1%en0": paired,
            "127.0.0.1": paired,
            "192.168.1.30": paired,
        ])
        let finder = FakeDesktopFinder(found: [
            DesktopEndpoint(address: "8.8.8.8", port: 45380),
            DesktopEndpoint(address: "fe80::1%en0", port: 45380),
            DesktopEndpoint(address: "127.0.0.1", port: 45380),
            DesktopEndpoint(address: "192.168.1.30", port: 0),
        ])

        await assertThrows(.desktopUnreachable) {
            _ = try await self.resolve(with: client, addresses: ["192.168.1.20"], finder: finder)
        }
    }

    /// An announced address is checked like a known one: another certificate there is a warning.
    func testWarnsWhenTheAnnouncedAddressPresentsAnotherCertificate() async {
        let client = FakeDesktopClient(answers: ["172.20.10.3": .failure(.certificateMismatch)])
        let finder = FakeDesktopFinder(found: [
            DesktopEndpoint(address: "172.20.10.3", port: 45380)
        ])

        await assertThrows(.certificateMismatch) {
            _ = try await self.resolve(with: client, addresses: ["192.168.1.20"], finder: finder)
        }
    }

    private func resolve(
        with client: FakeDesktopClient, addresses: [String], finder: FakeDesktopFinder? = nil
    ) async throws
        -> DesktopEndpoint
    {
        try await EndpointResolver(client: client, finder: finder, searchDelay: .zero).resolve(
            desktopID: desktopID, addresses: addresses, port: 45380)
    }
}

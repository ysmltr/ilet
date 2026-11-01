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

    private func resolve(with client: FakeDesktopClient, addresses: [String]) async throws
        -> DesktopEndpoint
    {
        try await EndpointResolver(client: client).resolve(
            desktopID: desktopID, addresses: addresses, port: 45380)
    }
}

import XCTest

@testable import IletCore

final class PairingAndSendingTests: XCTestCase {
    func testPairingStoresTheTokenAndTheDesktopWithTheWorkingAddressFirst() async throws {
        let payload = try Fixtures.payload()
        let client = FakeDesktopClient(answers: [
            "fd12:3456::20": .desktop(id: Fixtures.desktopID, protocolVersion: 1)
        ])
        let desktopStore = try makeDesktopStore()
        let credentials = InMemoryCredentialStore()

        let desktop = try await pairingService(client, desktopStore, credentials)
            .pair(using: payload, deviceName: "Yeşim’s iPhone")

        XCTAssertEqual(desktop.addresses, ["fd12:3456::20", "192.168.1.20"])
        XCTAssertEqual(try credentials.token(for: desktop.id), "token")
        XCTAssertEqual(try desktopStore.loadDesktops(), [desktop])
        XCTAssertEqual(desktopStore.defaultDesktopID(), desktop.id)
    }

    func testRejectedPairingStoresNothing() async throws {
        let client = FakeDesktopClient(
            answers: ["192.168.1.20": .desktop(id: Fixtures.desktopID, protocolVersion: 1)],
            pairResult: .failure(.pairingRejected))
        let desktopStore = try makeDesktopStore()
        let credentials = InMemoryCredentialStore()
        let payload = try Fixtures.payload()

        await assertThrows(.pairingRejected) {
            _ = try await self.pairingService(client, desktopStore, credentials)
                .pair(using: payload, deviceName: "iPhone")
        }
        XCTAssertEqual(try desktopStore.loadDesktops(), [])
        XCTAssertNil(try credentials.token(for: payload.desktopID))
    }

    func testConnectingWithoutATokenMeansNotPaired() async throws {
        let client = FakeDesktopClient(answers: [:])
        let connector = DesktopConnector(
            clientFactory: FakeClientFactory(client: client), desktopStore: try makeDesktopStore(),
            credentialStore: InMemoryCredentialStore())

        await assertThrows(.notPaired) {
            _ = try await connector.connect(
                to: Desktop(pairing: try Fixtures.payload(), pairedAt: Date()))
        }
    }

    func testRefusesFilesOverTheLimitBeforeSendingAnything() async throws {
        let client = FakeDesktopClient(answers: [:])
        let connection = DesktopConnection(
            limits: UploadLimits(maxFileSizeBytes: 1_000, maxConcurrentUploads: 1),
            endpoint: DesktopEndpoint(address: "192.168.1.20", port: 45380), token: "token",
            client: client)
        let file = PreparedFile(
            url: URL(fileURLWithPath: "/tmp/big.mov"), fileName: "big.mov", sizeBytes: 1_001)

        await assertThrows(.fileTooLarge(limitBytes: 1_000)) {
            _ = try await connection.upload(file) { _ in }
        }
        let uploads = await client.uploads
        XCTAssertEqual(uploads, [])
    }

    func testRemovingTheDefaultDesktopSelectsAnother() throws {
        let store = try makeDesktopStore()
        let first = Desktop(pairing: try Fixtures.payload(), pairedAt: Date())
        var fields = Fixtures.pairingFields()
        fields["id"] = UUID().uuidString.lowercased()
        let second = Desktop(
            pairing: try PairingPayload.parse(try Fixtures.pairingText(fields)), pairedAt: Date())
        try store.save(first)
        try store.save(second)

        try store.remove(desktopID: first.id)

        XCTAssertEqual(try store.loadDesktops(), [second])
        XCTAssertEqual(store.defaultDesktopID(), second.id)
    }

    private func pairingService(
        _ client: FakeDesktopClient, _ desktopStore: AppGroupDesktopStore,
        _ credentials: InMemoryCredentialStore
    ) -> PairingService {
        PairingService(
            clientFactory: FakeClientFactory(client: client), desktopStore: desktopStore,
            credentialStore: credentials, now: { Date(timeIntervalSince1970: 0) })
    }
}

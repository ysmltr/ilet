import XCTest

@testable import IletCore

/// Formats that must match the desktop byte for byte.
final class WireFormatTests: XCTestCase {
    func testFileNamesAreEncodedLikeEncodeURIComponent() throws {
        // Expected values were produced by JavaScript's encodeURIComponent.
        let vectors = [
            ("Fotoğraf 1 (kopya)!~*'.jpg", "Foto%C4%9Fraf%201%20(kopya)!~*'.jpg"),
            ("çay & şeker #2.HEIC", "%C3%A7ay%20%26%20%C5%9Feker%20%232.HEIC"),
            ("e\u{301}.png", "e%CC%81.png"),
            ("a/b\\c?.txt", "a%2Fb%5Cc%3F.txt"),
        ]
        for (name, expected) in vectors {
            XCTAssertEqual(try FileNameHeader.encode(name), expected)
        }
    }

    func testBuildsURLsForIPv4AndIPv6Literals() throws {
        let ipv4 = DesktopEndpoint(address: "192.168.1.20", port: 45380)
        let ipv6 = DesktopEndpoint(address: "fd12:3456::20", port: 45380)

        XCTAssertEqual(
            try ipv4.url(path: "/api/info").absoluteString, "https://192.168.1.20:45380/api/info")
        XCTAssertEqual(
            try ipv6.url(path: "/api/info").absoluteString, "https://[fd12:3456::20]:45380/api/info"
        )
    }

    func testMapsServerErrorCodes() {
        XCTAssertEqual(IletError(serverCode: .unauthorized), .notPaired)
        XCTAssertEqual(IletError(serverCode: .pairingRejected), .pairingRejected)
        XCTAssertEqual(IletError(serverCode: .insufficientStorage), .server(.insufficientStorage))
        XCTAssertEqual(ServerErrorCode(rawValue: "too_many_uploads"), .tooManyUploads)
        XCTAssertNil(ServerErrorCode(rawValue: "added_in_a_future_version"))
    }

    func testAllowsOnlyPrivateAndUniqueLocalAddresses() {
        for address in [
            "10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.20", "fd12:3456::20",
        ] {
            XCTAssertTrue(LocalNetworkAddress.isAllowed(address), address)
        }
        let refused = [
            "", "8.8.8.8", "172.32.0.1", "127.0.0.1", "169.254.1.1", "::1", "fe80::1",
            "2001:db8::1", "localhost", "attacker.example", "fd12::1%en0", "192.168.1.20:80",
        ]
        for address in refused {
            XCTAssertFalse(LocalNetworkAddress.isAllowed(address), address)
        }
    }
}

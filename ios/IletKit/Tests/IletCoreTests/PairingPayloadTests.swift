import XCTest

@testable import IletCore

final class PairingPayloadTests: XCTestCase {
    func testParsesAValidCode() throws {
        let payload = try Fixtures.payload()

        XCTAssertEqual(payload.desktopID, UUID(uuidString: Fixtures.desktopID))
        XCTAssertEqual(payload.desktopName, "DESKTOP-4F2K")
        XCTAssertEqual(payload.addresses, ["192.168.1.20", "fd12:3456::20"])
        XCTAssertEqual(payload.port, 45380)
        XCTAssertEqual(payload.fingerprint.hex, Fixtures.desktopCertificateFingerprint)
        XCTAssertEqual(payload.secret, Fixtures.secret)
    }

    func testIgnoresUnknownKeys() throws {
        var fields = Fixtures.pairingFields()
        fields["addedInAFutureVersion"] = true
        XCTAssertNoThrow(try PairingPayload.parse(try Fixtures.pairingText(fields)))
    }

    func testRejectsEveryBrokenRule() throws {
        let brokenFields: [(String, Any?)] = [
            ("ilet", 2),
            ("ilet", nil),
            ("id", Fixtures.desktopID.uppercased()),
            ("id", "not-a-uuid"),
            ("name", ""),
            ("name", "   "),
            ("name", String(repeating: "x", count: 65)),
            ("addresses", [String]()),
            ("addresses", Array(repeating: "192.168.1.20", count: 9)),
            ("addresses", ["attacker.example"]),
            ("addresses", ["8.8.8.8"]),
            ("addresses", ["fe80::1"]),
            ("addresses", ["fd12::1%en0"]),
            ("addresses", ["192.168.1.20/24"]),
            ("port", 0),
            ("port", 65_536),
            ("fingerprint", Fixtures.desktopCertificateFingerprint.uppercased()),
            ("fingerprint", String(Fixtures.desktopCertificateFingerprint.dropLast())),
            ("secret", String(Fixtures.secret.dropLast())),
            ("secret", Fixtures.secret.replacingOccurrences(of: "q", with: "+")),
        ]
        for (key, value) in brokenFields {
            var fields = Fixtures.pairingFields()
            fields[key] = value
            let text = try Fixtures.pairingText(fields)
            let message = "\(key): \(String(describing: value))"
            XCTAssertThrowsError(try PairingPayload.parse(text), message) { error in
                XCTAssertEqual(error as? IletError, .invalidPairingCode)
            }
        }
    }

    func testRejectsTextThatIsNotAPairingCode() {
        let texts = [
            "", "hello", "https://ilet.example/pair", "[]", "null",
            String(repeating: " ", count: 5000),
        ]
        for text in texts {
            XCTAssertThrowsError(try PairingPayload.parse(text)) { error in
                XCTAssertEqual(error as? IletError, .invalidPairingCode)
            }
        }
    }
}

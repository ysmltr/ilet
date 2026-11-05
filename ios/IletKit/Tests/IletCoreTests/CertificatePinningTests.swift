import XCTest

@testable import IletCore

final class CertificatePinningTests: XCTestCase {
    func testFingerprintMatchesTheDesktopsComputation() throws {
        let fingerprint = CertificateFingerprint(
            certificateData: try Fixtures.desktopCertificateData())
        XCTAssertEqual(fingerprint.hex, Fixtures.desktopCertificateFingerprint)
    }

    func testAcceptsTheServerWithThePinnedCertificate() throws {
        let pinned = try Fixtures.desktopFingerprint()
        XCTAssertTrue(
            CertificatePinning.leafCertificate(of: try Fixtures.serverTrust(), matches: pinned))
    }

    func testRejectsAServerWithAnyOtherCertificate() throws {
        let other = CertificateFingerprint(certificateData: Data("another certificate".utf8))
        XCTAssertFalse(
            CertificatePinning.leafCertificate(of: try Fixtures.serverTrust(), matches: other))
    }

    func testParsesOnlyTheProtocolsFingerprintFormat() {
        XCTAssertNotNil(CertificateFingerprint(hex: Fixtures.desktopCertificateFingerprint))
        XCTAssertNil(
            CertificateFingerprint(hex: Fixtures.desktopCertificateFingerprint.uppercased()))
        XCTAssertNil(
            CertificateFingerprint(hex: String(Fixtures.desktopCertificateFingerprint.dropLast())))
        XCTAssertNil(CertificateFingerprint(hex: String(repeating: "g", count: 64)))
        XCTAssertNil(CertificateFingerprint(hex: String(repeating: "０", count: 64)))
    }

    func testFingerprintSurvivesStorage() throws {
        let fingerprint = try Fixtures.desktopFingerprint()
        let decoded = try JSONDecoder().decode(
            CertificateFingerprint.self, from: try JSONEncoder().encode(fingerprint))
        XCTAssertEqual(decoded, fingerprint)
    }
}

import Security
import XCTest

@testable import IletCore

final class CertificatePinningTests: XCTestCase {
    func testFingerprintMatchesTheDesktopsComputation() throws {
        let fingerprint = CertificateFingerprint(certificateData: try Fixtures.desktopCertificateData())
        XCTAssertEqual(fingerprint.hex, Fixtures.desktopCertificateFingerprint)
    }

    func testAcceptsTheServerWithThePinnedCertificate() throws {
        let pinned = try XCTUnwrap(CertificateFingerprint(hex: Fixtures.desktopCertificateFingerprint))
        XCTAssertTrue(CertificatePinning.leafCertificate(of: try serverTrust(), matches: pinned))
    }

    func testRejectsAServerWithAnyOtherCertificate() throws {
        let other = CertificateFingerprint(certificateData: Data("another certificate".utf8))
        XCTAssertFalse(CertificatePinning.leafCertificate(of: try serverTrust(), matches: other))
    }

    func testParsesOnlyTheProtocolsFingerprintFormat() {
        XCTAssertNotNil(CertificateFingerprint(hex: Fixtures.desktopCertificateFingerprint))
        XCTAssertNil(CertificateFingerprint(hex: Fixtures.desktopCertificateFingerprint.uppercased()))
        XCTAssertNil(CertificateFingerprint(hex: String(Fixtures.desktopCertificateFingerprint.dropLast())))
        XCTAssertNil(CertificateFingerprint(hex: String(repeating: "g", count: 64)))
        XCTAssertNil(CertificateFingerprint(hex: String(repeating: "０", count: 64)))
    }

    func testFingerprintSurvivesStorage() throws {
        let fingerprint = try XCTUnwrap(CertificateFingerprint(hex: Fixtures.desktopCertificateFingerprint))
        let decoded = try JSONDecoder().decode(
            CertificateFingerprint.self, from: try JSONEncoder().encode(fingerprint))
        XCTAssertEqual(decoded, fingerprint)
    }

    /// A trust object for the desktop's certificate, as URLSession would hand it over.
    private func serverTrust() throws -> SecTrust {
        let certificate = try XCTUnwrap(
            SecCertificateCreateWithData(nil, try Fixtures.desktopCertificateData() as CFData))
        var trust: SecTrust?
        let status = SecTrustCreateWithCertificates(certificate, SecPolicyCreateBasicX509(), &trust)
        XCTAssertEqual(status, errSecSuccess)
        return try XCTUnwrap(trust)
    }
}

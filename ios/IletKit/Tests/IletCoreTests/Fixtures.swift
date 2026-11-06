import Foundation
import Security
import XCTest

@testable import IletCore

/// Test vectors produced by the desktop implementation (desktop/src/identity/certificate.ts), so
/// these tests prove that both sides agree.
enum Fixtures {
    /// A certificate created by the desktop's certificate code, base64 in 64-character lines.
    private static let desktopCertificateBase64 = """
        MIIBcjCCARigAwIBAgIRALt4QWYIxKiXezR/FcZOYXswCgYIKoZIzj0EAwIwDzEN
        MAsGA1UEAwwEaWxldDAgFw0yNjExMDEwMDAwMDBaGA85OTk5MTIzMTIzNTk1OVow
        DzENMAsGA1UEAwwEaWxldDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABIt6/5hh
        d1vfD4CR6Y0hWOrAhfX+3n57Mn8daIRvCQNeasdyT/DPxhs26dK5sH7rGoX2o5oU
        NIaiZqLrjZueZESjUzBRMAwGA1UdEwEB/wQCMAAwEwYDVR0lBAwwCgYIKwYBBQUH
        AwEwLAYDVR0RBCUwI4IJbG9jYWxob3N0hwR/AAABhxAAAAAAAAAAAAAAAAAAAAAB
        MAoGCCqGSM49BAMCA0gAMEUCIQD0/e593n8NEThVucCdkpY475tU55IYrrs33uCJ
        D+d2WwIgUzDcbaYAYdsJEoEbNvtVyu7qNYjx0xP+oylMSZkA8bo=
        """

    /// The fingerprint of that certificate, as the desktop computed it.
    static let desktopCertificateFingerprint =
        "2097bbf049208853d52394cee428a483c25450f2ee2309d936950b8a6ecbef7b"

    static let desktopID = "6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23"
    static let secret = "q3Zr0bS8wq3qKk4VQ2Xn0hY5w3m6Jt1oZr8sDpX4u7A"
    /// The entry ID of PROTOCOL.md's outbox example (section 5.5).
    static let outboxFileID = "3f9c2a8e5b7d4c1e9a0b6f8d2c4e1a3b"

    /// A checked route to the paired PC, as the connector returns it.
    static func connection() throws -> DesktopConnection {
        DesktopConnection(
            limits: UploadLimits(maxFileSizeBytes: 1_000, maxConcurrentUploads: 1),
            endpoint: DesktopEndpoint(address: "192.168.1.20", port: 45380), token: "token",
            fingerprint: try desktopFingerprint())
    }

    static func desktopCertificateData() throws -> Data {
        try XCTUnwrap(
            Data(base64Encoded: desktopCertificateBase64, options: .ignoreUnknownCharacters))
    }

    static func desktopFingerprint() throws -> CertificateFingerprint {
        try XCTUnwrap(CertificateFingerprint(hex: desktopCertificateFingerprint))
    }

    /// A trust object for the desktop's certificate, as URLSession would hand it over.
    static func serverTrust() throws -> SecTrust {
        let certificate = try XCTUnwrap(
            SecCertificateCreateWithData(nil, try desktopCertificateData() as CFData))
        var trust: SecTrust?
        let status = SecTrustCreateWithCertificates(certificate, SecPolicyCreateBasicX509(), &trust)
        XCTAssertEqual(status, errSecSuccess)
        return try XCTUnwrap(trust)
    }

    /// The fields of a valid pairing QR code; tests change one at a time.
    static func pairingFields() -> [String: Any] {
        [
            "ilet": 1,
            "id": desktopID,
            "name": "DESKTOP-4F2K",
            "addresses": ["192.168.1.20", "fd12:3456::20"],
            "port": 45380,
            "fingerprint": desktopCertificateFingerprint,
            "secret": secret,
        ]
    }

    static func pairingText(_ fields: [String: Any]) throws -> String {
        let json = try JSONSerialization.data(withJSONObject: fields)
        return try XCTUnwrap(String(bytes: json, encoding: .utf8))
    }

    static func payload() throws -> PairingPayload {
        try PairingPayload.parse(try pairingText(pairingFields()))
    }
}

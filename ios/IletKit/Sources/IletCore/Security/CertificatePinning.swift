import Foundation
import Security

/// Certificate pinning (PROTOCOL.md section 2.2). The server's leaf certificate must be exactly
/// the certificate whose fingerprint came from the QR code. No certificate authority or system
/// trust store is consulted, so even a certificate signed by a trusted CA is rejected.
public enum CertificatePinning {
    public static func leafCertificate(
        of trust: SecTrust, matches pinned: CertificateFingerprint
    )
        -> Bool
    {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
            let leaf = chain.first
        else {
            return false
        }
        return CertificateFingerprint(certificateData: SecCertificateCopyData(leaf) as Data)
            == pinned
    }
}

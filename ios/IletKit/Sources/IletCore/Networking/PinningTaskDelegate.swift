import Foundation
import os

/// Checks the server certificate of one request against the pin and reports upload progress.
///
/// It is a per-request delegate on purpose: the session itself has no delegate, so URLSession
/// hands the server-trust challenge to this object, and after a failure the client can tell a
/// pin mismatch apart from other cancellations.
final class PinningTaskDelegate: NSObject, URLSessionTaskDelegate, Sendable {
    private let pinnedFingerprint: CertificateFingerprint
    private let onProgress: (@Sendable (Double) -> Void)?
    private let certificateRejected = OSAllocatedUnfairLock(initialState: false)

    init(pinnedFingerprint: CertificateFingerprint, onProgress: (@Sendable (Double) -> Void)?) {
        self.pinnedFingerprint = pinnedFingerprint
        self.onProgress = onProgress
    }

    /// True once the server presented a certificate other than the pinned one.
    var rejectedCertificate: Bool {
        certificateRejected.withLock { $0 }
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        // ilet servers never ask for any other kind of authentication.
        guard
            challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
            let trust = challenge.protectionSpace.serverTrust
        else {
            return (.cancelAuthenticationChallenge, nil)
        }
        guard CertificatePinning.leafCertificate(of: trust, matches: pinnedFingerprint) else {
            certificateRejected.withLock { $0 = true }
            Log.network.error("server certificate does not match the pinned fingerprint")
            return (.cancelAuthenticationChallenge, nil)
        }
        return (.useCredential, URLCredential(trust: trust))
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64, totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else {
            return
        }
        onProgress?(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}

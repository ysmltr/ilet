import Foundation

/// The only error type services throw. Lower-level errors are mapped to one of these cases
/// where they happen, and views turn the cases into localized messages.
public enum IletError: Error, Equatable, Sendable {
    /// The scanned QR code is not a valid ilet pairing code.
    case invalidPairingCode
    /// The PC answered neither at a known address nor at one that its announcement named.
    case desktopUnreachable
    /// The PC presented a certificate other than the pinned one. Shown as a security warning.
    case certificateMismatch
    /// A different ilet PC answered at the address.
    case wrongDesktop
    case unsupportedProtocolVersion(Int)
    /// The PC does not know this iPhone's token (anymore).
    case notPaired
    /// Wrong, expired or already used pairing code.
    case pairingRejected
    case server(ServerErrorCode)
    case unexpectedResponse
    case fileTooLarge(limitBytes: Int64)
    case fileUnreadable
    /// A file from the PC could not be saved on this iPhone.
    case fileNotSaved
    case credentialStorage(OSStatus)
    case storageCorrupted
    /// The app is still finishing the share sheet's earlier uploads, so new ones cannot start yet.
    case backgroundUploadsBusy
    case cancelled
}

extension IletError {
    init(serverCode: ServerErrorCode) {
        switch serverCode {
        case .unauthorized:
            self = .notPaired
        case .pairingRejected:
            self = .pairingRejected
        default:
            self = .server(serverCode)
        }
    }

    /// Maps a URLSession error. Only used after the certificate check passed or never ran.
    init(connectionError error: Error) {
        if error is CancellationError {
            self = .cancelled
        } else if let urlError = error as? URLError, urlError.code == .cancelled {
            self = .cancelled
        } else {
            self = .desktopUnreachable
        }
    }
}

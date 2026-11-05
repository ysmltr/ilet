import Foundation
import IletCore

/// Turns errors into localized, user-facing text. Services only throw `IletError`; anything else
/// comes from system frameworks (the photo picker, for example) and gets the generic message.
enum ErrorMessage {
    static func text(for error: Error) -> String {
        guard let error = error as? IletError else {
            return String(localized: "error.generic")
        }
        switch error {
        case .invalidPairingCode:
            return String(localized: "error.invalidPairingCode")
        case .desktopUnreachable:
            return String(localized: "error.desktopUnreachable")
        case .certificateMismatch:
            return String(localized: "error.certificateMismatch")
        case .wrongDesktop:
            return String(localized: "error.wrongDesktop")
        case .unsupportedProtocolVersion:
            return String(localized: "error.unsupportedVersion")
        case .notPaired:
            return String(localized: "error.notPaired")
        case .pairingRejected:
            return String(localized: "error.pairingRejected")
        case .server(let code):
            return text(for: code)
        case .unexpectedResponse:
            return String(localized: "error.unexpectedResponse")
        case .fileTooLarge(let limitBytes):
            let limit = ByteCountFormatter.string(fromByteCount: limitBytes, countStyle: .file)
            return String(localized: "error.fileTooLarge \(limit)")
        case .fileUnreadable:
            return String(localized: "error.fileUnreadable")
        case .credentialStorage, .storageCorrupted:
            return String(localized: "error.storage")
        case .backgroundUploadsBusy:
            return String(localized: "error.backgroundUploadsBusy")
        case .cancelled:
            return String(localized: "error.cancelled")
        }
    }

    private static func text(for code: ServerErrorCode) -> String {
        switch code {
        case .insufficientStorage:
            return String(localized: "error.server.insufficientStorage")
        case .payloadTooLarge:
            return String(localized: "error.server.payloadTooLarge")
        case .tooManyRequests:
            return String(localized: "error.server.tooManyRequests")
        case .tooManyUploads:
            return String(localized: "error.server.busy")
        default:
            return String(localized: "error.server.generic")
        }
    }
}

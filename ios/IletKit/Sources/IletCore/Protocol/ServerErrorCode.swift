/// Error codes from PROTOCOL.md section 3.2.
public enum ServerErrorCode: String, Sendable {
    case invalidRequest = "invalid_request"
    case incompleteUpload = "incomplete_upload"
    case unauthorized
    case forbidden
    case pairingRejected = "pairing_rejected"
    case notFound = "not_found"
    case methodNotAllowed = "method_not_allowed"
    case fileGone = "file_gone"
    case lengthRequired = "length_required"
    case payloadTooLarge = "payload_too_large"
    case unsupportedMediaType = "unsupported_media_type"
    case tooManyRequests = "too_many_requests"
    case internalError = "internal_error"
    case tooManyUploads = "too_many_uploads"
    case tooManyDownloads = "too_many_downloads"
    case insufficientStorage = "insufficient_storage"
    /// A code from a newer desktop version.
    case unknown
}

import Foundation

/// The `Ilet-File-Name` header value (PROTOCOL.md section 5.3): the name as UTF-8, percent-encoded
/// exactly like JavaScript's `encodeURIComponent`, so the header stays plain ASCII.
enum FileNameHeader {
    private static let unreservedCharacters = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

    static func encode(_ fileName: String) throws -> String {
        guard let encoded = fileName.addingPercentEncoding(withAllowedCharacters: unreservedCharacters)
        else {
            throw IletError.fileUnreadable
        }
        return encoded
    }
}

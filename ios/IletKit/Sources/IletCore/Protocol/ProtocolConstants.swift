/// Wire-protocol constants shared with the desktop app. Every value is specified in
/// PROTOCOL.md (section numbers in brackets); change both together.
public enum ProtocolConstants {
    /// [5.1] The version this app speaks.
    static let protocolVersion = 1

    /// [4.2] The `ilet` key of a pairing QR code.
    static let pairingPayloadVersion = 1
    static let maxPairingAddresses = 8

    /// [4.2] Display and device names, in UTF-16 code units.
    public static let maxDisplayNameLength = 64

    /// [3.1] Access tokens and pairing secrets: 32 random bytes as base64url without padding.
    static let encodedSecretLength = 43

    /// [2.2] SHA-256 as lowercase hexadecimal.
    static let fingerprintHexLength = 64

    /// [2] There is no plaintext port.
    static let scheme = "https"
    static let bearerPrefix = "Bearer "

    /// [5]
    enum Path {
        static let info = "/api/info"
        static let pair = "/api/v1/pair"
        static let status = "/api/v1/status"
        static let files = "/api/v1/files"
    }

    enum Method {
        static let post = "POST"
    }

    enum Header {
        static let authorization = "Authorization"
        static let contentType = "Content-Type"
        static let fileName = "Ilet-File-Name"
    }

    enum MediaType {
        static let json = "application/json"
        static let upload = "application/octet-stream"
    }
}

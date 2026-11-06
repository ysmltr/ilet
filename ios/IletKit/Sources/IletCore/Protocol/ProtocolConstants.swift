/// Wire-protocol constants shared with the desktop app. Every value is specified in
/// PROTOCOL.md (section numbers in brackets); change both together.
public enum ProtocolConstants {
    /// [5.1] The version this app speaks.
    static let protocolVersion = 1

    /// [4.2] The `ilet` key of a pairing QR code.
    static let pairingPayloadVersion = 1
    /// [4.2] Also the most addresses the iPhone remembers for a PC.
    static let maxPairingAddresses = 8
    /// [4.2, 6] Ports in pairing codes and in announcements.
    static let validPorts = 1...65_535

    /// [6] What the PC announces on the local network.
    enum Discovery {
        static let serviceType = "_ilet._tcp"
        static let domain = "local."
        /// The TXT key that holds the PC's device ID.
        static let deviceIDKey = "id"
    }

    /// [4.2] Display and device names, in UTF-16 code units.
    public static let maxDisplayNameLength = 64

    /// [3.1] Access tokens and pairing secrets: 32 random bytes as base64url without padding.
    static let encodedSecretLength = 43

    /// [2.2] SHA-256 as lowercase hexadecimal.
    static let fingerprintHexLength = 64

    /// [5.4] An outbox entry's ID: 16 random bytes as lowercase hexadecimal.
    static let outboxFileIDLength = 32
    /// [3.3, 5.4] The most files that wait for one device on a PC.
    static let maxOutboxFiles = 200

    /// [2] There is no plaintext port.
    static let scheme = "https"
    static let bearerPrefix = "Bearer "

    /// [5]
    enum Path {
        static let info = "/api/info"
        static let pair = "/api/v1/pair"
        static let status = "/api/v1/status"
        static let files = "/api/v1/files"
        static let outbox = "/api/v1/outbox"
        static let outboxFile = "/api/v1/outbox/file"
        static let outboxReceived = "/api/v1/outbox/received"
    }

    enum Method {
        static let post = "POST"
    }

    enum Header {
        static let authorization = "Authorization"
        static let contentType = "Content-Type"
        static let fileName = "Ilet-File-Name"
        static let fileID = "Ilet-File-Id"
    }

    enum MediaType {
        static let json = "application/json"
        static let upload = "application/octet-stream"
    }
}

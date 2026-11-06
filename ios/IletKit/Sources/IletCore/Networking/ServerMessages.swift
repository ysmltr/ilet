// JSON bodies of PROTOCOL.md section 5. Unknown keys are ignored, so newer desktop versions can
// add fields.

public struct ServerInfo: Decodable, Sendable {
    public let protocolVersion: Int
    public let deviceId: String
    public let displayName: String
}

public struct UploadLimits: Decodable, Equatable, Sendable {
    public let maxFileSizeBytes: Int64
    public let maxConcurrentUploads: Int

    public init(maxFileSizeBytes: Int64, maxConcurrentUploads: Int) {
        self.maxFileSizeBytes = maxFileSizeBytes
        self.maxConcurrentUploads = maxConcurrentUploads
    }
}

public struct DeviceStatus: Decodable, Sendable {
    public let limits: UploadLimits

    public init(limits: UploadLimits) {
        self.limits = limits
    }
}

struct PairRequest: Encodable {
    let secret: String
    let deviceName: String
}

struct PairResponse: Decodable {
    let token: String
}

struct UploadResponse: Decodable {
    let fileName: String
}

/// A file that waits for this iPhone in a PC's outbox (section 5.5). The PC's timestamps are left
/// out: the iPhone fetches each file as soon as it sees it.
public struct OutboxFile: Decodable, Equatable, Sendable {
    public let id: String
    /// As the PC cleaned it. The iPhone cleans it again before saving (`ReceivedFileName`).
    public let name: String
    public let sizeBytes: Int64
}

extension OutboxFile {
    private static let lowercaseHexDigits = Set("0123456789abcdef")

    /// [5.4] Exactly 32 lowercase hexadecimal characters. No other ID is ever put into a request
    /// or a download's record.
    static func isValidID(_ id: String) -> Bool {
        id.count == ProtocolConstants.outboxFileIDLength
            && id.allSatisfy(lowercaseHexDigits.contains)
    }

    var isUsable: Bool {
        Self.isValidID(id) && sizeBytes >= 0
    }
}

struct OutboxList: Decodable {
    let files: [OutboxFile]

    /// The files whose ID and size have the protocol's form, at most as many as a PC may list.
    var usableFiles: [OutboxFile] {
        Array(files.filter(\.isUsable).prefix(ProtocolConstants.maxOutboxFiles))
    }
}

struct ReceivedRequest: Encodable {
    let id: String
}

struct ErrorResponse: Decodable {
    let error: String
}

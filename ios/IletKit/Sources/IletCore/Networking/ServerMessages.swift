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

struct ErrorResponse: Decodable {
    let error: String
}

import Foundation

/// A file that the app fetches from a PC's outbox. It is kept in its download task's
/// `taskDescription`, so whichever run of the app hears about the task can check its pin and save
/// the file under its name. Nothing in it is secret: the fingerprint is public, and the token
/// stays in the request (THREAT_MODEL.md, T10).
public struct OutboxDownload: Codable, Equatable, Sendable {
    public let fileID: String
    public let desktopID: UUID
    /// Cleaned already: the file is saved under this name, or a numbered one if it is taken.
    public let fileName: String
    public let sizeBytes: Int64
    /// The PC's pinned certificate, which the session checks on every new connection.
    let fingerprint: CertificateFingerprint

    func encoded() throws -> String {
        let data: Data
        do {
            data = try JSONEncoder().encode(self)
        } catch {
            throw IletError.unexpectedResponse
        }
        guard let text = String(bytes: data, encoding: .utf8) else {
            throw IletError.unexpectedResponse
        }
        return text
    }
}

extension OutboxDownload {
    /// The record of a task, or `nil` when it has none, it is unreadable or its ID is malformed.
    init?(_ task: URLSessionTask) {
        guard let text = task.taskDescription,
            let download = try? JSONDecoder().decode(Self.self, from: Data(text.utf8)),
            OutboxFile.isValidID(download.fileID)
        else {
            return nil
        }
        self = download
    }
}

extension URLRequest {
    /// `GET /api/v1/outbox/file` (PROTOCOL.md section 5.6): one file of the outbox, named only by
    /// its ID.
    init(downloading fileID: String, from endpoint: DesktopEndpoint, token: String) throws {
        guard OutboxFile.isValidID(fileID) else {
            throw IletError.unexpectedResponse
        }
        self.init(url: try endpoint.url(path: ProtocolConstants.Path.outboxFile))
        setValue(
            ProtocolConstants.bearerPrefix + token,
            forHTTPHeaderField: ProtocolConstants.Header.authorization)
        setValue(fileID, forHTTPHeaderField: ProtocolConstants.Header.fileID)
    }
}

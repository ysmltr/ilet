import Foundation

extension URLRequest {
    /// `POST /api/v1/files` (PROTOCOL.md section 5.3) without its body: URLSession streams the
    /// file and adds `Content-Length` itself. The app's uploads and the share sheet's background
    /// uploads both use it.
    init(upload fileName: String, to endpoint: DesktopEndpoint, token: String) throws {
        self.init(url: try endpoint.url(path: ProtocolConstants.Path.files))
        httpMethod = ProtocolConstants.Method.post
        setValue(
            ProtocolConstants.bearerPrefix + token,
            forHTTPHeaderField: ProtocolConstants.Header.authorization)
        setValue(
            ProtocolConstants.MediaType.upload,
            forHTTPHeaderField: ProtocolConstants.Header.contentType)
        setValue(
            try FileNameHeader.encode(fileName),
            forHTTPHeaderField: ProtocolConstants.Header.fileName)
    }
}

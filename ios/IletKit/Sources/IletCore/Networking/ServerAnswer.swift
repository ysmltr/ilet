import Foundation

/// Reads the PC's answer to a request (PROTOCOL.md section 3.2): the body of a success, or the
/// error that the PC names.
enum ServerAnswer {
    private static let successStatusCodes = 200..<300

    static func check(statusCode: Int, body: Data) -> Result<Data, IletError> {
        guard !successStatusCodes.contains(statusCode) else {
            return .success(body)
        }
        guard let response = try? JSONDecoder().decode(ErrorResponse.self, from: body) else {
            Log.network.error("unreadable error response, status \(statusCode, privacy: .public)")
            return .failure(.unexpectedResponse)
        }
        let code = ServerErrorCode(rawValue: response.error) ?? .unknown
        return .failure(IletError(serverCode: code))
    }
}

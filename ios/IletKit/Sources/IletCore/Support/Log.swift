import Foundation
import os

/// Unified logging. Tokens, pairing secrets, file contents and file names are never logged.
enum Log {
    private static let subsystem = "app.ilet"

    static let network = Logger(subsystem: subsystem, category: "network")
    static let storage = Logger(subsystem: subsystem, category: "storage")
    static let files = Logger(subsystem: subsystem, category: "files")
}

extension Error {
    /// The error's domain and code, which tell what failed. Its localized description is never
    /// logged: for a file, it names the file ("IMG_0001.HEIC couldn't be copied").
    var logSummary: String {
        let error = self as NSError
        return "\(error.domain) \(error.code)"
    }
}

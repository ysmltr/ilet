import os

/// Unified logging. Tokens, pairing secrets and file contents are never logged.
enum Log {
    private static let subsystem = "app.ilet"

    static let network = Logger(subsystem: subsystem, category: "network")
    static let storage = Logger(subsystem: subsystem, category: "storage")
    static let files = Logger(subsystem: subsystem, category: "files")
}

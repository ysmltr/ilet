import Foundation

/// How a background download ended.
public enum BackgroundDownloadResult: Equatable, Sendable {
    /// The file is among the received files, under this name.
    case saved(fileName: String)
    case failed(IletError)
}

/// What the app hears about its downloads. The handlers run on the session's own queue, not on
/// the main thread.
public struct BackgroundDownloadHandlers: Sendable {
    public var progress: @Sendable (OutboxDownload, Double) -> Void = { _, _ in }
    public var completion: @Sendable (OutboxDownload, BackgroundDownloadResult) -> Void
    /// iOS has delivered every event that it woke the app for.
    public var eventsFinished: @Sendable () -> Void = {}

    public init() {
        completion = { _, _ in }
    }
}

/// The app's downloads from a PC's outbox (PROTOCOL.md sections 5.4 to 5.7). iOS carries them on
/// when the user leaves the app, and wakes the app when they end. It allows one session per
/// identifier in a process, so the app opens this one once, and downloads that an earlier run of
/// the app left come back to it.
///
/// A background session takes no per-request delegate, so each task carries its pin, and the
/// file's name and size, in its record. The session's delegate checks the pin on every new TLS
/// connection and saves a file only once it is complete.
public final class BackgroundDownloads: OutboxDownloading, Sendable {
    public static let appSessionIdentifier = "app.ilet.app-downloads"
    /// A file waits on the PC for at most a day, so no download takes longer.
    private static let longestDownload: TimeInterval = 24 * 60 * 60
    /// Longest silence before a download fails.
    private static let idleTimeout: TimeInterval = 60

    private let session: URLSession

    public init(
        received: ReceivedFiles, ledger: DownloadLedger, handlers: BackgroundDownloadHandlers
    ) {
        let delegate = BackgroundDownloadDelegate(
            received: received, ledger: ledger, handlers: handlers)
        session = URLSession(
            configuration: Self.configuration(), delegate: delegate, delegateQueue: nil)
    }

    public func fileIDsInProgress() async -> Set<String> {
        let unfinished = await session.allTasks.filter { $0.state != .completed }
        return Set(unfinished.compactMap { OutboxDownload($0)?.fileID })
    }

    /// Hands a download to iOS, which carries it on even after the user leaves the app.
    public func start(
        _ file: OutboxFile, from desktopID: UUID, over connection: DesktopConnection
    ) throws
        -> OutboxDownload
    {
        guard file.isUsable else {
            throw IletError.unexpectedResponse
        }
        let download = OutboxDownload(
            fileID: file.id, desktopID: desktopID, fileName: ReceivedFileName.clean(file.name),
            sizeBytes: file.sizeBytes, fingerprint: connection.fingerprint)
        let description = try download.encoded()
        let request = try URLRequest(
            downloading: file.id, from: connection.endpoint, token: connection.token)
        let task = session.downloadTask(with: request)
        task.taskDescription = description
        task.resume()
        return download
    }

    private static func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.background(withIdentifier: appSessionIdentifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        // The PC is on the local network, never behind mobile data.
        configuration.allowsCellularAccess = false
        // One file at a time over one kept-alive connection: later files need no new certificate
        // check, which could have to wake the app.
        configuration.httpMaximumConnectionsPerHost = 1
        configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
        configuration.timeoutIntervalForRequest = idleTimeout
        configuration.timeoutIntervalForResource = longestDownload
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        return configuration
    }
}

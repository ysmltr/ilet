import Foundation

/// How a background upload ended.
public enum BackgroundUploadResult: Equatable, Sendable {
    /// The PC saved the file, under the name it reports when its answer arrives.
    case sent(savedAs: String?)
    case failed(IletError)
}

/// What the share sheet or the app hears about background uploads. The handlers run on the
/// session's own queue, not on the main thread.
public struct BackgroundUploadHandlers: Sendable {
    public var progress: @Sendable (UUID, Double) -> Void = { _, _ in }
    public var completion: @Sendable (UUID, BackgroundUploadResult) -> Void = { _, _ in }
    /// iOS has delivered every event that it woke the app for.
    public var eventsFinished: @Sendable () -> Void = {}

    public init() {}
}

/// Uploads that iOS carries on in the background: the share sheet's after the sheet closes, and
/// the app's after the user leaves it. Each share sheet opens a session of its own, so two never
/// meet; once the sheet is gone, iOS wakes the app with that session's identifier for the
/// remaining events. The app keeps one session of its own for as long as it runs.
///
/// A background session takes no per-request delegate, so each task carries its pin in its
/// `taskDescription`, and the session's delegate checks it on every new TLS connection, together
/// with whether a PC with that pin is still paired.
public final class BackgroundUploads: Sendable {
    /// The app's own session. iOS allows one session per identifier in a process, so the app
    /// opens it once, and uploads that an earlier run of the app left come back to it.
    public static let appSessionIdentifier = "app.ilet.app-uploads"
    /// The longest an upload may take, waiting for the Wi-Fi included, before iOS gives up.
    public static let longestUpload: TimeInterval = 24 * 60 * 60
    /// Copies older than this are leftovers, whose uploads ended long ago.
    public static let leftoverAge = 2 * longestUpload
    private static let shareSheetIdentifierPrefix = "app.ilet.background-uploads."
    /// Longest silence before an upload fails.
    private static let idleTimeout: TimeInterval = 60

    private let session: URLSession
    private let delegate: BackgroundUploadDelegate

    /// Opens a session: a new one for a share sheet without `identifier`, or else the one with
    /// that identifier, such as the app's own or a share sheet's that iOS woke the app for.
    public init(
        identifier: String? = nil, appGroup: String, copies: TemporaryFiles,
        desktops: any DesktopStore, handlers: BackgroundUploadHandlers
    ) {
        let identifier = identifier ?? Self.shareSheetIdentifierPrefix + UUID().uuidString
        let delegate = BackgroundUploadDelegate(
            copies: copies, desktops: desktops, handlers: handlers)
        self.delegate = delegate
        session = URLSession(
            configuration: Self.configuration(identifier: identifier, appGroup: appGroup),
            delegate: delegate, delegateQueue: nil)
    }

    /// True for the identifiers of the share sheets' sessions, which iOS may wake the app for
    /// once a sheet is gone.
    public static func isShareSheetSession(_ identifier: String) -> Bool {
        identifier.hasPrefix(shareSheetIdentifierPrefix)
    }

    /// True once the session has let go of every upload.
    public var hasEnded: Bool {
        delegate.hasEnded
    }

    /// Hands a prepared copy to iOS. From here on the copy belongs to the upload: whichever
    /// process hears that the upload ended deletes it.
    public func start(_ file: PreparedFile, id: UUID, over connection: DesktopConnection) throws {
        try connection.checkSize(of: file)
        // A task in a session that is letting go would crash the process.
        guard !delegate.isClosed else {
            throw IletError.backgroundUploadsBusy
        }
        let record = BackgroundUploadRecord(
            id: id, fingerprint: connection.fingerprint,
            folder: file.url.deletingLastPathComponent().lastPathComponent)
        let description = try record.encoded()
        let request = try URLRequest(
            upload: file.fileName, to: connection.endpoint, token: connection.token)
        let task = session.uploadTask(with: request, fromFile: file.url)
        task.taskDescription = description
        task.resume()
    }

    /// The user forgot the PC with this certificate on the iPhone: its uploads that iOS still
    /// holds end now, also one that is under way over a connection that is already open. Each
    /// copy is deleted as its upload ends.
    public func cancelUploads(pinnedTo fingerprint: CertificateFingerprint) async {
        let tasks = await session.allTasks
        for task in tasks where BackgroundUploadRecord(task)?.fingerprint == fingerprint {
            task.cancel()
        }
    }

    /// Lets go of the session. Uploads under way carry on, and iOS hands their remaining events
    /// to the app.
    public func disconnect() {
        delegate.close()
        session.finishTasksAndInvalidate()
    }

    private static func configuration(
        identifier: String, appGroup: String
    ) -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.background(withIdentifier: identifier)
        configuration.sharedContainerIdentifier = appGroup
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        // The PC is on the local network, never behind mobile data.
        configuration.allowsCellularAccess = false
        // One file at a time over one kept-alive connection: the PC's upload limit holds, and
        // later files need no new certificate check, which could have to wake the app.
        configuration.httpMaximumConnectionsPerHost = 1
        configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
        configuration.timeoutIntervalForRequest = idleTimeout
        configuration.timeoutIntervalForResource = longestUpload
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        return configuration
    }
}

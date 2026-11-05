import Foundation
import IletCore

/// The app's own background uploads: one session for as long as the app runs, so uploads carry
/// on when the user switches apps or locks the iPhone. iOS allows one session per identifier in a
/// process, and both the send screen and the app delegate, when iOS wakes the app for the
/// session's events, need it, so there is only `shared`.
@MainActor
final class AppUploads {
    static let shared = AppUploads()

    /// What the send screen hears about the uploads of this run of the app.
    var onProgress: @MainActor (UUID, Double) -> Void = { _, _ in }
    var onCompletion: @MainActor (UUID, BackgroundUploadResult) -> Void = { _, _ in }

    private let session: BackgroundUploads
    /// Tells iOS that the events it woke the app for are in, so it may suspend the app again.
    private var eventsCompletionHandler: (() -> Void)?

    /// Opening the session at once also hands it the uploads that an earlier run of the app
    /// left, so their copies are deleted when they end.
    private init() {
        session = BackgroundUploads(
            identifier: BackgroundUploads.appSessionIdentifier,
            appGroup: AppConfiguration.fromMainBundle().appGroupIdentifier,
            copies: .appUploads, handlers: Self.handlers())
    }

    /// Hands a prepared copy to iOS, which sends it even after the user leaves the app.
    func start(_ file: PreparedFile, id: UUID, over connection: DesktopConnection) throws {
        try session.start(file, id: id, over: connection)
    }

    /// iOS woke the app for this session's events.
    func handleEvents(completionHandler: @escaping () -> Void) {
        eventsCompletionHandler?()
        eventsCompletionHandler = completionHandler
    }

    private func finishEvents() {
        eventsCompletionHandler?()
        eventsCompletionHandler = nil
    }

    /// The session's events go to the one instance there is.
    private static func handlers() -> BackgroundUploadHandlers {
        var handlers = BackgroundUploadHandlers()
        handlers.progress = { id, fraction in
            Task { @MainActor in AppUploads.shared.onProgress(id, fraction) }
        }
        handlers.completion = { id, result in
            Task { @MainActor in AppUploads.shared.onCompletion(id, result) }
        }
        handlers.eventsFinished = {
            Task { @MainActor in AppUploads.shared.finishEvents() }
        }
        return handlers
    }
}

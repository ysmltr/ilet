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
    private let events: BackgroundEvents

    /// Opening the session at once also hands it the uploads that an earlier run of the app
    /// left, so their copies are deleted when they end.
    private init() {
        let configuration = AppConfiguration.fromMainBundle()
        events = BackgroundEvents()
        session = BackgroundUploads(
            identifier: BackgroundUploads.appSessionIdentifier,
            appGroup: configuration.appGroupIdentifier, copies: .appUploads,
            desktops: AppGroupDesktopStore(defaults: configuration.appGroupDefaults()),
            handlers: Self.handlers())
    }

    /// Hands a prepared copy to iOS, which sends it even after the user leaves the app.
    func start(_ file: PreparedFile, id: UUID, over connection: DesktopConnection) throws {
        try session.start(file, id: id, over: connection)
    }

    /// The user forgot this PC: the uploads to it that iOS still holds end now.
    func cancelUploads(to desktop: Desktop) async {
        await session.cancelUploads(pinnedTo: desktop.fingerprint)
    }

    /// iOS woke the app for this session's events.
    func handleEvents(completionHandler: @escaping () -> Void) {
        events.handle(completionHandler: completionHandler)
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
            Task { @MainActor in AppUploads.shared.events.finish() }
        }
        return handlers
    }
}

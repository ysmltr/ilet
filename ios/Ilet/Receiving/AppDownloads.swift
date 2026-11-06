import Foundation
import IletCore

/// The app's downloads from PCs: one background session for as long as the app runs, so a file
/// keeps coming when the user switches apps or locks the iPhone. iOS allows one session per
/// identifier in a process, and both the receive list and the app delegate, when iOS wakes the
/// app for the session's events, need it, so there is only `shared`.
@MainActor
final class AppDownloads {
    static let shared = AppDownloads()

    /// What the receive list hears about the downloads, of this run of the app or an earlier one.
    var onProgress: @MainActor (OutboxDownload, Double) -> Void = { _, _ in }
    var onCompletion: @MainActor (OutboxDownload, BackgroundDownloadResult) -> Void = { _, _ in }

    /// The app's Documents folder, which the Files app shows as On My iPhone › ilet.
    let received: ReceivedFiles
    /// The files saved in the last two days, so that none comes twice.
    let ledger: DownloadLedger
    let session: BackgroundDownloads
    private let events: BackgroundEvents

    /// Opening the session at once also hands it the downloads that an earlier run of the app
    /// left, so those files are saved when they arrive.
    private init() {
        let defaults = AppConfiguration.fromMainBundle().appGroupDefaults()
        let received = ReceivedFiles.documents
        let ledger = DownloadLedger(defaults: defaults)
        self.received = received
        self.ledger = ledger
        events = BackgroundEvents()
        session = BackgroundDownloads(
            received: received, ledger: ledger, desktops: AppGroupDesktopStore(defaults: defaults),
            handlers: Self.handlers())
    }

    /// iOS woke the app for this session's events.
    func handleEvents(completionHandler: @escaping () -> Void) {
        events.handle(completionHandler: completionHandler)
    }

    /// The user forgot this PC: the downloads from it that iOS still holds end now.
    func cancelDownloads(from desktop: Desktop) async {
        await session.cancelDownloads(from: desktop.id)
    }

    /// The session's events go to the one instance there is.
    private static func handlers() -> BackgroundDownloadHandlers {
        var handlers = BackgroundDownloadHandlers()
        handlers.progress = { download, fraction in
            Task { @MainActor in AppDownloads.shared.onProgress(download, fraction) }
        }
        handlers.completion = { download, result in
            Task { @MainActor in AppDownloads.shared.onCompletion(download, result) }
        }
        handlers.eventsFinished = {
            Task { @MainActor in AppDownloads.shared.events.finish() }
        }
        return handlers
    }
}

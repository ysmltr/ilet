import IletCore
import UIKit

/// Finishes background uploads when iOS wakes the app for their events: the app's own, and the
/// share sheet's once the sheet is gone. For a share sheet's, the app opens that session, whose
/// delegate checks the pin of any new connection and deletes each finished copy, and then lets
/// go of it again.
@MainActor
final class IletAppDelegate: NSObject, UIApplicationDelegate {
    private var sessions: [String: BackgroundUploads] = [:]
    private var completionHandlers: [String: () -> Void] = [:]

    func application(
        _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        if identifier == BackgroundUploads.appSessionIdentifier {
            AppUploads.shared.handleEvents(completionHandler: completionHandler)
            return
        }
        guard BackgroundUploads.isShareSheetSession(identifier) else {
            completionHandler()
            return
        }
        completionHandlers.removeValue(forKey: identifier)?()
        completionHandlers[identifier] = completionHandler
        sessions = sessions.filter { !$0.value.hasEnded }
        if sessions[identifier] == nil {
            sessions[identifier] = makeSession(identifier: identifier)
        }
    }

    private func makeSession(identifier: String) -> BackgroundUploads {
        var handlers = BackgroundUploadHandlers()
        handlers.eventsFinished = { [weak self] in
            Task { @MainActor [weak self] in self?.finishEvents(of: identifier) }
        }
        return BackgroundUploads(
            identifier: identifier,
            appGroup: AppConfiguration.fromMainBundle().appGroupIdentifier,
            copies: .appUploads, handlers: handlers)
    }

    /// iOS delivered the waiting events. The app lets go of the session, which ends once its last
    /// upload does, and tells iOS that it is done.
    private func finishEvents(of identifier: String) {
        sessions[identifier]?.disconnect()
        completionHandlers.removeValue(forKey: identifier)?()
    }
}

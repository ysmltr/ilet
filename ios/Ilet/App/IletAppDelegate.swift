import IletCore
import UIKit

/// Finishes the share sheet's background uploads. When the sheet is gone, iOS wakes the app with
/// the upload session's identifier; the app opens that session, whose delegate checks the pin of
/// any new connection and deletes each finished copy, and then lets go of it again.
@MainActor
final class IletAppDelegate: NSObject, UIApplicationDelegate {
    private var sessions: [String: BackgroundUploads] = [:]
    private var completionHandlers: [String: () -> Void] = [:]

    func application(
        _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        guard BackgroundUploads.isSession(identifier) else {
            completionHandler()
            return
        }
        completionHandlers.removeValue(forKey: identifier)?()
        completionHandlers[identifier] = completionHandler
        sessions = sessions.filter { !$0.value.hasEnded }
        if sessions[identifier] == nil {
            sessions[identifier] = makeSession(identifier: identifier)
        }
        if sessions[identifier] == nil {
            finishEvents(of: identifier)
        }
    }

    private func makeSession(identifier: String) -> BackgroundUploads? {
        let appGroup = AppConfiguration.fromMainBundle().appGroupIdentifier
        guard let copies = TemporaryFiles.backgroundUploads(appGroup: appGroup) else {
            return nil
        }
        var handlers = BackgroundUploadHandlers()
        handlers.eventsFinished = { [weak self] in
            Task { @MainActor [weak self] in self?.finishEvents(of: identifier) }
        }
        return BackgroundUploads(
            identifier: identifier, appGroup: appGroup, copies: copies, handlers: handlers)
    }

    /// iOS delivered the waiting events. The app lets go of the session, which ends once its last
    /// upload does, and tells iOS that it is done.
    private func finishEvents(of identifier: String) {
        sessions[identifier]?.disconnect()
        completionHandlers.removeValue(forKey: identifier)?()
    }
}

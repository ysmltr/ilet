import UIKit

/// A little time that iOS gives the app after the user leaves it, to finish preparing files and
/// hand them to the background uploads. When iOS says the time is up, the app lets go and is
/// suspended; preparing carries on when the user comes back.
@MainActor
final class BackgroundTime {
    private var identifier = UIBackgroundTaskIdentifier.invalid

    init(for name: String) {
        identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            self?.end()
        }
    }

    func end() {
        guard identifier != .invalid else {
            return
        }
        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }
}

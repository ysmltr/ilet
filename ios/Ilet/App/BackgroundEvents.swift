/// Tells iOS when the events that it woke the app for have all arrived, so it may suspend the
/// app again. A session opens when the app starts, so iOS may deliver every event before it hands
/// over the completion handler; then iOS hears at once.
@MainActor
final class BackgroundEvents {
    private var completionHandler: (() -> Void)?
    private var finishedEarly = false

    /// iOS woke the app for a session's events.
    func handle(completionHandler: @escaping () -> Void) {
        self.completionHandler?()
        self.completionHandler = nil
        if finishedEarly {
            finishedEarly = false
            completionHandler()
        } else {
            self.completionHandler = completionHandler
        }
    }

    /// The session has delivered every event.
    func finish() {
        guard let completionHandler else {
            finishedEarly = true
            return
        }
        self.completionHandler = nil
        completionHandler()
    }
}

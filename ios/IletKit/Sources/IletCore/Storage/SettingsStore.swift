import Foundation

public protocol SettingsStore: Sendable {
    /// Convert HEIC photos to JPG before sending, because Windows cannot open HEIC by default.
    func sendAsJPEG() -> Bool
    func setSendAsJPEG(_ enabled: Bool)
}

/// Keeps settings in the App Group's user defaults, shared with the Share Extension.
/// UserDefaults is thread-safe, which is why this class can be shared across tasks.
public final class AppGroupSettingsStore: SettingsStore, @unchecked Sendable {
    private enum Key {
        static let sendAsJPEG = "sendAsJPEG"
    }

    private static let sendAsJPEGByDefault = true

    private let defaults: UserDefaults

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public func sendAsJPEG() -> Bool {
        defaults.object(forKey: Key.sendAsJPEG) as? Bool ?? Self.sendAsJPEGByDefault
    }

    public func setSendAsJPEG(_ enabled: Bool) {
        defaults.set(enabled, forKey: Key.sendAsJPEG)
    }
}

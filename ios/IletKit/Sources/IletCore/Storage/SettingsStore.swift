import Foundation

public protocol SettingsStore: Sendable {
    /// Convert HEIC photos to JPG and HEVC videos to MP4 (H.264) before sending, because Windows
    /// cannot open either without extra apps.
    func sendCompatibleFormats() -> Bool
    func setSendCompatibleFormats(_ enabled: Bool)
}

/// Keeps settings in the App Group's user defaults, shared with the Share Extension.
/// UserDefaults is thread-safe, which is why this class can be shared across tasks.
public final class AppGroupSettingsStore: SettingsStore, @unchecked Sendable {
    private enum Key {
        /// The setting's first name, from when it was only about photos. It stays, so the
        /// user's choice survives updates.
        static let sendCompatibleFormats = "sendAsJPEG"
    }

    private static let sendCompatibleFormatsByDefault = true

    private let defaults: UserDefaults

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public func sendCompatibleFormats() -> Bool {
        defaults.object(forKey: Key.sendCompatibleFormats) as? Bool
            ?? Self.sendCompatibleFormatsByDefault
    }

    public func setSendCompatibleFormats(_ enabled: Bool) {
        defaults.set(enabled, forKey: Key.sendCompatibleFormats)
    }
}

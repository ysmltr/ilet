import Foundation

/// Identifiers that come from the build settings (Config/Shared.xcconfig) through Info.plist, so
/// they are defined in one place for the app and the Share Extension.
struct AppConfiguration {
    private enum InfoKey {
        static let appGroup = "IletAppGroupIdentifier"
        static let keychainAccessGroup = "IletKeychainAccessGroup"
    }

    let appGroupIdentifier: String
    let keychainAccessGroup: String

    static func fromMainBundle() -> AppConfiguration {
        AppConfiguration(
            appGroupIdentifier: infoValue(InfoKey.appGroup),
            keychainAccessGroup: infoValue(InfoKey.keychainAccessGroup))
    }

    /// The App Group's user defaults, where the app and the Share Extension keep the paired PCs.
    func appGroupDefaults() -> UserDefaults {
        guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
            preconditionFailure("App Group \(appGroupIdentifier) is not available")
        }
        return defaults
    }

    /// A missing value means a broken build configuration, not something the app could handle.
    private static func infoValue(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty
        else {
            preconditionFailure("Info.plist has no value for \(key)")
        }
        return value
    }
}

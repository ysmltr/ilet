import Foundation
import IletCore

/// The share sheet's composition root: the app's stores, and copies in the App Group, where the
/// app can still delete them after the sheet closes.
struct ShareDependencies {
    /// The share sheet may use about 120 MB in all, and converting a photo takes its decoded size.
    private static let conversionMemoryLimit: Int64 = 48 * 1024 * 1024

    let appGroup: String
    let desktopStore: any DesktopStore
    let settingsStore: any SettingsStore
    let connector: any DesktopConnecting
    let preparer: any FilePreparing
    let copies: TemporaryFiles

    static func live() -> ShareDependencies {
        let configuration = AppConfiguration.fromMainBundle()
        let appGroup = configuration.appGroupIdentifier
        guard let defaults = UserDefaults(suiteName: appGroup),
            let copies = TemporaryFiles.backgroundUploads(appGroup: appGroup)
        else {
            preconditionFailure("App Group \(appGroup) is not available")
        }
        let cutoff = Date(timeIntervalSinceNow: -BackgroundUploads.leftoverAge)
        copies.removeFolders(madeBefore: cutoff)

        let desktopStore = AppGroupDesktopStore(defaults: defaults)
        let credentialStore = KeychainCredentialStore(
            accessGroup: configuration.keychainAccessGroup)
        return ShareDependencies(
            appGroup: appGroup,
            desktopStore: desktopStore,
            settingsStore: AppGroupSettingsStore(defaults: defaults),
            connector: DesktopConnector(
                clientFactory: PinnedClientFactory(), desktopStore: desktopStore,
                credentialStore: credentialStore),
            preparer: FilePreparer(
                temporaryFiles: copies, conversionMemoryLimit: conversionMemoryLimit),
            copies: copies)
    }
}

import Foundation
import IletCore

/// The share sheet's composition root: the app's stores, and copies in the App Group, where the
/// app can still delete them after the sheet closes.
struct ShareDependencies {
    /// The share sheet may use about 120 MB in all. Converting a photo takes its decoded size,
    /// and converting a video holds several decoded frames, so 4K videos stay HEVC here.
    private static let conversionLimits = ConversionLimits(
        photoBytes: 48 * 1024 * 1024, videoFramePixels: 1920 * 1080)

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
                credentialStore: credentialStore, finder: BonjourDesktopFinder()),
            preparer: FilePreparer(temporaryFiles: copies, limits: conversionLimits),
            copies: copies)
    }
}

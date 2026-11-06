import Foundation
import IletCore
import UIKit

/// Composition root: creates the services once and hands them to the view models.
@MainActor
struct AppDependencies {
    let desktopStore: any DesktopStore
    let settingsStore: any SettingsStore
    let credentialStore: any CredentialStore
    let pairing: any Pairing
    let connector: any DesktopConnecting
    let filePreparer: any FilePreparing
    let copies: TemporaryFiles
    let uploads: AppUploads
    let receiver: OutboxReceiver
    let downloads: AppDownloads

    static func live() -> AppDependencies {
        let configuration = AppConfiguration.fromMainBundle()
        guard let defaults = UserDefaults(suiteName: configuration.appGroupIdentifier) else {
            preconditionFailure("App Group \(configuration.appGroupIdentifier) is not available")
        }
        let copies = TemporaryFiles.appUploads
        let cutoff = Date(timeIntervalSinceNow: -BackgroundUploads.leftoverAge)
        copies.removeFolders(madeBefore: cutoff)

        let desktopStore = AppGroupDesktopStore(defaults: defaults)
        let credentialStore = KeychainCredentialStore(
            accessGroup: configuration.keychainAccessGroup)
        let clientFactory = PinnedClientFactory()
        // Opened at once, like the uploads, so downloads that an earlier run left come back.
        let downloads = AppDownloads.shared
        return AppDependencies(
            desktopStore: desktopStore,
            settingsStore: AppGroupSettingsStore(defaults: defaults),
            credentialStore: credentialStore,
            pairing: PairingService(
                clientFactory: clientFactory, desktopStore: desktopStore,
                credentialStore: credentialStore, now: { Date() }),
            connector: DesktopConnector(
                clientFactory: clientFactory, desktopStore: desktopStore,
                credentialStore: credentialStore, finder: BonjourDesktopFinder()),
            filePreparer: FilePreparer(temporaryFiles: copies),
            copies: copies,
            uploads: .shared,
            receiver: OutboxReceiver(
                clientFactory: clientFactory, downloads: downloads.session,
                ledger: downloads.ledger),
            downloads: downloads)
    }

    func makeDesktopsViewModel() -> DesktopsViewModel {
        DesktopsViewModel(store: desktopStore, credentials: credentialStore)
    }

    func makeSendViewModel() -> SendViewModel {
        SendViewModel(
            connector: connector, preparer: filePreparer, settings: settingsStore,
            uploads: uploads, copies: copies)
    }

    func makeReceiveViewModel() -> ReceiveViewModel {
        ReceiveViewModel(connector: connector, receiver: receiver, downloads: downloads)
    }

    func makePairingViewModel() -> PairingViewModel {
        PairingViewModel(pairing: pairing, suggestedDeviceName: UIDevice.current.name)
    }
}

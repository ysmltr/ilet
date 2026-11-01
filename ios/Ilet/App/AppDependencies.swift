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

    static func live() -> AppDependencies {
        let configuration = AppConfiguration.fromMainBundle()
        guard let defaults = UserDefaults(suiteName: configuration.appGroupIdentifier) else {
            preconditionFailure("App Group \(configuration.appGroupIdentifier) is not available")
        }
        TemporaryFiles.outgoing.removeAll()

        let desktopStore = AppGroupDesktopStore(defaults: defaults)
        let credentialStore = KeychainCredentialStore(
            accessGroup: configuration.keychainAccessGroup)
        let clientFactory = PinnedClientFactory()
        return AppDependencies(
            desktopStore: desktopStore,
            settingsStore: AppGroupSettingsStore(defaults: defaults),
            credentialStore: credentialStore,
            pairing: PairingService(
                clientFactory: clientFactory, desktopStore: desktopStore,
                credentialStore: credentialStore, now: { Date() }),
            connector: DesktopConnector(
                clientFactory: clientFactory, desktopStore: desktopStore,
                credentialStore: credentialStore),
            filePreparer: FilePreparer())
    }

    func makeDesktopsViewModel() -> DesktopsViewModel {
        DesktopsViewModel(store: desktopStore, credentials: credentialStore)
    }

    func makeSendViewModel() -> SendViewModel {
        SendViewModel(connector: connector, preparer: filePreparer, settings: settingsStore)
    }

    func makePairingViewModel() -> PairingViewModel {
        PairingViewModel(pairing: pairing, suggestedDeviceName: UIDevice.current.name)
    }
}

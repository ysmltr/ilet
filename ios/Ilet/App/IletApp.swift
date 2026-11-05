import SwiftUI

@main
struct IletApp: App {
    /// Receives the share sheet's background uploads when iOS wakes the app for them.
    @UIApplicationDelegateAdaptor(IletAppDelegate.self) private var appDelegate
    private let dependencies: AppDependencies
    @StateObject private var desktops: DesktopsViewModel
    @StateObject private var sender: SendViewModel

    init() {
        let dependencies = AppDependencies.live()
        self.dependencies = dependencies
        _desktops = StateObject(wrappedValue: dependencies.makeDesktopsViewModel())
        _sender = StateObject(wrappedValue: dependencies.makeSendViewModel())
    }

    var body: some Scene {
        WindowGroup {
            HomeView(
                desktops: desktops, sender: sender,
                makePairingViewModel: dependencies.makePairingViewModel)
        }
    }
}

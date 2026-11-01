import SwiftUI

@main
struct IletApp: App {
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

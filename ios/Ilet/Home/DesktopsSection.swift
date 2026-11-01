import IletCore
import SwiftUI

/// The paired PCs: tap one to send to it, swipe to forget it.
struct DesktopsSection: View {
    @ObservedObject var viewModel: DesktopsViewModel
    let onPairAnother: () -> Void

    var body: some View {
        Section {
            ForEach(viewModel.desktops) { desktop in
                Button {
                    viewModel.makeDefault(desktop)
                } label: {
                    HStack {
                        Label(desktop.name, systemImage: "desktopcomputer")
                        Spacer()
                        if desktop.id == viewModel.defaultDesktop?.id {
                            Image(systemName: "checkmark")
                                .accessibilityLabel(Text("desktops.selected"))
                        }
                    }
                }
                .foregroundStyle(.primary)
            }
            .onDelete { offsets in viewModel.forget(at: offsets) }
            Button(action: onPairAnother) {
                Label("desktops.pairAnother", systemImage: "qrcode.viewfinder")
            }
        } header: {
            Text("desktops.title")
        } footer: {
            Text("desktops.footer")
        }
    }
}

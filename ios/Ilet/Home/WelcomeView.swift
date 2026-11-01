import SwiftUI

/// Shown until the first PC is paired.
struct WelcomeView: View {
    let onPair: () -> Void

    var body: some View {
        VStack(spacing: Layout.sectionSpacing) {
            HStack {
                Image(systemName: "iphone")
                Image(systemName: "arrow.right")
                Image(systemName: "desktopcomputer")
            }
            .font(.system(size: Layout.heroIconSize))
            .foregroundStyle(.tint)
            .accessibilityHidden(true)
            Text("welcome.title")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("welcome.message")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button(action: onPair) {
                Label("welcome.pair", systemImage: "qrcode.viewfinder")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(Layout.screenPadding)
    }
}

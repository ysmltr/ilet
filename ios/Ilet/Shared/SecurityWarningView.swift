import SwiftUI

/// Shown whenever a PC presents a certificate other than the pinned one.
struct SecurityWarningView: View {
    var body: some View {
        VStack(spacing: Layout.sectionSpacing) {
            Image(systemName: "exclamationmark.shield.fill")
                .font(.system(size: Layout.heroIconSize))
                .foregroundStyle(.red)
                .accessibilityHidden(true)
            Text("security.title")
                .font(.title2.bold())
            Text("security.message")
                .multilineTextAlignment(.center)
        }
        .padding(Layout.screenPadding)
    }
}

/// The warning as a sheet with a button to close it.
struct SecurityWarningSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack {
            SecurityWarningView()
            Button("common.ok") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
    }
}

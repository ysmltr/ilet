import SwiftUI

/// The launch screen again (the same logo on the same background) plus a spinner, while ilet loads
/// the paired PCs, so the app starts without a jump.
struct LaunchView: View {
    var body: some View {
        // The launch screen centres the logo on the whole screen, so this ignores the safe area.
        ZStack {
            Color("LaunchBackground")
            Image("Logo")
                .accessibilityHidden(true)
                .overlay(alignment: .bottom) {
                    ProgressView()
                        .offset(y: Layout.launchSpinnerOffset)
                }
        }
        .ignoresSafeArea()
    }
}

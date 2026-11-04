import SwiftUI

/// Shown until the first PC is paired: what ilet does, and the three steps to start.
struct WelcomeView: View {
    let onPair: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: Layout.sectionSpacing) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: Layout.welcomeLogoWidth)
                    .accessibilityHidden(true)
                VStack(spacing: Layout.rowSpacing) {
                    Text("welcome.title")
                        .font(.title2.bold())
                    Text("welcome.message")
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                VStack(alignment: .leading, spacing: Layout.sectionSpacing) {
                    WelcomeStep(number: 1, text: "welcome.step1")
                    WelcomeStep(number: 2, text: "welcome.step2")
                    WelcomeStep(number: 3, text: "welcome.step3")
                }
            }
            .padding(Layout.screenPadding)
        }
        .safeAreaInset(edge: .bottom) {
            Button(action: onPair) {
                Label("welcome.pair", systemImage: "qrcode.viewfinder")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, Layout.screenPadding)
            .padding(.vertical, Layout.sectionSpacing)
            .background(.bar)
        }
    }
}

/// One numbered step, which VoiceOver reads as one sentence with its number.
private struct WelcomeStep: View {
    let number: Int
    let text: LocalizedStringKey

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Layout.stepSpacing) {
            Image(systemName: "\(number).circle.fill")
                .font(.title2)
                .foregroundStyle(.tint)
            Text(text)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "\(number). ") + Text(text))
    }
}

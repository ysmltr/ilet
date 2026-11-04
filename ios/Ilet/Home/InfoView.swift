import SwiftUI

/// How ilet works, what to check when the PC cannot be reached, and what ilet does with your data.
/// Opened with the info button at the top right.
struct InfoView: View {
    /// PRIVACY.md in the repository, which is also the privacy policy on the App Store.
    private static let privacyPolicyAddress = "https://github.com/ysmltr/ilet/blob/main/PRIVACY.md"

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    AboutHeader()
                }
                Section {
                    Text("info.how.body")
                } header: {
                    Text("info.how.title")
                }
                Section {
                    Text("info.pairing.body")
                } header: {
                    Text("info.pairing.title")
                }
                Section {
                    Text("info.sending.body")
                } header: {
                    Text("info.sending.title")
                }
                Section {
                    Label("info.trouble.running", systemImage: "desktopcomputer")
                    Label("info.trouble.wifi", systemImage: "wifi")
                    Label("info.trouble.private", systemImage: "house")
                    Label("info.trouble.localNetwork", systemImage: "network")
                    OpenSettingsButton()
                } header: {
                    Text("info.trouble.title")
                }
                Section {
                    Text("info.privacy.body")
                    if let privacyPolicy = URL(string: Self.privacyPolicyAddress) {
                        Link("info.privacy.link", destination: privacyPolicy)
                    }
                } header: {
                    Text("info.privacy.title")
                }
            }
            .navigationTitle(Text("info.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("common.done") { dismiss() }
                }
            }
        }
    }
}

/// The logo, the name and the version, at the top of the info page.
private struct AboutHeader: View {
    /// For example "1.0 (7.1)": the version and the build number.
    private static var version: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }

    var body: some View {
        VStack(spacing: Layout.rowSpacing) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(maxWidth: Layout.infoLogoWidth)
                .accessibilityHidden(true)
            Text(verbatim: "ilet")
                .font(.title2.bold())
            Text("info.version \(Self.version)")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .listRowBackground(Color.clear)
    }
}

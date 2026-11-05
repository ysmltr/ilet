import IletCore
import SwiftUI

struct ShareView: View {
    @ObservedObject var model: ShareViewModel

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("share.title")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        if model.phase == .choosing {
                            Button("common.cancel") { model.cancel() }
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        if model.phase == .choosing {
                            Button("share.send") { Task { await model.send() } }
                                .disabled(!model.canSend)
                        } else {
                            Button("common.done") { model.done() }
                        }
                    }
                }
        }
        .sheet(isPresented: $model.isSecurityWarningPresented) {
            SecurityWarningSheet()
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.desktops.isEmpty {
            NotPairedView(message: model.errorMessage)
        } else {
            List {
                Section("share.to") {
                    DesktopPicker(model: model)
                }
                Section {
                    ForEach(model.items) { item in
                        ShareItemRow(item: item)
                    }
                } header: {
                    Text("share.items")
                } footer: {
                    footer
                }
            }
        }
    }

    @ViewBuilder
    private var footer: some View {
        if model.phase == .sending {
            if model.isPreparing {
                Text("share.footer.preparing")
            } else {
                Text("share.footer.background")
            }
        }
    }
}

private struct DesktopPicker: View {
    @ObservedObject var model: ShareViewModel

    var body: some View {
        if model.desktops.count == 1, let desktop = model.desktops.first {
            Label(desktop.name, systemImage: "desktopcomputer")
        } else {
            Picker("share.pc", selection: $model.selectedDesktopID) {
                ForEach(model.desktops) { desktop in
                    Text(desktop.name).tag(desktop.id as Desktop.ID?)
                }
            }
            .disabled(model.phase != .choosing)
        }
    }
}

private struct ShareItemRow: View {
    let item: ShareItem

    var body: some View {
        VStack(alignment: .leading, spacing: Layout.rowSpacing) {
            Text(item.name)
                .lineLimit(1)
                .truncationMode(.middle)
            status
            if let note = item.note {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var status: some View {
        switch item.state {
        case .ready:
            EmptyView()
        case .preparing:
            caption("transfer.preparing")
        case .waiting:
            caption("share.waiting")
        case .sending(let fraction):
            ProgressView(value: fraction)
        case .sent(let savedAs):
            Label(sentText(savedAs), systemImage: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundStyle(.red)
        }
    }

    private func caption(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    /// The PC's answer names the saved file; without it, the upload is still known to be sent.
    private func sentText(_ savedAs: String?) -> String {
        guard let savedAs else {
            return String(localized: "share.sent")
        }
        return String(localized: "transfer.sent \(savedAs)")
    }
}

private struct NotPairedView: View {
    let message: String?

    var body: some View {
        VStack(spacing: Layout.sectionSpacing) {
            Image(systemName: "desktopcomputer")
                .font(.system(size: Layout.heroIconSize))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("share.notPaired.title")
                .font(.title2.bold())
            Text(message ?? String(localized: "share.notPaired.message"))
                .multilineTextAlignment(.center)
        }
        .padding(Layout.screenPadding)
    }
}

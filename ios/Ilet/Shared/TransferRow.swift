import SwiftUI

/// One file in a list of transfers, in the app and in the share sheet.
struct TransferRow: View {
    let transfer: Transfer

    var body: some View {
        VStack(alignment: .leading, spacing: Layout.rowSpacing) {
            Text(transfer.name)
                .lineLimit(1)
                .truncationMode(.middle)
            status
            if let note = transfer.note {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var status: some View {
        switch transfer.state {
        case .ready:
            EmptyView()
        case .preparing:
            caption("transfer.preparing")
        case .waiting:
            caption("transfer.waiting")
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
            return String(localized: "transfer.sentUnnamed")
        }
        return String(localized: "transfer.sent \(savedAs)")
    }
}

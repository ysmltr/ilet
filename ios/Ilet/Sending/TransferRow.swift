import SwiftUI

struct TransferRow: View {
    let transfer: Transfer

    var body: some View {
        VStack(alignment: .leading, spacing: Layout.rowSpacing) {
            Text(transfer.name)
                .lineLimit(1)
                .truncationMode(.middle)
            switch transfer.state {
            case .preparing:
                Text("transfer.preparing")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .sending(let fraction):
                ProgressView(value: fraction)
            case .sent(let savedAs):
                Label(
                    String(localized: "transfer.sent \(savedAs)"),
                    systemImage: "checkmark.circle.fill"
                )
                .font(.caption)
                .foregroundStyle(.green)
            case .failed(let message):
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}

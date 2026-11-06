import SwiftUI

/// The files from PCs: each with its progress and, once it is saved, buttons to share it or to
/// save it to Photos. ilet never opens a received file by itself.
struct ReceivedSection: View {
    @ObservedObject var receiver: ReceiveViewModel

    var body: some View {
        Section {
            if receiver.items.isEmpty {
                Text("receive.empty")
                    .foregroundStyle(.secondary)
            }
            ForEach(receiver.items) { item in
                ReceivedFileRow(item: item) {
                    Task { await receiver.saveToPhotos(item.id) }
                }
            }
        } header: {
            HStack {
                Text("receive.title")
                Spacer()
                if receiver.hasFinished {
                    Button("home.clearFinished") { receiver.clearFinished() }
                }
            }
        } footer: {
            Text(receiver.notice ?? String(localized: "receive.footer"))
        }
    }
}

/// One received file. Its buttons appear once it is saved.
private struct ReceivedFileRow: View {
    let item: ReceivedItem
    let saveToPhotos: () -> Void

    var body: some View {
        HStack(spacing: Layout.stepSpacing) {
            TransferRow(transfer: item.transfer)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let file = item.savedFile {
                if !item.isInPhotos, PhotoLibrary.kind(of: file) != nil {
                    Button(action: saveToPhotos) {
                        Label("receive.saveToPhotos", systemImage: "photo.badge.plus")
                            .labelStyle(.iconOnly)
                    }
                }
                ShareLink(item: file) {
                    Label("receive.share", systemImage: "square.and.arrow.up")
                        .labelStyle(.iconOnly)
                }
            }
        }
        // In a list row, each button then takes only its own taps, not the whole row's.
        .buttonStyle(.borderless)
    }
}

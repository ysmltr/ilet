import Foundation
import IletCore
import PhotosUI
import SwiftUI

@MainActor
final class SendViewModel: ObservableObject {
    /// Progress below this step is not shown, to keep the list from redrawing for every chunk.
    private static let progressStep = 0.01

    @Published private(set) var transfers: [Transfer] = []
    @Published var isSecurityWarningPresented = false
    @Published var sendAsJPEG: Bool {
        didSet { settings.setSendAsJPEG(sendAsJPEG) }
    }

    private let connector: any DesktopConnecting
    private let preparer: any FilePreparing
    private let settings: any SettingsStore

    init(connector: any DesktopConnecting, preparer: any FilePreparing, settings: any SettingsStore)
    {
        self.connector = connector
        self.preparer = preparer
        self.settings = settings
        _sendAsJPEG = Published(initialValue: settings.sendAsJPEG())
    }

    /// Sends a batch: one connection check, then at most as many parallel uploads as the PC
    /// allows. Every file fails or succeeds on its own.
    func send(_ sources: [TransferSource], to desktop: Desktop) async {
        let batch = sources.map { source in
            (transfer: Transfer(name: Self.placeholderName(for: source)), source: source)
        }
        transfers.append(contentsOf: batch.map { $0.transfer })
        let connection: DesktopConnection
        do {
            connection = try await connector.connect(to: desktop)
        } catch {
            for item in batch {
                fail(item.transfer.id, with: error)
            }
            return
        }
        let pending = PendingTransfers(batch.map { (id: $0.transfer.id, source: $0.source) })
        let workerCount = min(max(1, connection.limits.maxConcurrentUploads), batch.count)
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<workerCount {
                group.addTask { await self.sendPending(pending, over: connection) }
            }
        }
    }

    func clearFinished() {
        transfers.removeAll { $0.state.isFinished }
    }

    /// For failures before a batch starts, for example in the file picker.
    func report(_ error: Error) {
        let message = ErrorMessage.text(for: error)
        transfers.append(
            Transfer(name: String(localized: "transfer.file"), state: .failed(message: message)))
    }

    private func sendPending(_ pending: PendingTransfers, over connection: DesktopConnection) async
    {
        while let next = pending.next() {
            await send(next.source, as: next.id, over: connection)
        }
    }

    private func send(
        _ source: TransferSource, as id: Transfer.ID, over connection: DesktopConnection
    )
        async
    {
        do {
            let copy = try await load(source)
            let file = try await preparer.prepareForSending(copy, convertHEICToJPEG: sendAsJPEG)
            defer { preparer.discard(file) }
            update(id) { transfer in
                transfer.name = file.fileName
                transfer.state = .sending(fraction: 0)
            }
            let savedName = try await connection.upload(file) { fraction in
                Task { @MainActor [weak self] in
                    self?.showProgress(fraction, for: id)
                }
            }
            update(id) { $0.state = .sent(savedAs: savedName) }
        } catch {
            fail(id, with: error)
        }
    }

    private func load(_ source: TransferSource) async throws -> URL {
        switch source {
        case .photo(let item):
            let picked: PickedFile?
            do {
                picked = try await item.loadTransferable(type: PickedFile.self)
            } catch {
                throw IletError.fileUnreadable
            }
            guard let picked else {
                throw IletError.fileUnreadable
            }
            return picked.url
        case .file(let url):
            return try await preparer.importFile(at: url)
        }
    }

    private func showProgress(_ fraction: Double, for id: Transfer.ID) {
        update(id) { transfer in
            guard case .sending(let shown) = transfer.state, fraction - shown >= Self.progressStep
            else {
                return
            }
            transfer.state = .sending(fraction: fraction)
        }
    }

    private func fail(_ id: Transfer.ID, with error: Error) {
        if error as? IletError == .certificateMismatch {
            isSecurityWarningPresented = true
        }
        update(id) { $0.state = .failed(message: ErrorMessage.text(for: error)) }
    }

    private func update(_ id: Transfer.ID, _ change: (inout Transfer) -> Void) {
        guard let index = transfers.firstIndex(where: { $0.id == id }) else {
            return
        }
        change(&transfers[index])
    }

    private static func placeholderName(for source: TransferSource) -> String {
        switch source {
        case .photo:
            return String(localized: "transfer.photo")
        case .file(let url):
            return url.lastPathComponent
        }
    }
}

/// The files of one batch that no upload worker has taken yet.
@MainActor
private final class PendingTransfers {
    private var items: [(id: Transfer.ID, source: TransferSource)]

    init(_ items: [(id: Transfer.ID, source: TransferSource)]) {
        self.items = items
    }

    func next() -> (id: Transfer.ID, source: TransferSource)? {
        items.isEmpty ? nil : items.removeFirst()
    }
}

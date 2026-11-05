import Foundation
import IletCore

/// The share sheet: shows the shared items, sends them to the chosen PC and follows each one.
/// The uploads belong to iOS, so they carry on after the sheet closes.
@MainActor
final class ShareViewModel: ObservableObject {
    enum Phase {
        case choosing
        case sending
        case finished
    }

    /// One send: a checked connection, and the session that the copies are handed to.
    private struct Batch {
        let connection: DesktopConnection
        let loader: SharedItemLoader
        let uploads: BackgroundUploads
    }

    /// Progress below this step is not shown, to keep the list from redrawing for every chunk.
    private static let progressStep = 0.01

    @Published private(set) var desktops: [Desktop]
    @Published var selectedDesktopID: Desktop.ID?
    @Published private(set) var items: [ShareItem]
    @Published private(set) var phase = Phase.choosing
    @Published private(set) var errorMessage: String?
    @Published var isSecurityWarningPresented = false

    private let providers: [ShareItem.ID: NSItemProvider]
    private let dependencies: ShareDependencies
    private let onClose: (_ cancelled: Bool) -> Void
    private var uploads: BackgroundUploads?
    private var isClosed = false

    init(
        attachments: [NSItemProvider], dependencies: ShareDependencies,
        onClose: @escaping (_ cancelled: Bool) -> Void
    ) {
        let items = attachments.map { ShareItem(name: Self.displayName(of: $0)) }
        providers = Dictionary(uniqueKeysWithValues: zip(items.map(\.id), attachments))
        self.dependencies = dependencies
        self.onClose = onClose
        let store = dependencies.desktopStore
        var desktops: [Desktop] = []
        var errorMessage: String?
        do {
            desktops = try store.loadDesktops()
        } catch {
            errorMessage = ErrorMessage.text(for: error)
        }
        let defaultID = store.defaultDesktopID()
        let selected = desktops.first { $0.id == defaultID } ?? desktops.first
        _desktops = Published(initialValue: desktops)
        _selectedDesktopID = Published(initialValue: selected?.id)
        _items = Published(initialValue: items)
        _errorMessage = Published(initialValue: errorMessage)
    }

    var selectedDesktop: Desktop? {
        desktops.first { $0.id == selectedDesktopID }
    }

    var canSend: Bool {
        phase == .choosing && selectedDesktop != nil && !items.isEmpty
    }

    /// True while an item is still being copied or converted: closing now would drop it.
    var isPreparing: Bool {
        items.contains { $0.state == .preparing }
    }

    /// Checks the PC once, then prepares the items one at a time, so the share sheet's little
    /// memory only ever holds one photo conversion, and hands each to iOS.
    func send() async {
        guard canSend, let desktop = selectedDesktop else {
            return
        }
        phase = .sending
        dependencies.desktopStore.setDefaultDesktopID(desktop.id)
        for index in items.indices {
            items[index].state = .preparing
        }
        do {
            let batch = try await connect(to: desktop)
            for item in items where !isClosed {
                await start(item.id, in: batch)
            }
        } catch {
            for item in items {
                fail(item.id, with: error)
            }
        }
        finishIfDone()
    }

    func cancel() {
        close(cancelled: true)
    }

    func done() {
        close(cancelled: false)
    }

    private func close(cancelled: Bool) {
        isClosed = true
        uploads?.disconnect()
        uploads = nil
        onClose(cancelled)
    }

    private func connect(to desktop: Desktop) async throws -> Batch {
        let connection = try await dependencies.connector.connect(to: desktop)
        let loader = SharedItemLoader(
            copies: dependencies.copies, maxBytes: connection.limits.maxFileSizeBytes)
        return Batch(connection: connection, loader: loader, uploads: makeUploads())
    }

    private func makeUploads() -> BackgroundUploads {
        if let uploads {
            return uploads
        }
        var handlers = BackgroundUploadHandlers()
        handlers.progress = { [weak self] id, fraction in
            Task { @MainActor [weak self] in self?.showProgress(fraction, for: id) }
        }
        handlers.completion = { [weak self] id, result in
            Task { @MainActor [weak self] in self?.finish(id, with: result) }
        }
        let uploads = BackgroundUploads(
            appGroup: dependencies.appGroup, copies: dependencies.copies, handlers: handlers)
        self.uploads = uploads
        return uploads
    }

    private func start(_ id: ShareItem.ID, in batch: Batch) async {
        guard let provider = providers[id] else {
            return
        }
        let file: PreparedFile
        do {
            file = try await prepare(provider, with: batch.loader)
        } catch {
            fail(id, with: error)
            return
        }
        update(id) { item in
            item.name = file.fileName
            item.state = .waiting
            item.note = file.isUnconvertedHEIC ? String(localized: "share.keptHEIC") : nil
        }
        do {
            try batch.uploads.start(file, id: id, over: batch.connection)
        } catch {
            dependencies.preparer.discard(file)
            fail(id, with: error)
        }
    }

    private func prepare(
        _ provider: NSItemProvider, with loader: SharedItemLoader
    ) async throws -> PreparedFile {
        let convert = dependencies.settingsStore.sendAsJPEG()
        guard
            let type = SharedItemType.identifier(
                from: provider.registeredTypeIdentifiers, convertHEIC: convert)
        else {
            throw IletError.fileUnreadable
        }
        let copy = try await loader.copy(provider, as: type)
        do {
            return try await dependencies.preparer.prepareForSending(
                copy, convertHEICToJPEG: convert)
        } catch {
            dependencies.copies.discard(copy)
            throw error
        }
    }

    private func showProgress(_ fraction: Double, for id: ShareItem.ID) {
        update(id) { item in
            switch item.state {
            case .waiting:
                item.state = .sending(fraction: fraction)
            case .sending(let shown) where fraction - shown >= Self.progressStep:
                item.state = .sending(fraction: fraction)
            default:
                break
            }
        }
    }

    private func finish(_ id: ShareItem.ID, with result: BackgroundUploadResult) {
        switch result {
        case .sent(let savedAs):
            update(id) { $0.state = .sent(savedAs: savedAs) }
        case .failed(let error):
            fail(id, with: error)
        }
        finishIfDone()
    }

    private func fail(_ id: ShareItem.ID, with error: Error) {
        if error as? IletError == .certificateMismatch {
            isSecurityWarningPresented = true
        }
        update(id) { $0.state = .failed(message: ErrorMessage.text(for: error)) }
    }

    private func finishIfDone() {
        if phase == .sending, items.allSatisfy({ $0.state.isFinished }) {
            phase = .finished
        }
    }

    private func update(_ id: ShareItem.ID, _ change: (inout ShareItem) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else {
            return
        }
        change(&items[index])
    }

    private static func displayName(of provider: NSItemProvider) -> String {
        guard let name = provider.suggestedName else {
            return String(localized: "transfer.file")
        }
        return SharedFileName.clean(name)
    }
}

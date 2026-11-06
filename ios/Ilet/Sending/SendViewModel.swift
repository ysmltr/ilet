import Foundation
import IletCore
import PhotosUI
import SwiftUI
import UIKit

/// The send screen. It prepares the chosen files one at a time and hands each to the app's
/// background uploads, so they carry on when the user switches apps or locks the iPhone.
@MainActor
final class SendViewModel: ObservableObject {
    /// How often converting a video is tried, when iOS keeps stopping it because ilet was left.
    private static let conversionAttempts = 3
    /// How often the app checks whether it is in front again, before it converts once more.
    private static let activeCheckInterval = Duration.seconds(1)

    @Published private(set) var transfers: [Transfer] = []
    @Published var isSecurityWarningPresented = false
    @Published var sendCompatibleFormats: Bool {
        didSet { settings.setSendCompatibleFormats(sendCompatibleFormats) }
    }

    private let connector: any DesktopConnecting
    private let preparer: any FilePreparing
    private let settings: any SettingsStore
    private let uploads: AppUploads
    private let copies: TemporaryFiles

    init(
        connector: any DesktopConnecting, preparer: any FilePreparing,
        settings: any SettingsStore, uploads: AppUploads, copies: TemporaryFiles
    ) {
        self.connector = connector
        self.preparer = preparer
        self.settings = settings
        self.uploads = uploads
        self.copies = copies
        _sendCompatibleFormats = Published(initialValue: settings.sendCompatibleFormats())
        uploads.onProgress = { [weak self] id, fraction in
            self?.update(id) { $0.showProgress(fraction) }
        }
        uploads.onCompletion = { [weak self] id, result in self?.finish(id, with: result) }
    }

    /// True while a file is still being copied or converted, which stops while ilet is left.
    var isPreparing: Bool {
        transfers.contains { $0.state == .preparing }
    }

    /// True while iOS still has files of the list to send.
    var isSending: Bool {
        transfers.contains { !$0.state.isFinished }
    }

    /// Sends a batch: one connection check, then each file is prepared and handed to iOS in
    /// turn. Every file fails or succeeds on its own.
    func send(_ sources: [TransferSource], to desktop: Desktop) async {
        let batch = sources.map { source in
            (transfer: Transfer(name: Self.placeholderName(for: source)), source: source)
        }
        transfers.append(contentsOf: batch.map { $0.transfer })
        // What is handed to iOS goes on when ilet is left; iOS gives a little time for the rest.
        let backgroundTime = BackgroundTime(for: "Preparing files to send")
        defer { backgroundTime.end() }
        let connection: DesktopConnection
        do {
            connection = try await connector.connect(to: desktop)
        } catch {
            for item in batch {
                fail(item.transfer.id, with: error)
            }
            return
        }
        for item in batch {
            await start(item.source, as: item.transfer.id, over: connection)
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

    private func start(
        _ source: TransferSource, as id: Transfer.ID, over connection: DesktopConnection
    )
        async
    {
        let file: PreparedFile
        do {
            let copy = try await load(source)
            file = try await prepare(copy)
        } catch {
            fail(id, with: error)
            return
        }
        update(id) { transfer in
            transfer.name = file.fileName
            transfer.state = .waiting
            transfer.note = ConversionNote.text(for: file.keptOriginal)
        }
        do {
            try uploads.start(file, id: id, over: connection)
        } catch {
            preparer.discard(file)
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

    /// Prepares a copy. When iOS stopped converting a video because ilet was left, converting is
    /// tried again once ilet is back in front, a few times at most.
    private func prepare(_ copy: URL) async throws -> PreparedFile {
        let convert = sendCompatibleFormats
        do {
            for _ in 1..<Self.conversionAttempts {
                let file = try await preparer.prepareForSending(copy, makeCompatible: convert)
                guard file.keptOriginal == .videoInterrupted else {
                    return file
                }
                await waitUntilActive()
            }
            return try await preparer.prepareForSending(copy, makeCompatible: convert)
        } catch {
            copies.discard(copy)
            throw error
        }
    }

    /// Returns once ilet is in front again. While the app is suspended nothing runs, so checking
    /// once a second costs nothing.
    private func waitUntilActive() async {
        while UIApplication.shared.applicationState != .active, !Task.isCancelled {
            try? await Task.sleep(for: Self.activeCheckInterval)
        }
    }

    private func finish(_ id: Transfer.ID, with result: BackgroundUploadResult) {
        switch result {
        case .sent(let savedAs):
            update(id) { $0.state = .sent(savedAs: savedAs) }
        case .failed(let error):
            fail(id, with: error)
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
            return SharedFileName.clean(url.lastPathComponent)
        }
    }
}

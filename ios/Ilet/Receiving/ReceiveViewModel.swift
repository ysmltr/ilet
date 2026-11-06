import Foundation
import IletCore

/// One file from a PC in the receive list.
struct ReceivedItem: Identifiable, Equatable {
    /// The PC's ID for the file, so that a download that is tried again keeps its row.
    let id: String
    var transfer: Transfer
    /// Where the file is, once it is saved.
    var savedFile: URL?
    var isInPhotos = false
}

/// The files that the selected PC sends to this iPhone (PROTOCOL.md sections 5.4 to 5.7). While
/// ilet is in front, the list checks the PC's outbox now and then, and iOS fetches each new file
/// in the background, so a download carries on when the user leaves the app. ilet never opens a
/// received file by itself.
@MainActor
final class ReceiveViewModel: ObservableObject {
    /// How often the outbox is checked while ilet is in front.
    private static let checkInterval = Duration.seconds(15)
    /// The wait after the PC could not be reached at all, which is usual while it is off.
    private static let retryInterval = Duration.seconds(60)
    /// How often a file is tried in one visit; pulling the list down tries again.
    private static let attemptsPerFile = 3

    private enum Outcome {
        case checked
        case unreachable
        /// The PC cannot send files to this iPhone; checking again would not change that.
        case stopped
        /// Another check was running.
        case busy
    }

    /// A checked route to the PC, kept for a visit so that a check needs no new connection.
    private struct Route {
        let desktopID: UUID
        let connection: DesktopConnection
    }

    @Published private(set) var items: [ReceivedItem] = []
    /// Why the PC cannot send files to this iPhone, when that is known.
    @Published private(set) var notice: String?
    @Published var isSecurityWarningPresented = false
    @Published var photosMessage: String?

    private let connector: any DesktopConnecting
    private let receiver: OutboxReceiver
    private let received: ReceivedFiles
    private var route: Route?
    /// The PC of the latest visit: the one that the notice is about.
    private var visitedDesktopID: UUID?
    /// Failed downloads per file in this visit.
    private var failures: [String: Int] = [:]
    private var isChecking = false
    private var isPaused = false

    init(connector: any DesktopConnecting, receiver: OutboxReceiver, downloads: AppDownloads) {
        self.connector = connector
        self.receiver = receiver
        received = downloads.received
        downloads.onProgress = { [weak self] download, fraction in
            self?.show(download) { $0.transfer.showProgress(fraction) }
        }
        downloads.onCompletion = { [weak self] download, result in
            self?.finish(download, with: result)
        }
    }

    var hasFinished: Bool {
        items.contains { $0.transfer.state.isFinished }
    }

    /// Checks the PC's outbox until the task is cancelled: when ilet leaves the screen or
    /// another PC is selected. Each visit starts with a new connection.
    func keepChecking(_ desktop: Desktop) async {
        if visitedDesktopID != desktop.id {
            visitedDesktopID = desktop.id
            notice = nil
        }
        route = nil
        failures = [:]
        isPaused = false
        while !Task.isCancelled {
            var pause = Self.checkInterval
            if !isPaused {
                switch await check(desktop) {
                case .checked, .busy:
                    break
                case .unreachable:
                    pause = Self.retryInterval
                case .stopped:
                    isPaused = true
                }
            }
            try? await Task.sleep(for: pause)
        }
    }

    /// Pull to refresh: checks at once, and tries again the files that failed too often.
    func refresh(_ desktop: Desktop) async {
        failures = [:]
        if await check(desktop) == .checked {
            isPaused = false
        }
    }

    func clearFinished() {
        items.removeAll { $0.transfer.state.isFinished }
    }

    /// Only when the user taps Save to Photos.
    func saveToPhotos(_ id: ReceivedItem.ID) async {
        guard let file = items.first(where: { $0.id == id })?.savedFile,
            let kind = PhotoLibrary.kind(of: file)
        else {
            return
        }
        switch await PhotoLibrary.add(file, as: kind) {
        case .added:
            update(id) { item in
                item.isInPhotos = true
                item.transfer.note = String(localized: "receive.savedToPhotos")
            }
        case .denied:
            photosMessage = String(localized: "receive.photosDenied")
        case .failed:
            photosMessage = String(localized: "receive.photosFailed")
        }
    }

    private func check(_ desktop: Desktop) async -> Outcome {
        guard !isChecking else {
            return .busy
        }
        isChecking = true
        defer { isChecking = false }
        let kept = route?.desktopID == desktop.id ? route?.connection : nil
        do {
            let connection: DesktopConnection
            if let kept {
                connection = kept
            } else {
                connection = try await connector.connect(to: desktop)
                route = Route(desktopID: desktop.id, connection: connection)
            }
            let skipped = Set(failures.filter { $0.value >= Self.attemptsPerFile }.keys)
            let started = try await receiver.check(desktop, over: connection, skipping: skipped)
            notice = nil
            for download in started {
                show(download) { $0.transfer.state = .waiting }
            }
            return .checked
        } catch {
            route = nil
            return outcome(of: error, afterNewConnection: kept == nil)
        }
    }

    private func outcome(of error: Error, afterNewConnection: Bool) -> Outcome {
        // A kept route may only be out of date: the next check connects afresh.
        let retry: Outcome = afterNewConnection ? .unreachable : .checked
        guard let error = error as? IletError else {
            return retry
        }
        switch error {
        case .certificateMismatch:
            isSecurityWarningPresented = true
            return .stopped
        case .server(.notFound):
            // Older versions of ilet on the PC have no outbox.
            notice = String(localized: "receive.pcTooOld")
            return .stopped
        case .notPaired, .wrongDesktop, .unsupportedProtocolVersion:
            notice = ErrorMessage.text(for: error)
            return .stopped
        default:
            return retry
        }
    }

    private func finish(_ download: OutboxDownload, with result: BackgroundDownloadResult) {
        switch result {
        case .saved(let fileName):
            failures[download.fileID] = nil
            show(download) { item in
                item.transfer.state = .sent(savedAs: fileName)
                item.savedFile = received.url(of: fileName)
            }
            confirm(download)
        case .failed(let error):
            failures[download.fileID, default: 0] += 1
            if error == .certificateMismatch {
                isSecurityWarningPresented = true
            }
            show(download) { $0.transfer.state = .failed(message: Self.message(for: error)) }
        }
    }

    /// Tells the PC at once, over the visit's route, that the file is saved. Without a route, the
    /// next check does it, since the PC still lists the file.
    private func confirm(_ download: OutboxDownload) {
        guard let route, route.desktopID == download.desktopID else {
            return
        }
        Task { [receiver] in await receiver.confirm(download, over: route.connection) }
    }

    /// Updates the file's row, or adds one: of a download that an earlier run of the app started,
    /// the first news may be its progress or its end.
    private func show(_ download: OutboxDownload, _ change: (inout ReceivedItem) -> Void) {
        if items.contains(where: { $0.id == download.fileID }) {
            update(download.fileID, change)
            return
        }
        var item = ReceivedItem(
            id: download.fileID, transfer: Transfer(name: download.fileName, state: .waiting))
        change(&item)
        items.append(item)
    }

    private func update(_ id: ReceivedItem.ID, _ change: (inout ReceivedItem) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else {
            return
        }
        change(&items[index])
    }

    private static func message(for error: IletError) -> String {
        switch error {
        case .server(.fileGone):
            return String(localized: "receive.failed.gone")
        case .server(.tooManyDownloads), .server(.tooManyRequests):
            return ErrorMessage.text(for: error)
        case .server:
            return String(localized: "receive.failed.server")
        case .unexpectedResponse:
            return String(localized: "receive.failed.incomplete")
        default:
            return ErrorMessage.text(for: error)
        }
    }
}

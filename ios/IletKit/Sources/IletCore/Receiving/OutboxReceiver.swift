import Foundation

/// Starts downloads from a PC's outbox: `BackgroundDownloads`, or a fake in tests.
public protocol OutboxDownloading: Sendable {
    /// The IDs of the files being fetched, from this run of the app or an earlier one.
    func fileIDsInProgress() async -> Set<String>
    func start(
        _ file: OutboxFile, from desktopID: UUID, over connection: DesktopConnection
    ) throws
        -> OutboxDownload
}

/// Fetches the files that wait for this iPhone on a PC (PROTOCOL.md sections 5.4 to 5.7). A check
/// lists the PC's outbox, confirms again each file that was saved but is still listed, because
/// the PC did not hear of it, and starts a download for each new one.
public struct OutboxReceiver: Sendable {
    private let clientFactory: any DesktopClientFactory
    private let downloads: any OutboxDownloading
    private let ledger: DownloadLedger

    public init(
        clientFactory: any DesktopClientFactory, downloads: any OutboxDownloading,
        ledger: DownloadLedger
    ) {
        self.clientFactory = clientFactory
        self.downloads = downloads
        self.ledger = ledger
    }

    /// Checks the outbox once and returns the downloads it started. Files in `skipping`, which
    /// failed too often already, are left for a later check.
    public func check(
        _ desktop: Desktop, over connection: DesktopConnection, skipping: Set<String>
    ) async throws
        -> [OutboxDownload]
    {
        let client = clientFactory.makeClient(pinnedTo: connection.fingerprint)
        let files = try await client.outbox(at: connection.endpoint, token: connection.token)
        let inProgress = await downloads.fileIDsInProgress()
        var started: [OutboxDownload] = []
        for file in files where !inProgress.contains(file.id) && !skipping.contains(file.id) {
            if ledger.contains(file.id, from: desktop.id) {
                await connection.confirm(file.id, with: client)
                continue
            }
            do {
                started.append(try downloads.start(file, from: desktop.id, over: connection))
            } catch {
                Log.network.error("download not started: \(error.logSummary, privacy: .public)")
            }
        }
        return started
    }

    /// Tells the PC that a file is saved, so it deletes its copy. A confirmation that does not
    /// arrive is sent again by a later check.
    public func confirm(_ download: OutboxDownload, over connection: DesktopConnection) async {
        let client = clientFactory.makeClient(pinnedTo: connection.fingerprint)
        await connection.confirm(download.fileID, with: client)
    }
}

extension DesktopConnection {
    /// A confirmation that fails is only logged: a later check sends it again.
    fileprivate func confirm(_ fileID: String, with client: any DesktopClient) async {
        do {
            try await client.confirmReceived(fileID: fileID, at: endpoint, token: token)
        } catch {
            Log.network.error("confirmation failed: \(error.logSummary, privacy: .public)")
        }
    }
}

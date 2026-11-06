import Foundation
import IletCore

@MainActor
final class DesktopsViewModel: ObservableObject {
    @Published private(set) var desktops: [Desktop] = []
    @Published private(set) var defaultDesktopID: UUID?
    @Published var errorMessage: String?

    private let store: any DesktopStore
    private let credentials: any CredentialStore
    /// Ends the uploads to a PC and the downloads from it that iOS still holds.
    private let stopTransfers: @MainActor (Desktop) async -> Void

    init(
        store: any DesktopStore, credentials: any CredentialStore,
        stopTransfers: @escaping @MainActor (Desktop) async -> Void
    ) {
        self.store = store
        self.credentials = credentials
        self.stopTransfers = stopTransfers
    }

    /// The PC that files go to: the chosen one, or the first if none was chosen.
    var defaultDesktop: Desktop? {
        desktops.first { $0.id == defaultDesktopID } ?? desktops.first
    }

    func reload() {
        do {
            desktops = try store.loadDesktops()
            defaultDesktopID = store.defaultDesktopID()
        } catch {
            errorMessage = ErrorMessage.text(for: error)
        }
    }

    func makeDefault(_ desktop: Desktop) {
        store.setDefaultDesktopID(desktop.id)
        reload()
    }

    /// Forgets PCs on this iPhone: the token and the stored details are deleted, and the uploads
    /// and downloads that iOS still holds for them end, so nothing more goes to them or comes from
    /// them (THREAT_MODEL.md, T14). The PC itself still lists this iPhone until it is removed
    /// there too.
    func forget(at offsets: IndexSet) {
        for desktop in offsets.map({ desktops[$0] }) {
            do {
                try credentials.deleteToken(for: desktop.id)
                try store.remove(desktopID: desktop.id)
            } catch {
                errorMessage = ErrorMessage.text(for: error)
            }
            // Also when deleting failed: the user wants nothing more to go to this PC.
            Task { await stopTransfers(desktop) }
        }
        reload()
    }
}

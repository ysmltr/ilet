import Foundation
import IletCore

@MainActor
final class DesktopsViewModel: ObservableObject {
    @Published private(set) var desktops: [Desktop] = []
    @Published private(set) var defaultDesktopID: UUID?
    @Published var errorMessage: String?

    private let store: any DesktopStore
    private let credentials: any CredentialStore

    init(store: any DesktopStore, credentials: any CredentialStore) {
        self.store = store
        self.credentials = credentials
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

    /// Forgets PCs on this iPhone: the token and the stored details are deleted. The PC itself
    /// still lists this iPhone until it is removed there too.
    func forget(at offsets: IndexSet) {
        for desktop in offsets.map({ desktops[$0] }) {
            do {
                try credentials.deleteToken(for: desktop.id)
                try store.remove(desktopID: desktop.id)
            } catch {
                errorMessage = ErrorMessage.text(for: error)
            }
        }
        reload()
    }
}

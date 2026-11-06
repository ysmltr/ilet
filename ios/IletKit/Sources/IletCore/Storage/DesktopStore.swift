import Foundation

/// The paired PCs and which one the Share Extension sends to.
public protocol DesktopStore: Sendable {
    func loadDesktops() throws -> [Desktop]
    /// Adds the PC, or replaces the stored one with the same ID.
    func save(_ desktop: Desktop) throws
    func remove(desktopID: UUID) throws
    func defaultDesktopID() -> UUID?
    func setDefaultDesktopID(_ desktopID: UUID?)
}

extension DesktopStore {
    /// True while this iPhone is paired with a PC that has this certificate, and this ID when one
    /// is given. The background sessions ask before every new connection, so a PC that the user
    /// forgot gets no more files and sends none (THREAT_MODEL.md, T14). An unreadable list
    /// counts as empty.
    func isPaired(pinnedTo fingerprint: CertificateFingerprint, id: UUID? = nil) -> Bool {
        let desktops = (try? loadDesktops()) ?? []
        return desktops.contains { desktop in
            desktop.fingerprint == fingerprint && (id == nil || desktop.id == id)
        }
    }
}

/// Stores PCs in the App Group's user defaults, which the Share Extension can read too.
/// UserDefaults is thread-safe, which is why this class can be shared across tasks.
public final class AppGroupDesktopStore: DesktopStore, @unchecked Sendable {
    private enum Key {
        static let desktops = "desktops"
        static let defaultDesktopID = "defaultDesktopID"
    }

    private let defaults: UserDefaults

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public func loadDesktops() throws -> [Desktop] {
        guard let data = defaults.data(forKey: Key.desktops) else {
            return []
        }
        do {
            return try JSONDecoder().decode([Desktop].self, from: data)
        } catch {
            Log.storage.error("stored PCs are unreadable: \(error.logSummary, privacy: .public)")
            throw IletError.storageCorrupted
        }
    }

    public func save(_ desktop: Desktop) throws {
        var desktops = try loadDesktops()
        if let index = desktops.firstIndex(where: { $0.id == desktop.id }) {
            desktops[index] = desktop
        } else {
            desktops.append(desktop)
        }
        try write(desktops)
        if defaultDesktopID() == nil {
            setDefaultDesktopID(desktop.id)
        }
    }

    public func remove(desktopID: UUID) throws {
        let remaining = try loadDesktops().filter { $0.id != desktopID }
        try write(remaining)
        if defaultDesktopID() == desktopID {
            setDefaultDesktopID(remaining.first?.id)
        }
    }

    public func defaultDesktopID() -> UUID? {
        defaults.string(forKey: Key.defaultDesktopID).flatMap(UUID.init(uuidString:))
    }

    public func setDefaultDesktopID(_ desktopID: UUID?) {
        defaults.set(desktopID?.uuidString, forKey: Key.defaultDesktopID)
    }

    private func write(_ desktops: [Desktop]) throws {
        do {
            defaults.set(try JSONEncoder().encode(desktops), forKey: Key.desktops)
        } catch {
            Log.storage.error("PCs could not be saved: \(error.logSummary, privacy: .public)")
            throw IletError.storageCorrupted
        }
    }
}

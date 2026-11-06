import Foundation

/// The files from PCs' outboxes that this iPhone saved, for two days: longer than a file waits on
/// a PC. A PC lists a file until it hears that it was saved (PROTOCOL.md section 5.7); when that
/// confirmation was lost, the ledger keeps the app from fetching the file a second time, and the
/// app confirms it again instead.
public final class DownloadLedger: @unchecked Sendable {
    static let defaultsKey = "savedOutboxFiles"
    static let retention: TimeInterval = 2 * 24 * 60 * 60
    /// Far more than PCs list in two days, so the stored list stays small.
    static let maxEntries = 1_000

    private let defaults: UserDefaults
    private let now: @Sendable () -> Date
    /// UserDefaults is thread-safe, but remembering a file reads the list and writes it again;
    /// the lock makes that one step, for the downloads' queue and the app's checks alike.
    private let lock = NSLock()

    public init(defaults: UserDefaults, now: @escaping @Sendable () -> Date = { Date() }) {
        self.defaults = defaults
        self.now = now
    }

    func contains(_ fileID: String, from desktopID: UUID) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return entries()[Self.key(fileID, desktopID)] != nil
    }

    func remember(_ fileID: String, from desktopID: UUID) {
        lock.lock()
        defer { lock.unlock() }
        var current = entries()
        current[Self.key(fileID, desktopID)] = now()
        if current.count > Self.maxEntries {
            let newest = current.sorted { $0.value > $1.value }.prefix(Self.maxEntries)
            current = Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) })
        }
        do {
            defaults.set(try JSONEncoder().encode(current), forKey: Self.defaultsKey)
        } catch {
            Log.storage.error("saved files not recorded: \(error.logSummary, privacy: .public)")
        }
    }

    /// The entries of the last two days. Older ones are left out, and so dropped at the next
    /// write; an unreadable list counts as empty.
    private func entries() -> [String: Date] {
        guard let data = defaults.data(forKey: Self.defaultsKey),
            let stored = try? JSONDecoder().decode([String: Date].self, from: data)
        else {
            return [:]
        }
        let cutoff = now().addingTimeInterval(-Self.retention)
        return stored.filter { $0.value >= cutoff }
    }

    private static func key(_ fileID: String, _ desktopID: UUID) -> String {
        "\(desktopID.uuidString)/\(fileID)"
    }
}

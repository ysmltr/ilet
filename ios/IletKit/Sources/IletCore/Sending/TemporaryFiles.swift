import Foundation

/// Copies of files being sent. Each file gets its own folder, so equal names never collide, and
/// the folder's name starts with the time it was made, so leftovers can be found by age without
/// reading file dates. Copies are deleted after the upload, and leftovers (after a crash, for
/// example) once they are old, when the app or the share sheet starts.
public struct TemporaryFiles: Sendable {
    private static let backgroundUploadsPath = "Library/Caches/ilet-background-uploads"
    private static let nameSeparator: Character = "-"

    let root: URL

    public init(root: URL) {
        self.root = root
    }

    /// The copies that iOS uploads in the background, for the app and the share sheet. They are
    /// in the App Group, so the app can delete the share sheet's when iOS wakes it for the end of
    /// an upload.
    public static func backgroundUploads(appGroup: String) -> TemporaryFiles? {
        guard
            let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: appGroup)
        else {
            return nil
        }
        return TemporaryFiles(
            root: container.appending(path: backgroundUploadsPath, directoryHint: .isDirectory))
    }

    /// A new, empty folder for one file.
    public func makeFolder(now: Date = Date()) throws -> URL {
        let name = "\(Int(now.timeIntervalSince1970))\(Self.nameSeparator)\(UUID().uuidString)"
        let folder = root.appending(path: name, directoryHint: .isDirectory)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            Log.files.error("temporary folder failed: \(error.logSummary, privacy: .public)")
            throw IletError.fileUnreadable
        }
        return folder
    }

    /// Deletes a file's folder. Files outside this store are never touched.
    public func discard(_ file: URL) {
        let folder = file.deletingLastPathComponent()
        guard folder.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL
        else {
            return
        }
        remove(folder)
    }

    /// Deletes one of this store's folders by its name. Any other name, a path for example, is
    /// refused, because the name comes from a background upload's record.
    public func discardFolder(named name: String) {
        guard Self.creationTime(ofFolderNamed: name) != nil else {
            Log.files.error("refused to delete a folder that this store did not make")
            return
        }
        let folder = root.appending(path: name, directoryHint: .isDirectory)
        guard FileManager.default.fileExists(atPath: folder.path(percentEncoded: false)) else {
            return
        }
        remove(folder)
    }

    /// Deletes every folder made before `cutoff`. Anything else in the store, which the store
    /// never makes, counts as old.
    public func removeFolders(madeBefore cutoff: Date) {
        let path = root.path(percentEncoded: false)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: path)) ?? []
        for name in names where Self.creationTime(ofFolderNamed: name) ?? .distantPast < cutoff {
            remove(root.appending(path: name))
        }
    }

    /// When a folder of this store was made, read from its name: whole seconds since 1970, a
    /// hyphen and a UUID, exactly as `makeFolder` writes it. `nil` for any other name.
    static func creationTime(ofFolderNamed name: String) -> Date? {
        let parts = name.split(
            separator: nameSeparator, maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2, let seconds = Int(parts[0]),
            let id = UUID(uuidString: String(parts[1])),
            name == "\(seconds)\(nameSeparator)\(id.uuidString)"
        else {
            return nil
        }
        return Date(timeIntervalSince1970: TimeInterval(seconds))
    }

    /// A copy that cannot be deleted only wastes space until the system clears the folder, so the
    /// failure is logged rather than shown.
    private func remove(_ url: URL) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            Log.files.error("temporary file not deleted: \(error.logSummary, privacy: .public)")
        }
    }
}

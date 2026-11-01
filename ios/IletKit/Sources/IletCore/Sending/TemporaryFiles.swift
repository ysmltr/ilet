import Foundation

/// The app's own copies of files being sent. Each file gets its own folder, so equal names never
/// collide. Copies are deleted after the upload, and leftovers (after a crash, for example) at
/// the next launch.
public struct TemporaryFiles: Sendable {
    public static let outgoing = TemporaryFiles(
        root: FileManager.default.temporaryDirectory.appending(
            path: "ilet-outgoing", directoryHint: .isDirectory))

    let root: URL

    /// A new, empty folder for one file.
    public func makeFolder() throws -> URL {
        let folder = root.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            Log.files.error(
                "temporary folder failed: \(error.localizedDescription, privacy: .public)")
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

    public func removeAll() {
        guard FileManager.default.fileExists(atPath: root.path(percentEncoded: false)) else {
            return
        }
        remove(root)
    }

    /// A copy that cannot be deleted only wastes space until the system clears the temporary
    /// folder, so the failure is logged rather than shown.
    private func remove(_ url: URL) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            Log.files.error(
                "temporary file not deleted: \(error.localizedDescription, privacy: .public)")
        }
    }
}

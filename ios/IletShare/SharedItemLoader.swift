import Foundation
import IletCore

/// Copies a shared item into the share sheet's store, where it waits for its background upload.
struct SharedItemLoader {
    let copies: TemporaryFiles
    /// The PC's limit: a larger file is refused before a byte of it is copied.
    let maxBytes: Int64

    @MainActor
    func copy(_ provider: NSItemProvider, as type: String) async throws -> URL {
        let folder = try copies.makeFolder()
        do {
            return try await load(provider, as: type, into: folder)
        } catch {
            copies.discardFolder(named: folder.lastPathComponent)
            throw error
        }
    }

    @MainActor
    private func load(
        _ provider: NSItemProvider, as type: String, into folder: URL
    ) async throws -> URL {
        let maxBytes = maxBytes
        return try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: type) { file, _ in
                continuation.resume(
                    with: Result { try Self.keep(file, in: folder, maxBytes: maxBytes) })
            }
        }
    }

    /// Runs while the system's temporary file exists: it is deleted once this returns.
    private static func keep(_ file: URL?, in folder: URL, maxBytes: Int64) throws -> URL {
        guard let file,
            let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize
        else {
            throw IletError.fileUnreadable
        }
        guard Int64(size) <= maxBytes else {
            throw IletError.fileTooLarge(limitBytes: maxBytes)
        }
        let copy = folder.appending(path: SharedFileName.clean(file.lastPathComponent))
        do {
            try FileManager.default.copyItem(at: file, to: copy)
        } catch {
            throw IletError.fileUnreadable
        }
        return copy
    }
}

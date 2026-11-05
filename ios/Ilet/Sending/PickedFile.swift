import CoreTransferable
import Foundation
import IletCore
import UniformTypeIdentifiers

/// A photo or video from the photo picker, copied straight into the store that background
/// uploads read from, so a large video is copied only once.
struct PickedFile: Transferable, Sendable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            try keepCopy(of: received.file)
        }
        FileRepresentation(importedContentType: .movie) { received in
            try keepCopy(of: received.file)
        }
    }

    /// The system deletes the received file once the closure returns, so the app keeps a copy.
    private static func keepCopy(of file: URL) throws -> PickedFile {
        let folder = try TemporaryFiles.appUploads.makeFolder()
        let copy = folder.appending(path: file.lastPathComponent)
        do {
            try FileManager.default.copyItem(at: file, to: copy)
        } catch {
            TemporaryFiles.appUploads.discard(copy)
            throw error
        }
        return PickedFile(url: copy)
    }
}

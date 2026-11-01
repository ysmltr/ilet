import CoreTransferable
import Foundation
import IletCore
import UniformTypeIdentifiers

/// A photo or video from the photo picker, copied into the app's temporary folder.
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
        let copy = try TemporaryFiles.outgoing.makeFolder().appending(path: file.lastPathComponent)
        try FileManager.default.copyItem(at: file, to: copy)
        return PickedFile(url: copy)
    }
}

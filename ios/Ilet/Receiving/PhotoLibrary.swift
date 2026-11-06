import Photos
import UniformTypeIdentifiers

/// Adds a received photo or video to the photo library, only when the user taps Save to Photos.
/// ilet asks only to add: it never sees the photos and videos that are already there.
enum PhotoLibrary {
    enum Kind {
        case image
        case video
    }

    enum Outcome {
        case added
        case denied
        case failed
    }

    /// What the file's name says it is. Photos checks the content itself when the file is added.
    static func kind(of file: URL) -> Kind? {
        guard let type = UTType(filenameExtension: file.pathExtension) else {
            return nil
        }
        if type.conforms(to: .image) {
            return .image
        }
        if type.conforms(to: .movie) {
            return .video
        }
        return nil
    }

    /// Photos copies the file, so it stays in On My iPhone › ilet as well.
    static func add(_ file: URL, as kind: Kind) async -> Outcome {
        guard await PHPhotoLibrary.requestAuthorization(for: .addOnly) == .authorized else {
            return .denied
        }
        let resourceType: PHAssetResourceType = kind == .image ? .photo : .video
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(
                    with: resourceType, fileURL: file, options: nil)
            }
            return .added
        } catch {
            return .failed
        }
    }
}

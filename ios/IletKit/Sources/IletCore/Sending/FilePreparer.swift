import Foundation
import ImageIO
import UniformTypeIdentifiers

/// A file ready to upload: a copy the app owns, the name to send, and its size.
public struct PreparedFile: Sendable {
    public let url: URL
    public let fileName: String
    public let sizeBytes: Int64
}

public protocol FilePreparing: Sendable {
    /// Copies a file the user picked (possibly security-scoped) into the app's temporary folder.
    func importFile(at url: URL) async throws -> URL
    /// Turns a copy in the temporary folder into the file to upload, converting HEIC photos to
    /// JPG when asked.
    func prepareForSending(_ file: URL, convertHEICToJPEG: Bool) async throws -> PreparedFile
    func discard(_ file: PreparedFile)
}

public struct FilePreparer: FilePreparing {
    private static let jpegQuality = 0.9
    private static let jpegExtension = "jpg"
    private static let firstImage = 0
    private static let singleImage = 1

    private let temporaryFiles: TemporaryFiles

    public init(temporaryFiles: TemporaryFiles = .outgoing) {
        self.temporaryFiles = temporaryFiles
    }

    public func importFile(at url: URL) async throws -> URL {
        let isSecurityScoped = url.startAccessingSecurityScopedResource()
        defer {
            if isSecurityScoped {
                url.stopAccessingSecurityScopedResource()
            }
        }
        let copy = try temporaryFiles.makeFolder().appending(path: url.lastPathComponent)
        do {
            try FileManager.default.copyItem(at: url, to: copy)
        } catch {
            Log.files.error(
                "picked file not copied: \(error.localizedDescription, privacy: .public)")
            throw IletError.fileUnreadable
        }
        return copy
    }

    public func prepareForSending(
        _ file: URL, convertHEICToJPEG: Bool
    ) async throws
        -> PreparedFile
    {
        let upload = try convertHEICToJPEG && Self.isHEIC(file) ? convertToJPEG(file) : file
        return PreparedFile(
            url: upload, fileName: upload.lastPathComponent, sizeBytes: try fileSize(of: upload))
    }

    public func discard(_ file: PreparedFile) {
        temporaryFiles.discard(file.url)
    }

    private static func isHEIC(_ file: URL) -> Bool {
        guard let type = UTType(filenameExtension: file.pathExtension) else {
            return false
        }
        return type.conforms(to: .heic) || type.conforms(to: .heif)
    }

    /// Re-encodes the image as JPG next to the original and deletes the original. Metadata such
    /// as orientation, capture date and location is copied along.
    private func convertToJPEG(_ source: URL) throws -> URL {
        let destination = source.deletingPathExtension().appendingPathExtension(Self.jpegExtension)
        guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil),
            let imageDestination = CGImageDestinationCreateWithURL(
                destination as CFURL, UTType.jpeg.identifier as CFString, Self.singleImage, nil)
        else {
            throw IletError.fileUnreadable
        }
        let options = [kCGImageDestinationLossyCompressionQuality: Self.jpegQuality] as CFDictionary
        CGImageDestinationAddImageFromSource(
            imageDestination, imageSource, Self.firstImage, options)
        guard CGImageDestinationFinalize(imageDestination) else {
            throw IletError.fileUnreadable
        }
        do {
            try FileManager.default.removeItem(at: source)
        } catch {
            Log.files.error(
                "HEIC copy not deleted: \(error.localizedDescription, privacy: .public)")
        }
        return destination
    }

    private func fileSize(of file: URL) throws -> Int64 {
        let values: URLResourceValues
        do {
            values = try file.resourceValues(forKeys: [.fileSizeKey])
        } catch {
            throw IletError.fileUnreadable
        }
        guard let size = values.fileSize else {
            throw IletError.fileUnreadable
        }
        return Int64(size)
    }
}

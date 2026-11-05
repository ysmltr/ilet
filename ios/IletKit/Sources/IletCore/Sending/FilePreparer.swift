import Foundation
import ImageIO
import UniformTypeIdentifiers

/// A file ready to upload: a copy the app owns, the name to send, and its size.
public struct PreparedFile: Sendable {
    public let url: URL
    public let fileName: String
    public let sizeBytes: Int64
    /// A HEIC photo that was to become a JPG but is sent as it is, because converting it would
    /// need more memory than the share sheet has.
    public var isUnconvertedHEIC = false
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
    /// Bits per color channel of an ordinary photo; deeper ones take twice the memory.
    private static let standardDepth = 8
    private static let standardBytesPerPixel: Int64 = 4
    private static let deepBytesPerPixel: Int64 = 8

    private let temporaryFiles: TemporaryFiles
    private let conversionMemoryLimit: Int64?

    /// `conversionMemoryLimit` is the most memory a HEIC photo may take, decoded, to be converted
    /// to JPG; larger ones are sent as HEIC. Without a limit every photo is converted.
    public init(temporaryFiles: TemporaryFiles = .outgoing, conversionMemoryLimit: Int64? = nil) {
        self.temporaryFiles = temporaryFiles
        self.conversionMemoryLimit = conversionMemoryLimit
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
        guard convertHEICToJPEG, Self.isHEIC(file) else {
            return try prepared(file)
        }
        guard fitsConversionLimit(file) else {
            Log.files.info("HEIC photo too large to convert here, sent as HEIC")
            return try prepared(file, isUnconvertedHEIC: true)
        }
        return try prepared(convertToJPEG(file))
    }

    public func discard(_ file: PreparedFile) {
        temporaryFiles.discard(file.url)
    }

    /// The memory an image takes when decoded: width × height × bytes per pixel. `nil` if the
    /// file does not tell, or for sizes no image has.
    static func decodedSize(of file: URL) -> Int64? {
        guard let source = CGImageSourceCreateWithURL(file as CFURL, nil) else {
            return nil
        }
        let copied = CGImageSourceCopyPropertiesAtIndex(source, firstImage, nil)
        let properties = copied as? [String: Any] ?? [:]
        guard let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
            let height = properties[kCGImagePropertyPixelHeight as String] as? Int,
            width > 0, height > 0
        else {
            return nil
        }
        let depth = properties[kCGImagePropertyDepth as String] as? Int ?? standardDepth
        let bytesPerPixel = depth > standardDepth ? deepBytesPerPixel : standardBytesPerPixel
        let (pixels, pixelsOverflow) = Int64(width).multipliedReportingOverflow(by: Int64(height))
        let (bytes, bytesOverflow) = pixels.multipliedReportingOverflow(by: bytesPerPixel)
        guard !pixelsOverflow, !bytesOverflow else {
            return nil
        }
        return bytes
    }

    private static func isHEIC(_ file: URL) -> Bool {
        guard let type = UTType(filenameExtension: file.pathExtension) else {
            return false
        }
        return type.conforms(to: .heic) || type.conforms(to: .heif)
    }

    private func prepared(_ file: URL, isUnconvertedHEIC: Bool = false) throws -> PreparedFile {
        PreparedFile(
            url: file, fileName: file.lastPathComponent, sizeBytes: try fileSize(of: file),
            isUnconvertedHEIC: isUnconvertedHEIC)
    }

    /// Where memory is limited, a photo whose size cannot be read is not converted.
    private func fitsConversionLimit(_ file: URL) -> Bool {
        guard let conversionMemoryLimit else {
            return true
        }
        guard let size = Self.decodedSize(of: file) else {
            return false
        }
        return size <= conversionMemoryLimit
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

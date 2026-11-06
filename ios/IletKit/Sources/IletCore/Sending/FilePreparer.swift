import Foundation
import ImageIO
import UniformTypeIdentifiers

/// A file ready to upload: a copy the app owns, the name to send, and its size.
public struct PreparedFile: Sendable {
    public let url: URL
    public let fileName: String
    public let sizeBytes: Int64
    /// Why a photo or video that was to be converted is sent as it is; `nil` if it was converted
    /// or needed no conversion.
    public var keptOriginal: KeptOriginal?
}

/// Why a photo or video stays in a format that Windows needs an extra app for.
public enum KeptOriginal: Equatable, Sendable {
    /// A HEIC photo that would take more memory to convert than the share sheet has.
    case photoTooLarge
    /// An HEVC video that would take more memory to convert than the share sheet has.
    case videoTooLarge
    /// iOS stopped converting the video, for example because the app was left. Trying again once
    /// the app is back in front may work.
    case videoInterrupted
    /// The video could not be converted.
    case videoFailed
}

/// Where memory is short, as in the share sheet, larger photos and videos are sent as they are.
public struct ConversionLimits: Sendable {
    /// The most memory a HEIC photo may take, decoded.
    public var photoBytes: Int64
    /// The most pixels a frame of an HEVC video may have.
    public var videoFramePixels: Int64

    public init(photoBytes: Int64, videoFramePixels: Int64) {
        self.photoBytes = photoBytes
        self.videoFramePixels = videoFramePixels
    }
}

public protocol FilePreparing: Sendable {
    /// Copies a file the user picked (possibly security-scoped) into the app's temporary folder,
    /// under a cleaned name: any app may have named a file in Files.
    func importFile(at url: URL) async throws -> URL
    /// Turns a copy in the temporary folder into the file to upload. With `makeCompatible`, HEIC
    /// photos become JPG and HEVC videos become MP4 (H.264), which Windows opens without extra
    /// apps.
    func prepareForSending(_ file: URL, makeCompatible: Bool) async throws -> PreparedFile
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
    private let limits: ConversionLimits?

    /// Without `limits`, every HEIC photo and HEVC video is converted.
    public init(temporaryFiles: TemporaryFiles, limits: ConversionLimits? = nil) {
        self.temporaryFiles = temporaryFiles
        self.limits = limits
    }

    public func importFile(at url: URL) async throws -> URL {
        let isSecurityScoped = url.startAccessingSecurityScopedResource()
        defer {
            if isSecurityScoped {
                url.stopAccessingSecurityScopedResource()
            }
        }
        let name = SharedFileName.clean(url.lastPathComponent)
        let copy = try temporaryFiles.makeFolder().appending(path: name)
        do {
            try FileManager.default.copyItem(at: url, to: copy)
        } catch {
            Log.files.error("picked file not copied: \(error.logSummary, privacy: .public)")
            throw IletError.fileUnreadable
        }
        return copy
    }

    public func prepareForSending(
        _ file: URL, makeCompatible: Bool
    ) async throws
        -> PreparedFile
    {
        guard makeCompatible else {
            return try prepared(file)
        }
        if Self.conforms(file, to: [.heic, .heif]) {
            return try preparePhoto(file)
        }
        // Only files named as videos are opened as videos, so other files are never parsed.
        guard Self.conforms(file, to: [.movie]),
            let framePixels = await VideoConverter.hevcFramePixels(of: file)
        else {
            return try prepared(file)
        }
        return try await prepareVideo(file, framePixels: framePixels)
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

    /// The type comes from the name's extension, as the PC will see it.
    private static func conforms(_ file: URL, to types: [UTType]) -> Bool {
        guard let type = UTType(filenameExtension: file.pathExtension) else {
            return false
        }
        return types.contains { type.conforms(to: $0) }
    }

    private func preparePhoto(_ file: URL) throws -> PreparedFile {
        guard fitsPhotoLimit(file) else {
            Log.files.info("HEIC photo too large to convert here, sent as HEIC")
            return try prepared(file, keptOriginal: .photoTooLarge)
        }
        return try prepared(convertToJPEG(file))
    }

    private func prepareVideo(_ file: URL, framePixels: Int64) async throws -> PreparedFile {
        if let limit = limits?.videoFramePixels, framePixels > limit {
            Log.files.info("HEVC video too large to convert here, sent as HEVC")
            return try prepared(file, keptOriginal: .videoTooLarge)
        }
        switch try await VideoConverter.convertToMP4(file) {
        case .converted(let converted):
            return try prepared(converted)
        case .interrupted:
            return try prepared(file, keptOriginal: .videoInterrupted)
        case .failed:
            return try prepared(file, keptOriginal: .videoFailed)
        }
    }

    private func prepared(_ file: URL, keptOriginal: KeptOriginal? = nil) throws -> PreparedFile {
        PreparedFile(
            url: file, fileName: file.lastPathComponent, sizeBytes: try fileSize(of: file),
            keptOriginal: keptOriginal)
    }

    /// Where memory is limited, a photo whose size cannot be read is not converted.
    private func fitsPhotoLimit(_ file: URL) -> Bool {
        guard let limit = limits?.photoBytes else {
            return true
        }
        guard let size = Self.decodedSize(of: file) else {
            return false
        }
        return size <= limit
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
            Log.files.error("HEIC copy not deleted: \(error.logSummary, privacy: .public)")
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

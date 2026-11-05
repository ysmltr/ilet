import AVFoundation
import CoreMedia
import Foundation

/// Converts HEVC videos, which Windows plays only with a paid extension, to H.264 video with AAC
/// sound in an MP4 file, which Windows plays as it is.
enum VideoConverter {
    enum Outcome: Equatable {
        case converted(URL)
        /// The system stopped the conversion, for example because the app was left.
        case interrupted
        case failed
    }

    private static let fileExtension = "mp4"
    /// HEVC pictures, also those with an alpha channel or with Dolby Vision HDR.
    private static let hevcCodecs: Set<FourCharCode> = [
        kCMVideoCodecType_HEVC, kCMVideoCodecType_HEVCWithAlpha, kCMVideoCodecType_DolbyVisionHEVC,
    ]
    /// AVFoundation's codes for work that the system stopped: `operationInterrupted`, when the app
    /// goes to the background, and `mediaServicesWereReset`, which macOS does not have.
    private static let interruptionCodes: Set<Int> = [-11_847, -11_819]
    /// No video is wider or taller than this.
    private static let largestSide: CGFloat = 65_536

    /// The pixels in a frame of the file's HEVC video; `nil` if it has none or cannot be read.
    static func hevcFramePixels(of file: URL) async -> Int64? {
        let asset = AVURLAsset(url: file)
        guard let tracks = try? await asset.loadTracks(withMediaType: .video) else {
            return nil
        }
        for track in tracks {
            guard let descriptions = try? await track.load(.formatDescriptions),
                descriptions.contains(where: isHEVC),
                let size = try? await track.load(.naturalSize)
            else {
                continue
            }
            return pixels(in: size)
        }
        return nil
    }

    /// Converts the video to an MP4 file of the same name, which replaces it. Metadata such as the
    /// capture date and place goes along.
    static func convertToMP4(_ source: URL) async throws -> Outcome {
        let folder = source.deletingLastPathComponent()
        // A name of its own, because the original may already be called *.mp4.
        let output = folder.appending(path: "\(UUID().uuidString).\(fileExtension)")
        let asset = AVURLAsset(url: source)
        // The quality presets, unlike the HEVC ones, encode H.264 video and AAC sound.
        let preset = AVAssetExportPresetHighestQuality
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
            return .failed
        }
        session.outputURL = output
        session.outputFileType = .mp4
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { continuation.resume() }
        }
        guard session.status == .completed else {
            let error = session.error.map { $0 as NSError }
            let domain = error?.domain ?? "none"
            let code = error?.code ?? 0
            Log.files.error(
                "video not converted: \(domain, privacy: .public) \(code, privacy: .public)")
            try? FileManager.default.removeItem(at: output)
            return isInterruption(error) ? .interrupted : .failed
        }
        let destination = source.deletingPathExtension().appendingPathExtension(fileExtension)
        do {
            try FileManager.default.removeItem(at: source)
            try FileManager.default.moveItem(at: output, to: destination)
        } catch {
            Log.files.error(
                "converted video not moved: \(error.localizedDescription, privacy: .public)")
            throw IletError.fileUnreadable
        }
        return .converted(destination)
    }

    private static func isHEVC(_ description: CMFormatDescription) -> Bool {
        hevcCodecs.contains(CMFormatDescriptionGetMediaSubType(description))
    }

    private static func isInterruption(_ error: NSError?) -> Bool {
        guard let error else {
            return false
        }
        return error.domain == AVFoundationErrorDomain && interruptionCodes.contains(error.code)
    }

    /// `nil` for sizes that no video has.
    private static func pixels(in size: CGSize) -> Int64? {
        let width = abs(size.width).rounded()
        let height = abs(size.height).rounded()
        guard width >= 1, height >= 1, width <= largestSide, height <= largestSide else {
            return nil
        }
        return Int64(width) * Int64(height)
    }
}

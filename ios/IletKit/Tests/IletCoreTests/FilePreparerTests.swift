import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest

@testable import IletCore

/// Photos and videos are converted only when asked, and in the share sheet only if they fit its
/// little memory. Other files, also ones that only look like videos, are sent as they are.
final class FilePreparerTests: XCTestCase {
    func testReadsTheDecodedSizeOfAnImage() throws {
        let image = try makePNG(width: 30, height: 20, named: "image.png", in: makeTemporaryStore())
        XCTAssertEqual(FilePreparer.decodedSize(of: image), 30 * 20 * 4)
    }

    func testKeepsAHEICPhotoThatIsTooLargeToConvert() async throws {
        let store = makeTemporaryStore()
        let photo = try makePNG(width: 10, height: 10, named: "photo.heic", in: store)
        let preparer = FilePreparer(temporaryFiles: store, limits: limits(photoBytes: 399))

        let file = try await preparer.prepareForSending(photo, makeCompatible: true)

        XCTAssertEqual(file.fileName, "photo.heic")
        XCTAssertEqual(file.keptOriginal, .photoTooLarge)
    }

    func testConvertsAHEICPhotoWithinTheLimit() async throws {
        let store = makeTemporaryStore()
        let photo = try makePNG(width: 10, height: 10, named: "photo.heic", in: store)
        let preparer = FilePreparer(temporaryFiles: store, limits: limits(photoBytes: 400))

        let file = try await preparer.prepareForSending(photo, makeCompatible: true)

        XCTAssertEqual(file.fileName, "photo.jpg")
        XCTAssertNil(file.keptOriginal)
    }

    func testConvertsNothingWhenNotAsked() async throws {
        let store = makeTemporaryStore()
        let photo = try makePNG(width: 10, height: 10, named: "photo.heic", in: store)
        let preparer = FilePreparer(temporaryFiles: store)

        let file = try await preparer.prepareForSending(photo, makeCompatible: false)

        XCTAssertEqual(file.fileName, "photo.heic")
        XCTAssertNil(file.keptOriginal)
    }

    /// Shared items come from other apps, so a name proves nothing about the content.
    func testSendsAFileThatOnlyLooksLikeAVideoAsItIs() async throws {
        let store = makeTemporaryStore()
        let fake = try store.makeFolder().appending(path: "clip.mov")
        try Data("not a video".utf8).write(to: fake)
        let preparer = FilePreparer(temporaryFiles: store)

        let file = try await preparer.prepareForSending(fake, makeCompatible: true)

        XCTAssertEqual(file.url, fake)
        XCTAssertEqual(file.sizeBytes, 11)
        XCTAssertNil(file.keptOriginal)
    }

    private func limits(photoBytes: Int64) -> ConversionLimits {
        ConversionLimits(photoBytes: photoBytes, videoFramePixels: 1920 * 1080)
    }

    /// A PNG under any name. ImageIO reads the content, not the name, so "photo.heic" stands in
    /// for a HEIC photo.
    private func makePNG(
        width: Int, height: Int, named name: String, in store: TemporaryFiles
    ) throws -> URL {
        let url = try store.makeFolder().appending(path: name)
        let context = try XCTUnwrap(
            CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.setFillColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try XCTUnwrap(context.makeImage())
        let png = UTType.png.identifier as CFString
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, png, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return url
    }
}

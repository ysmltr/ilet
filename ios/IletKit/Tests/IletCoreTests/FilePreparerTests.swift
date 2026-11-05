import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest

@testable import IletCore

/// The share sheet has little memory, so a photo is converted only if it fits the limit.
final class FilePreparerTests: XCTestCase {
    func testReadsTheDecodedSizeOfAnImage() throws {
        let image = try makePNG(width: 30, height: 20, named: "image.png", in: makeTemporaryStore())
        XCTAssertEqual(FilePreparer.decodedSize(of: image), 30 * 20 * 4)
    }

    func testKeepsAHEICPhotoThatIsTooLargeToConvert() async throws {
        let store = makeTemporaryStore()
        let photo = try makePNG(width: 10, height: 10, named: "photo.heic", in: store)
        let preparer = FilePreparer(temporaryFiles: store, conversionMemoryLimit: 399)

        let file = try await preparer.prepareForSending(photo, convertHEICToJPEG: true)

        XCTAssertEqual(file.fileName, "photo.heic")
        XCTAssertTrue(file.isUnconvertedHEIC)
    }

    func testConvertsAHEICPhotoWithinTheLimit() async throws {
        let store = makeTemporaryStore()
        let photo = try makePNG(width: 10, height: 10, named: "photo.heic", in: store)
        let preparer = FilePreparer(temporaryFiles: store, conversionMemoryLimit: 400)

        let file = try await preparer.prepareForSending(photo, convertHEICToJPEG: true)

        XCTAssertEqual(file.fileName, "photo.jpg")
        XCTAssertFalse(file.isUnconvertedHEIC)
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

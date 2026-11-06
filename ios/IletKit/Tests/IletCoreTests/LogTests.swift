import XCTest

@testable import IletCore

/// File names stay out of the log (SECURITY_REVIEW.md, S9): errors are logged by their domain and
/// code, never by a description that would name the file.
final class LogTests: XCTestCase {
    func testSummarizesAFileErrorWithoutItsName() {
        let error = CocoaError(
            .fileWriteOutOfSpace, userInfo: [NSFilePathErrorKey: "/tmp/IMG_0001.HEIC"])

        XCTAssertEqual(error.logSummary, "NSCocoaErrorDomain 640")
    }
}

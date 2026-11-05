import XCTest

@testable import IletCore

/// Items that other apps share come from outside ilet: their types and names are checked.
final class SharedItemTests: XCTestCase {
    func testSendsTheMostFaithfulFileAndNeverALink() {
        XCTAssertEqual(choice(["public.heic", "public.jpeg"], convertHEIC: false), "public.heic")
        XCTAssertEqual(choice(["public.url", "public.plain-text"]), "public.plain-text")
        XCTAssertNil(choice(["public.url"]))
        XCTAssertNil(choice(["public.file-url"]))
        XCTAssertNil(choice(["com.example.not-a-declared-type"]))
        XCTAssertNil(choice([]))
    }

    func testTakesTheSharingAppsJPGForAHEICPhotoWhenConverting() {
        XCTAssertEqual(choice(["public.heic", "public.jpeg"]), "public.jpeg")
        XCTAssertEqual(choice(["public.heic", "public.png"]), "public.heic")
        XCTAssertEqual(choice(["public.png", "public.jpeg"]), "public.png")
    }

    func testKeepsOnlyTheLastPartOfAPath() {
        XCTAssertEqual(SharedFileName.clean("../../Library/evil.jpg"), "evil.jpg")
        XCTAssertEqual(SharedFileName.clean("/private/var/photo.heic"), "photo.heic")
        XCTAssertEqual(SharedFileName.clean("folder/"), "folder")
    }

    func testRemovesInvisibleCharacters() {
        // The right-to-left override would show this name as "photoexe.jpg".
        XCTAssertEqual(SharedFileName.clean("photo\u{202E}gpj.exe"), "photogpj.exe")
        XCTAssertEqual(SharedFileName.clean("a\u{0}b\nc\u{2028}d.txt"), "abcd.txt")
    }

    func testFallsBackWhenNothingUsableIsLeft() {
        let oneHugeCharacter = "e" + String(repeating: "\u{301}", count: 300)
        for name in ["", ".", "..", "/", "../", "\u{202E}", oneHugeCharacter] {
            XCTAssertEqual(SharedFileName.clean(name), "file", name)
        }
    }

    func testShortensLongNamesBetweenCharactersAndKeepsTheExtension() {
        let turkish = SharedFileName.clean(String(repeating: "ş", count: 300) + ".jpg")
        let withoutExtension = SharedFileName.clean(String(repeating: "a", count: 300))
        let longExtension = SharedFileName.clean("a." + String(repeating: "b", count: 300))

        XCTAssertLessThanOrEqual(turkish.utf8.count, 200)
        XCTAssertTrue(turkish.hasSuffix("ş.jpg"))
        XCTAssertEqual(withoutExtension, String(repeating: "a", count: 200))
        XCTAssertEqual(longExtension.utf8.count, 200)
        XCTAssertEqual(SharedFileName.clean("IMG_1234.HEIC"), "IMG_1234.HEIC")
    }

    private func choice(_ offered: [String], convertHEIC: Bool = true) -> String? {
        SharedItemType.identifier(from: offered, convertHEIC: convertHEIC)
    }
}

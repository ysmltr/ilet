import XCTest

@testable import IletCore

/// The setting for formats that Windows opens covers videos now, under the key it had when it
/// was only about photos, so a choice made before the update stays.
final class SettingsStoreTests: XCTestCase {
    func testConvertsByDefault() throws {
        let store = AppGroupSettingsStore(defaults: try makeDefaults())
        XCTAssertTrue(store.sendCompatibleFormats())
    }

    func testKeepsAChoiceSavedUnderTheFirstName() throws {
        let defaults = try makeDefaults()
        defaults.set(false, forKey: "sendAsJPEG")

        XCTAssertFalse(AppGroupSettingsStore(defaults: defaults).sendCompatibleFormats())
    }

    func testSavesTheChoice() throws {
        let defaults = try makeDefaults()

        AppGroupSettingsStore(defaults: defaults).setSendCompatibleFormats(false)

        XCTAssertFalse(AppGroupSettingsStore(defaults: defaults).sendCompatibleFormats())
    }
}

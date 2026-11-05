import Foundation
import IletCore

/// The note under a photo or video that is sent as it is, although it was to be converted.
enum ConversionNote {
    static func text(for keptOriginal: KeptOriginal?) -> String? {
        switch keptOriginal {
        case .photoTooLarge:
            return String(localized: "share.keptHEIC")
        case .videoTooLarge:
            return String(localized: "share.keptHEVC")
        case .videoInterrupted, .videoFailed:
            return String(localized: "transfer.keptHEVC")
        case nil:
            return nil
        }
    }
}

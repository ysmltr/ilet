import Foundation
import PhotosUI
import SwiftUI

/// Where a file to send comes from.
enum TransferSource {
    case photo(PhotosPickerItem)
    case file(URL)
}

/// One file in the transfer list.
struct Transfer: Identifiable, Equatable {
    enum State: Equatable {
        case preparing
        case sending(fraction: Double)
        case sent(savedAs: String)
        case failed(message: String)

        var isFinished: Bool {
            switch self {
            case .sent, .failed:
                return true
            case .preparing, .sending:
                return false
            }
        }
    }

    let id = UUID()
    var name: String
    var state = State.preparing
}

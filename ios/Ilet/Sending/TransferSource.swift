import Foundation
import PhotosUI
import SwiftUI

/// Where a file to send comes from.
enum TransferSource {
    case photo(PhotosPickerItem)
    case file(URL)
}

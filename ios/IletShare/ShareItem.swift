import Foundation

/// One shared item in the share sheet's list.
struct ShareItem: Identifiable, Equatable {
    enum State: Equatable {
        case ready
        case preparing
        /// Handed to iOS, which has not started sending it yet.
        case waiting
        case sending(fraction: Double)
        case sent(savedAs: String?)
        case failed(message: String)

        var isFinished: Bool {
            switch self {
            case .sent, .failed:
                return true
            case .ready, .preparing, .waiting, .sending:
                return false
            }
        }
    }

    let id = UUID()
    var name: String
    var state = State.ready
    /// Shown under the item, for example when a photo stays HEIC.
    var note: String?
}

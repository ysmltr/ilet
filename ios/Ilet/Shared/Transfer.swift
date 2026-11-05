import Foundation

/// One file in a list of transfers, in the app and in the share sheet.
struct Transfer: Identifiable, Equatable {
    enum State: Equatable {
        /// Listed, but not sent yet: in the share sheet, until Send is tapped.
        case ready
        case preparing
        /// Handed to iOS, which has not started sending it yet.
        case waiting
        case sending(fraction: Double)
        /// The PC's answer names the saved file, when it could be read.
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

    /// Progress below this step is not shown, to keep the list from redrawing for every chunk.
    private static let progressStep = 0.01

    let id = UUID()
    var name: String
    var state = State.preparing
    /// Shown under the name, for example when a video stays HEVC.
    var note: String?

    /// Shows an upload's progress, unless the upload has ended or moved too little to be seen.
    mutating func showProgress(_ fraction: Double) {
        switch state {
        case .waiting:
            state = .sending(fraction: fraction)
        case .sending(let shown) where fraction - shown >= Self.progressStep:
            state = .sending(fraction: fraction)
        default:
            break
        }
    }
}

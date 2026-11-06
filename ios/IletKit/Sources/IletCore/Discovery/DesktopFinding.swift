import Foundation

/// Finds where a paired PC is now, from its announcement on the local network
/// (PROTOCOL.md section 6).
public protocol DesktopFinding: Sendable {
    /// The addresses and ports that the PC's announcement names, found within a few seconds, or
    /// none. They are only a hint: whoever connects still checks each address and the pin.
    func endpoints(of desktopID: UUID) async -> [DesktopEndpoint]
}

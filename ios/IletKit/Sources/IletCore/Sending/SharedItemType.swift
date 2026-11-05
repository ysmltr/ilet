import UniformTypeIdentifiers

/// Picks which of a shared item's types to copy. Apps offer an item in several types, the most
/// faithful first. Only files are sent, never links.
public enum SharedItemType {
    /// `offered` lists the item's type identifiers in the sharing app's order. With
    /// `convertHEIC`, a HEIC photo comes as the sharing app's own JPG when it offers one, which
    /// spares the share sheet the memory that converting takes.
    public static func identifier(from offered: [String], convertHEIC: Bool) -> String? {
        let files = offered.filter { conforms($0, to: [.data]) && !conforms($0, to: [.url]) }
        guard let original = files.first else {
            return nil
        }
        guard convertHEIC, conforms(original, to: [.heic, .heif]),
            let jpeg = files.first(where: { conforms($0, to: [.jpeg]) })
        else {
            return original
        }
        return jpeg
    }

    /// Types the system does not know conform to nothing, so they are never copied.
    private static func conforms(_ identifier: String, to types: [UTType]) -> Bool {
        guard let type = UTType(identifier) else {
            return false
        }
        return types.contains { type.conforms(to: $0) }
    }
}

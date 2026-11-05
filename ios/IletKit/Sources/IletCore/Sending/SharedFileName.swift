/// Cleans the name another app gives a shared file. It comes from outside ilet, so it may hold a
/// path, invisible characters (a right-to-left override can disguise the extension) or far too
/// many bytes. The PC checks names again (PROTOCOL.md section 5.3); this keeps the copy on the
/// iPhone and the name in the share sheet safe.
public enum SharedFileName {
    static let fallback = "file"
    static let maxBytes = 200
    static let maxExtensionBytes = 16
    private static let unusableNames: Set<String> = ["", ".", ".."]
    private static let removedCategories: Set<Unicode.GeneralCategory> = [
        .control, .format, .lineSeparator, .paragraphSeparator,
    ]

    public static func clean(_ name: String) -> String {
        let lastComponent = name.split(separator: "/").last ?? ""
        var kept = String.UnicodeScalarView()
        kept.append(contentsOf: lastComponent.unicodeScalars.filter(isKept))
        let cleaned = shortened(String(kept))
        return unusableNames.contains(cleaned) ? fallback : cleaned
    }

    private static func isKept(_ scalar: Unicode.Scalar) -> Bool {
        !removedCategories.contains(scalar.properties.generalCategory)
    }

    /// Cuts the name to `maxBytes` of UTF-8 between two characters, keeping a short extension.
    private static func shortened(_ name: String) -> String {
        guard name.utf8.count > maxBytes else {
            return name
        }
        let start = extensionStart(of: name)
        let suffix = name[start...]
        var budget = maxBytes - suffix.utf8.count
        var shortName = ""
        for character in name[..<start] {
            let size = character.utf8.count
            guard size <= budget else {
                break
            }
            shortName.append(character)
            budget -= size
        }
        shortName.append(contentsOf: suffix)
        return shortName
    }

    /// Where a short extension such as ".jpg" starts, or the end of a name without one.
    private static func extensionStart(of name: String) -> String.Index {
        guard let dot = name.lastIndex(of: "."), dot != name.startIndex,
            name[dot...].utf8.count <= maxExtensionBytes + 1
        else {
            return name.endIndex
        }
        return dot
    }
}

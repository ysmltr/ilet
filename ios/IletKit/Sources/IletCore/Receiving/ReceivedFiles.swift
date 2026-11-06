import Foundation

/// The files that came from a PC, in ilet's own folder, which the Files app shows as On My
/// iPhone › ilet. A file is only ever added under a name that is free: ` (1)`, ` (2)`, … are
/// tried in turn, so nothing in the folder is ever replaced.
public struct ReceivedFiles: Sendable {
    /// The app's Documents folder.
    public static let documents = ReceivedFiles(folder: .documentsDirectory)
    /// Names are numbered up to here; a file that would need a higher number is not saved.
    private static let maxNumber = 999

    let folder: URL

    /// Where a received file is, for Share and Save to Photos.
    public func url(of fileName: String) -> URL {
        folder.appending(path: fileName, directoryHint: .notDirectory)
    }

    /// Moves a complete download in under `fileName`, or else the first free numbered name, and
    /// returns the name it got. The name was cleaned when the download started; it is cleaned
    /// again here, where the file is written, so it can only ever name a file in this folder.
    func add(_ file: URL, named fileName: String) throws -> String {
        let cleanName = ReceivedFileName.clean(fileName)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            Log.files.error("received files folder failed: \(error.logSummary, privacy: .public)")
            throw IletError.fileNotSaved
        }
        for number in 0...Self.maxNumber {
            let name = Self.name(cleanName, numbered: number)
            do {
                // Fails, rather than replaces, when the name is taken.
                try FileManager.default.moveItem(at: file, to: url(of: name))
                return name
            } catch let error as CocoaError where error.code == .fileWriteFileExists {
                continue
            } catch {
                Log.files.error("received file not saved: \(error.logSummary, privacy: .public)")
                throw IletError.fileNotSaved
            }
        }
        Log.files.error("received file not saved: every numbered name is taken")
        throw IletError.fileNotSaved
    }

    /// `report.pdf`, then `report (1).pdf`, `report (2).pdf`, …: the number goes before the
    /// extension, if there is one.
    static func name(_ fileName: String, numbered number: Int) -> String {
        guard number > 0 else {
            return fileName
        }
        guard let dot = fileName.lastIndex(of: "."), dot != fileName.startIndex else {
            return "\(fileName) (\(number))"
        }
        return "\(fileName[..<dot]) (\(number))\(fileName[dot...])"
    }
}

/// Cleans the name of a file from a PC, which the PC cleaned already (PROTOCOL.md section 5.4):
/// like a shared name (`SharedFileName`), and without leading dots, which would hide the file in
/// the Files app or give it the name of a folder that the system keeps there, such as `.Trash`.
enum ReceivedFileName {
    static func clean(_ name: String) -> String {
        let visible = SharedFileName.clean(name).drop(while: { $0 == "." })
        return visible.isEmpty ? SharedFileName.fallback : String(visible)
    }
}

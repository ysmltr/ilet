import IletCore

extension TemporaryFiles {
    /// The app's copies while iOS uploads them. They are in the App Group with the share sheet's,
    /// so one sweep finds every leftover.
    static let appUploads: TemporaryFiles = {
        let appGroup = AppConfiguration.fromMainBundle().appGroupIdentifier
        guard let store = TemporaryFiles.backgroundUploads(appGroup: appGroup) else {
            preconditionFailure("App Group \(appGroup) is not available")
        }
        return store
    }()
}

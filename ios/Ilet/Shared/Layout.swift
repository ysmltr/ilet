import CoreGraphics

/// Shared spacing and sizes, so screens look alike.
enum Layout {
    static let screenPadding: CGFloat = 32
    static let sectionSpacing: CGFloat = 20
    static let rowSpacing: CGFloat = 4
    static let stepSpacing: CGFloat = 12
    static let heroIconSize: CGFloat = 44
    static let scannerCornerRadius: CGFloat = 16
    /// How far below the logo's bottom edge the start screen shows its spinner.
    static let launchSpinnerOffset: CGFloat = 56
    static let welcomeLogoWidth: CGFloat = 200
    static let infoLogoWidth: CGFloat = 120
}

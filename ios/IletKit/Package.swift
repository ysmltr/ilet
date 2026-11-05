// swift-tools-version: 5.9

import PackageDescription

// Everything the app and the Share Extension share: protocol, pinning, networking, storage and
// the background uploads. No UI, and it also builds for macOS, so `swift test` runs on a Mac
// without a simulator.
let package = Package(
    name: "IletKit",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "IletCore", targets: ["IletCore"])
    ],
    targets: [
        .target(
            name: "IletCore",
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "IletCoreTests",
            dependencies: ["IletCore"],
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        ),
    ]
)

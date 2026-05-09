// swift-tools-version: 5.10
//
// HyperBabel Swift demo — Swift Package manifest.
//
// The demo is delivered as plain Swift source files under HyperBabelDemo/.
// This Package.swift is mostly for documentation: it lists the third-party
// SDK dependencies so engineers know exactly which packages to add to their
// Xcode project. See the README for the recommended Xcode setup flow.

import PackageDescription

let package = Package(
    name: "HyperBabelDemo",
    platforms: [
        .iOS(.v16),
        // The macOS bound is set only so `swift build` on a developer's host
        // machine (which compiles the platform-agnostic API + UI code) finds
        // a recent-enough Combine and SwiftUI. The shipped target is iOS.
        .macOS(.v14),
    ],
    products: [
        .library(name: "HyperBabelDemo", targets: ["HyperBabelDemo"]),
    ],
    dependencies: [
        // Real-Time channel SDK. Imported by Realtime/HyperBabelRealtime.swift.
        .package(url: "https://github.com/ably/ably-cocoa.git", from: "1.2.0"),

        // Video RTC SDK. Imported by Video/HyperBabelVideo.swift.
        .package(url: "https://github.com/AgoraIO/AgoraRtcEngine_iOS.git", from: "4.4.0"),
    ],
    targets: [
        .target(
            name: "HyperBabelDemo",
            dependencies: [
                .product(name: "Ably", package: "ably-cocoa"),
                .product(name: "RtcBasic", package: "AgoraRtcEngine_iOS"),
            ],
            path: "HyperBabelDemo"
        ),
    ]
)

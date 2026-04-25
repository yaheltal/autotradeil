import SwiftUI

/// AutoTradeIL — Hebrew RTL B2B dealer marketplace, iOS 17+.
///
/// A11y notes (best-effort review approved, swift-lead validation pending):
///   - All text uses system text styles (Dynamic Type) — no `.system(size:)`.
///   - Brand contrast tokens: navy on cream = AAA; gold ONLY as icon/accent.
///   - VoiceOver: composite views combine via `.accessibilityElement`.
///   - Layout direction is RTL at root and inherited.
@main
struct AutoTradeILApp: App {
    @StateObject private var authManager = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environment(\.layoutDirection, .rightToLeft)
                .preferredColorScheme(.light)
        }
    }
}

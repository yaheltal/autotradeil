import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut, value: authManager.isAuthenticated)
    }
}

/// Root tab bar. Each tab gets an explicit accessibility label so VoiceOver
/// reads the Hebrew name only — not the SF Symbol asset name (a11y req #C).
struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("דשבורד", systemImage: "chart.bar.fill") }
                .accessibilityLabel("דשבורד")

            InventoryListView()
                .tabItem { Label("מלאי", systemImage: "car.fill") }
                .accessibilityLabel("מלאי")

            MarketplaceView()
                .tabItem { Label("שוק", systemImage: "storefront.fill") }
                .accessibilityLabel("שוק B2B")

            OffersView()
                .tabItem { Label("הצעות", systemImage: "tag.fill") }
                .accessibilityLabel("הצעות")

            NotificationsView()
                .tabItem { Label("התראות", systemImage: "bell.fill") }
                .accessibilityLabel("התראות")
        }
        .tint(Color.brandGold)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

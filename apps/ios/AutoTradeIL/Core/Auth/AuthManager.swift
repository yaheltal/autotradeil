import Combine
import Foundation

/// Session-state owner. Persists the access token in the Keychain and exposes
/// the current dealer profile to the rest of the app.
@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published private(set) var isAuthenticated = false
    @Published private(set) var currentDealer: DealerProfile?
    @Published private(set) var token: String?

    private let tokenKey = "auth_token"

    private init() {
        loadStoredSession()
    }

    private func loadStoredSession() {
        if let stored = KeychainManager.shared.load(forKey: tokenKey) {
            self.token = stored
            self.isAuthenticated = true
            Task { await refreshProfile() }
        }
    }

    /// Native client login — proxies through `/api/v1/auth/login` which calls
    /// Supabase's password grant server-side (Phase 5.1).
    func login(email: String, password: String) async throws {
        struct Body: Encodable {
            let email: String
            let password: String
        }
        struct Resp: Decodable {
            let accessToken: String
        }
        let resp: Resp = try await APIClient.shared.request(
            endpoint: "/api/v1/auth/login",
            method: "POST",
            body: Body(email: email, password: password)
        )

        self.token = resp.accessToken
        self.isAuthenticated = true
        KeychainManager.shared.save(resp.accessToken, forKey: tokenKey)
        await refreshProfile()
        Announcer.screenChanged(focusOn: "התחברת בהצלחה")
    }

    func logout() {
        KeychainManager.shared.delete(forKey: tokenKey)
        self.token = nil
        self.isAuthenticated = false
        self.currentDealer = nil
    }

    func refreshProfile() async {
        guard let token = token else { return }
        do {
            let profile: DealerProfile = try await APIClient.shared.request(
                endpoint: "/api/v1/dealers/me",
                token: token
            )
            self.currentDealer = profile
        } catch {
            // Non-fatal — leave existing profile in place.
        }
    }
}

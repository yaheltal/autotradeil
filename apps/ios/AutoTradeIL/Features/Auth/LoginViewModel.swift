import Foundation

@MainActor
final class LoginViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    var biometricType: BiometricAuthManager.BiometricType {
        BiometricAuthManager.shared.biometricType
    }

    func login() async {
        guard !email.trimmingCharacters(in: .whitespaces).isEmpty,
              !password.isEmpty else {
            errorMessage = "אנא מלא אימייל וסיסמה"
            Announcer.announce(errorMessage ?? "")
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await AuthManager.shared.login(email: email, password: password)
        } catch let error as APIError {
            errorMessage = error.errorDescription
            Announcer.announce(errorMessage ?? "")
        } catch {
            errorMessage = "שגיאה בהתחברות"
            Announcer.announce(errorMessage ?? "")
        }
    }

    /// Biometric "fast-login" — re-uses the keychain-stored access token.
    /// If no token exists yet, this is a no-op (UI hides the button).
    func loginWithBiometrics() async {
        let success = await BiometricAuthManager.shared.authenticate()
        guard success else { return }
        await AuthManager.shared.refreshProfile()
    }
}

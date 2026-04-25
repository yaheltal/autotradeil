import Foundation
import LocalAuthentication

/// Face ID / Touch ID convenience.
///
/// A11y note: per a11y-lead required change #8, callers should NOT render a
/// disabled "Face ID" button when biometrics are unavailable — they should
/// conditionally omit it. `biometricType == .none` is the gate.
final class BiometricAuthManager {
    static let shared = BiometricAuthManager()

    enum BiometricType {
        case faceID, touchID, none
    }

    var biometricType: BiometricType {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        default: return .none
        }
    }

    func authenticate(reason: String = "התחבר ל-AutoTradeIL") async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }
        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
        } catch {
            return false
        }
    }
}

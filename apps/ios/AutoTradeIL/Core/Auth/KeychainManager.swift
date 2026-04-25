import Foundation
import Security

/// Minimal Keychain wrapper.
///
/// Security note (a11y-lead required change #D, deferred to swift-lead):
///   - We use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` so the secret
///     never syncs to iCloud Keychain and is only readable while the device
///     is unlocked.
///   - For higher-assurance flows (e.g. payment), wrap with
///     `SecAccessControlCreateWithFlags(.biometryCurrentSet, ...)` to require
///     Face ID / Touch ID on every read. Token reads at app launch don't
///     need that — Face ID prompts every cold-start would be hostile UX.
final class KeychainManager {
    static let shared = KeychainManager()
    private let service = "il.autotradeil.app"

    private init() {}

    func save(_ value: String, forKey key: String) {
        guard let data = value.data(using: .utf8) else { return }
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        // Replace existing.
        SecItemDelete(baseQuery as CFDictionary)

        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    func load(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

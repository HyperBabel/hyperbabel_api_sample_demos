/*
 * SecureStore — iOS Keychain wrapper for HyperBabel customer JWT pair.
 *
 * Uses the Security framework directly so we don't pull in a third-party
 * Keychain dependency. The customer JWT pair (access + refresh + expires_at)
 * lives here; lifetime is unlocked-while-unlocked-this-device-only, so the
 * tokens are wiped if the user disables passcode / Face ID.
 *
 * Identity (user_id, display_name, lang) lives in @AppStorage /
 * UserDefaults — see Session.swift — because it isn't secret and changes
 * via the Settings screen.
 */
import Foundation
import Security

enum SecureStore {
    private static let service = "com.hyperbabel.demo.customer-auth"

    enum Key: String {
        case accessToken  = "hb_access_token"
        case refreshToken = "hb_refresh_token"
        case expiresAt    = "hb_expires_at"
    }

    // ── Read ────────────────────────────────────────────────────────────

    static func read(_ key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass            as String: kSecClassGenericPassword,
            kSecAttrService      as String: service,
            kSecAttrAccount      as String: key.rawValue,
            kSecReturnData       as String: true,
            kSecMatchLimit       as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        return value
    }

    static func readInt(_ key: Key) -> Int? {
        guard let s = read(key) else { return nil }
        return Int(s)
    }

    // ── Write ───────────────────────────────────────────────────────────

    @discardableResult
    static func write(_ key: Key, _ value: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let baseQuery: [String: Any] = [
            kSecClass        as String: kSecClassGenericPassword,
            kSecAttrService  as String: service,
            kSecAttrAccount  as String: key.rawValue,
        ]
        // Try update first; if it doesn't exist, add it.
        let updateStatus = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary,
        )
        if updateStatus == errSecSuccess { return true }
        var addQuery = baseQuery
        addQuery[kSecValueData as String]   = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        return addStatus == errSecSuccess
    }

    @discardableResult
    static func writeInt(_ key: Key, _ value: Int) -> Bool {
        write(key, String(value))
    }

    // ── Delete ──────────────────────────────────────────────────────────

    static func delete(_ key: Key) {
        let query: [String: Any] = [
            kSecClass       as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearAll() {
        delete(.accessToken)
        delete(.refreshToken)
        delete(.expiresAt)
    }
}

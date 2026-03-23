import Foundation
import Security

/// Minimal Keychain wrapper for storing sensitive strings (API key, etc.)
enum KeychainHelper {

    // MARK: - Public API

    /// Save or update a string value in the Keychain.
    @discardableResult
    static func save(key: String, value: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }

        // Try to update first; if the item doesn't exist yet, add it.
        let query = baseQuery(for: key)
        let status = SecItemCopyMatching(query as CFDictionary, nil)

        if status == errSecSuccess {
            let attributes: [String: Any] = [kSecValueData as String: data]
            let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            return updateStatus == errSecSuccess
        } else {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            return addStatus == errSecSuccess
        }
    }

    /// Read a string value from the Keychain.
    static func read(key: String) -> String? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Delete a value from the Keychain.
    @discardableResult
    static func delete(key: String) -> Bool {
        let query = baseQuery(for: key)
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    // MARK: - One-time Migration

    /// Migrate API key from UserDefaults to Keychain. Safe to call repeatedly.
    static func migrateApiKeyFromUserDefaults() {
        let defaults = UserDefaults.standard
        guard let plaintext = defaults.string(forKey: "apiKey"), !plaintext.isEmpty else { return }

        // Only migrate if Keychain doesn't already have a value
        if read(key: "apiKey") == nil {
            save(key: "apiKey", value: plaintext)
        }

        // Remove plaintext copy
        defaults.removeObject(forKey: "apiKey")
    }

    // MARK: - Internal

    private static func baseQuery(for key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: AppConfig.App.bundleId,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
    }
}

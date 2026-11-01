import Foundation
import Security

/// Access tokens, one per paired PC.
public protocol CredentialStore: Sendable {
    func saveToken(_ token: String, for desktopID: UUID) throws
    func token(for desktopID: UUID) throws -> String?
    func deleteToken(for desktopID: UUID) throws
}

/// Keeps tokens in the Keychain, in an access group shared with the Share Extension. They are
/// readable only on this device and only after the first unlock since restart, so background
/// uploads work while the phone is locked but tokens never reach backups or other devices.
public struct KeychainCredentialStore: CredentialStore {
    private static let service = "app.ilet.access-token"

    private let accessGroup: String

    public init(accessGroup: String) {
        self.accessGroup = accessGroup
    }

    public func saveToken(_ token: String, for desktopID: UUID) throws {
        try deleteToken(for: desktopID)
        var attributes = query(for: desktopID)
        attributes[kSecValueData as String] = Data(token.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw IletError.credentialStorage(status)
        }
    }

    public func token(for desktopID: UUID) throws -> String? {
        var search = query(for: desktopID)
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(search as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
                throw IletError.storageCorrupted
            }
            return token
        case errSecItemNotFound:
            return nil
        default:
            throw IletError.credentialStorage(status)
        }
    }

    public func deleteToken(for desktopID: UUID) throws {
        let status = SecItemDelete(query(for: desktopID) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw IletError.credentialStorage(status)
        }
    }

    private func query(for desktopID: UUID) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: desktopID.uuidString.lowercased(),
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}

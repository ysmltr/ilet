import type { SafeStorage } from 'electron';

import { StartupError } from '../shared/errors';
import type { SecretCipher } from './secretCipher';

/** Uses Electron's safeStorage: DPAPI on Windows, the Keychain on macOS. */
export function createSafeStorageCipher(safeStorage: SafeStorage): SecretCipher {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new StartupError('secure_storage_unavailable');
  }
  return {
    encrypt: (plaintext) => safeStorage.encryptString(plaintext),
    decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
  };
}

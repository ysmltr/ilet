/** Encrypts secrets at rest so that only the current OS user can decrypt them. */
export interface SecretCipher {
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}

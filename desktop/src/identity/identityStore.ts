import { createPrivateKey, randomUUID, X509Certificate } from 'node:crypto';

import { StartupError } from '../shared/errors';
import { readJsonFile, writeJsonFileAtomic } from '../shared/jsonFile';
import { isRecord, isUuid } from '../shared/validation';
import { certificateFingerprint, createSelfSignedCertificate } from './certificate';
import type { SecretCipher } from './secretCipher';

const IDENTITY_FORMAT_VERSION = 1;
const ENCRYPTED_KEY_ENCODING = 'base64';

/** The desktop's long-lived TLS identity. */
export interface TlsIdentity {
  readonly deviceId: string;
  readonly certificatePem: string;
  readonly privateKeyPem: string;
  readonly fingerprint: string;
}

interface IdentityFile {
  readonly formatVersion: number;
  readonly deviceId: string;
  readonly certificatePem: string;
  readonly encryptedPrivateKey: string;
}

/**
 * Loads the identity, creating it on first launch. The private key is written to disk only
 * encrypted, and on load it must match the certificate.
 */
export async function loadOrCreateIdentity(
  filePath: string,
  cipher: SecretCipher,
  now: () => Date,
): Promise<TlsIdentity> {
  const stored = await readJsonFile(filePath);
  if (stored !== undefined) {
    return restoreIdentity(stored, cipher, filePath);
  }
  const identity = createIdentity(now());
  const file: IdentityFile = {
    formatVersion: IDENTITY_FORMAT_VERSION,
    deviceId: identity.deviceId,
    certificatePem: identity.certificatePem,
    encryptedPrivateKey: cipher.encrypt(identity.privateKeyPem).toString(ENCRYPTED_KEY_ENCODING),
  };
  await writeJsonFileAtomic(filePath, file);
  return identity;
}

function createIdentity(now: Date): TlsIdentity {
  const { certificatePem, privateKeyPem } = createSelfSignedCertificate(now);
  return {
    deviceId: randomUUID(),
    certificatePem,
    privateKeyPem,
    fingerprint: certificateFingerprint(new X509Certificate(certificatePem)),
  };
}

function restoreIdentity(stored: unknown, cipher: SecretCipher, filePath: string): TlsIdentity {
  const file = parseIdentityFile(stored);
  if (file === undefined) {
    throw new StartupError('data_file_invalid', { detail: filePath });
  }
  let certificate: X509Certificate;
  let privateKeyPem: string;
  try {
    certificate = new X509Certificate(file.certificatePem);
    privateKeyPem = cipher.decrypt(Buffer.from(file.encryptedPrivateKey, ENCRYPTED_KEY_ENCODING));
  } catch (error) {
    throw new StartupError('data_file_invalid', { detail: filePath, cause: error });
  }
  if (!certificate.checkPrivateKey(createPrivateKey(privateKeyPem))) {
    throw new StartupError('data_file_invalid', { detail: `${filePath} (key does not match)` });
  }
  return {
    deviceId: file.deviceId,
    certificatePem: file.certificatePem,
    privateKeyPem,
    fingerprint: certificateFingerprint(certificate),
  };
}

function parseIdentityFile(value: unknown): IdentityFile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { formatVersion, deviceId, certificatePem, encryptedPrivateKey } = value;
  if (
    formatVersion !== IDENTITY_FORMAT_VERSION ||
    !isUuid(deviceId) ||
    typeof certificatePem !== 'string' ||
    typeof encryptedPrivateKey !== 'string'
  ) {
    return undefined;
  }
  return { formatVersion, deviceId, certificatePem, encryptedPrivateKey };
}

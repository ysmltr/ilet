import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadOrCreateIdentity } from '../../src/identity/identityStore';
import type { SecretCipher } from '../../src/identity/secretCipher';
import { StartupError } from '../../src/shared/errors';
import { createTempFolder, fakeCipher } from '../helpers/fakes';

const now = (): Date => new Date();

async function identityFilePath(): Promise<string> {
  return path.join(await createTempFolder(), 'identity.json');
}

describe('loadOrCreateIdentity', () => {
  it('creates an identity on first launch and loads the same one later', async () => {
    const filePath = await identityFilePath();
    const created = await loadOrCreateIdentity(filePath, fakeCipher, now);
    const loaded = await loadOrCreateIdentity(filePath, fakeCipher, now);

    expect(loaded).toEqual(created);
    expect(created.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes the private key only in encrypted form', async () => {
    const filePath = await identityFilePath();
    const identity = await loadOrCreateIdentity(filePath, fakeCipher, now);

    const stored = await readFile(filePath, 'utf8');
    expect(stored).not.toContain('PRIVATE KEY');
    expect(stored).not.toContain(identity.privateKeyPem.split('\n')[1]);
  });

  it('refuses a key that cannot be decrypted, for example from another Windows user', async () => {
    const filePath = await identityFilePath();
    await loadOrCreateIdentity(filePath, fakeCipher, now);
    const otherUser: SecretCipher = {
      ...fakeCipher,
      decrypt: () => {
        throw new Error('decryption failed');
      },
    };
    await expect(loadOrCreateIdentity(filePath, otherUser, now)).rejects.toThrow(StartupError);
  });

  it('refuses a key that does not belong to the certificate', async () => {
    const first = await identityFilePath();
    const second = await identityFilePath();
    await loadOrCreateIdentity(first, fakeCipher, now);
    await loadOrCreateIdentity(second, fakeCipher, now);
    const firstFile = JSON.parse(await readFile(first, 'utf8')) as object;
    const secondFile = JSON.parse(await readFile(second, 'utf8')) as {
      encryptedPrivateKey: string;
    };
    await writeFile(
      first,
      JSON.stringify({ ...firstFile, encryptedPrivateKey: secondFile.encryptedPrivateKey }),
    );

    await expect(loadOrCreateIdentity(first, fakeCipher, now)).rejects.toThrow(StartupError);
  });

  it.each([
    ['not JSON', 'not json'],
    ['a missing field', JSON.stringify({ formatVersion: 1 })],
    ['a bad certificate', JSON.stringify({ formatVersion: 1, deviceId: 'x', certificatePem: '' })],
  ])('refuses to start with %s', async (_description, content) => {
    const filePath = await identityFilePath();
    await writeFile(filePath, content);
    await expect(loadOrCreateIdentity(filePath, fakeCipher, now)).rejects.toThrow(StartupError);
  });
});

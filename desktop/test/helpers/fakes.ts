import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach } from 'vitest';

import type { SecretCipher } from '../../src/identity/secretCipher';
import { formatLogLine, type LogFields, type Logger } from '../../src/shared/logger';

const FAKE_CIPHER_PREFIX = 'fake-encrypted:';

/** Reversible stand-in for safeStorage; the "ciphertext" never contains the plaintext as is. */
export const fakeCipher: SecretCipher = {
  encrypt: (plaintext) =>
    Buffer.from(`${FAKE_CIPHER_PREFIX}${Buffer.from(plaintext).toString('hex')}`),
  decrypt: (ciphertext) => {
    const text = ciphertext.toString();
    if (!text.startsWith(FAKE_CIPHER_PREFIX)) {
      throw new Error('cannot decrypt');
    }
    return Buffer.from(text.slice(FAKE_CIPHER_PREFIX.length), 'hex').toString();
  },
};

export interface MemoryLogger extends Logger {
  readonly lines: string[];
}

export function createMemoryLogger(): MemoryLogger {
  const lines: string[] = [];
  const write =
    (level: 'info' | 'warn' | 'error') =>
    (message: string, fields: LogFields = {}): void => {
      lines.push(formatLogLine(level, message, fields, new Date()));
    };
  return { lines, info: write('info'), warn: write('warn'), error: write('error') };
}

/** A fresh temporary folder, deleted after the current test. */
export async function createTempFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'ilet-test-'));
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });
  return folder;
}

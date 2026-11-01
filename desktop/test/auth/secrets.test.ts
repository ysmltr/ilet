import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashPresentedSecret, issueSecret, secretHashesEqual } from '../../src/auth/secrets';

const ENCODED_SECRET_LENGTH = 43;

describe('secrets', () => {
  it('issues 256-bit secrets as unpadded base64url', () => {
    const { value } = issueSecret();
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value).toHaveLength(ENCODED_SECRET_LENGTH);
    expect(Buffer.from(value, 'base64url')).toHaveLength(32);
  });

  it('keeps only the SHA-256 hash of the decoded bytes', () => {
    const { value, hash } = issueSecret();
    const expected = createHash('sha256').update(Buffer.from(value, 'base64url')).digest();
    expect(hash.equals(expected)).toBe(true);
    expect(hash.toString('hex')).not.toContain(value);
  });

  it('never issues the same secret twice', () => {
    const values = new Set(Array.from({ length: 100 }, () => issueSecret().value));
    expect(values.size).toBe(100);
  });

  it('hashes a presented secret the same way it was issued', () => {
    const { value, hash } = issueSecret();
    const presented = hashPresentedSecret(value);
    expect(presented && secretHashesEqual(presented, hash)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['too long', 'A'.repeat(ENCODED_SECRET_LENGTH + 1)],
    ['padded', `${'A'.repeat(ENCODED_SECRET_LENGTH)}=`],
    ['standard base64', `${'A'.repeat(ENCODED_SECRET_LENGTH - 1)}+`],
    ['spaces', ` ${'A'.repeat(ENCODED_SECRET_LENGTH - 1)}`],
    ['non-canonical last character', `${'A'.repeat(ENCODED_SECRET_LENGTH - 1)}B`],
  ])('rejects a %s secret', (_description, value) => {
    expect(hashPresentedSecret(value)).toBeUndefined();
  });

  it('compares hashes', () => {
    const first = issueSecret().hash;
    expect(secretHashesEqual(first, Buffer.from(first))).toBe(true);
    expect(secretHashesEqual(first, issueSecret().hash)).toBe(false);
    expect(secretHashesEqual(first, first.subarray(1))).toBe(false);
  });
});

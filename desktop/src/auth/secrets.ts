import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { SECRET_BYTES } from '../protocol/constants';

const SECRET_ENCODING = 'base64url';
const BASE64URL_CHARACTERS = /^[A-Za-z0-9_-]+$/;

/** A new secret: the value goes to the client once; only the hash is kept. */
export interface IssuedSecret {
  readonly value: string;
  readonly hash: Buffer;
}

/** Creates an access token or pairing secret (PROTOCOL.md section 3.1). */
export function issueSecret(): IssuedSecret {
  const bytes = randomBytes(SECRET_BYTES);
  return { value: bytes.toString(SECRET_ENCODING), hash: sha256(bytes) };
}

/**
 * Hashes a secret presented by a client, or returns `undefined` if it is not a well-formed
 * secret. Only the canonical encoding is accepted, so each secret has exactly one valid string.
 */
export function hashPresentedSecret(value: string): Buffer | undefined {
  if (!BASE64URL_CHARACTERS.test(value)) {
    return undefined;
  }
  const bytes = Buffer.from(value, SECRET_ENCODING);
  if (bytes.length !== SECRET_BYTES || bytes.toString(SECRET_ENCODING) !== value) {
    return undefined;
  }
  return sha256(bytes);
}

/** Compares two secret hashes in constant time. */
export function secretHashesEqual(first: Buffer, second: Buffer): boolean {
  return first.length === second.length && timingSafeEqual(first, second);
}

function sha256(bytes: Buffer): Buffer {
  return createHash('sha256').update(bytes).digest();
}

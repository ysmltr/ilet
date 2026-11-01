import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { issueSecret } from '../../src/auth/secrets';
import { PairingCodes } from '../../src/pairing/pairingCodes';

const LIFETIME_MS = 120_000;

describe('PairingCodes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-01T12:00:00.000Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createCodes = (): PairingCodes => new PairingCodes(Date.now, LIFETIME_MS);

  it('issues a 256-bit secret that expires after the lifetime', () => {
    const code = createCodes().start();
    expect(Buffer.from(code.secret, 'base64url')).toHaveLength(32);
    expect(code.expiresAt).toBe(Date.now() + LIFETIME_MS);
  });

  it('accepts the secret exactly once', () => {
    const codes = createCodes();
    const { secret } = codes.start();

    expect(codes.redeem(secret)).toBe(true);
    expect(codes.redeem(secret)).toBe(false);
    expect(codes.isActive()).toBe(false);
  });

  it('keeps the code usable after wrong or malformed secrets', () => {
    const codes = createCodes();
    const { secret } = codes.start();

    expect(codes.redeem(issueSecret().value)).toBe(false);
    expect(codes.redeem('not a secret')).toBe(false);
    expect(codes.redeem('')).toBe(false);
    expect(codes.isActive()).toBe(true);
    expect(codes.redeem(secret)).toBe(true);
  });

  it('rejects the secret once the lifetime is over and tells listeners', () => {
    const codes = createCodes();
    const expired = vi.fn();
    codes.onExpired(expired);
    const { secret } = codes.start();

    vi.advanceTimersByTime(LIFETIME_MS - 1);
    expect(codes.isActive()).toBe(true);
    vi.advanceTimersByTime(1);

    expect(codes.isActive()).toBe(false);
    expect(codes.redeem(secret)).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('rejects an expired secret even if the expiry timer has not run yet', () => {
    const codes = createCodes();
    const { secret } = codes.start();
    vi.setSystemTime(Date.now() + LIFETIME_MS);
    expect(codes.redeem(secret)).toBe(false);
  });

  it('invalidates the previous code when a new one starts', () => {
    const codes = createCodes();
    const first = codes.start();
    const second = codes.start();

    expect(second.secret).not.toBe(first.secret);
    expect(codes.redeem(first.secret)).toBe(false);
    expect(codes.redeem(second.secret)).toBe(true);
  });

  it('invalidates the code on cancel, without an expiry event', () => {
    const codes = createCodes();
    const expired = vi.fn();
    codes.onExpired(expired);
    const { secret } = codes.start();

    codes.cancel();
    vi.advanceTimersByTime(LIFETIME_MS);

    expect(codes.redeem(secret)).toBe(false);
    expect(expired).not.toHaveBeenCalled();
  });

  it('accepts nothing before a code is started', () => {
    const codes = createCodes();
    expect(codes.isActive()).toBe(false);
    expect(codes.redeem(issueSecret().value)).toBe(false);
  });
});

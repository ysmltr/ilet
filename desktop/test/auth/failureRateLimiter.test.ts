import { describe, expect, it } from 'vitest';

import { FailureRateLimiter } from '../../src/auth/failureRateLimiter';

const POLICY = { maxFailures: 3, windowMs: 60_000 };
const TRACKED_CLIENT_LIMIT = 1024;

function createLimiter(): { limiter: FailureRateLimiter; advance: (ms: number) => void } {
  let now = 1_000_000;
  return {
    limiter: new FailureRateLimiter(POLICY, () => now),
    advance: (ms) => {
      now += ms;
    },
  };
}

function fail(limiter: FailureRateLimiter, client: string, times: number): void {
  for (let attempt = 0; attempt < times; attempt += 1) {
    limiter.recordFailure(client);
  }
}

describe('FailureRateLimiter', () => {
  it('allows failures up to the limit', () => {
    const { limiter } = createLimiter();
    fail(limiter, 'client', POLICY.maxFailures - 1);
    expect(limiter.blockedForMs('client')).toBe(0);
  });

  it('blocks a client that reaches the limit until its window ends', () => {
    const { limiter, advance } = createLimiter();
    fail(limiter, 'client', POLICY.maxFailures);
    expect(limiter.blockedForMs('client')).toBe(POLICY.windowMs);

    advance(POLICY.windowMs - 1);
    expect(limiter.blockedForMs('client')).toBe(1);

    advance(1);
    expect(limiter.blockedForMs('client')).toBe(0);
  });

  it('starts a fresh window after the old one ends', () => {
    const { limiter, advance } = createLimiter();
    fail(limiter, 'client', POLICY.maxFailures - 1);
    advance(POLICY.windowMs);
    fail(limiter, 'client', POLICY.maxFailures - 1);
    expect(limiter.blockedForMs('client')).toBe(0);
  });

  it('counts each client separately', () => {
    const { limiter } = createLimiter();
    fail(limiter, 'attacker', POLICY.maxFailures);
    expect(limiter.blockedForMs('attacker')).toBeGreaterThan(0);
    expect(limiter.blockedForMs('phone')).toBe(0);
  });

  it('bounds memory by dropping the oldest client', () => {
    const { limiter } = createLimiter();
    for (let client = 0; client < TRACKED_CLIENT_LIMIT; client += 1) {
      fail(limiter, `client-${String(client)}`, POLICY.maxFailures);
    }
    fail(limiter, 'one-more', 1);

    expect(limiter.blockedForMs('client-0')).toBe(0);
    expect(limiter.blockedForMs('client-1')).toBeGreaterThan(0);
  });
});

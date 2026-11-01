import type { IncomingMessage } from 'node:http';

import type { FailureRateLimiter } from '../auth/failureRateLimiter';
import { ProtocolError } from '../shared/errors';
import { normalizeAddress } from './networkAddress';

const MS_PER_SECOND = 1000;

/** The key failures are counted under: the client's address. */
export function clientAddressOf(request: IncomingMessage): string {
  return normalizeAddress(request.socket.remoteAddress ?? '');
}

/** Rejects a client with too many recent failures before anything else about it is checked. */
export function rejectIfRateLimited(limiter: FailureRateLimiter, client: string): void {
  const blockedForMs = limiter.blockedForMs(client);
  if (blockedForMs > 0) {
    throw new ProtocolError('too_many_requests', {
      retryAfterSeconds: Math.ceil(blockedForMs / MS_PER_SECOND),
    });
  }
}

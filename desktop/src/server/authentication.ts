import type { DeviceRegistry } from '../auth/deviceRegistry';
import type { FailureRateLimiter } from '../auth/failureRateLimiter';
import { BEARER_SCHEME, RequestHeader } from '../protocol/constants';
import { ProtocolError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import { normalizeAddress } from './networkAddress';
import type { Authenticator } from './routing';

const MS_PER_SECOND = 1000;
/** RFC 6750: the scheme is case-insensitive; the token itself is checked by the registry. */
const BEARER_CREDENTIALS = new RegExp(`^${BEARER_SCHEME} +(\\S+)$`, 'i');

export function parseBearerToken(authorization: string | undefined): string | undefined {
  return authorization === undefined ? undefined : BEARER_CREDENTIALS.exec(authorization)?.[1];
}

/**
 * Checks the access token. Clients with too many recent failures are rejected before their
 * token is even looked at.
 */
export function createTokenAuthenticator(
  registry: DeviceRegistry,
  failureLimiter: FailureRateLimiter,
  logger: Logger,
): Authenticator {
  return (request) => {
    const client = normalizeAddress(request.socket.remoteAddress ?? '');
    const blockedForMs = failureLimiter.blockedForMs(client);
    if (blockedForMs > 0) {
      throw new ProtocolError('too_many_requests', {
        retryAfterSeconds: Math.ceil(blockedForMs / MS_PER_SECOND),
      });
    }
    const token = parseBearerToken(request.headers[RequestHeader.authorization]);
    const device = token === undefined ? undefined : registry.authenticate(token);
    if (device === undefined) {
      failureLimiter.recordFailure(client);
      logger.warn('authentication failed', { client });
      throw new ProtocolError('unauthorized');
    }
    return device;
  };
}

import type { Server } from 'node:https';

import type { DeviceRegistry } from '../auth/deviceRegistry';
import { FailureRateLimiter } from '../auth/failureRateLimiter';
import type { FileReceiver } from '../files/fileReceiver';
import type { TlsIdentity } from '../identity/identityStore';
import type { Outbox } from '../outbox/outbox';
import type { PairingCodes } from '../pairing/pairingCodes';
import { AUTH_FAILURE_LIMIT, SERVER_LIMITS } from '../protocol/constants';
import type { Settings } from '../settings/settings';
import type { Logger } from '../shared/logger';
import { createTokenAuthenticator } from './authentication';
import { type BlockedLocalAddressCheck, createHttpsServer, type ServerLimits } from './httpsServer';
import { infoRoute } from './routes/infoRoute';
import { outboxFileRoute, outboxListRoute, outboxReceivedRoute } from './routes/outboxRoutes';
import { pairRoute } from './routes/pairRoute';
import { statusRoute } from './routes/statusRoute';
import { type FileReceivedListener, uploadRoute } from './routes/uploadRoute';
import { createRequestHandler } from './routing';

export interface IletServerDependencies {
  readonly identity: TlsIdentity;
  readonly settings: Settings;
  readonly devices: DeviceRegistry;
  readonly pairingCodes: PairingCodes;
  readonly receiver: FileReceiver;
  readonly onFileReceived: FileReceivedListener;
  readonly outbox: Outbox;
  readonly isBlockedLocalAddress: BlockedLocalAddressCheck;
  readonly logger: Logger;
  readonly now: () => number;
  readonly limits?: ServerLimits;
}

/** Wires the routes, authentication and TLS settings into one HTTPS server (not yet listening). */
export function createIletServer(dependencies: IletServerDependencies): Server {
  const { identity, settings, devices, receiver, onFileReceived, outbox, logger, now } =
    dependencies;
  const limits = dependencies.limits ?? SERVER_LIMITS;
  // One limiter for tokens and pairing secrets: guessing either counts against the same budget.
  const failureLimiter = new FailureRateLimiter(AUTH_FAILURE_LIMIT, now);
  const handleRequest = createRequestHandler({
    routes: [
      infoRoute({ deviceId: identity.deviceId, displayName: settings.displayName }),
      pairRoute({ codes: dependencies.pairingCodes, devices, failureLimiter, limits, logger }),
      statusRoute(settings),
      uploadRoute(receiver, onFileReceived),
      outboxListRoute(outbox),
      outboxFileRoute(outbox),
      outboxReceivedRoute(outbox, limits),
    ],
    authenticate: createTokenAuthenticator(devices, failureLimiter, logger),
    logger,
  });
  return createHttpsServer(
    identity,
    handleRequest,
    dependencies.isBlockedLocalAddress,
    logger,
    limits,
  );
}

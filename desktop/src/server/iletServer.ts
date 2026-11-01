import type { Server } from 'node:https';

import type { DeviceRegistry } from '../auth/deviceRegistry';
import { FailureRateLimiter } from '../auth/failureRateLimiter';
import type { FileReceiver } from '../files/fileReceiver';
import type { TlsIdentity } from '../identity/identityStore';
import { AUTH_FAILURE_LIMIT } from '../protocol/constants';
import type { Settings } from '../settings/settings';
import type { Logger } from '../shared/logger';
import { createTokenAuthenticator } from './authentication';
import { createHttpsServer, type ServerLimits } from './httpsServer';
import { infoRoute } from './routes/infoRoute';
import { statusRoute } from './routes/statusRoute';
import { type FileReceivedListener, uploadRoute } from './routes/uploadRoute';
import { createRequestHandler } from './routing';

export interface IletServerDependencies {
  readonly identity: TlsIdentity;
  readonly settings: Settings;
  readonly devices: DeviceRegistry;
  readonly receiver: FileReceiver;
  readonly onFileReceived: FileReceivedListener;
  readonly logger: Logger;
  readonly now: () => number;
  readonly limits?: ServerLimits;
}

/** Wires the routes, authentication and TLS settings into one HTTPS server (not yet listening). */
export function createIletServer(dependencies: IletServerDependencies): Server {
  const { identity, settings, devices, receiver, onFileReceived, logger, now } = dependencies;
  const handleRequest = createRequestHandler({
    routes: [
      infoRoute({ deviceId: identity.deviceId, displayName: settings.displayName }),
      statusRoute(settings),
      uploadRoute(receiver, onFileReceived),
    ],
    authenticate: createTokenAuthenticator(
      devices,
      new FailureRateLimiter(AUTH_FAILURE_LIMIT, now),
      logger,
    ),
    logger,
  });
  return createHttpsServer(identity, handleRequest, logger, dependencies.limits);
}

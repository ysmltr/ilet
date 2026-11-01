import { createServer, type Server } from 'node:https';
import type { Socket } from 'node:net';

import { SERVER_LIMITS, TLS_CIPHERS, TLS_MIN_VERSION } from '../protocol/constants';
import { hasErrorCode, StartupError } from '../shared/errors';
import { errorFields, type Logger } from '../shared/logger';
import { isLocalNetworkAddress } from './networkAddress';
import type { RequestListener } from './routing';

export type ServerLimits = { readonly [Limit in keyof typeof SERVER_LIMITS]: number };

export interface TlsCredentials {
  readonly certificatePem: string;
  readonly privateKeyPem: string;
}

/** Uploads may legitimately take many minutes; stalled ones are ended by the idle timeout. */
const NO_TOTAL_REQUEST_TIMEOUT = 0;
/** How often Node.js checks the header timeout; its default (30 s) would make it imprecise. */
const TIMEOUT_CHECK_INTERVAL_MS = 1_000;

export const ListenAddress = {
  /** IPv4 and IPv6 on every interface, for phones on the LAN. Peers are filtered per connection. */
  allInterfaces: '::',
  /** This PC only: tests and the dev token script. */
  loopback: '127.0.0.1',
} as const;
export type ListenAddress = (typeof ListenAddress)[keyof typeof ListenAddress];

export function createHttpsServer(
  credentials: TlsCredentials,
  handleRequest: RequestListener,
  logger: Logger,
  limits: ServerLimits = SERVER_LIMITS,
): Server {
  const server = createServer(
    {
      cert: credentials.certificatePem,
      key: credentials.privateKeyPem,
      minVersion: TLS_MIN_VERSION,
      ciphers: TLS_CIPHERS,
      handshakeTimeout: limits.tlsHandshakeTimeoutMs,
      headersTimeout: limits.headersTimeoutMs,
      requestTimeout: NO_TOTAL_REQUEST_TIMEOUT,
      keepAliveTimeout: limits.keepAliveTimeoutMs,
      maxHeaderSize: limits.maxHeaderBytes,
      connectionsCheckingInterval: TIMEOUT_CHECK_INTERVAL_MS,
    },
    handleRequest,
  );
  server.timeout = limits.idleTimeoutMs;
  server.maxConnections = limits.maxConnections;
  // Lets the upload route validate a request before telling the client to send the body.
  server.on('checkContinue', handleRequest);
  // Runs before any TLS bytes are processed, so other networks see nothing.
  server.on('connection', (socket: Socket) => {
    if (!isLocalNetworkAddress(socket.remoteAddress)) {
      socket.destroy();
    }
  });
  server.on('tlsClientError', (error: Error) => {
    logger.warn('TLS connection failed', { reason: errorCodeOf(error) });
  });
  return server;
}

export async function listen(
  server: Server,
  address: ListenAddress,
  port: number,
  logger: Logger,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onListenError = (error: Error): void => {
      reject(
        hasErrorCode(error, 'EADDRINUSE')
          ? new StartupError('port_in_use', { detail: String(port), cause: error })
          : error,
      );
    };
    server.once('error', onListenError);
    server.listen({ port, host: address, ipv6Only: false }, () => {
      server.off('error', onListenError);
      resolve();
    });
  });
  server.on('error', (error: Error) => {
    logger.error('server error', errorFields(error));
  });
}

/** Stops accepting connections and closes the open ones, which aborts uploads in progress. */
export async function closeServer(server: Server): Promise<void> {
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  server.closeAllConnections();
  await closed;
}

function errorCodeOf(error: Error): string {
  return 'code' in error && typeof error.code === 'string' ? error.code : error.name;
}

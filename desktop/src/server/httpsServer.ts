import { createServer, type Server } from 'node:https';
import type { Socket } from 'node:net';

import { SERVER_LIMITS, TLS_CIPHERS, TLS_MIN_VERSION } from '../protocol/constants';
import { hasErrorCode, StartupError } from '../shared/errors';
import { errorFields, type Logger } from '../shared/logger';
import { isLocalNetworkAddress } from './networkAddress';
import type { RequestListener } from './routing';

export type ServerLimits = { readonly [Limit in keyof typeof SERVER_LIMITS]: number };

/** True for an address of this PC that must not accept connections: one on a Public network. */
export type BlockedLocalAddressCheck = (localAddress: string) => boolean;

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

/**
 * Counts the open connections of all the servers that share it (one per address the Store
 * version listens on), so that listening on more addresses allows no more connections.
 */
export class ConnectionBudget {
  private open = 0;

  constructor(private readonly limit: number) {}

  /** Counts the connection until it closes, if there is room for it. */
  admit(socket: Socket): boolean {
    if (this.open >= this.limit) {
      return false;
    }
    this.open += 1;
    socket.once('close', () => {
      this.open -= 1;
    });
    return true;
  }
}

export function createHttpsServer(
  credentials: TlsCredentials,
  handleRequest: RequestListener,
  isBlockedLocalAddress: BlockedLocalAddressCheck,
  logger: Logger,
  limits: ServerLimits = SERVER_LIMITS,
  budget: ConnectionBudget = new ConnectionBudget(limits.maxConnections),
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
  // Lets the upload route validate a request before telling the client to send the body.
  server.on('checkContinue', handleRequest);
  // Runs before any TLS bytes are processed, so other networks see nothing.
  server.on('connection', (socket: Socket) => {
    const { remoteAddress, localAddress } = socket;
    if (
      !isLocalNetworkAddress(remoteAddress) ||
      localAddress === undefined ||
      isBlockedLocalAddress(localAddress) ||
      !budget.admit(socket)
    ) {
      socket.destroy();
    }
  });
  server.on('tlsClientError', (error: Error) => {
    logger.warn('TLS connection failed', { reason: errorCodeOf(error) });
  });
  return server;
}

/** `address` is an IP address, with its zone for a link-local IPv6 address. */
export async function listen(
  server: Server,
  address: string,
  port: number,
  logger: Logger,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onListening = (): void => {
      server.off('error', onListenError);
      resolve();
    };
    const onListenError = (error: Error): void => {
      server.off('listening', onListening);
      reject(
        hasErrorCode(error, 'EADDRINUSE')
          ? new StartupError('port_in_use', { detail: String(port), cause: error })
          : error,
      );
    };
    server.once('error', onListenError);
    server.once('listening', onListening);
    server.listen({ port, host: address, ipv6Only: false });
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

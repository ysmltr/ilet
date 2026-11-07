import { createServer as createHttpsServer } from 'node:https';
import { type AddressInfo, connect, createServer as createNetServer, type Server } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import { ServerListeners } from '../../src/server/serverListeners';
import { StartupError } from '../../src/shared/errors';
import { createMemoryLogger, type MemoryLogger } from '../helpers/fakes';

/** Short, so that the tests do not wait for the app's five seconds. */
const RETRY_DELAY_MS = 20;
/** Long enough for several attempts. */
const SEVERAL_RETRIES_MS = 150;

/** Windows and Linux route all of 127.0.0.0/8 to this PC; macOS only 127.0.0.1. */
const hasSecondLoopbackAddress = process.platform !== 'darwin';
/** Windows tries a refused connection again for a second or two before it gives up. */
const WITH_REFUSED_CONNECTIONS = { timeout: 20_000 };

async function listenOn(address: string, port = 0): Promise<Server> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(port, address, resolve));
  return server;
}

async function closeNetServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
}

async function freePort(): Promise<number> {
  const server = await listenOn('127.0.0.1');
  const { port } = server.address() as AddressInfo;
  await closeNetServer(server);
  return port;
}

/** Only whether a TCP connection is accepted: the servers have no certificate. */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

function setUp(port: number): { listeners: ServerListeners; logger: MemoryLogger } {
  const logger = createMemoryLogger();
  const listeners = new ServerListeners({
    createServer: () => createHttpsServer(),
    port,
    logger,
    retryDelayMs: RETRY_DELAY_MS,
  });
  return { listeners, logger };
}

const failuresIn = (logger: MemoryLogger): number =>
  logger.lines.filter((line) => line.includes('could not listen on an address')).length;
const isListeningOn = (logger: MemoryLogger, address: string): boolean =>
  logger.lines.some((line) => line.includes(`INFO listening address="${address}"`));

describe.runIf(hasSecondLoopbackAddress)('ServerListeners', () => {
  it('listens on each address and follows the changes', WITH_REFUSED_CONNECTIONS, async () => {
    const port = await freePort();
    const { listeners } = setUp(port);
    await listeners.start(['127.0.0.1', '127.0.0.2']);
    try {
      expect(await canConnect('127.0.0.1', port)).toBe(true);
      expect(await canConnect('127.0.0.2', port)).toBe(true);

      await listeners.update(['127.0.0.2']);
      expect(await canConnect('127.0.0.1', port)).toBe(false);
      expect(await canConnect('127.0.0.2', port)).toBe(true);
    } finally {
      await listeners.close();
    }
    expect(await canConnect('127.0.0.2', port)).toBe(false);
  });

  it('tries a taken address again until it is free, and says so once', async () => {
    const port = await freePort();
    const blocker = await listenOn('127.0.0.2', port);
    const { listeners, logger } = setUp(port);
    try {
      await listeners.start(['127.0.0.1', '127.0.0.2']);
      expect(await canConnect('127.0.0.1', port)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, SEVERAL_RETRIES_MS));
      expect(isListeningOn(logger, '127.0.0.2')).toBe(false);
      await closeNetServer(blocker);

      await vi.waitFor(() => {
        expect(isListeningOn(logger, '127.0.0.2')).toBe(true);
      });
      expect(await canConnect('127.0.0.2', port)).toBe(true);
      expect(failuresIn(logger)).toBe(1);
    } finally {
      await listeners.close();
    }
  });

  it('stops trying an address that left the set', WITH_REFUSED_CONNECTIONS, async () => {
    const port = await freePort();
    const blocker = await listenOn('127.0.0.2', port);
    const { listeners } = setUp(port);
    try {
      await listeners.start(['127.0.0.1', '127.0.0.2']);
      await listeners.update(['127.0.0.1']);
      await closeNetServer(blocker);
      await new Promise((resolve) => setTimeout(resolve, SEVERAL_RETRIES_MS));

      expect(await canConnect('127.0.0.2', port)).toBe(false);
    } finally {
      await listeners.close();
    }
  });

  it(
    'fails to start when the port is taken on every address, and tries no more',
    WITH_REFUSED_CONNECTIONS,
    async () => {
      const port = await freePort();
      const blocker = await listenOn('127.0.0.1', port);
      const { listeners } = setUp(port);
      let failure: unknown;
      try {
        await listeners.start(['127.0.0.1']);
      } catch (error) {
        failure = error;
      } finally {
        await closeNetServer(blocker);
      }
      expect(failure).toBeInstanceOf(StartupError);
      expect((failure as StartupError).code).toBe('port_in_use');

      await new Promise((resolve) => setTimeout(resolve, SEVERAL_RETRIES_MS));
      expect(await canConnect('127.0.0.1', port)).toBe(false);
    },
  );
});

import type { Server } from 'node:https';
import { type AddressInfo, connect, Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createSelfSignedCertificate } from '../../src/identity/certificate';
import { SERVER_LIMITS } from '../../src/protocol/constants';
import {
  closeServer,
  ConnectionBudget,
  createHttpsServer,
  listen,
} from '../../src/server/httpsServer';
import { createMemoryLogger } from '../helpers/fakes';

/** Windows and Linux route all of 127.0.0.0/8 to this PC; macOS only 127.0.0.1. */
const hasSecondLoopbackAddress = process.platform !== 'darwin';
/** Long enough for the server to close a connection it refuses. */
const SETTLE_MS = 300;

describe('ConnectionBudget', () => {
  it('admits connections up to the limit and counts each until it closes', () => {
    const budget = new ConnectionBudget(2);
    const [first, second, third] = [new Socket(), new Socket(), new Socket()];

    expect(budget.admit(first)).toBe(true);
    expect(budget.admit(second)).toBe(true);
    expect(budget.admit(third)).toBe(false);

    first.emit('close', false);
    expect(budget.admit(third)).toBe(true);
  });
});

describe.runIf(hasSecondLoopbackAddress)('servers that share a budget', () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.destroy();
    }
    await Promise.all(servers.splice(0).map(closeServer));
  });

  /** Resolves to whether the server closed the connection by itself. */
  function connectAndWait(host: string, port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      sockets.push(socket);
      let closedByServer = false;
      socket.once('close', () => {
        closedByServer = true;
      });
      socket.once('connect', () => {
        setTimeout(() => {
          resolve(closedByServer);
        }, SETTLE_MS);
      });
      socket.once('error', reject);
    });
  }

  it('allow no more connections together than one server alone', async () => {
    const credentials = createSelfSignedCertificate(new Date());
    const budget = new ConnectionBudget(1);
    const logger = createMemoryLogger();
    const limits = { ...SERVER_LIMITS, maxConnections: 1 };
    const create = (): Server =>
      createHttpsServer(
        credentials,
        () => undefined,
        () => false,
        logger,
        limits,
        budget,
      );
    const first = create();
    const second = create();
    servers.push(first, second);
    await listen(first, '127.0.0.1', 0, logger);
    const { port } = first.address() as AddressInfo;
    await listen(second, '127.0.0.2', port, logger);

    expect(await connectAndWait('127.0.0.1', port)).toBe(false);
    // The second server has none of its own open, but the budget is spent.
    expect(await connectAndWait('127.0.0.2', port)).toBe(true);
  });
});

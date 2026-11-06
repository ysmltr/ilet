import type { RemoteInfo } from 'node:dgram';
import os, { type NetworkInterfaceInfo } from 'node:os';

import { MDNSServer } from '@homebridge/ciao/lib/MDNSServer';
import type { NetworkUpdate } from '@homebridge/ciao/lib/NetworkManager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { responderOptions } from '../../src/discovery/serviceAdvertiser';
import { ipv4, ipv6 } from '../helpers/networkFakes';

// What ilet relies on in ciao itself when Windows joins a network (SECURITY_REVIEW.md S11). The
// tests open no sockets: ciao reads the adapters from os.networkInterfaces(), which they replace,
// and they never bind the server.

const WIFI = 'Wi-Fi';
/** ciao looks at the adapters every 15 seconds (its NetworkManager.POLLING_TIME). */
const CIAO_POLLING_TIME = 15_000;
const LOOPBACK = { 'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)] };
const LINK_LOCAL = ipv6('fe80::1c2b:3d4e:5f60:7182', 12);
/** On a network: an IPv4 address, and the link-local IPv6 address every adapter has. */
const JOINED = { [WIFI]: [ipv4('192.168.1.20'), LINK_LOCAL], ...LOOPBACK };
/** While Windows joins a network: the link-local address, but no IPv4 address yet. */
const JOINING = { [WIFI]: [LINK_LOCAL], ...LOOPBACK };

/** The parts of ciao's server that it keeps private and that these tests use. */
interface ServerInternals {
  bound: boolean;
  handleMessage(name: string, buffer: Buffer, rinfo: RemoteInfo, family: 'IPv4' | 'IPv6'): void;
}

const ignoringPackets = { handleQuery: () => undefined, handleResponse: () => undefined };
let adapters: NodeJS.Dict<NetworkInterfaceInfo[]>;

beforeEach(() => {
  vi.useFakeTimers();
  adapters = JOINED;
  vi.spyOn(os, 'networkInterfaces').mockImplementation(() => adapters);
});

afterEach(() => {
  vi.useRealTimers();
});

async function startServer(): Promise<MDNSServer> {
  const server = new MDNSServer(ignoringPackets, responderOptions([WIFI]));
  await server.getNetworkManager().waitForInit();
  return server;
}

/** Lets ciao look at the adapters once more. */
async function nextAdapterCheck(): Promise<void> {
  await vi.advanceTimersByTimeAsync(CIAO_POLLING_TIME);
}

function names(update: NetworkUpdate): Record<string, string[]> {
  return {
    added: (update.added ?? []).map((adapter) => adapter.name),
    removed: (update.removed ?? []).map((adapter) => adapter.name),
    changed: (update.changes ?? []).map((change) => change.name),
  };
}

describe("ciao with ilet's options, while Windows joins a network", () => {
  it('ignores a packet that arrives while an adapter has no IPv4 address', async () => {
    const server = await startServer();
    const internals = server as unknown as ServerInternals;
    // As after bind(), without opening sockets.
    internals.bound = true;
    try {
      adapters = JOINING;
      await nextAdapterCheck();

      // Without excludeIpv6Only, this throws the AssertionError of the PC's error dialog: ciao
      // kept the adapter without its IPv4 netmask, and compared the sender's address with it.
      const query = Buffer.alloc(12);
      const sender: RemoteInfo = {
        address: '192.168.1.30',
        family: 'IPv4',
        port: 5353,
        size: query.length,
      };
      expect(() => {
        internals.handleMessage(WIFI, query, sender, 'IPv4');
      }).not.toThrow();
    } finally {
      server.shutdown();
    }
  });

  it('drops the adapter until it has an IPv4 address, then adds it back', async () => {
    const server = await startServer();
    const manager = server.getNetworkManager();
    // The server would open a socket for the adapter added back; this test only watches.
    manager.removeAllListeners('network-update');
    const updates: Record<string, string[]>[] = [];
    manager.on('network-update', (update) => updates.push(names(update)));
    try {
      adapters = JOINING;
      await nextAdapterCheck();
      adapters = JOINED;
      await nextAdapterCheck();

      // An added adapter gets a new socket and a new announcement. Without excludeIpv6Only the
      // adapter would only change, and its socket would stay open meanwhile (the test above).
      expect(updates).toEqual([
        { added: [], removed: [WIFI], changed: [] },
        { added: [WIFI], removed: [], changed: [] },
      ]);
    } finally {
      server.shutdown();
    }
  });
});

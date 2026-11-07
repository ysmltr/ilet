import { ListenAddress } from '../server/httpsServer';
import type { NetworkExposure } from './networkExposure';

/**
 * Where the server listens for phones:
 * - `all-interfaces`: on every address of the PC. Only for the installer's version, whose firewall
 *   rules block every network but Private ones; ilet refuses the other addresses per connection.
 * - `private-networks`: only on the addresses of Private networks, following the network monitor.
 *   For the Store version, whose firewall rules can only allow: if it listened on another
 *   network, Windows would ask the user whether to let ilet in there (STORE.md).
 * - `loopback`: on this PC only, for development scripts and tests.
 */
export type ListenPolicy = 'all-interfaces' | 'private-networks' | 'loopback';

export interface ServerReach {
  /** The addresses to listen on, in the form a server binds to. */
  readonly listenOn: readonly string[];
  /** The adapters to announce on: `undefined` for every one, empty for none. */
  readonly announceOn: readonly string[] | undefined;
}

export function serverReach(exposure: NetworkExposure, policy: ListenPolicy): ServerReach {
  switch (policy) {
    case 'all-interfaces':
      return { listenOn: [ListenAddress.allInterfaces], announceOn: exposure.announceOn };
    case 'loopback':
      return { listenOn: [ListenAddress.loopback], announceOn: [] };
    case 'private-networks':
      // Loopback always, so that a port taken by another program shows at startup.
      if (exposure.listenAddresses === undefined) {
        // No address is known to be on a Private network.
        return { listenOn: [ListenAddress.loopback], announceOn: [] };
      }
      return {
        listenOn: [ListenAddress.loopback, ...exposure.listenAddresses],
        // ciao binds its sockets to every adapter, so it waits until only Private networks are left.
        announceOn: exposure.otherNetworkConnected ? [] : exposure.announceOn,
      };
  }
}

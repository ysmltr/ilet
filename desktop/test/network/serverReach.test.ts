import { describe, expect, it } from 'vitest';

import { type NetworkExposure, UNKNOWN_EXPOSURE } from '../../src/network/networkExposure';
import { serverReach } from '../../src/network/serverReach';

/** Wi-Fi at home is Private; WSL's virtual adapter is there too, as on many PCs. */
const homeWithWsl: NetworkExposure = {
  announceOn: ['Wi-Fi'],
  acceptedLocalAddresses: new Set(['192.168.1.20', 'fe80::1', '127.0.0.1']),
  listenAddresses: ['192.168.1.20', 'fe80::1%12'],
  otherNetworkConnected: true,
  publicNetworks: [],
  domainNetworks: [],
};
const homeOnly: NetworkExposure = { ...homeWithWsl, otherNetworkConnected: false };

describe('serverReach', () => {
  it('lets the installer listen everywhere, as its firewall rules keep other networks out', () => {
    expect(serverReach(homeWithWsl, 'all-interfaces')).toEqual({
      listenOn: ['::'],
      announceOn: ['Wi-Fi'],
    });
    expect(serverReach(UNKNOWN_EXPOSURE, 'all-interfaces')).toEqual({
      listenOn: ['::'],
      announceOn: undefined,
    });
  });

  it('keeps the Store version to loopback and the addresses of Private networks', () => {
    expect(serverReach(homeOnly, 'private-networks')).toEqual({
      listenOn: ['127.0.0.1', '192.168.1.20', 'fe80::1%12'],
      announceOn: ['Wi-Fi'],
    });
  });

  it('holds back the announcement of the Store version while another network is connected', () => {
    expect(serverReach(homeWithWsl, 'private-networks')).toEqual({
      listenOn: ['127.0.0.1', '192.168.1.20', 'fe80::1%12'],
      announceOn: [],
    });
  });

  it('keeps the Store version on this PC while the categories are unknown', () => {
    expect(serverReach(UNKNOWN_EXPOSURE, 'private-networks')).toEqual({
      listenOn: ['127.0.0.1'],
      announceOn: [],
    });
  });

  it('keeps development scripts on this PC', () => {
    expect(serverReach(homeOnly, 'loopback')).toEqual({ listenOn: ['127.0.0.1'], announceOn: [] });
  });
});

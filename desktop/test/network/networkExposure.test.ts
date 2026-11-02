import { describe, expect, it } from 'vitest';

import { networkExposure, sameExposure, UNKNOWN_EXPOSURE } from '../../src/network/networkExposure';
import type { NetworkInterfaces } from '../../src/network/networkInterfaces';
import { ipv4, ipv6 } from '../helpers/networkFakes';

const interfaces: NetworkInterfaces = {
  'Wi-Fi': [ipv4('192.168.1.20'), ipv6('fe80::1')],
  Ethernet: [ipv4('10.0.0.5')],
  'vEthernet (WSL)': [ipv4('172.20.0.1')],
};

describe('networkExposure', () => {
  it('announces everywhere and blocks nothing while the categories are unknown', () => {
    expect(networkExposure(undefined, interfaces)).toBe(UNKNOWN_EXPOSURE);
  });

  it('blocks the addresses on Public networks and announces only on the others', () => {
    const exposure = networkExposure(
      [
        { interfaceName: 'Wi-Fi', category: 'public' },
        { interfaceName: 'Ethernet', category: 'private' },
        { interfaceName: 'vEthernet (WSL)', category: 'public' },
      ],
      interfaces,
    );

    expect(exposure.announceOn).toEqual(['Ethernet']);
    expect([...exposure.blockedLocalAddresses].sort()).toEqual([
      '172.20.0.1',
      '192.168.1.20',
      'fe80::1',
    ]);
    // A virtual adapter is not something the user can fix in the network settings.
    expect(exposure.publicNetworks).toEqual(['Wi-Fi']);
  });

  it('trusts Domain networks like Private ones', () => {
    const exposure = networkExposure(
      [{ interfaceName: 'Ethernet', category: 'domain' }],
      interfaces,
    );
    expect(exposure.announceOn).toEqual(['Ethernet']);
    expect(exposure.blockedLocalAddresses.size).toBe(0);
  });

  it('announces nowhere when every network is Public', () => {
    const exposure = networkExposure([{ interfaceName: 'Wi-Fi', category: 'public' }], interfaces);
    expect(exposure.announceOn).toEqual([]);
  });

  it('warns only about adapters with an address a phone could use', () => {
    const exposure = networkExposure([{ interfaceName: 'Wi-Fi', category: 'public' }], {
      'Wi-Fi': [ipv6('fe80::1')],
    });
    expect(exposure.blockedLocalAddresses).toEqual(new Set(['fe80::1']));
    expect(exposure.publicNetworks).toEqual([]);
  });
});

describe('sameExposure', () => {
  const profiles = [{ interfaceName: 'Wi-Fi', category: 'public' } as const];

  it('ignores the order of adapters and addresses', () => {
    const first = networkExposure(profiles, interfaces);
    const reordered = {
      ...first,
      blockedLocalAddresses: new Set([...first.blockedLocalAddresses].reverse()),
    };
    expect(sameExposure(first, reordered)).toBe(true);
  });

  it('tells unknown categories from a PC that is on no network', () => {
    expect(sameExposure(UNKNOWN_EXPOSURE, networkExposure([], {}))).toBe(false);
  });

  it('notices a changed address', () => {
    const before = networkExposure(profiles, interfaces);
    const after = networkExposure(profiles, { ...interfaces, 'Wi-Fi': [ipv4('192.168.1.21')] });
    expect(sameExposure(before, after)).toBe(false);
  });
});

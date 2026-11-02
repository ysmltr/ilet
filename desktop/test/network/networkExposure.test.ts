import { describe, expect, it } from 'vitest';

import { networkExposure, sameExposure, UNKNOWN_EXPOSURE } from '../../src/network/networkExposure';
import type { NetworkInterfaces } from '../../src/network/networkInterfaces';
import { ipv4, ipv6 } from '../helpers/networkFakes';

const interfaces: NetworkInterfaces = {
  'Wi-Fi': [ipv4('192.168.1.20'), ipv6('fe80::1')],
  Ethernet: [ipv4('10.0.0.5')],
  'vEthernet (WSL)': [ipv4('172.20.0.1')],
  'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)],
};

describe('networkExposure', () => {
  it('announces everywhere and accepts everything while the categories are unknown', () => {
    expect(networkExposure(undefined, interfaces)).toBe(UNKNOWN_EXPOSURE);
  });

  it('accepts and announces only on Private networks', () => {
    const exposure = networkExposure(
      [
        { interfaceName: 'Wi-Fi', category: 'public' },
        { interfaceName: 'Ethernet', category: 'private' },
        { interfaceName: 'vEthernet (WSL)', category: 'public' },
      ],
      interfaces,
    );

    expect(exposure.announceOn).toEqual(['Ethernet']);
    expect(exposure.acceptedLocalAddresses).toEqual(new Set(['10.0.0.5', '127.0.0.1']));
    // A virtual adapter is not something the user can fix in the network settings.
    expect(exposure.publicNetworks).toEqual(['Wi-Fi']);
    expect(exposure.domainNetworks).toEqual([]);
  });

  it('treats Domain networks like Public ones, with their own warning', () => {
    const exposure = networkExposure(
      [{ interfaceName: 'Ethernet', category: 'domain' }],
      interfaces,
    );
    expect(exposure.announceOn).toEqual([]);
    expect(exposure.acceptedLocalAddresses).toEqual(new Set(['127.0.0.1']));
    expect(exposure.domainNetworks).toEqual(['Ethernet']);
    expect(exposure.publicNetworks).toEqual([]);
  });

  it('refuses an adapter that has no category yet', () => {
    const exposure = networkExposure(
      [{ interfaceName: 'Ethernet', category: 'private' }],
      interfaces,
    );
    expect(exposure.acceptedLocalAddresses?.has('192.168.1.20')).toBe(false);
  });

  it('distrusts an adapter with a Private and a Public profile', () => {
    const exposure = networkExposure(
      [
        { interfaceName: 'Wi-Fi', category: 'private' },
        { interfaceName: 'Wi-Fi', category: 'public' },
      ],
      interfaces,
    );
    expect(exposure.announceOn).toEqual([]);
    expect(exposure.acceptedLocalAddresses?.has('192.168.1.20')).toBe(false);
  });

  it('warns only about adapters with an address a phone could use', () => {
    const exposure = networkExposure([{ interfaceName: 'Wi-Fi', category: 'public' }], {
      'Wi-Fi': [ipv6('fe80::1')],
    });
    expect(exposure.publicNetworks).toEqual([]);
  });
});

describe('sameExposure', () => {
  const profiles = [{ interfaceName: 'Ethernet', category: 'private' } as const];

  it('ignores the order of adapters and addresses', () => {
    const first = networkExposure(profiles, interfaces);
    const reordered = {
      ...first,
      acceptedLocalAddresses: new Set([...(first.acceptedLocalAddresses ?? [])].reverse()),
    };
    expect(sameExposure(first, reordered)).toBe(true);
  });

  it('tells unknown categories from a PC that is on no network', () => {
    expect(sameExposure(UNKNOWN_EXPOSURE, networkExposure([], {}))).toBe(false);
  });

  it('notices a changed address', () => {
    const before = networkExposure(profiles, interfaces);
    const after = networkExposure(profiles, { ...interfaces, Ethernet: [ipv4('10.0.0.6')] });
    expect(sameExposure(before, after)).toBe(false);
  });
});

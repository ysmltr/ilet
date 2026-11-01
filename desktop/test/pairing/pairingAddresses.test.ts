import type { NetworkInterfaceInfo } from 'node:os';

import { describe, expect, it } from 'vitest';

import { type NetworkInterfaces, selectPairingAddresses } from '../../src/pairing/pairingAddresses';

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    family: 'IPv4',
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: `${address}/24`,
  };
}

function ipv6(address: string): NetworkInterfaceInfo {
  return {
    address,
    family: 'IPv6',
    internal: false,
    netmask: 'ffff:ffff:ffff:ffff::',
    mac: '00:00:00:00:00:00',
    cidr: `${address}/64`,
    scopeid: 0,
  };
}

describe('selectPairingAddresses', () => {
  it('keeps private IPv4 and unique local IPv6 addresses only', () => {
    const interfaces: NetworkInterfaces = {
      'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true), ipv6('::1')],
      'Wi-Fi': [ipv4('192.168.1.20'), ipv6('fe80::1c2b:3a4d'), ipv6('fd12:3456::20')],
      Ethernet: [ipv4('169.254.10.10'), ipv4('8.8.8.8'), ipv6('2001:db8::20')],
    };
    expect(selectPairingAddresses(interfaces)).toEqual(['192.168.1.20', 'fd12:3456::20']);
  });

  it('lists physical adapters before virtual ones and IPv4 before IPv6', () => {
    const interfaces: NetworkInterfaces = {
      'vEthernet (WSL)': [ipv4('172.20.16.1')],
      'VirtualBox Host-Only Network': [ipv4('192.168.56.1')],
      'Wi-Fi': [ipv6('fd00::5'), ipv4('192.168.1.20')],
      Ethernet: [ipv4('10.0.0.8')],
    };
    expect(selectPairingAddresses(interfaces)).toEqual([
      '192.168.1.20',
      '10.0.0.8',
      'fd00::5',
      '172.20.16.1',
      '192.168.56.1',
    ]);
  });

  it('lists each address once and at most eight', () => {
    const addresses = Array.from({ length: 12 }, (_, index) => ipv4(`10.0.0.${String(index)}`));
    const interfaces: NetworkInterfaces = { Ethernet: addresses, 'Ethernet 2': [ipv4('10.0.0.1')] };

    const selected = selectPairingAddresses(interfaces);

    expect(selected).toHaveLength(8);
    expect(new Set(selected).size).toBe(8);
  });

  it('returns nothing when the PC is offline', () => {
    expect(selectPairingAddresses({ Loopback: [ipv4('127.0.0.1', true)] })).toEqual([]);
  });
});

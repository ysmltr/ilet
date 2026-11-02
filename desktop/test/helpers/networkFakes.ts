import type { NetworkInterfaceInfo } from 'node:os';

/** An adapter address as `os.networkInterfaces()` reports it. */
export function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    family: 'IPv4',
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: `${address}/24`,
  };
}

export function ipv6(address: string): NetworkInterfaceInfo {
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

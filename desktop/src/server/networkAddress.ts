import { BlockList, isIP } from 'node:net';

interface NetworkRange {
  readonly network: string;
  readonly prefix: number;
  readonly family: 'ipv4' | 'ipv6';
}

/** RFC 1918 private IPv4 networks and RFC 4193 unique local IPv6 addresses. */
const PRIVATE_RANGES: readonly NetworkRange[] = [
  { network: '10.0.0.0', prefix: 8, family: 'ipv4' },
  { network: '172.16.0.0', prefix: 12, family: 'ipv4' },
  { network: '192.168.0.0', prefix: 16, family: 'ipv4' },
  { network: 'fc00::', prefix: 7, family: 'ipv6' },
];

/** Link-local (RFC 3927, RFC 4291) and loopback ranges. */
const LINK_LOCAL_AND_LOOPBACK_RANGES: readonly NetworkRange[] = [
  { network: '169.254.0.0', prefix: 16, family: 'ipv4' },
  { network: 'fe80::', prefix: 10, family: 'ipv6' },
  { network: '127.0.0.0', prefix: 8, family: 'ipv4' },
  { network: '::1', prefix: 128, family: 'ipv6' },
];

function blockListOf(ranges: readonly NetworkRange[]): BlockList {
  const list = new BlockList();
  for (const range of ranges) {
    list.addSubnet(range.network, range.prefix, range.family);
  }
  return list;
}

const localNetworks = blockListOf([...PRIVATE_RANGES, ...LINK_LOCAL_AND_LOOPBACK_RANGES]);
const privateNetworks = blockListOf(PRIVATE_RANGES);

const IPV4_MAPPED_IPV6_PREFIX = '::ffff:';
const IPV6_ZONE_SEPARATOR = '%';
const LOCALHOST = 'localhost';

/** Lower-cases, drops an IPv6 zone ("fe80::1%12") and unwraps IPv4-mapped IPv6 addresses. */
export function normalizeAddress(address: string): string {
  const withoutZone = (address.split(IPV6_ZONE_SEPARATOR)[0] ?? '').toLowerCase();
  const mappedIpv4 = withoutZone.slice(IPV4_MAPPED_IPV6_PREFIX.length);
  return withoutZone.startsWith(IPV4_MAPPED_IPV6_PREFIX) && isIP(mappedIpv4) === 4
    ? mappedIpv4
    : withoutZone;
}

/** True for private, link-local and loopback addresses: the peers ilet accepts. */
export function isLocalNetworkAddress(address: string | undefined): boolean {
  return address !== undefined && isInRanges(localNetworks, address);
}

/**
 * True for this PC's addresses that a phone on the same network can reach and that need no
 * zone ID: private IPv4 and unique local IPv6. These go into the pairing QR code.
 */
export function isAdvertisableAddress(address: string): boolean {
  return isInRanges(privateNetworks, address);
}

function isInRanges(ranges: BlockList, address: string): boolean {
  const normalized = normalizeAddress(address);
  switch (isIP(normalized)) {
    case 4:
      return ranges.check(normalized, 'ipv4');
    case 6:
      return ranges.check(normalized, 'ipv6');
    default:
      return false;
  }
}

/**
 * True when a Host header names an IP literal or localhost, with an optional port. A request
 * that reached us through DNS rebinding carries the attacker's host name instead.
 */
export function isAllowedHostHeader(host: string | undefined): boolean {
  if (host === undefined) {
    return false;
  }
  const hostname = hostnameOf(host.toLowerCase());
  return hostname === LOCALHOST || isIP(normalizeAddress(hostname)) !== 0;
}

function hostnameOf(host: string): string {
  if (host.startsWith('[')) {
    const closingBracket = host.indexOf(']');
    return closingBracket === -1 ? '' : host.slice(1, closingBracket);
  }
  const portSeparator = host.lastIndexOf(':');
  return portSeparator === -1 ? host : host.slice(0, portSeparator);
}

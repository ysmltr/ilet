import type { NetworkInterfaceInfo } from 'node:os';

import { isAdvertisableAddress, normalizeAddress } from '../server/networkAddress';
import { isVirtualAdapter, type NetworkInterfaces } from './networkInterfaces';
import type { NetworkProfile } from './networkProfiles';

/** How far ilet reaches into each network the PC is connected to. */
export interface NetworkExposure {
  /** Adapters to announce on; `undefined` means all of them, because the categories are unknown. */
  readonly announceOn: readonly string[] | undefined;
  /**
   * This PC's addresses (normalized) that accept connections: those on Private networks, and
   * loopback. `undefined` means all of them, because the categories are unknown.
   */
  readonly acceptedLocalAddresses: ReadonlySet<string> | undefined;
  /**
   * The addresses of the adapters on Private networks as a server binds to them: a link-local
   * IPv6 address with its zone. `undefined` while the categories are unknown.
   */
  readonly listenAddresses: readonly string[] | undefined;
  /**
   * An adapter outside Private networks has an address: one on a Public or Domain network, one
   * that Windows has not classified yet, or a virtual one. A socket bound to every adapter would
   * reach it too. Assumed while the categories are unknown.
   */
  readonly otherNetworkConnected: boolean;
  /** Physical adapters on Public networks, named in the warning the window shows. */
  readonly publicNetworks: readonly string[];
  /** Physical adapters on Domain networks, which the user cannot switch to Private. */
  readonly domainNetworks: readonly string[];
}

/**
 * Without categories (another platform, or a failed query), the installer's firewall rules decide
 * alone, and the Store version listens on this PC only (serverReach.ts).
 */
export const UNKNOWN_EXPOSURE: NetworkExposure = {
  announceOn: undefined,
  acceptedLocalAddresses: undefined,
  listenAddresses: undefined,
  otherNetworkConnected: true,
  publicNetworks: [],
  domainNetworks: [],
};

/**
 * ilet trusts only Private networks, like the firewall rules its installer adds, so a firewall
 * rule that allows more (for example one clicked by accident) changes nothing. Everything else
 * is refused, also an adapter whose network Windows has not classified yet.
 */
export function networkExposure(
  profiles: readonly NetworkProfile[] | undefined,
  interfaces: NetworkInterfaces,
): NetworkExposure {
  if (profiles === undefined) {
    return UNKNOWN_EXPOSURE;
  }
  const adaptersIn = (category: NetworkProfile['category']): string[] =>
    unique(
      profiles
        .filter((profile) => profile.category === category)
        .map(({ interfaceName }) => interfaceName),
    );
  const untrustedAdapters = profiles
    .filter((profile) => profile.category !== 'private')
    .map(({ interfaceName }) => interfaceName);
  // An adapter can have several profiles; one that is not Private is enough to distrust it.
  const trustedAdapters = adaptersIn('private').filter((name) => !untrustedAdapters.includes(name));
  const infosOf = (name: string): NetworkInterfaceInfo[] => interfaces[name] ?? [];
  const addressesOf = (name: string): string[] =>
    infosOf(name).map((info) => normalizeAddress(info.address));
  const loopbackAddresses = Object.values(interfaces).flatMap((infos = []) =>
    infos.filter((info) => info.internal).map((info) => normalizeAddress(info.address)),
  );
  const shownInWarning = (names: readonly string[]): string[] =>
    names.filter(
      (name) => !isVirtualAdapter(name) && addressesOf(name).some(isAdvertisableAddress),
    );
  return {
    announceOn: trustedAdapters,
    acceptedLocalAddresses: new Set([
      ...trustedAdapters.flatMap(addressesOf),
      ...loopbackAddresses,
    ]),
    listenAddresses: unique(trustedAdapters.flatMap((name) => infosOf(name).map(bindAddressOf))),
    otherNetworkConnected: Object.entries(interfaces).some(
      ([name, infos = []]) =>
        !trustedAdapters.includes(name) && infos.some((info) => !info.internal),
    ),
    publicNetworks: shownInWarning(adaptersIn('public')),
    domainNetworks: shownInWarning(adaptersIn('domain')),
  };
}

export function sameExposure(first: NetworkExposure, second: NetworkExposure): boolean {
  return (
    sameList(first.announceOn, second.announceOn) &&
    sameList(
      first.acceptedLocalAddresses && [...first.acceptedLocalAddresses],
      second.acceptedLocalAddresses && [...second.acceptedLocalAddresses],
    ) &&
    sameList(first.listenAddresses, second.listenAddresses) &&
    first.otherNetworkConnected === second.otherNetworkConnected &&
    sameList(first.publicNetworks, second.publicNetworks) &&
    sameList(first.domainNetworks, second.domainNetworks)
  );
}

/** A link-local IPv6 address can be bound only with its zone, which Windows numbers. */
function bindAddressOf(info: NetworkInterfaceInfo): string {
  return info.family === 'IPv6' && info.scopeid !== 0
    ? `${info.address}%${String(info.scopeid)}`
    : info.address;
}

function sameList(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined,
): boolean {
  if (first === undefined || second === undefined) {
    return first === second;
  }
  const sortedSecond = [...second].sort();
  return (
    first.length === second.length &&
    [...first].sort().every((item, index) => item === sortedSecond[index])
  );
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

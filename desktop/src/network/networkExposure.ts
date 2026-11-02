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
  /** Physical adapters on Public networks, named in the warning the window shows. */
  readonly publicNetworks: readonly string[];
  /** Physical adapters on Domain networks, which the user cannot switch to Private. */
  readonly domainNetworks: readonly string[];
}

/** Without categories (another platform, or a failed query) ilet behaves as before: the firewall decides. */
export const UNKNOWN_EXPOSURE: NetworkExposure = {
  announceOn: undefined,
  acceptedLocalAddresses: undefined,
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
  const addressesOf = (name: string): string[] =>
    (interfaces[name] ?? []).map((info) => normalizeAddress(info.address));
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
    sameList(first.publicNetworks, second.publicNetworks) &&
    sameList(first.domainNetworks, second.domainNetworks)
  );
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

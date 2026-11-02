import { isAdvertisableAddress, normalizeAddress } from '../server/networkAddress';
import { isVirtualAdapter, type NetworkInterfaces } from './networkInterfaces';
import type { NetworkProfile } from './networkProfiles';

/** How far ilet reaches into each network the PC is connected to. */
export interface NetworkExposure {
  /** Adapters to announce on; `undefined` means all of them, because the categories are unknown. */
  readonly announceOn: readonly string[] | undefined;
  /** This PC's addresses on Public networks (normalized): connections to them are refused. */
  readonly blockedLocalAddresses: ReadonlySet<string>;
  /** Physical adapters on Public networks, named in the warning the window shows. */
  readonly publicNetworks: readonly string[];
}

/** Without categories (another platform, or a failed query) ilet behaves as before: the firewall decides. */
export const UNKNOWN_EXPOSURE: NetworkExposure = {
  announceOn: undefined,
  blockedLocalAddresses: new Set(),
  publicNetworks: [],
};

/**
 * On a network Windows classifies as Public, its firewall blocks ilet. ilet does the same on its
 * own, so a firewall rule that allows more (for example one clicked by accident) changes nothing.
 */
export function networkExposure(
  profiles: readonly NetworkProfile[] | undefined,
  interfaces: NetworkInterfaces,
): NetworkExposure {
  if (profiles === undefined) {
    return UNKNOWN_EXPOSURE;
  }
  const publicAdapters = unique(
    profiles
      .filter((profile) => profile.category === 'public')
      .map(({ interfaceName }) => interfaceName),
  );
  const trustedAdapters = unique(
    profiles
      .filter((profile) => profile.category !== 'public')
      .map(({ interfaceName }) => interfaceName),
  );
  const addressesOf = (name: string): string[] =>
    (interfaces[name] ?? []).map((info) => normalizeAddress(info.address));
  return {
    announceOn: trustedAdapters.filter((name) => !publicAdapters.includes(name)),
    blockedLocalAddresses: new Set(publicAdapters.flatMap(addressesOf)),
    publicNetworks: publicAdapters.filter(
      (name) => !isVirtualAdapter(name) && addressesOf(name).some(isAdvertisableAddress),
    ),
  };
}

export function sameExposure(first: NetworkExposure, second: NetworkExposure): boolean {
  return (
    sameList(first.announceOn, second.announceOn) &&
    sameList([...first.blockedLocalAddresses], [...second.blockedLocalAddresses]) &&
    sameList(first.publicNetworks, second.publicNetworks)
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

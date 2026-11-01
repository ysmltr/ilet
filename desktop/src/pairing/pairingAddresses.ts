import type { NetworkInterfaceInfo } from 'node:os';

import { MAX_PAIRING_ADDRESSES } from '../protocol/constants';
import { isAdvertisableAddress } from '../server/networkAddress';

export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** Adapters of virtual machines and WSL. A phone usually cannot reach them, so they go last. */
const VIRTUAL_ADAPTER_NAMES = /virtual|vethernet|vmware|vbox|hyper-v|wsl/i;

interface Candidate {
  readonly address: string;
  readonly isIpv4: boolean;
  readonly isVirtual: boolean;
}

/**
 * The addresses for the pairing QR code, most likely to work first (PROTOCOL.md section 4.2):
 * physical adapters before virtual ones, IPv4 before IPv6.
 */
export function selectPairingAddresses(interfaces: NetworkInterfaces): string[] {
  const candidates: Candidate[] = Object.entries(interfaces).flatMap(([name, infos = []]) =>
    infos
      .filter((info) => !info.internal && isAdvertisableAddress(info.address))
      .map((info) => ({
        address: info.address,
        isIpv4: info.family === 'IPv4',
        isVirtual: VIRTUAL_ADAPTER_NAMES.test(name),
      })),
  );
  candidates.sort(
    (first, second) =>
      Number(first.isVirtual) - Number(second.isVirtual) ||
      Number(second.isIpv4) - Number(first.isIpv4),
  );
  const uniqueAddresses = [...new Set(candidates.map((candidate) => candidate.address))];
  return uniqueAddresses.slice(0, MAX_PAIRING_ADDRESSES);
}

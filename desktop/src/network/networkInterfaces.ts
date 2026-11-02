import type { NetworkInterfaceInfo } from 'node:os';

/** What `os.networkInterfaces()` returns: the addresses of each adapter, by adapter name. */
export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** Adapters of virtual machines and WSL. A phone usually cannot reach them. */
const VIRTUAL_ADAPTER_NAMES = /virtual|vethernet|vmware|vbox|hyper-v|wsl/i;

export function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER_NAMES.test(name);
}

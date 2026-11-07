/**
 * How this copy of ilet was installed, which decides what Windows does for it (STORE.md):
 * - `installer`: ilet-Setup.exe. Its firewall rules allow Private networks and block every other
 *   network, and ilet can add a login item and the Send to shortcut.
 * - `store`: the Microsoft Store package. Its firewall rules can only allow Private networks, and
 *   Windows keeps the files and registry entries that ilet writes private to the package.
 * - `development`: started from the source code, with no firewall rules of its own.
 */
export type Packaging = 'installer' | 'store' | 'development';

/** `windowsStore` is Electron's `process.windowsStore`: true inside a Store (AppX) package. */
export function packagingOf(isPackaged: boolean, windowsStore: boolean | undefined): Packaging {
  if (!isPackaged) {
    return 'development';
  }
  return windowsStore === true ? 'store' : 'installer';
}

/**
 * Only the installer's rules keep every other network out. Without them, ilet must not even listen
 * on another network, or Windows would ask the user whether to let it in (THREAT_MODEL.md T48).
 */
export function firewallBlocksOtherNetworks(packaging: Packaging): boolean {
  return packaging === 'installer';
}

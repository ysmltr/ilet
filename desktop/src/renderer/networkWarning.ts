import type { NetworkStatus } from '../ipc/contract';
import { requireElement, translate } from './page';

const warning = requireElement('network-warning', HTMLElement);
const publicText = requireElement('network-warning-text', HTMLElement);
const domainText = requireElement('domain-warning-text', HTMLElement);
const openSettings = requireElement('open-network-settings', HTMLButtonElement);

export async function connectNetworkWarning(): Promise<void> {
  openSettings.addEventListener('click', () => {
    window.ilet.openNetworkSettings();
  });
  requireElement('check-network', HTMLButtonElement).addEventListener('click', () => {
    void check();
  });
  window.ilet.onNetworkChanged(showNetworkStatus);
  await check();
}

async function check(): Promise<void> {
  showNetworkStatus(await window.ilet.checkNetwork());
}

/** Adapter names come from Windows and are shown as text. */
function showNetworkStatus({ publicNetworks, domainNetworks }: NetworkStatus): void {
  const names = (adapters: readonly string[]): string =>
    adapters.map((name) => `“${name}”`).join(', ');
  publicText.textContent = translate('publicNetworkBody', { networks: names(publicNetworks) });
  domainText.textContent = translate('domainNetworkBody', { networks: names(domainNetworks) });
  publicText.hidden = publicNetworks.length === 0;
  domainText.hidden = domainNetworks.length === 0;
  // Only a Public network can be switched to Private in Windows Settings.
  openSettings.hidden = publicNetworks.length === 0;
  warning.hidden = publicNetworks.length === 0 && domainNetworks.length === 0;
}

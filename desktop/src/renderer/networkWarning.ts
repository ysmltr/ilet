import type { NetworkStatus } from '../ipc/contract';
import { requireElement, translate } from './page';

const warning = requireElement('network-warning', HTMLElement);
const warningText = requireElement('network-warning-text', HTMLElement);

export async function connectNetworkWarning(): Promise<void> {
  requireElement('open-network-settings', HTMLButtonElement).addEventListener('click', () => {
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
function showNetworkStatus(status: NetworkStatus): void {
  const networks = status.publicNetworks.map((name) => `“${name}”`).join(', ');
  warningText.textContent = translate('publicNetworkBody', { networks });
  warning.hidden = status.publicNetworks.length === 0;
}

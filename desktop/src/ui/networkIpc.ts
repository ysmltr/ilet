import { IpcChannel, type NetworkStatus } from '../ipc/contract';
import type { NetworkMonitor } from '../network/networkMonitor';
import type { AppWindow } from './appWindow';
import { noArguments } from './ipcArguments';
import type { IpcGuard } from './ipcGuard';

export interface NetworkActions {
  readonly openNetworkSettings: () => Promise<void>;
}

/** The warning about Public networks, and the way to fix it. */
export function connectNetwork(
  guard: IpcGuard,
  monitor: NetworkMonitor,
  window: AppWindow,
  actions: NetworkActions,
): void {
  const status = (): NetworkStatus => ({ publicNetworks: monitor.current.publicNetworks });

  guard.handle(IpcChannel.checkNetwork, noArguments, async () => {
    await monitor.refresh();
    return status();
  });
  guard.on(IpcChannel.openNetworkSettings, noArguments, () => {
    void actions.openNetworkSettings();
  });
  monitor.onChange(() => {
    window.send(IpcChannel.networkChanged, status());
  });
  // The user may have just switched the network to Private in Windows Settings.
  window.onShow(() => {
    void monitor.refresh();
  });
}

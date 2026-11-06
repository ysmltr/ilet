import type { IletBridge } from '../ipc/contract';
import { connectDevicesView } from './devicesView';
import { connectNetworkWarning } from './networkWarning';
import { connectOutboxView } from './outboxView';
import { translatePage } from './page';
import { connectPairingView } from './pairingView';
import { connectSettingsView } from './settingsView';

declare global {
  interface Window {
    readonly ilet: IletBridge;
  }
}

translatePage();
connectPairingView();
void connectDevicesView();
void connectOutboxView();
void connectSettingsView();
void connectNetworkWarning();

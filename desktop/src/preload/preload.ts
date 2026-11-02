/**
 * Runs in the sandboxed window before the page. It can reach Electron's IPC, the page cannot:
 * the page gets only the functions of `IletBridge`, and the main process checks every message.
 */
import { contextBridge, ipcRenderer } from 'electron';

import {
  BRIDGE_NAME,
  type ChooseReceiveFolderResult,
  type DeviceSummary,
  type IletBridge,
  IpcChannel,
  type NetworkStatus,
  type PairingEvent,
  type RenameDeviceResult,
  type SettingsSummary,
  type StartPairingResult,
} from '../ipc/contract';

/**
 * The page receives plain data, never Electron's event object (it would expose `sender`). The
 * payloads come from the main process, which sends the types of the contract.
 */
function subscribe(channel: string, deliver: (payload: unknown) => void): void {
  ipcRenderer.on(channel, (_event, payload: unknown) => {
    deliver(payload);
  });
}

const bridge: IletBridge = {
  startPairing: () => ipcRenderer.invoke(IpcChannel.startPairing) as Promise<StartPairingResult>,
  cancelPairing: () => {
    ipcRenderer.send(IpcChannel.cancelPairing);
  },
  onPairingEvent: (listener) => {
    subscribe(IpcChannel.pairingEvent, (payload) => {
      listener(payload as PairingEvent);
    });
  },

  listDevices: () =>
    ipcRenderer.invoke(IpcChannel.listDevices) as Promise<readonly DeviceSummary[]>,
  renameDevice: (id, name) =>
    ipcRenderer.invoke(IpcChannel.renameDevice, id, name) as Promise<RenameDeviceResult>,
  removeDevice: (id) => ipcRenderer.invoke(IpcChannel.removeDevice, id) as Promise<boolean>,
  onDevicesChanged: (listener) => {
    subscribe(IpcChannel.devicesChanged, (payload) => {
      listener(payload as readonly DeviceSummary[]);
    });
  },

  getSettings: () => ipcRenderer.invoke(IpcChannel.getSettings) as Promise<SettingsSummary>,
  chooseReceiveFolder: () =>
    ipcRenderer.invoke(IpcChannel.chooseReceiveFolder) as Promise<ChooseReceiveFolderResult>,
  openReceiveFolder: () => {
    ipcRenderer.send(IpcChannel.openReceiveFolder);
  },
  setStartWithWindows: (enabled) =>
    ipcRenderer.invoke(IpcChannel.setStartWithWindows, enabled) as Promise<SettingsSummary>,

  checkNetwork: () => ipcRenderer.invoke(IpcChannel.checkNetwork) as Promise<NetworkStatus>,
  onNetworkChanged: (listener) => {
    subscribe(IpcChannel.networkChanged, (payload) => {
      listener(payload as NetworkStatus);
    });
  },
  openNetworkSettings: () => {
    ipcRenderer.send(IpcChannel.openNetworkSettings);
  },
};

contextBridge.exposeInMainWorld(BRIDGE_NAME, bridge);

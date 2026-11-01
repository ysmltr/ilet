/**
 * Runs in the sandboxed window before the page. It can reach Electron's IPC, the page cannot:
 * the page gets only the three functions of `IletBridge`.
 */
import { contextBridge, ipcRenderer } from 'electron';

import {
  BRIDGE_NAME,
  type IletBridge,
  IpcChannel,
  type PairingEvent,
  type StartPairingResult,
} from '../ipc/contract';

const bridge: IletBridge = {
  startPairing: () => ipcRenderer.invoke(IpcChannel.startPairing) as Promise<StartPairingResult>,
  cancelPairing: () => {
    ipcRenderer.send(IpcChannel.cancelPairing);
  },
  onPairingEvent: (listener) => {
    // The page receives plain data, never Electron's event object (it would expose `sender`).
    ipcRenderer.on(IpcChannel.pairingEvent, (_event, pairingEvent: PairingEvent) => {
      listener(pairingEvent);
    });
  },
};

contextBridge.exposeInMainWorld(BRIDGE_NAME, bridge);

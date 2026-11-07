/**
 * Runs in the sandboxed window before the page. It can reach Electron's IPC, the page cannot:
 * the page gets only the functions of `IletBridge`, and the main process checks every message.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

import {
  BRIDGE_NAME,
  type ChooseReceiveFolderResult,
  type DeviceSummary,
  type IletBridge,
  IpcChannel,
  MAX_DROPPED_PATHS,
  type NetworkStatus,
  type OutboxSummary,
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
  openStartupSettings: () => {
    ipcRenderer.send(IpcChannel.openStartupSettings);
  },

  checkNetwork: () => ipcRenderer.invoke(IpcChannel.checkNetwork) as Promise<NetworkStatus>,
  onNetworkChanged: (listener) => {
    subscribe(IpcChannel.networkChanged, (payload) => {
      listener(payload as NetworkStatus);
    });
  },
  openNetworkSettings: () => {
    ipcRenderer.send(IpcChannel.openNetworkSettings);
  },

  getOutbox: () => ipcRenderer.invoke(IpcChannel.getOutbox) as Promise<OutboxSummary>,
  onOutboxChanged: (listener) => {
    subscribe(IpcChannel.outboxChanged, (payload) => {
      listener(payload as OutboxSummary);
    });
  },
  chooseFilesToSend: () => ipcRenderer.invoke(IpcChannel.chooseFilesToSend) as Promise<void>,
  cancelOutboxFile: (id) => ipcRenderer.invoke(IpcChannel.cancelOutboxFile, id) as Promise<boolean>,
};

const FILES_DRAG_TYPE = 'Files';

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(FILES_DRAG_TYPE) === true;
}

/**
 * Files dropped on the window reach the main process from here, never from the page: only a drop
 * that the user really made is read (`isTrusted`; the page can dispatch only untrusted events),
 * and the page never learns a path. These listeners run first, in the capture phase, as they
 * were added before the page's own. The main process asks the user before it copies anything.
 */
function forwardDroppedFiles(): void {
  window.addEventListener(
    'dragover',
    (event) => {
      if (carriesFiles(event)) {
        // Without this, the window refuses the drop.
        event.preventDefault();
      }
    },
    true,
  );
  window.addEventListener(
    'drop',
    (event) => {
      event.preventDefault();
      if (!event.isTrusted) {
        return;
      }
      const paths = Array.from(event.dataTransfer?.files ?? [], (file) =>
        webUtils.getPathForFile(file),
      )
        .filter((filePath) => filePath !== '')
        .slice(0, MAX_DROPPED_PATHS);
      if (paths.length > 0) {
        ipcRenderer.send(IpcChannel.dropFiles, paths);
      }
    },
    true,
  );
}

contextBridge.exposeInMainWorld(BRIDGE_NAME, bridge);
forwardDroppedFiles();

import { type BrowserWindow, ipcMain } from 'electron';

import type { ServerCore } from '../app/serverCore';
import { IpcChannel, type PairingEvent } from '../ipc/contract';
import type { NetworkInterfaces } from '../pairing/pairingAddresses';
import type { Logger } from '../shared/logger';
import { startPairing } from './pairingFlow';
import { type IpcSender, isFromAppWindow } from './trustedSender';

/**
 * Connects the window to pairing. Every message from the window is checked: it must come from
 * the window's own page and carry no arguments, because none of these channels takes any.
 */
export function connectPairingToWindow(
  core: ServerCore,
  window: BrowserWindow,
  networkInterfaces: () => NetworkInterfaces,
  logger: Logger,
): void {
  const isValidMessage = (event: IpcSender, args: readonly unknown[], channel: string): boolean => {
    const valid = args.length === 0 && isFromAppWindow(event, window.webContents);
    if (!valid) {
      logger.warn('rejected IPC message', { channel });
    }
    return valid;
  };

  ipcMain.handle(IpcChannel.startPairing, (event, ...args: unknown[]) => {
    if (!isValidMessage(event, args, IpcChannel.startPairing)) {
      throw new Error('IPC message rejected');
    }
    return startPairing({
      codes: core.pairingCodes,
      deviceId: core.identity.deviceId,
      displayName: core.settings.displayName,
      port: core.settings.port,
      fingerprint: core.identity.fingerprint,
      networkInterfaces,
    });
  });
  ipcMain.on(IpcChannel.cancelPairing, (event, ...args: unknown[]) => {
    if (isValidMessage(event, args, IpcChannel.cancelPairing)) {
      core.pairingCodes.cancel();
    }
  });

  const notifyWindow = (pairingEvent: PairingEvent): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.pairingEvent, pairingEvent);
    }
  };
  core.devices.onRegistered((device) => {
    notifyWindow({ type: 'paired', deviceName: device.name });
  });
  core.pairingCodes.onExpired(() => {
    notifyWindow({ type: 'expired' });
  });
  // A closed window must not leave a usable code behind.
  window.on('closed', () => {
    core.pairingCodes.cancel();
  });
}

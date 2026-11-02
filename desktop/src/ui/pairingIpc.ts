import type { ServerCore } from '../app/serverCore';
import { IpcChannel, type PairingEvent } from '../ipc/contract';
import type { NetworkInterfaces } from '../network/networkInterfaces';
import type { AppWindow } from './appWindow';
import { noArguments } from './ipcArguments';
import type { IpcGuard } from './ipcGuard';
import { startPairing } from './pairingFlow';

/** Pairing from the window. Hiding the window must not leave a usable code behind. */
export function connectPairing(
  guard: IpcGuard,
  core: ServerCore,
  window: AppWindow,
  networkInterfaces: () => NetworkInterfaces,
): void {
  guard.handle(IpcChannel.startPairing, noArguments, () =>
    startPairing({
      codes: core.pairingCodes,
      deviceId: core.identity.deviceId,
      displayName: core.settings.current.displayName,
      port: core.settings.current.port,
      fingerprint: core.identity.fingerprint,
      networkInterfaces,
    }),
  );
  guard.on(IpcChannel.cancelPairing, noArguments, () => {
    core.pairingCodes.cancel();
  });

  const notify = (event: PairingEvent): void => {
    window.send(IpcChannel.pairingEvent, event);
  };
  core.devices.onRegistered((device) => {
    notify({ type: 'paired', deviceName: device.name });
  });
  core.pairingCodes.onExpired(() => {
    notify({ type: 'expired' });
  });
  window.onHide(() => {
    core.pairingCodes.cancel();
    notify({ type: 'cancelled' });
  });
}

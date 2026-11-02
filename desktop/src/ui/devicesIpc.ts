import type { DeviceRegistry } from '../auth/deviceRegistry';
import type { Translate } from '../i18n/messages';
import { type DeviceSummary, IpcChannel, type RenameDeviceResult } from '../ipc/contract';
import { sanitizeDisplayName } from '../shared/text';
import type { AppWindow } from './appWindow';
import { deviceIdArgument, noArguments, renameDeviceArguments } from './ipcArguments';
import type { IpcGuard } from './ipcGuard';

/** The list of paired devices, with rename and remove. The window is told about every change. */
export function connectDevices(
  guard: IpcGuard,
  devices: DeviceRegistry,
  window: AppWindow,
  translate: Translate,
): void {
  const summaries = (): DeviceSummary[] =>
    devices.list().map(({ id, name, pairedAt }) => ({ id, name, pairedAt }));
  const sendList = (): void => {
    window.send(IpcChannel.devicesChanged, summaries());
  };

  guard.handle(IpcChannel.listDevices, noArguments, summaries);
  guard.handle(
    IpcChannel.renameDevice,
    renameDeviceArguments,
    async (id, requestedName): Promise<RenameDeviceResult> => {
      const name = sanitizeDisplayName(requestedName);
      if (name === '') {
        return 'invalid-name';
      }
      if ((await devices.rename(id, name)) === undefined) {
        return 'not-found';
      }
      sendList();
      return 'renamed';
    },
  );
  // The main process asks itself, so not even a compromised page can remove a device silently.
  guard.handle(IpcChannel.removeDevice, deviceIdArgument, async (id) => {
    const device = devices.list().find((candidate) => candidate.id === id);
    if (device === undefined) {
      return false;
    }
    const confirmed = await window.confirm({
      title: translate('removeDeviceTitle'),
      message: translate('removeDeviceQuestion', { name: device.name }),
      detail: translate('removeDeviceDetail'),
      confirmLabel: translate('remove'),
      cancelLabel: translate('cancel'),
    });
    return confirmed && (await devices.revoke(id));
  });
  devices.onRegistered(sendList);
  devices.onRevoked(sendList);
}

import type { ServerCore } from '../app/serverCore';
import type { Translate } from '../i18n/messages';
import { type ChooseReceiveFolderResult, IpcChannel, type SettingsSummary } from '../ipc/contract';
import type { StartWithWindows } from '../settings/startWithWindows';
import type { AppWindow } from './appWindow';
import { booleanArgument, noArguments } from './ipcArguments';
import type { IpcGuard } from './ipcGuard';

export interface SettingsActions {
  readonly openReceiveFolder: () => Promise<void>;
}

/** The receive folder and starting with Windows. The page never sends a path. */
export function connectSettings(
  guard: IpcGuard,
  core: ServerCore,
  window: AppWindow,
  startWithWindows: StartWithWindows,
  translate: Translate,
  actions: SettingsActions,
): void {
  const summary = (): SettingsSummary => ({
    receiveFolder: core.settings.current.receiveFolder,
    startWithWindows: startWithWindows.isEnabled(),
    startWithWindowsAvailable: startWithWindows.available,
  });

  guard.handle(IpcChannel.getSettings, noArguments, summary);
  guard.handle(
    IpcChannel.chooseReceiveFolder,
    noArguments,
    async (): Promise<ChooseReceiveFolderResult> => {
      const chosen = await window.chooseFolder(
        translate('chooseFolderTitle'),
        core.settings.current.receiveFolder,
      );
      if (chosen === undefined) {
        return { status: 'cancelled' };
      }
      const check = await core.changeReceiveFolder(chosen);
      return check.ok
        ? { status: 'changed', settings: summary() }
        : { status: 'rejected', problem: check.problem };
    },
  );
  guard.on(IpcChannel.openReceiveFolder, noArguments, () => {
    void actions.openReceiveFolder();
  });
  guard.handle(IpcChannel.setStartWithWindows, booleanArgument, (enabled) => {
    startWithWindows.setEnabled(enabled);
    return summary();
  });
}

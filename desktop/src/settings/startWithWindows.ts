import type { App } from 'electron';

import type { Packaging } from '../app/packaging';
import type { StartWithWindowsControl } from '../ipc/contract';

/**
 * Added by the login item, so that a start with Windows goes straight to the tray. The Store
 * package's startup task passes it too (installer/appxmanifest.xml).
 */
export const HIDDEN_START_ARGUMENT = '--hidden';

/**
 * The installer's version keeps the switch as a login item, so it is not in the settings file.
 * A Store package cannot add one, as Windows keeps the package's registry entries private to it:
 * its startup task is switched on the Startup page of Windows Settings instead. A development
 * build would register Electron without the app, so it offers neither.
 */
export interface StartWithWindows {
  readonly control: StartWithWindowsControl;
  /** Only the checkbox has a state that ilet can read; a startup task's needs native code. */
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export type LoginItemApp = Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>;

export function createStartWithWindows(app: LoginItemApp, packaging: Packaging): StartWithWindows {
  if (packaging !== 'installer') {
    return {
      control: packaging === 'store' ? 'windows-settings' : 'unavailable',
      isEnabled: () => false,
      setEnabled: () => undefined,
    };
  }
  const loginItem = { args: [HIDDEN_START_ARGUMENT] };
  return {
    control: 'checkbox',
    isEnabled: () => app.getLoginItemSettings(loginItem).openAtLogin,
    setEnabled: (enabled) => {
      app.setLoginItemSettings({ ...loginItem, openAtLogin: enabled });
    },
  };
}

export function isHiddenStart(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_START_ARGUMENT);
}

import type { App } from 'electron';

/** Added by the login item, so that a start with Windows goes straight to the tray. */
const HIDDEN_START_ARGUMENT = '--hidden';

/** Windows keeps this setting itself (a login item), so it is not in the settings file. */
export interface StartWithWindows {
  /** A development build would register Electron without the app, so it cannot offer this. */
  readonly available: boolean;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export type LoginItemApp = Pick<
  App,
  'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'
>;

export function createStartWithWindows(app: LoginItemApp): StartWithWindows {
  const loginItem = { args: [HIDDEN_START_ARGUMENT] };
  return {
    available: app.isPackaged,
    isEnabled: () => app.isPackaged && app.getLoginItemSettings(loginItem).openAtLogin,
    setEnabled: (enabled) => {
      if (app.isPackaged) {
        app.setLoginItemSettings({ ...loginItem, openAtLogin: enabled });
      }
    },
  };
}

export function isHiddenStart(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_START_ARGUMENT);
}

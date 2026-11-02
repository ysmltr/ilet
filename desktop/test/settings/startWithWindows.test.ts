import type { LoginItemSettings, LoginItemSettingsOptions, Settings } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  createStartWithWindows,
  isHiddenStart,
  type LoginItemApp,
} from '../../src/settings/startWithWindows';

function fakeApp(isPackaged: boolean, openAtLogin = false) {
  const setLoginItemSettings = vi.fn<(settings: Settings) => void>();
  const getLoginItemSettings = vi.fn<(options?: LoginItemSettingsOptions) => LoginItemSettings>(
    () => ({ openAtLogin }) as LoginItemSettings,
  );
  const app: LoginItemApp = { isPackaged, getLoginItemSettings, setLoginItemSettings };
  return { app, setLoginItemSettings, getLoginItemSettings };
}

describe('createStartWithWindows', () => {
  it('registers the installed app with the argument for a start in the tray', () => {
    const { app, setLoginItemSettings, getLoginItemSettings } = fakeApp(true, true);
    const startWithWindows = createStartWithWindows(app);

    startWithWindows.setEnabled(true);

    expect(startWithWindows.available).toBe(true);
    expect(startWithWindows.isEnabled()).toBe(true);
    expect(getLoginItemSettings).toHaveBeenCalledWith({ args: ['--hidden'] });
    expect(setLoginItemSettings).toHaveBeenCalledWith({ args: ['--hidden'], openAtLogin: true });
  });

  it('offers nothing in a development build, which would register Electron itself', () => {
    const { app, setLoginItemSettings } = fakeApp(false, true);
    const startWithWindows = createStartWithWindows(app);

    startWithWindows.setEnabled(true);

    expect(startWithWindows.available).toBe(false);
    expect(startWithWindows.isEnabled()).toBe(false);
    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });
});

describe('isHiddenStart', () => {
  it('recognizes a start by Windows', () => {
    expect(isHiddenStart(['C:\\Program Files\\ilet\\ilet.exe', '--hidden'])).toBe(true);
    expect(isHiddenStart(['C:\\Program Files\\ilet\\ilet.exe'])).toBe(false);
  });
});

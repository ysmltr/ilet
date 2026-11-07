import type { LoginItemSettings, LoginItemSettingsOptions, Settings } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  createStartWithWindows,
  isHiddenStart,
  type LoginItemApp,
} from '../../src/settings/startWithWindows';

function fakeApp(openAtLogin = false) {
  const setLoginItemSettings = vi.fn<(settings: Settings) => void>();
  const getLoginItemSettings = vi.fn<(options?: LoginItemSettingsOptions) => LoginItemSettings>(
    () => ({ openAtLogin }) as LoginItemSettings,
  );
  const app: LoginItemApp = { getLoginItemSettings, setLoginItemSettings };
  return { app, setLoginItemSettings, getLoginItemSettings };
}

describe('createStartWithWindows', () => {
  it('registers the installed app with the argument for a start in the tray', () => {
    const { app, setLoginItemSettings, getLoginItemSettings } = fakeApp(true);
    const startWithWindows = createStartWithWindows(app, 'installer');

    startWithWindows.setEnabled(true);

    expect(startWithWindows.control).toBe('checkbox');
    expect(startWithWindows.isEnabled()).toBe(true);
    expect(getLoginItemSettings).toHaveBeenCalledWith({ args: ['--hidden'] });
    expect(setLoginItemSettings).toHaveBeenCalledWith({ args: ['--hidden'], openAtLogin: true });
  });

  it('leaves the Store package to the Startup page of Windows Settings', () => {
    const { app, setLoginItemSettings, getLoginItemSettings } = fakeApp(true);
    const startWithWindows = createStartWithWindows(app, 'store');

    startWithWindows.setEnabled(true);

    expect(startWithWindows.control).toBe('windows-settings');
    expect(startWithWindows.isEnabled()).toBe(false);
    // A login item would land in the package's private registry, where Windows never looks.
    expect(getLoginItemSettings).not.toHaveBeenCalled();
    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('offers nothing in a development build, which would register Electron itself', () => {
    const { app, setLoginItemSettings } = fakeApp(true);
    const startWithWindows = createStartWithWindows(app, 'development');

    startWithWindows.setEnabled(true);

    expect(startWithWindows.control).toBe('unavailable');
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

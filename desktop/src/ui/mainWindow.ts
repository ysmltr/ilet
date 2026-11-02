import { app, BrowserWindow } from 'electron';

import { APP_NAME } from '../protocol/constants';
import { errorFields, type Logger } from '../shared/logger';
import { APP_ENTRY_URL } from './appUrl';

const WINDOW_SIZE = { width: 440, height: 720 } as const;

export function createMainWindow(
  preloadPath: string,
  iconPath: string,
  logger: Logger,
): BrowserWindow {
  const window = new BrowserWindow({
    ...WINDOW_SIZE,
    icon: iconPath,
    // The size is the page area, without the Windows title bar.
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: APP_NAME,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window.removeMenu();
  window.once('ready-to-show', () => {
    window.show();
  });
  window.loadURL(APP_ENTRY_URL).catch((error: unknown) => {
    logger.error('window could not load', errorFields(error));
  });
  return window;
}

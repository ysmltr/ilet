import path from 'node:path';

import { app, dialog } from 'electron';

import { startDesktopApp } from './app/desktopApp';
import { createTranslator, resolveLanguage } from './i18n/messages';
import { ListenAddress } from './server/httpsServer';
import { createConsoleLogger, errorFields } from './shared/logger';
import { registerAppScheme } from './ui/appProtocol';
import { installNavigationGuards } from './ui/securityGuards';
import { startupErrorMessage } from './ui/startupErrorMessage';

const logger = createConsoleLogger();
const EXIT_CODE_STARTUP_FAILED = 1;

// Both must be in place before the app is ready and before any window exists.
registerAppScheme();
installNavigationGuards();

// A second instance would compete for the port and the data files; it shows the first one instead.
if (app.requestSingleInstanceLock()) {
  startDesktopApp(
    {
      // All built next to this file by scripts/bundle.mjs.
      preload: path.join(__dirname, 'preload.js'),
      rendererFolder: path.join(__dirname, 'renderer'),
      appIcon: path.join(__dirname, 'icons', 'ilet.ico'),
      trayIcon: path.join(__dirname, 'icons', 'ilet-tray.ico'),
    },
    ListenAddress.allInterfaces,
    logger,
  ).catch((error: unknown) => {
    logger.error('ilet could not start', errorFields(error));
    // A tray app that exits without a word looks as if it never started.
    const translate = createTranslator(resolveLanguage(app.getPreferredSystemLanguages()));
    dialog.showErrorBox(translate('startupFailedTitle'), startupErrorMessage(error, translate));
    app.exit(EXIT_CODE_STARTUP_FAILED);
  });
} else {
  app.quit();
}

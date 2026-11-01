import os from 'node:os';
import path from 'node:path';

import { getResponder } from '@homebridge/ciao';
import { app, type BrowserWindow, safeStorage, session } from 'electron';

import { type ServerCore, startServerCore } from './app/serverCore';
import { createSafeStorageCipher } from './identity/safeStorageCipher';
import { ListenAddress } from './server/httpsServer';
import { createConsoleLogger, errorFields } from './shared/logger';
import { registerAppScheme, serveRendererAssets } from './ui/appProtocol';
import { createMainWindow } from './ui/mainWindow';
import { connectPairingToWindow } from './ui/pairingIpc';
import { installNavigationGuards, lockDownSession } from './ui/securityGuards';

const logger = createConsoleLogger();
const EXIT_CODE_STARTUP_FAILED = 1;
/** Both are built next to this file by scripts/bundle.mjs. */
const PRELOAD_FILE_NAME = 'preload.js';
const RENDERER_FOLDER_NAME = 'renderer';

async function run(): Promise<void> {
  await app.whenReady();
  lockDownSession(session.defaultSession);
  serveRendererAssets(path.join(__dirname, RENDERER_FOLDER_NAME));
  const core = await startServerCore({
    dataFolder: app.getPath('userData'),
    downloadsFolder: app.getPath('downloads'),
    listenAddress: ListenAddress.allInterfaces,
    createMdnsResponder: getResponder,
    hostname: os.hostname(),
    platform: process.platform,
    secretCipher: createSafeStorageCipher(safeStorage),
    logger,
  });
  const window = createMainWindow(path.join(__dirname, PRELOAD_FILE_NAME), logger);
  connectPairingToWindow(core, window, os.networkInterfaces, logger);
  focusOnSecondLaunch(window);
  stopOnQuit(core);
}

function focusOnSecondLaunch(window: BrowserWindow): void {
  app.on('second-instance', () => {
    if (window.isDestroyed()) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  });
}

/** Closes the server before the process exits, which deletes partial uploads cleanly. */
function stopOnQuit(core: ServerCore): void {
  let stopped = false;
  app.on('will-quit', (event) => {
    if (stopped) {
      return;
    }
    event.preventDefault();
    core
      .stop()
      .catch((error: unknown) => {
        logger.error('could not stop the server', errorFields(error));
      })
      .finally(() => {
        stopped = true;
        app.quit();
      });
  });
}

// Both must be in place before the app is ready and before any window exists.
registerAppScheme();
installNavigationGuards();

// A second instance would compete for the port and the data files.
if (app.requestSingleInstanceLock()) {
  run().catch((error: unknown) => {
    logger.error('ilet could not start', errorFields(error));
    app.exit(EXIT_CODE_STARTUP_FAILED);
  });
} else {
  app.quit();
}

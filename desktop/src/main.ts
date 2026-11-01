import os from 'node:os';

import { app, safeStorage } from 'electron';

import { type ServerCore, startServerCore } from './app/serverCore';
import { createSafeStorageCipher } from './identity/safeStorageCipher';
import { ListenAddress } from './server/httpsServer';
import { createConsoleLogger, errorFields } from './shared/logger';

const logger = createConsoleLogger();
const EXIT_CODE_STARTUP_FAILED = 1;

async function run(): Promise<void> {
  await app.whenReady();
  const core = await startServerCore({
    dataFolder: app.getPath('userData'),
    downloadsFolder: app.getPath('downloads'),
    listenAddress: ListenAddress.allInterfaces,
    hostname: os.hostname(),
    platform: process.platform,
    secretCipher: createSafeStorageCipher(safeStorage),
    logger,
  });
  stopOnQuit(core);
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

// A second instance would compete for the port and the data files.
if (app.requestSingleInstanceLock()) {
  run().catch((error: unknown) => {
    logger.error('ilet could not start', errorFields(error));
    app.exit(EXIT_CODE_STARTUP_FAILED);
  });
} else {
  app.quit();
}

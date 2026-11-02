import { mkdir, stat } from 'node:fs/promises';

import { shell } from 'electron';

import { errorFields, type Logger } from '../shared/logger';

/** The Network & Internet page of Windows Settings, where the network profile can be changed. */
const NETWORK_SETTINGS_URI = 'ms-settings:network-status';

/** Opens a folder in Explorer. It must be a folder: `shell.openPath` would run a file. */
export async function openFolderInExplorer(folder: string, logger: Logger): Promise<void> {
  try {
    // The default folder appears only with the first file; opening it should work before that.
    await mkdir(folder, { recursive: true });
    if (!(await stat(folder)).isDirectory()) {
      logger.warn('not opened: not a folder', { folder });
      return;
    }
    const failure = await shell.openPath(folder);
    if (failure !== '') {
      logger.warn('could not open the folder', { reason: failure });
    }
  } catch (error) {
    logger.warn('could not open the folder', errorFields(error));
  }
}

/** Shows a received file selected in Explorer. Received files are never opened. */
export function revealInExplorer(filePath: string): void {
  shell.showItemInFolder(filePath);
}

export async function openNetworkSettings(logger: Logger): Promise<void> {
  try {
    await shell.openExternal(NETWORK_SETTINGS_URI);
  } catch (error) {
    logger.warn('could not open the network settings', errorFields(error));
  }
}

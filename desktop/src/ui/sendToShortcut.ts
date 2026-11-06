import path from 'node:path';

import { app, shell } from 'electron';

import type { Logger } from '../shared/logger';
import { END_OF_SWITCHES, SEND_TO_ARGUMENT, SEND_TO_SHORTCUT_NAME } from './sendToArguments';

/**
 * Adds "iPhone (ilet)" to Explorer's Send to menu for the current user, or refreshes it after an
 * update. Only the installed app does: a development build would point Explorer at Electron.
 * Returns whether the menu offers ilet.
 */
export function installSendToShortcut(description: string, logger: Logger): boolean {
  if (!app.isPackaged || process.platform !== 'win32') {
    return false;
  }
  const shortcut = path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'SendTo',
    SEND_TO_SHORTCUT_NAME,
  );
  const written = shell.writeShortcutLink(shortcut, 'create', {
    target: process.execPath,
    args: `${SEND_TO_ARGUMENT} ${END_OF_SWITCHES}`,
    description,
    icon: process.execPath,
    iconIndex: 0,
  });
  if (!written) {
    logger.warn('could not add ilet to the Send to menu');
  }
  return written;
}

import path from 'node:path';

import type { App } from 'electron';

import { type ReceiveFolderRules, windowsReceiveFolderRules } from '../settings/receiveFolder';

/** ilet's own folders are forbidden too: a file in its program folder could be loaded as code. */
export function receiveFolderRulesFor(app: Pick<App, 'getPath'>): ReceiveFolderRules {
  return windowsReceiveFolderRules({
    homeFolder: app.getPath('home'),
    appFolders: [path.dirname(app.getPath('exe')), app.getPath('userData')],
    env: process.env,
  });
}

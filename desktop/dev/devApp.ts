/**
 * DEVELOPMENT ONLY. The whole desktop app (window, tray, notifications) with the dev data,
 * listening on this PC only, and with a paired test phone, so everything can be tried without
 * an iPhone: send files with the printed curl command.
 */
import path from 'node:path';

import { startDesktopApp } from '../src/app/desktopApp';
import { DataFileName } from '../src/app/serverCore';
import { DeviceRegistry } from '../src/auth/deviceRegistry';
import { registerAppScheme } from '../src/ui/appProtocol';
import { installNavigationGuards } from '../src/ui/securityGuards';
import {
  describeDevServer,
  revokeDevicesNamed,
  runDevScript,
  uploadCommand,
  useDevDataFolder,
} from './devEnvironment';

const TEST_PHONE_NAME = 'Test iPhone (dev)';
/** The window's files, which npm run build bundles into dist/. */
const BUILD_FOLDER = path.join(__dirname, '..', '..', 'dist');

// Both must be in place before the app is ready, as in src/main.ts.
registerAppScheme();
installNavigationGuards();

runDevScript(async (logger) => {
  const dataFolder = await useDevDataFolder();
  // Paired before the app starts, like a phone that was paired on an earlier day.
  const devices = await DeviceRegistry.open(
    path.join(dataFolder, DataFileName.pairedDevices),
    () => new Date(),
  );
  await revokeDevicesNamed(devices, TEST_PHONE_NAME);
  const { token } = await devices.register(TEST_PHONE_NAME);

  const core = await startDesktopApp(
    {
      preload: path.join(BUILD_FOLDER, 'preload.js'),
      rendererFolder: path.join(BUILD_FOLDER, 'renderer'),
      appIcon: path.join(BUILD_FOLDER, 'icons', 'ilet.ico'),
      trayIcon: path.join(BUILD_FOLDER, 'icons', 'ilet-tray.ico'),
    },
    'this-pc',
    logger,
  );
  const server = await describeDevServer(core, dataFolder);
  process.stdout.write(
    [
      '',
      '=== ilet dev app (development only) ===',
      `Test phone:   ${TEST_PHONE_NAME}`,
      `Saving to:    ${core.settings.current.receiveFolder}`,
      '',
      'Send photo.jpg from the current folder as the test phone (another terminal):',
      `  ${uploadCommand(server, token)}`,
      '',
      'Quit from the tray icon, or press Ctrl+C here.',
      '',
    ].join('\n'),
  );
});

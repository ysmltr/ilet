import os from 'node:os';

import { getResponder } from '@homebridge/ciao';
import { app, safeStorage, session } from 'electron';

import { createTranslator, resolveLanguage, type Translate } from '../i18n/messages';
import { createSafeStorageCipher } from '../identity/safeStorageCipher';
import { NetworkMonitor } from '../network/networkMonitor';
import { createWindowsProfileReader, type NetworkProfileReader } from '../network/networkProfiles';
import { ListenAddress } from '../server/httpsServer';
import { createStartWithWindows, isHiddenStart } from '../settings/startWithWindows';
import { errorFields, type Logger } from '../shared/logger';
import { serveRendererAssets } from '../ui/appProtocol';
import { AppTray } from '../ui/appTray';
import { AppWindow } from '../ui/appWindow';
import { connectDevices } from '../ui/devicesIpc';
import { FileNotifications } from '../ui/fileNotifications';
import { createIpcGuard } from '../ui/ipcGuard';
import { createMainWindow } from '../ui/mainWindow';
import { connectNetwork } from '../ui/networkIpc';
import { connectPairing } from '../ui/pairingIpc';
import { lockDownSession } from '../ui/securityGuards';
import { connectSettings } from '../ui/settingsIpc';
import { openFolderInExplorer, openNetworkSettings, revealInExplorer } from '../ui/shellActions';
import { createToastPresenter } from '../ui/toastPresenter';
import { receiveFolderRulesFor } from './receiveFolderRules';
import { type ServerCore, startServerCore } from './serverCore';

/** Must match the installer's shortcut (electron-builder's appId), or notifications do not show. */
const APP_USER_MODEL_ID = 'com.ilet.desktop';
const DEFAULT_SYSTEM_ROOT = 'C:\\Windows';

export interface DesktopAppFiles {
  readonly preload: string;
  readonly rendererFolder: string;
  readonly appIcon: string;
  readonly trayIcon: string;
}

/** Composition root of the desktop app: network monitor, server, window, tray and notifications. */
export async function startDesktopApp(
  files: DesktopAppFiles,
  listenAddress: ListenAddress,
  logger: Logger,
): Promise<ServerCore> {
  // A development build has no Start menu shortcut, so Electron's own path stands in for it.
  app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath);
  const monitor = new NetworkMonitor({
    readProfiles: networkProfileReader(logger),
    networkInterfaces: os.networkInterfaces,
    logger,
  });
  // Runs while Electron starts, and finishes before the server listens on any network.
  const firstNetworkCheck = monitor.refresh();
  await app.whenReady();
  lockDownSession(session.defaultSession);
  serveRendererAssets(files.rendererFolder);
  await firstNetworkCheck;

  const core = await startServerCore({
    dataFolder: app.getPath('userData'),
    downloadsFolder: app.getPath('downloads'),
    listenAddress,
    // A server for this PC only has nothing to announce.
    createMdnsResponder:
      listenAddress === ListenAddress.allInterfaces
        ? (adapters) =>
            getResponder(adapters === undefined ? undefined : { interface: [...adapters] })
        : undefined,
    networkExposure: monitor.current,
    receiveFolderRules: receiveFolderRulesFor(app),
    hostname: os.hostname(),
    platform: process.platform,
    secretCipher: createSafeStorageCipher(safeStorage),
    logger,
  });
  monitor.onChange((exposure) => {
    void core.applyNetworkExposure(exposure);
  });
  monitor.start();

  const translate = createTranslator(resolveLanguage(app.getPreferredSystemLanguages()));
  const window = new AppWindow(() => createMainWindow(files.preload, files.appIcon, logger));
  const openReceiveFolder = (): Promise<void> =>
    openFolderInExplorer(core.settings.current.receiveFolder, logger);
  connectWindow({ core, monitor, window, translate, logger, openReceiveFolder });
  notifyAboutFiles(core, translate, files.appIcon);
  const tray = createTray(files.trayIcon, monitor, window, translate, openReceiveFolder);

  app.on('second-instance', () => {
    window.show();
  });
  stopOnQuit(core, monitor, window, tray, logger);
  if (!isHiddenStart(process.argv)) {
    window.show();
  }
  return core;
}

interface WindowParts {
  readonly core: ServerCore;
  readonly monitor: NetworkMonitor;
  readonly window: AppWindow;
  readonly translate: Translate;
  readonly logger: Logger;
  readonly openReceiveFolder: () => Promise<void>;
}

function connectWindow(parts: WindowParts): void {
  const { core, monitor, window, translate, logger } = parts;
  const guard = createIpcGuard((event) => window.isSender(event), logger);
  connectPairing(guard, core, window, os.networkInterfaces);
  connectDevices(guard, core.devices, window, translate);
  connectSettings(guard, core, window, createStartWithWindows(app), translate, {
    openReceiveFolder: parts.openReceiveFolder,
  });
  connectNetwork(guard, monitor, window, {
    openNetworkSettings: () => openNetworkSettings(logger),
  });
}

function notifyAboutFiles(core: ServerCore, translate: Translate, iconPath: string): void {
  const notifications = new FileNotifications({
    show: createToastPresenter(iconPath),
    reveal: revealInExplorer,
    translate,
  });
  core.onFileReceived((file, device) => {
    notifications.fileReceived({
      filePath: file.path,
      fileName: file.fileName,
      deviceName: device.name,
    });
  });
}

function createTray(
  iconPath: string,
  monitor: NetworkMonitor,
  window: AppWindow,
  translate: Translate,
  openReceiveFolder: () => Promise<void>,
): AppTray {
  const tray = new AppTray(iconPath, translate, {
    open: () => {
      window.show();
    },
    openReceiveFolder: () => {
      void openReceiveFolder();
    },
    quit: () => {
      app.quit();
    },
  });
  tray.showPublicNetworkWarning(monitor.current.publicNetworks.length > 0);
  monitor.onChange((exposure) => {
    tray.showPublicNetworkWarning(exposure.publicNetworks.length > 0);
  });
  return tray;
}

/** Withdraws the announcement and closes the server, which deletes partial uploads cleanly. */
function stopOnQuit(
  core: ServerCore,
  monitor: NetworkMonitor,
  window: AppWindow,
  tray: AppTray,
  logger: Logger,
): void {
  app.on('before-quit', () => {
    window.allowClosing();
  });
  app.on('will-quit', (event) => {
    event.preventDefault();
    monitor.stop();
    tray.destroy();
    // Electron ignores a second app.quit() after will-quit was prevented during a quit that
    // closed a window, so the app exits by itself once the server has stopped.
    core
      .stop()
      .catch((error: unknown) => {
        logger.error('could not stop the server', errorFields(error));
      })
      .finally(() => {
        app.exit();
      });
  });
}

function networkProfileReader(logger: Logger): NetworkProfileReader {
  if (process.platform !== 'win32') {
    return () => Promise.resolve(undefined);
  }
  return createWindowsProfileReader(process.env['SystemRoot'] ?? DEFAULT_SYSTEM_ROOT, logger);
}

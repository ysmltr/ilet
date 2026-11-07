import os from 'node:os';

import { getResponder } from '@homebridge/ciao';
import { app, safeStorage, session } from 'electron';

import { responderOptions } from '../discovery/serviceAdvertiser';
import { createTranslator, type Language, resolveLanguage, type Translate } from '../i18n/messages';
import { createSafeStorageCipher } from '../identity/safeStorageCipher';
import type { NetworkExposure } from '../network/networkExposure';
import { NetworkMonitor } from '../network/networkMonitor';
import { createWindowsProfileReader, type NetworkProfileReader } from '../network/networkProfiles';
import type { ListenPolicy } from '../network/serverReach';
import { createStartWithWindows, isHiddenStart } from '../settings/startWithWindows';
import { errorFields, type Logger } from '../shared/logger';
import { serveRendererAssets } from '../ui/appProtocol';
import { AppTray } from '../ui/appTray';
import { AppWindow } from '../ui/appWindow';
import { connectDevices } from '../ui/devicesIpc';
import { deliveryNotifications, FileNotifications } from '../ui/fileNotifications';
import { createIpcGuard } from '../ui/ipcGuard';
import { createMainWindow } from '../ui/mainWindow';
import { connectNetwork } from '../ui/networkIpc';
import { connectOutbox, type SendFlow } from '../ui/outboxIpc';
import { connectPairing } from '../ui/pairingIpc';
import { lockDownSession } from '../ui/securityGuards';
import { parseSendToRequest, sendToPaths } from '../ui/sendToArguments';
import { installSendToShortcut } from '../ui/sendToShortcut';
import { connectSettings } from '../ui/settingsIpc';
import {
  openFolderInExplorer,
  openNetworkSettings,
  openStartupSettings,
  revealInExplorer,
} from '../ui/shellActions';
import { createToastPresenter } from '../ui/toastPresenter';
import { firewallBlocksOtherNetworks, type Packaging, packagingOf } from './packaging';
import { receiveFolderRulesFor } from './receiveFolderRules';
import { type ServerCore, startServerCore } from './serverCore';

/** Must match the installer's shortcut (electron-builder's appId), or notifications do not show. */
const APP_USER_MODEL_ID = 'com.ilet.desktop';
const DEFAULT_SYSTEM_ROOT = 'C:\\Windows';

/** Phones on the local network, or only this PC (the development app). */
export type ServerScope = 'network' | 'this-pc';

export interface DesktopAppFiles {
  readonly preload: string;
  readonly rendererFolder: string;
  readonly appIcon: string;
  readonly trayIcon: string;
}

/** Composition root of the desktop app: network monitor, server, window, tray and notifications. */
export async function startDesktopApp(
  files: DesktopAppFiles,
  scope: ServerScope,
  logger: Logger,
): Promise<ServerCore> {
  const packaging = packagingOf(app.isPackaged, process.windowsStore);
  // A Store package's identity names the app for its notifications; another name would hide them.
  if (packaging !== 'store') {
    // A development build has no Start menu shortcut, so Electron's own path stands in for it.
    app.setAppUserModelId(packaging === 'installer' ? APP_USER_MODEL_ID : process.execPath);
  }
  const listenPolicy = listenPolicyFor(scope, packaging);
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
    listenPolicy,
    // A server for this PC only has nothing to announce.
    createMdnsResponder:
      listenPolicy === 'loopback'
        ? undefined
        : (adapters) => getResponder(responderOptions(adapters)),
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

  const language = resolveLanguage(app.getPreferredSystemLanguages());
  const translate = createTranslator(language);
  const window = new AppWindow(() => createMainWindow(files.preload, files.appIcon, logger));
  const openReceiveFolder = (): Promise<void> =>
    openFolderInExplorer(core.settings.current.receiveFolder, logger);
  // Windows keeps what a Store package writes in AppData private to it, so Explorer would never
  // see the shortcut there; the Store version has only the window (STORE.md).
  const sendToMenu =
    packaging === 'installer' && installSendToShortcut(translate('outboxTitle'), logger);
  const sendFlow = connectWindow({
    core,
    monitor,
    window,
    translate,
    language,
    packaging,
    sendToMenu,
    logger,
    openReceiveFolder,
  });
  notifyAboutFiles(core, window, translate, files.appIcon);
  const tray = createTray(files.trayIcon, monitor, window, translate, openReceiveFolder);

  app.on('second-instance', (_event, _argv, _workingDirectory, additionalData) => {
    const paths = parseSendToRequest(additionalData);
    if (paths === undefined) {
      window.show();
      return;
    }
    void sendFlow.sendFromExplorer(paths);
  });
  stopOnQuit(core, monitor, window, tray, logger);
  const startedWithFiles = sendToPaths(process.argv);
  if (startedWithFiles !== undefined) {
    // Explorer's Send to started ilet; the window opens to confirm the files.
    void sendFlow.sendFromExplorer(startedWithFiles);
  } else if (!isHiddenStart(process.argv)) {
    window.show();
  }
  return core;
}

interface WindowParts {
  readonly core: ServerCore;
  readonly monitor: NetworkMonitor;
  readonly window: AppWindow;
  readonly translate: Translate;
  readonly language: Language;
  readonly packaging: Packaging;
  readonly sendToMenu: boolean;
  readonly logger: Logger;
  readonly openReceiveFolder: () => Promise<void>;
}

function connectWindow(parts: WindowParts): SendFlow {
  const { core, monitor, window, translate, logger } = parts;
  const guard = createIpcGuard((event) => window.isSender(event), logger);
  connectPairing(guard, core, window, os.networkInterfaces);
  connectDevices(guard, core.devices, window, translate);
  connectSettings(guard, core, window, createStartWithWindows(app, parts.packaging), translate, {
    openReceiveFolder: parts.openReceiveFolder,
    openStartupSettings: () => openStartupSettings(logger),
  });
  connectNetwork(guard, monitor, window, {
    openNetworkSettings: () => openNetworkSettings(logger),
  });
  return connectOutbox({
    guard,
    core,
    window,
    translate,
    language: parts.language,
    sendToMenu: parts.sendToMenu,
    logger,
  });
}

function notifyAboutFiles(
  core: ServerCore,
  window: AppWindow,
  translate: Translate,
  iconPath: string,
): void {
  const show = createToastPresenter(iconPath);
  const received = new FileNotifications({ show, reveal: revealInExplorer, translate });
  core.onFileReceived((file, device) => {
    received.fileReceived({
      filePath: file.path,
      fileName: file.fileName,
      deviceName: device.name,
    });
  });
  const delivered = deliveryNotifications(show, translate, () => {
    window.show();
  });
  core.outbox.onDelivered(({ deviceId, name }) => {
    const device = core.devices.list().find(({ id }) => id === deviceId);
    if (device !== undefined) {
      delivered.add({ fileName: name, deviceName: device.name });
    }
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
  tray.showBlockedNetworkWarning(isBlockedSomewhere(monitor.current));
  monitor.onChange((exposure) => {
    tray.showBlockedNetworkWarning(isBlockedSomewhere(exposure));
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

/** Only the installer's firewall rules keep other networks out of a server on every address. */
function listenPolicyFor(scope: ServerScope, packaging: Packaging): ListenPolicy {
  if (scope === 'this-pc') {
    return 'loopback';
  }
  return firewallBlocksOtherNetworks(packaging) ? 'all-interfaces' : 'private-networks';
}

function networkProfileReader(logger: Logger): NetworkProfileReader {
  if (process.platform !== 'win32') {
    return () => Promise.resolve(undefined);
  }
  return createWindowsProfileReader(process.env['SystemRoot'] ?? DEFAULT_SYSTEM_ROOT, logger);
}

function isBlockedSomewhere({ publicNetworks, domainNetworks }: NetworkExposure): boolean {
  return publicNetworks.length > 0 || domainNetworks.length > 0;
}

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { DeviceRegistry } from '../auth/deviceRegistry';
import { Announcer } from '../discovery/announcer';
import type { MdnsResponderFactory } from '../discovery/serviceAdvertiser';
import { serviceAnnouncement } from '../discovery/serviceAnnouncement';
import { availableBytes } from '../files/diskSpace';
import { FileReceiver } from '../files/fileReceiver';
import { createUntrustedFileMarker } from '../files/markOfTheWeb';
import { removeStalePartFiles } from '../files/partialFiles';
import { loadOrCreateIdentity, type TlsIdentity } from '../identity/identityStore';
import type { SecretCipher } from '../identity/secretCipher';
import type { NetworkExposure } from '../network/networkExposure';
import { PairingCodes } from '../pairing/pairingCodes';
import { closeServer, listen, type ListenAddress } from '../server/httpsServer';
import { createIletServer } from '../server/iletServer';
import { normalizeAddress } from '../server/networkAddress';
import type { FileReceivedListener } from '../server/routes/uploadRoute';
import {
  checkReceiveFolder,
  isForbiddenReceiveFolder,
  type ReceiveFolderCheck,
  type ReceiveFolderRules,
} from '../settings/receiveFolder';
import { defaultSettings } from '../settings/settings';
import { SettingsStore } from '../settings/settingsStore';
import type { Logger } from '../shared/logger';

/** The files in the data folder. */
export const DataFileName = {
  identity: 'identity.json',
  settings: 'settings.json',
  pairedDevices: 'paired-devices.json',
} as const;

export interface ServerCoreEnvironment {
  /** Where identity, settings and paired devices are stored. */
  readonly dataFolder: string;
  readonly downloadsFolder: string;
  readonly listenAddress: ListenAddress;
  /**
   * Announces the server on the local network, so phones find it after its address changes.
   * Undefined when the server listens on this PC only (development scripts and tests).
   */
  readonly createMdnsResponder: MdnsResponderFactory | undefined;
  /** What the network monitor knows at startup; later changes arrive through the core. */
  readonly networkExposure: NetworkExposure;
  readonly receiveFolderRules: ReceiveFolderRules;
  readonly hostname: string;
  readonly platform: NodeJS.Platform;
  readonly secretCipher: SecretCipher;
  readonly logger: Logger;
}

export interface ServerCore {
  readonly identity: TlsIdentity;
  readonly settings: SettingsStore;
  readonly devices: DeviceRegistry;
  readonly pairingCodes: PairingCodes;
  /** Checks a folder the user picked and, only if it passes, saves files there from now on. */
  changeReceiveFolder(folder: string): Promise<ReceiveFolderCheck>;
  /** Follows the network monitor: where to announce, and which of this PC's addresses to refuse. */
  applyNetworkExposure(exposure: NetworkExposure): Promise<void>;
  onFileReceived(listener: FileReceivedListener): void;
  stop(): Promise<void>;
}

/** Composition root: loads the stored state, wires the modules together and starts listening. */
export async function startServerCore(environment: ServerCoreEnvironment): Promise<ServerCore> {
  const { dataFolder, logger } = environment;
  const markUntrusted = createUntrustedFileMarker(environment.platform);
  await mkdir(dataFolder, { recursive: true });

  const now = (): Date => new Date();
  const identity = await loadOrCreateIdentity(
    path.join(dataFolder, DataFileName.identity),
    environment.secretCipher,
    now,
  );
  const settings = await SettingsStore.open(
    path.join(dataFolder, DataFileName.settings),
    defaultSettings(environment),
  );
  await replaceForbiddenReceiveFolder(settings, environment);
  const devices = await DeviceRegistry.open(path.join(dataFolder, DataFileName.pairedDevices), now);

  const removedPartFiles = await removeStalePartFiles(settings.current.receiveFolder);
  if (removedPartFiles > 0) {
    logger.info('removed partial files from an earlier run', { count: removedPartFiles });
  }

  const receiver = new FileReceiver({
    policy: () => settings.current,
    markUntrusted,
    availableBytes,
    now,
    logger,
  });
  devices.onRevoked((deviceId) => {
    receiver.abortUploadsFrom(deviceId);
  });
  const pairingCodes = new PairingCodes(Date.now);

  let exposure = environment.networkExposure;
  const fileListeners = new Set<FileReceivedListener>();
  // Only the receive folder changes while the app runs, and the receiver reads it per upload.
  const { displayName, port } = settings.current;
  const server = createIletServer({
    identity,
    settings: settings.current,
    devices,
    pairingCodes,
    receiver,
    onFileReceived: (file, device) => {
      logger.info('file received', { device: device.name, bytes: file.sizeBytes });
      for (const listener of fileListeners) {
        listener(file, device);
      }
    },
    isBlockedLocalAddress: (address) => {
      const accepted = exposure.acceptedLocalAddresses;
      return accepted !== undefined && !accepted.has(normalizeAddress(address));
    },
    logger,
    now: Date.now,
  });
  await listen(server, environment.listenAddress, port, logger);
  logger.info('server listening', { port, fingerprint: identity.fingerprint });

  const { createMdnsResponder } = environment;
  const announcer =
    createMdnsResponder === undefined
      ? undefined
      : new Announcer(
          serviceAnnouncement({ deviceId: identity.deviceId, displayName, port }),
          createMdnsResponder,
          logger,
        );
  await announcer?.announceOn(exposure.announceOn);

  return {
    identity,
    settings,
    devices,
    pairingCodes,
    changeReceiveFolder: async (folder) => {
      const check = await checkReceiveFolder(
        folder,
        environment.receiveFolderRules,
        markUntrusted,
        logger,
      );
      if (check.ok) {
        await settings.update({ receiveFolder: check.folder });
        logger.info('receive folder changed', { folder: check.folder });
      }
      return check;
    },
    applyNetworkExposure: async (next) => {
      exposure = next;
      await announcer?.announceOn(next.announceOn);
    },
    onFileReceived: (listener) => {
      fileListeners.add(listener);
    },
    stop: async () => {
      // Withdrawn first, so phones are told the PC is gone before its port stops answering.
      await announcer?.stop();
      await closeServer(server);
    },
  };
}

/** A folder that is no longer allowed (PATH changed, or the file was edited) gives way to the default. */
async function replaceForbiddenReceiveFolder(
  settings: SettingsStore,
  environment: ServerCoreEnvironment,
): Promise<void> {
  const { receiveFolder } = settings.current;
  if (!isForbiddenReceiveFolder(receiveFolder, environment.receiveFolderRules)) {
    return;
  }
  environment.logger.warn('the receive folder is not allowed, using the default instead', {
    folder: receiveFolder,
  });
  await settings.update({ receiveFolder: defaultSettings(environment).receiveFolder });
}

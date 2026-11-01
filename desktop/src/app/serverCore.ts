import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { DeviceRegistry } from '../auth/deviceRegistry';
import { availableBytes } from '../files/diskSpace';
import { FileReceiver } from '../files/fileReceiver';
import { createUntrustedFileMarker } from '../files/markOfTheWeb';
import { removeStalePartFiles } from '../files/partialFiles';
import { loadOrCreateIdentity, type TlsIdentity } from '../identity/identityStore';
import type { SecretCipher } from '../identity/secretCipher';
import { PairingCodes } from '../pairing/pairingCodes';
import { closeServer, listen, type ListenAddress } from '../server/httpsServer';
import { createIletServer } from '../server/iletServer';
import { defaultSettings, loadOrCreateSettings, type Settings } from '../settings/settings';
import type { Logger } from '../shared/logger';

const DataFileName = {
  identity: 'identity.json',
  settings: 'settings.json',
  pairedDevices: 'paired-devices.json',
} as const;

export interface ServerCoreEnvironment {
  /** Where identity, settings and paired devices are stored. */
  readonly dataFolder: string;
  readonly downloadsFolder: string;
  readonly listenAddress: ListenAddress;
  readonly hostname: string;
  readonly platform: NodeJS.Platform;
  readonly secretCipher: SecretCipher;
  readonly logger: Logger;
}

export interface ServerCore {
  readonly identity: TlsIdentity;
  readonly settings: Settings;
  readonly devices: DeviceRegistry;
  readonly pairingCodes: PairingCodes;
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
  const settings = await loadOrCreateSettings(
    path.join(dataFolder, DataFileName.settings),
    defaultSettings(environment),
  );
  const devices = await DeviceRegistry.open(path.join(dataFolder, DataFileName.pairedDevices), now);

  const removedPartFiles = await removeStalePartFiles(settings.receiveFolder);
  if (removedPartFiles > 0) {
    logger.info('removed partial files from an earlier run', { count: removedPartFiles });
  }

  const receiver = new FileReceiver({
    policy: settings,
    markUntrusted,
    availableBytes,
    now,
    logger,
  });
  devices.onRevoked((deviceId) => {
    receiver.abortUploadsFrom(deviceId);
  });
  const pairingCodes = new PairingCodes(Date.now);

  const server = createIletServer({
    identity,
    settings,
    devices,
    pairingCodes,
    receiver,
    onFileReceived: (file, device) => {
      logger.info('file received', { device: device.name, bytes: file.sizeBytes });
    },
    logger,
    now: Date.now,
  });
  await listen(server, environment.listenAddress, settings.port, logger);
  logger.info('server listening', { port: settings.port, fingerprint: identity.fingerprint });

  return { identity, settings, devices, pairingCodes, stop: () => closeServer(server) };
}

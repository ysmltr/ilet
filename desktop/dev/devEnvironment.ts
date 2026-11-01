/**
 * DEVELOPMENT ONLY. Shared setup for the dev scripts. They are compiled to dist-dev/, which the
 * installer never includes, and they refuse to run in a packaged app.
 */
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import { type ServerCore, startServerCore } from '../src/app/serverCore';
import type { DeviceRegistry } from '../src/auth/deviceRegistry';
import { createSafeStorageCipher } from '../src/identity/safeStorageCipher';
import { ListenAddress } from '../src/server/httpsServer';
import { createConsoleLogger, errorFields, type Logger } from '../src/shared/logger';

/** Kept apart from the real app's data, so test devices never reach a real installation. */
const DEV_DATA_FOLDER_NAME = 'ilet-dev';
const DEV_CERTIFICATE_FILE_NAME = 'dev-certificate.pem';
const EXIT_CODE_FAILED = 1;

export interface DevServer {
  readonly core: ServerCore;
  readonly dataFolder: string;
  readonly baseUrl: string;
  /** For `curl --cacert`, with forward slashes so it works in every Windows shell. */
  readonly certificatePath: string;
}

export function runDevScript(main: (logger: Logger) => Promise<void>): void {
  const logger = createConsoleLogger();
  main(logger).catch((error: unknown) => {
    logger.error('dev script failed', errorFields(error));
    app.exit(EXIT_CODE_FAILED);
  });
}

/** Starts the server core with dev data, listening on this PC only. */
export async function startDevServer(logger: Logger): Promise<DevServer> {
  if (app.isPackaged) {
    throw new Error('Development scripts must never run in a packaged app.');
  }
  app.setPath('userData', path.join(app.getPath('appData'), DEV_DATA_FOLDER_NAME));
  await app.whenReady();

  const dataFolder = app.getPath('userData');
  const core = await startServerCore({
    dataFolder,
    downloadsFolder: app.getPath('downloads'),
    listenAddress: ListenAddress.loopback,
    hostname: os.hostname(),
    platform: process.platform,
    secretCipher: createSafeStorageCipher(safeStorage),
    logger,
  });
  const certificatePath = path.join(dataFolder, DEV_CERTIFICATE_FILE_NAME);
  await writeFile(certificatePath, core.identity.certificatePem);
  return {
    core,
    dataFolder,
    baseUrl: `https://${ListenAddress.loopback}:${String(core.settings.port)}`,
    certificatePath: forwardSlashes(certificatePath),
  };
}

/** Each run starts fresh, so devices left over from earlier runs stop working. */
export async function revokeDevicesNamed(devices: DeviceRegistry, name: string): Promise<void> {
  const earlier = devices.list().filter((device) => device.name === name);
  await Promise.all(earlier.map((device) => devices.revoke(device.id)));
}

export function curlCommand(server: DevServer, ...args: string[]): string {
  return ['curl.exe', '--cacert', `"${server.certificatePath}"`, ...args].join(' ');
}

export function forwardSlashes(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/**
 * DEVELOPMENT ONLY. Shared setup for the dev scripts. They are compiled to dist-dev/, which the
 * installer never includes, and they refuse to run in a packaged app.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import { receiveFolderRulesFor } from '../src/app/receiveFolderRules';
import { type ServerCore, startServerCore } from '../src/app/serverCore';
import type { DeviceRegistry } from '../src/auth/deviceRegistry';
import { createSafeStorageCipher } from '../src/identity/safeStorageCipher';
import { UNKNOWN_EXPOSURE } from '../src/network/networkExposure';
import { ApiPath } from '../src/protocol/constants';
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

/** Points the app at the dev data folder and returns it. Refuses to run in a packaged app. */
export async function useDevDataFolder(): Promise<string> {
  if (app.isPackaged) {
    throw new Error('Development scripts must never run in a packaged app.');
  }
  const dataFolder = path.join(app.getPath('appData'), DEV_DATA_FOLDER_NAME);
  app.setPath('userData', dataFolder);
  await mkdir(dataFolder, { recursive: true });
  return dataFolder;
}

/** Starts the server core with dev data, listening on this PC only. */
export async function startDevServer(logger: Logger): Promise<DevServer> {
  const dataFolder = await useDevDataFolder();
  await app.whenReady();
  const core = await startServerCore({
    dataFolder,
    downloadsFolder: app.getPath('downloads'),
    listenPolicy: 'loopback',
    createMdnsResponder: undefined,
    // Loopback only: no network can reach the server, so there is nothing to protect.
    networkExposure: UNKNOWN_EXPOSURE,
    receiveFolderRules: receiveFolderRulesFor(app),
    hostname: os.hostname(),
    platform: process.platform,
    secretCipher: createSafeStorageCipher(safeStorage),
    logger,
  });
  return describeDevServer(core, dataFolder);
}

/** What the printed curl commands need; writes the certificate for `curl --cacert`. */
export async function describeDevServer(core: ServerCore, dataFolder: string): Promise<DevServer> {
  const certificatePath = path.join(dataFolder, DEV_CERTIFICATE_FILE_NAME);
  await writeFile(certificatePath, core.identity.certificatePem);
  return {
    core,
    dataFolder,
    baseUrl: `https://${ListenAddress.loopback}:${String(core.settings.current.port)}`,
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

/** Sends photo.jpg from the current folder, as a paired phone would. */
export function uploadCommand(server: DevServer, token: string): string {
  return curlCommand(
    server,
    `-H "Authorization: Bearer ${token}"`,
    '-H "Content-Type: application/octet-stream"',
    '-H "Ilet-File-Name: photo.jpg"',
    '--data-binary "@photo.jpg"',
    `${server.baseUrl}${ApiPath.files}`,
  );
}

export function forwardSlashes(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

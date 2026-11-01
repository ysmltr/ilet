/**
 * DEVELOPMENT ONLY. Starts the server core and issues an access token for testing with curl.
 * It is compiled to dist-dev/, which the installer never includes, and it refuses to run in a
 * packaged app.
 */
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import { startServerCore } from '../src/app/serverCore';
import type { DeviceRegistry } from '../src/auth/deviceRegistry';
import { createSafeStorageCipher } from '../src/identity/safeStorageCipher';
import { ApiPath } from '../src/protocol/constants';
import { ListenAddress } from '../src/server/httpsServer';
import { createConsoleLogger, errorFields } from '../src/shared/logger';

/** Kept apart from the real app's data, so a test token never reaches a real installation. */
const DEV_DATA_FOLDER_NAME = 'ilet-dev';
const DEV_DEVICE_NAME = 'curl (dev token)';
const DEV_CERTIFICATE_FILE_NAME = 'dev-certificate.pem';
const EXIT_CODE_FAILED = 1;

const logger = createConsoleLogger();

async function run(): Promise<void> {
  if (app.isPackaged) {
    throw new Error('The dev token script must never run in a packaged app.');
  }
  app.setPath('userData', path.join(app.getPath('appData'), DEV_DATA_FOLDER_NAME));
  await app.whenReady();

  const core = await startServerCore({
    dataFolder: app.getPath('userData'),
    downloadsFolder: app.getPath('downloads'),
    // The test token must not be usable from other devices.
    listenAddress: ListenAddress.loopback,
    hostname: os.hostname(),
    platform: process.platform,
    secretCipher: createSafeStorageCipher(safeStorage),
    logger,
  });
  await revokeEarlierDevTokens(core.devices);
  const { token } = await core.devices.register(DEV_DEVICE_NAME);
  const certificatePath = path.join(app.getPath('userData'), DEV_CERTIFICATE_FILE_NAME);
  await writeFile(certificatePath, core.identity.certificatePem);

  process.stdout.write(
    instructions({
      token,
      certificatePath: certificatePath.replaceAll('\\', '/'),
      baseUrl: `https://${ListenAddress.loopback}:${String(core.settings.port)}`,
      fingerprint: core.identity.fingerprint,
      receiveFolder: core.settings.receiveFolder,
    }),
  );
}

/** Each run issues a fresh token, so earlier dev tokens stop working. */
async function revokeEarlierDevTokens(devices: DeviceRegistry): Promise<void> {
  const earlier = devices.list().filter((device) => device.name === DEV_DEVICE_NAME);
  await Promise.all(earlier.map((device) => devices.revoke(device.id)));
}

interface InstructionValues {
  readonly token: string;
  readonly certificatePath: string;
  readonly baseUrl: string;
  readonly fingerprint: string;
  readonly receiveFolder: string;
}

function instructions(values: InstructionValues): string {
  const curl = `curl.exe --cacert "${values.certificatePath}"`;
  const auth = `-H "Authorization: Bearer ${values.token}"`;
  return [
    '',
    '=== ilet dev server (development only) ===',
    `Test token:   ${values.token}`,
    `Fingerprint:  ${values.fingerprint}`,
    `Certificate:  ${values.certificatePath}`,
    `Saving to:    ${values.receiveFolder}`,
    '',
    'Try these in another terminal (PowerShell, cmd or Git Bash):',
    `  ${curl} ${values.baseUrl}${ApiPath.info}`,
    `  ${curl} ${auth} ${values.baseUrl}${ApiPath.status}`,
    `  ${curl} ${auth} -H "Content-Type: application/octet-stream" -H "Ilet-File-Name: photo.jpg" --data-binary "@photo.jpg" ${values.baseUrl}${ApiPath.files}`,
    '',
    'Press Ctrl+C to stop.',
    '',
  ].join('\n');
}

run().catch((error: unknown) => {
  logger.error('dev server failed', errorFields(error));
  app.exit(EXIT_CODE_FAILED);
});

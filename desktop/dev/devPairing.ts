/**
 * DEVELOPMENT ONLY. Starts a pairing code and shows what its QR code contains, so curl can play
 * the phone's part in pairing.
 */
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { selectPairingAddresses } from '../src/pairing/pairingAddresses';
import { pairingPayload } from '../src/pairing/pairingPayload';
import { ApiPath } from '../src/protocol/constants';
import {
  curlCommand,
  forwardSlashes,
  revokeDevicesNamed,
  runDevScript,
  startDevServer,
} from './devEnvironment';

const DEV_DEVICE_NAME = 'curl (dev pairing)';
const PAIR_REQUEST_FILE_NAME = 'pair-request.json';

runDevScript(async (logger) => {
  const server = await startDevServer(logger);
  const { core } = server;
  await revokeDevicesNamed(core.devices, DEV_DEVICE_NAME);

  const { secret, expiresAt } = core.pairingCodes.start();
  const payload = pairingPayload({
    deviceId: core.identity.deviceId,
    displayName: core.settings.displayName,
    addresses: selectPairingAddresses(os.networkInterfaces()),
    port: core.settings.port,
    fingerprint: core.identity.fingerprint,
    secret,
  });
  // A file avoids the different JSON quoting rules of PowerShell, cmd and Git Bash.
  const requestPath = path.join(server.dataFolder, PAIR_REQUEST_FILE_NAME);
  await writeFile(requestPath, JSON.stringify({ secret, deviceName: DEV_DEVICE_NAME }));

  core.devices.onRegistered((device) => {
    process.stdout.write(
      `\nPaired with "${device.name}". Try the same command again: it fails, because the code works only once.\n`,
    );
  });
  core.pairingCodes.onExpired(() => {
    process.stdout.write('\nThe pairing code expired. Run npm run dev:pair again for a new one.\n');
  });

  const pair = [
    '-H "Content-Type: application/json"',
    `--data-binary "@${forwardSlashes(requestPath)}"`,
    `${server.baseUrl}${ApiPath.pair}`,
  ].join(' ');
  const status = ['-H "Authorization: Bearer <token>"', `${server.baseUrl}${ApiPath.status}`];
  process.stdout.write(
    [
      '',
      '=== ilet dev pairing (development only) ===',
      `The pairing code is valid until ${new Date(expiresAt).toLocaleTimeString()}.`,
      'QR code content (this dev server itself listens on 127.0.0.1 only):',
      `  ${payload}`,
      '',
      'Pair like a phone would, in another terminal:',
      `  ${curlCommand(server, pair)}`,
      'It answers {"token":"..."}. Then use that token:',
      `  ${curlCommand(server, ...status)}`,
      '',
      'Press Ctrl+C to stop.',
      '',
    ].join('\n'),
  );
});

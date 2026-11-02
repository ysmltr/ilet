/** DEVELOPMENT ONLY. Starts the server core and issues an access token for testing with curl. */
import { ApiPath } from '../src/protocol/constants';
import {
  curlCommand,
  revokeDevicesNamed,
  runDevScript,
  startDevServer,
  uploadCommand,
} from './devEnvironment';

const DEV_DEVICE_NAME = 'curl (dev token)';

runDevScript(async (logger) => {
  const server = await startDevServer(logger);
  await revokeDevicesNamed(server.core.devices, DEV_DEVICE_NAME);
  const { token } = await server.core.devices.register(DEV_DEVICE_NAME);

  const auth = `-H "Authorization: Bearer ${token}"`;
  process.stdout.write(
    [
      '',
      '=== ilet dev server (development only) ===',
      `Test token:   ${token}`,
      `Fingerprint:  ${server.core.identity.fingerprint}`,
      `Certificate:  ${server.certificatePath}`,
      `Saving to:    ${server.core.settings.current.receiveFolder}`,
      '',
      'Try these in another terminal (PowerShell, cmd or Git Bash):',
      `  ${curlCommand(server, `${server.baseUrl}${ApiPath.info}`)}`,
      `  ${curlCommand(server, auth, `${server.baseUrl}${ApiPath.status}`)}`,
      `  ${uploadCommand(server, token)}`,
      '',
      'Press Ctrl+C to stop.',
      '',
    ].join('\n'),
  );
});

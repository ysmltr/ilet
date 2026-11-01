/** DEVELOPMENT ONLY. Starts the server core and issues an access token for testing with curl. */
import { ApiPath } from '../src/protocol/constants';
import { curlCommand, revokeDevicesNamed, runDevScript, startDevServer } from './devEnvironment';

const DEV_DEVICE_NAME = 'curl (dev token)';

runDevScript(async (logger) => {
  const server = await startDevServer(logger);
  await revokeDevicesNamed(server.core.devices, DEV_DEVICE_NAME);
  const { token } = await server.core.devices.register(DEV_DEVICE_NAME);

  const auth = `-H "Authorization: Bearer ${token}"`;
  const upload = [
    auth,
    '-H "Content-Type: application/octet-stream"',
    '-H "Ilet-File-Name: photo.jpg"',
    '--data-binary "@photo.jpg"',
  ].join(' ');
  process.stdout.write(
    [
      '',
      '=== ilet dev server (development only) ===',
      `Test token:   ${token}`,
      `Fingerprint:  ${server.core.identity.fingerprint}`,
      `Certificate:  ${server.certificatePath}`,
      `Saving to:    ${server.core.settings.receiveFolder}`,
      '',
      'Try these in another terminal (PowerShell, cmd or Git Bash):',
      `  ${curlCommand(server, `${server.baseUrl}${ApiPath.info}`)}`,
      `  ${curlCommand(server, auth, `${server.baseUrl}${ApiPath.status}`)}`,
      `  ${curlCommand(server, upload, `${server.baseUrl}${ApiPath.files}`)}`,
      '',
      'Press Ctrl+C to stop.',
      '',
    ].join('\n'),
  );
});

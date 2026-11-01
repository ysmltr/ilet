import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { type AddressInfo, createServer, type Server } from 'node:net';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ServerCoreEnvironment, startServerCore } from '../../src/app/serverCore';
import { newPartFileName } from '../../src/files/partialFiles';
import { ListenAddress } from '../../src/server/httpsServer';
import { defaultSettings } from '../../src/settings/settings';
import { StartupError } from '../../src/shared/errors';
import { createMemoryLogger, createTempFolder, fakeCipher } from '../helpers/fakes';
import { sendRequest } from '../helpers/testServer';

const runsOnWindows = process.platform === 'win32';

/** Binds the same address the server core uses in these tests, so the port really is taken. */
async function listenOnRandomPort(): Promise<{ server: Server; port: number }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, ListenAddress.loopback, resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

async function closeNetServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

async function freePort(): Promise<number> {
  const { server, port } = await listenOnRandomPort();
  await closeNetServer(server);
  return port;
}

/** A fresh data folder whose settings file uses `port` instead of the default port. */
async function createEnvironment(
  port: number,
  platform: NodeJS.Platform = 'win32',
): Promise<ServerCoreEnvironment> {
  const root = await createTempFolder();
  const dataFolder = path.join(root, 'data');
  const downloadsFolder = path.join(root, 'Downloads');
  const settings = { ...defaultSettings({ hostname: 'TEST-PC', downloadsFolder }), port };
  await mkdir(dataFolder, { recursive: true });
  await writeFile(
    path.join(dataFolder, 'settings.json'),
    JSON.stringify({ formatVersion: 1, ...settings }),
  );
  return {
    dataFolder,
    downloadsFolder,
    listenAddress: ListenAddress.loopback,
    hostname: 'TEST-PC',
    platform,
    secretCipher: fakeCipher,
    logger: createMemoryLogger(),
  };
}

async function startupError(environment: ServerCoreEnvironment): Promise<StartupError> {
  const error: unknown = await startServerCore(environment).then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(StartupError);
  return error as StartupError;
}

describe('startServerCore', () => {
  it.runIf(runsOnWindows)('starts, serves /api/info and stops', async () => {
    const port = await freePort();
    const core = await startServerCore(await createEnvironment(port));
    try {
      const response = await sendRequest(port, core.identity.certificatePem, { path: '/api/info' });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ deviceId: core.identity.deviceId });
    } finally {
      await core.stop();
    }
  });

  it.runIf(runsOnWindows)('removes partial files left by a crash', async () => {
    const environment = await createEnvironment(await freePort());
    const receiveFolder = path.join(environment.downloadsFolder, 'ilet');
    await mkdir(receiveFolder, { recursive: true });
    await writeFile(path.join(receiveFolder, newPartFileName()), 'partial');

    const core = await startServerCore(environment);
    await core.stop();

    expect(await readdir(receiveFolder)).toEqual([]);
  });

  it.runIf(runsOnWindows)('reports a busy port clearly', async () => {
    const { server: blocker, port } = await listenOnRandomPort();
    try {
      expect((await startupError(await createEnvironment(port))).code).toBe('port_in_use');
    } finally {
      await closeNetServer(blocker);
    }
  });

  it('refuses to run where received files cannot be marked as untrusted', async () => {
    const environment = await createEnvironment(await freePort(), 'linux');
    expect((await startupError(environment)).code).toBe('unsupported_platform');
  });
});

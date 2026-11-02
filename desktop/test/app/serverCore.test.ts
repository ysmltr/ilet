import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { type AddressInfo, createServer, type Server } from 'node:net';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ServerCoreEnvironment, startServerCore } from '../../src/app/serverCore';
import { newPartFileName } from '../../src/files/partialFiles';
import { type NetworkExposure, UNKNOWN_EXPOSURE } from '../../src/network/networkExposure';
import { ListenAddress } from '../../src/server/httpsServer';
import type { ReceiveFolderRules } from '../../src/settings/receiveFolder';
import { defaultSettings, type Settings } from '../../src/settings/settings';
import { StartupError } from '../../src/shared/errors';
import { FakeMdnsResponder } from '../helpers/fakeMdns';
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

/** Forbids only what a test adds; real rules would forbid the temporary folder (in AppData). */
const NO_FOLDER_RULES: ReceiveFolderRules = {
  forbiddenTrees: [],
  forbiddenFolders: [],
  homeFolder: 'C:\\NoHome',
  ignoreCase: true,
};

/** A fresh data folder whose settings file uses `port` instead of the default port. */
async function createEnvironment(
  port: number,
  platform: NodeJS.Platform = 'win32',
  storedSettings: Partial<Settings> = {},
): Promise<ServerCoreEnvironment> {
  const root = await createTempFolder();
  const dataFolder = path.join(root, 'data');
  const downloadsFolder = path.join(root, 'Downloads');
  const settings = {
    ...defaultSettings({ hostname: 'TEST-PC', downloadsFolder }),
    port,
    ...storedSettings,
  };
  await mkdir(dataFolder, { recursive: true });
  await writeFile(
    path.join(dataFolder, 'settings.json'),
    JSON.stringify({ formatVersion: 1, ...settings }),
  );
  return {
    dataFolder,
    downloadsFolder,
    listenAddress: ListenAddress.loopback,
    createMdnsResponder: undefined,
    networkExposure: UNKNOWN_EXPOSURE,
    receiveFolderRules: NO_FOLDER_RULES,
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

  it.runIf(runsOnWindows)(
    'announces the server and withdraws the announcement on stop',
    async () => {
      const port = await freePort();
      const responder = new FakeMdnsResponder();
      const core = await startServerCore({
        ...(await createEnvironment(port)),
        createMdnsResponder: () => responder,
      });
      const { deviceId } = core.identity;
      await core.stop();

      expect(responder.definitions).toEqual([
        {
          name: 'TEST-PC',
          type: 'ilet',
          hostname: `ilet-${deviceId.slice(0, 8)}`,
          port,
          txt: { id: deviceId, name: 'TEST-PC' },
        },
      ]);
      expect(responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
    },
  );

  it.runIf(runsOnWindows)('removes partial files left by a crash', async () => {
    const environment = await createEnvironment(await freePort());
    const receiveFolder = path.join(environment.downloadsFolder, 'ilet');
    await mkdir(receiveFolder, { recursive: true });
    await writeFile(path.join(receiveFolder, newPartFileName()), 'partial');

    const core = await startServerCore(environment);
    await core.stop();

    expect(await readdir(receiveFolder)).toEqual([]);
  });

  it.runIf(runsOnWindows)('announces only on the adapters the network allows', async () => {
    const created: { adapters: readonly string[] | undefined; responder: FakeMdnsResponder }[] = [];
    const exposure: NetworkExposure = {
      announceOn: ['Ethernet'],
      acceptedLocalAddresses: undefined,
      publicNetworks: [],
      domainNetworks: [],
    };
    const core = await startServerCore({
      ...(await createEnvironment(await freePort())),
      networkExposure: exposure,
      createMdnsResponder: (adapters) => {
        const responder = new FakeMdnsResponder();
        created.push({ adapters, responder });
        return responder;
      },
    });

    // The PC joined a Public network and left the Private one.
    await core.applyNetworkExposure({ ...exposure, announceOn: [] });
    await core.stop();

    expect(created.map(({ adapters }) => adapters)).toEqual([['Ethernet']]);
    expect(created[0]?.responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
  });

  it.runIf(runsOnWindows)('refuses connections on addresses outside Private networks', async () => {
    const port = await freePort();
    const core = await startServerCore(await createEnvironment(port));
    const fetchInfo = () => sendRequest(port, core.identity.certificatePem, { path: '/api/info' });
    try {
      await core.applyNetworkExposure({
        announceOn: [],
        acceptedLocalAddresses: new Set(['192.168.1.20']),
        publicNetworks: ['Wi-Fi'],
        domainNetworks: [],
      });
      await expect(fetchInfo()).rejects.toThrow();

      await core.applyNetworkExposure(UNKNOWN_EXPOSURE);
      expect((await fetchInfo()).status).toBe(200);
    } finally {
      await core.stop();
    }
  });

  it.runIf(runsOnWindows)('changes the receive folder only after checking it', async () => {
    const environment = await createEnvironment(await freePort());
    const allowed = await createTempFolder();
    const forbidden = await createTempFolder();
    const core = await startServerCore({
      ...environment,
      receiveFolderRules: { ...NO_FOLDER_RULES, forbiddenTrees: [forbidden] },
    });
    try {
      expect(await core.changeReceiveFolder(forbidden)).toEqual({
        ok: false,
        problem: 'system-folder',
      });
      expect(core.settings.current.receiveFolder).toBe(
        path.join(environment.downloadsFolder, 'ilet'),
      );

      expect((await core.changeReceiveFolder(allowed)).ok).toBe(true);
      expect(core.settings.current.receiveFolder).toBe(await realpath(allowed));
    } finally {
      await core.stop();
    }
  });

  it.runIf(runsOnWindows)('replaces a stored receive folder that is not allowed', async () => {
    const forbidden = await createTempFolder();
    const environment = await createEnvironment(await freePort(), 'win32', {
      receiveFolder: path.join(forbidden, 'Startup'),
    });
    const logger = createMemoryLogger();
    const core = await startServerCore({
      ...environment,
      receiveFolderRules: { ...NO_FOLDER_RULES, forbiddenTrees: [forbidden] },
      logger,
    });
    await core.stop();

    const defaultFolder = path.join(environment.downloadsFolder, 'ilet');
    expect(core.settings.current.receiveFolder).toBe(defaultFolder);
    const saved: unknown = JSON.parse(
      await readFile(path.join(environment.dataFolder, 'settings.json'), 'utf8'),
    );
    expect(saved).toMatchObject({ receiveFolder: defaultFolder });
    expect(logger.lines.join('\n')).toContain('the receive folder is not allowed');
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

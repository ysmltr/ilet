import { randomUUID, X509Certificate } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { afterEach } from 'vitest';

import { DeviceRegistry, type PairedDevice } from '../../src/auth/deviceRegistry';
import { FileReceiver, type ReceivedFile } from '../../src/files/fileReceiver';
import { writeZoneIdentifier, type UntrustedFileMarker } from '../../src/files/markOfTheWeb';
import {
  certificateFingerprint,
  createSelfSignedCertificate,
} from '../../src/identity/certificate';
import { Outbox } from '../../src/outbox/outbox';
import { PairingCodes } from '../../src/pairing/pairingCodes';
import { SERVER_LIMITS } from '../../src/protocol/constants';
import {
  type BlockedLocalAddressCheck,
  closeServer,
  listen,
  ListenAddress,
  type ServerLimits,
} from '../../src/server/httpsServer';
import { createIletServer } from '../../src/server/iletServer';
import { defaultSettings, type Settings } from '../../src/settings/settings';
import { createMemoryLogger, createTempFolder, type MemoryLogger } from './fakes';

const RANDOM_FREE_PORT = 0;

export interface TestRequest {
  readonly method?: string;
  readonly path: string;
  readonly headers?: OutgoingHttpHeaders;
  readonly body?: Buffer | string;
  /** Behave like a client that ignores certificate names (an attacker would). */
  readonly skipHostnameCheck?: boolean;
  /** The server's address; 127.0.0.1 unless a test listens on another one. */
  readonly host?: string;
}

export interface TestResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

export interface TestServerOptions {
  readonly settings?: Partial<Settings>;
  readonly limits?: Partial<ServerLimits>;
  readonly markUntrusted?: UntrustedFileMarker;
  readonly isBlockedLocalAddress?: BlockedLocalAddressCheck;
  /** The outbox's clock; real time by default. */
  readonly now?: () => Date;
}

export interface TestServer {
  readonly port: number;
  readonly certificatePem: string;
  readonly deviceId: string;
  readonly receiveFolder: string;
  readonly devices: DeviceRegistry;
  readonly pairingCodes: PairingCodes;
  readonly outbox: Outbox;
  /** Where files to send are placed before the tests queue them. */
  readonly sourceFolder: string;
  readonly device: PairedDevice;
  readonly token: string;
  readonly logger: MemoryLogger;
  readonly received: ReceivedFile[];
  send(request: TestRequest): Promise<TestResponse>;
  upload(
    fileName: string,
    content: Buffer | string,
    headers?: OutgoingHttpHeaders,
  ): Promise<TestResponse>;
  uploadHeaders(fileName: string, sizeBytes: number): OutgoingHttpHeaders;
}

const markIfSupported: UntrustedFileMarker = (filePath) =>
  process.platform === 'win32' ? writeZoneIdentifier(filePath) : Promise.resolve();

/** A complete server on a random port with one paired device, stopped after the test. */
export async function startTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const folder = await createTempFolder();
  const logger = createMemoryLogger();
  const { certificatePem, privateKeyPem } = createSelfSignedCertificate(new Date());
  const identity = {
    deviceId: randomUUID(),
    certificatePem,
    privateKeyPem,
    fingerprint: certificateFingerprint(new X509Certificate(certificatePem)),
  };
  const settings: Settings = {
    ...defaultSettings({ hostname: 'TEST-PC', downloadsFolder: folder }),
    maxFileSizeBytes: 1024 * 1024,
    ...options.settings,
  };
  const devices = await DeviceRegistry.open(
    path.join(folder, 'paired-devices.json'),
    () => new Date(),
  );
  const { device, token } = await devices.register('Test iPhone');
  const receiver = new FileReceiver({
    policy: () => settings,
    markUntrusted: options.markUntrusted ?? markIfSupported,
    availableBytes: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
    now: () => new Date(),
    logger,
  });
  const now = options.now ?? ((): Date => new Date());
  const outbox = await Outbox.open({
    folder: path.join(folder, 'outbox'),
    listFile: path.join(folder, 'outbox.json'),
    isPaired: (deviceId) => devices.has(deviceId),
    maxFileSizeBytes: () => settings.maxFileSizeBytes,
    availableBytes: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
    now,
    logger,
  });
  devices.onRevoked((deviceId) => {
    receiver.abortUploadsFrom(deviceId);
    void outbox.removeDevice(deviceId);
  });
  const sourceFolder = path.join(folder, 'to-send');
  await mkdir(sourceFolder);
  const received: ReceivedFile[] = [];
  const pairingCodes = new PairingCodes(Date.now);
  afterEach(() => {
    pairingCodes.cancel();
  });
  const server = createIletServer({
    identity,
    settings,
    devices,
    pairingCodes,
    receiver,
    outbox,
    onFileReceived: (file) => received.push(file),
    isBlockedLocalAddress: options.isBlockedLocalAddress ?? (() => false),
    logger,
    now: Date.now,
    limits: { ...SERVER_LIMITS, ...options.limits },
  });
  await listen(server, ListenAddress.loopback, RANDOM_FREE_PORT, logger);
  afterEach(() => closeServer(server));
  const port = (server.address() as AddressInfo).port;

  const send = (request: TestRequest): Promise<TestResponse> =>
    sendRequest(port, certificatePem, request);
  const uploadHeaders = (fileName: string, sizeBytes: number): OutgoingHttpHeaders => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/octet-stream',
    'Content-Length': sizeBytes,
    'Ilet-File-Name': encodeURIComponent(fileName),
  });
  return {
    port,
    certificatePem,
    deviceId: identity.deviceId,
    receiveFolder: settings.receiveFolder,
    devices,
    pairingCodes,
    outbox,
    sourceFolder,
    device,
    token,
    logger,
    received,
    send,
    uploadHeaders,
    upload: (fileName, content, headers = {}) =>
      send({
        method: 'POST',
        path: '/api/v1/files',
        headers: { ...uploadHeaders(fileName, Buffer.byteLength(content)), ...headers },
        body: content,
      }),
  };
}

export function sendRequest(
  port: number,
  certificatePem: string,
  {
    method = 'GET',
    path: requestPath,
    headers = {},
    body,
    skipHostnameCheck = false,
    host = '127.0.0.1',
  }: TestRequest,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        host,
        port,
        method,
        path: requestPath,
        headers,
        ca: certificatePem,
        agent: false,
        ...(skipHostnameCheck ? { checkServerIdentity: () => undefined } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

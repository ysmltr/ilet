import type { OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { describe, expect, it } from 'vitest';

import { issueSecret } from '../../src/auth/secrets';
import { startTestServer, type TestResponse, type TestServer } from '../helpers/testServer';

const PAIR_PATH = '/api/v1/pair';
const MAX_JSON_BODY_BYTES = 4 * 1024;

function pair(
  server: TestServer,
  body: string,
  headers: OutgoingHttpHeaders = {},
): Promise<TestResponse> {
  return server.send({
    method: 'POST',
    path: PAIR_PATH,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...headers,
    },
    body,
  });
}

function pairWith(server: TestServer, secret: string, deviceName = 'Yeşim’s iPhone') {
  return pair(server, JSON.stringify({ secret, deviceName }));
}

/** Sends the headers and part of the body, then goes quiet. */
function startSlowPairRequest(server: TestServer): Promise<string> {
  return new Promise((resolve) => {
    const request = httpsRequest({
      host: '127.0.0.1',
      port: server.port,
      method: 'POST',
      path: PAIR_PATH,
      headers: { 'Content-Type': 'application/json', 'Content-Length': 100 },
      ca: server.certificatePem,
      agent: false,
    });
    request.on('response', (response) => {
      response.resume();
      resolve(`status ${String(response.statusCode)}`);
    });
    request.on('error', (error) => {
      resolve(`error ${error.message}`);
    });
    request.write('{"secret":');
  });
}

describe('POST /api/v1/pair', () => {
  it('is closed while no pairing code is on screen', async () => {
    const server = await startTestServer();
    const response = await pairWith(server, issueSecret().value);

    expect(response.status).toBe(403);
    expect(response.body).toBe('{"error":"pairing_rejected"}');
    expect(response.headers.connection).toBe('close');
  });

  it('pairs a device and returns a token that works', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();

    const response = await pairWith(server, secret, '  Yeşim’s‮ iPhone ');

    expect(response.status).toBe(201);
    const { token } = JSON.parse(response.body) as { token: string };
    const status = await server.send({
      path: '/api/v1/status',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status.status).toBe(200);
    expect(JSON.parse(status.body)).toMatchObject({ pairedDevice: { name: 'Yeşim’s iPhone' } });
  });

  it('accepts the secret only once', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();

    expect((await pairWith(server, secret)).status).toBe(201);
    expect((await pairWith(server, secret)).status).toBe(403);
  });

  it('rejects a wrong secret but keeps the code usable', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();

    expect((await pairWith(server, issueSecret().value)).status).toBe(403);
    expect((await pairWith(server, secret)).status).toBe(201);
  });

  it('rejects the secret after the code was closed', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    server.pairingCodes.cancel();

    expect((await pairWith(server, secret)).status).toBe(403);
  });

  it.each([
    ['not JSON', '{"secret":'],
    ['a JSON array', '[]'],
    ['a missing device name', '{"secret":"SECRET"}'],
    ['an invisible device name', '{"secret":"SECRET","deviceName":"\\u200b\\u0000"}'],
    ['a secret that is not a string', '{"secret":42,"deviceName":"iPhone"}'],
  ])('rejects %s without using up the code', async (_description, body) => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();

    const response = await pair(server, body.replace('SECRET', secret));

    expect(response.status).toBe(400);
    expect(response.body).toBe('{"error":"invalid_request"}');
    expect((await pairWith(server, secret)).status).toBe(201);
  });

  it('ignores unknown fields', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    const response = await pair(
      server,
      JSON.stringify({ secret, deviceName: 'iPhone', futureField: true }),
    );
    expect(response.status).toBe(201);
  });

  it('requires a JSON content type', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    const body = JSON.stringify({ secret, deviceName: 'iPhone' });
    expect((await pair(server, body, { 'Content-Type': 'text/plain' })).status).toBe(415);
  });

  it('refuses bodies larger than 4 KiB', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    const body = JSON.stringify({ secret, deviceName: 'x'.repeat(MAX_JSON_BODY_BYTES) });
    expect((await pair(server, body)).status).toBe(413);
  });

  it('requires Content-Length', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    const body = JSON.stringify({ secret, deviceName: 'iPhone' });
    const response = await server.send({
      method: 'POST',
      path: PAIR_PATH,
      headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
      body,
    });
    expect(response.status).toBe(411);
  });

  it('closes the connection when the body arrives too slowly, keeping the code', async () => {
    const server = await startTestServer({ limits: { jsonBodyTimeoutMs: 300 } });
    const { secret } = server.pairingCodes.start();

    expect(await startSlowPairRequest(server)).toMatch(/^error/);
    expect((await pairWith(server, secret)).status).toBe(201);
  });

  it('rate-limits failed attempts, even with the right secret afterwards', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await pairWith(server, issueSecret().value)).status).toBe(403);
    }

    const blocked = await pairWith(server, secret);

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(server.pairingCodes.isActive()).toBe(true);
  });

  it('never writes the secret or the token to the log', async () => {
    const server = await startTestServer();
    const { secret } = server.pairingCodes.start();
    await pairWith(server, issueSecret().value);
    const response = await pairWith(server, secret);
    const { token } = JSON.parse(response.body) as { token: string };

    const log = server.logger.lines.join('\n');
    expect(log).toContain('device paired');
    expect(log).not.toContain(secret);
    expect(log).not.toContain(token);
  });
});

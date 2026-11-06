import { writeFile } from 'node:fs/promises';
import type { OutgoingHttpHeaders } from 'node:http';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { OutboxEntry } from '../../src/outbox/outbox';
import { startTestServer, type TestServer } from '../helpers/testServer';

const json = (body: string): unknown => JSON.parse(body);

const auth = (token: string): OutgoingHttpHeaders => ({ Authorization: `Bearer ${token}` });

async function queue(
  server: TestServer,
  name: string,
  content: string,
  deviceId = server.device.id,
): Promise<OutboxEntry> {
  const source = path.join(server.sourceFolder, name);
  await writeFile(source, content);
  const { queued } = await server.outbox.send(deviceId, [source]);
  const [entry] = queued;
  if (entry === undefined) {
    throw new Error('the file was not queued');
  }
  return entry;
}

function download(server: TestServer, headers: OutgoingHttpHeaders, token = server.token) {
  return server.send({ path: '/api/v1/outbox/file', headers: { ...auth(token), ...headers } });
}

function confirm(server: TestServer, body: string, headers: OutgoingHttpHeaders = {}) {
  return server.send({
    method: 'POST',
    path: '/api/v1/outbox/received',
    headers: {
      ...auth(server.token),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...headers,
    },
    body,
  });
}

describe('outbox endpoints', () => {
  it('require a token', async () => {
    const server = await startTestServer();
    const entry = await queue(server, 'a.txt', 'a');
    const list = await server.send({ path: '/api/v1/outbox' });
    const file = await server.send({
      path: '/api/v1/outbox/file',
      headers: { 'Ilet-File-Id': entry.id },
    });
    const received = await confirm(server, JSON.stringify({ id: entry.id }), {
      Authorization: 'Bearer wrong',
    });
    expect([list.status, file.status, received.status]).toEqual([401, 401, 401]);
    expect(server.outbox.list()).toEqual([entry]);
  });

  it('list only the files waiting for the device that asks, oldest first', async () => {
    const server = await startTestServer();
    const other = await server.devices.register('Other iPhone');
    const first = await queue(server, 'first.txt', 'first');
    await queue(server, 'theirs.txt', 'theirs', other.device.id);
    const second = await queue(server, 'second.txt', 'second!');

    const response = await server.send({ path: '/api/v1/outbox', headers: auth(server.token) });
    expect(response.status).toBe(200);
    const { id, name, sizeBytes, queuedAt, expiresAt } = first;
    expect(json(response.body)).toEqual({
      files: [
        { id, name, sizeBytes, queuedAt, expiresAt },
        {
          id: second.id,
          name: 'second.txt',
          sizeBytes: 7,
          queuedAt: second.queuedAt,
          expiresAt: second.expiresAt,
        },
      ],
    });
  });

  it('download a file by its ID, with its exact length, and keep it until confirmed', async () => {
    const server = await startTestServer();
    const entry = await queue(server, 'report.txt', 'report content');

    const response = await download(server, { 'Ilet-File-Id': entry.id });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-length']).toBe('14');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toBe('report content');
    expect(server.outbox.list()).toEqual([entry]);
  });

  it('download an empty file', async () => {
    const server = await startTestServer();
    const entry = await queue(server, 'empty.txt', '');
    const response = await download(server, { 'Ilet-File-Id': entry.id });
    expect(response.status).toBe(200);
    expect(response.headers['content-length']).toBe('0');
    expect(response.body).toBe('');
  });

  it.each([
    ['a missing', {}],
    ['a path as', { 'Ilet-File-Id': '..\\..\\paired-devices.json' }],
    ['an upper-case', { 'Ilet-File-Id': 'A'.repeat(32) }],
    ['a repeated', { 'Ilet-File-Id': ['a'.repeat(32), 'a'.repeat(32)] }],
  ])('refuse %s file ID', async (_, headers: OutgoingHttpHeaders) => {
    const server = await startTestServer();
    const response = await download(server, headers);
    expect(response.status).toBe(400);
    expect(json(response.body)).toEqual({ error: 'invalid_request' });
  });

  it("answer 410 for another device's file, just as for an unknown one", async () => {
    const server = await startTestServer();
    const other = await server.devices.register('Other iPhone');
    const theirs = await queue(server, 'theirs.txt', 'private', other.device.id);

    const response = await download(server, { 'Ilet-File-Id': theirs.id });
    const unknown = await download(server, { 'Ilet-File-Id': 'b'.repeat(32) });
    expect(response.status).toBe(410);
    expect(unknown.status).toBe(410);
    expect(response.body).toBe('{"error":"file_gone"}');
    expect(response.body).toBe(unknown.body);
  });

  it('confirm a file, which deletes it; a repeated confirmation gets the same answer', async () => {
    const server = await startTestServer();
    const entry = await queue(server, 'a.txt', 'a');

    const first = await confirm(server, JSON.stringify({ id: entry.id }));
    const repeated = await confirm(server, JSON.stringify({ id: entry.id }));
    expect([first.status, first.body]).toEqual([200, '{}']);
    expect([repeated.status, repeated.body]).toEqual([200, '{}']);
    expect(server.outbox.list()).toEqual([]);
    expect((await download(server, { 'Ilet-File-Id': entry.id })).status).toBe(410);
  });

  it("cannot confirm another device's file", async () => {
    const server = await startTestServer();
    const other = await server.devices.register('Other iPhone');
    const theirs = await queue(server, 'theirs.txt', 'private', other.device.id);

    const response = await confirm(server, JSON.stringify({ id: theirs.id }));
    expect(response.status).toBe(200);
    expect(server.outbox.list()).toEqual([theirs]);
  });

  it.each([
    ['is not JSON', '{ id', {}, 400],
    ['has no valid ID', JSON.stringify({ id: 42 }), {}, 400],
    ['is an array', JSON.stringify(['a'.repeat(32)]), {}, 400],
    ['is not declared as JSON', '{}', { 'Content-Type': 'text/plain' }, 415],
    ['is too large', JSON.stringify({ id: 'a'.repeat(5000) }), {}, 413],
  ])(
    'refuse a confirmation that %s',
    async (_, body: string, headers: OutgoingHttpHeaders, status: number) => {
      const server = await startTestServer();
      const response = await confirm(server, body, headers);
      expect(response.status).toBe(status);
    },
  );

  it('stop serving the files of a removed device at once', async () => {
    const server = await startTestServer();
    const entry = await queue(server, 'a.txt', 'a');
    await server.devices.revoke(server.device.id);

    const response = await download(server, { 'Ilet-File-Id': entry.id });
    expect(response.status).toBe(401);
    await expect.poll(() => server.outbox.list()).toEqual([]);
  });
});

import { readdir, readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { issueSecret } from '../../src/auth/secrets';
import { startTestServer, type TestServer } from '../helpers/testServer';

const json = (body: string): unknown => JSON.parse(body);

async function filesIn(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
}

/** Starts an upload and writes only part of the body, leaving the request open. */
function startPartialUpload(server: TestServer, sizeBytes: number, firstChunk: Buffer) {
  const request = httpsRequest({
    host: '127.0.0.1',
    port: server.port,
    method: 'POST',
    path: '/api/v1/files',
    headers: server.uploadHeaders('partial.bin', sizeBytes),
    ca: server.certificatePem,
    agent: false,
  });
  const outcome = new Promise<string>((resolve) => {
    request.on('response', (response) => {
      resolve(`status ${String(response.statusCode)}`);
      response.resume();
    });
    request.on('error', (error) => {
      resolve(`error ${error.message}`);
    });
  });
  request.write(firstChunk);
  return { request, outcome };
}

describe('HTTPS server', () => {
  describe('common rules', () => {
    it('answers /api/info without authentication', async () => {
      const server = await startTestServer();
      const response = await server.send({ path: '/api/info' });

      expect(response.status).toBe(200);
      expect(json(response.body)).toEqual({
        protocolVersion: 1,
        deviceId: server.deviceId,
        displayName: 'TEST-PC',
      });
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBe("default-src 'none'");
    });

    it('rejects any request with an Origin header', async () => {
      const server = await startTestServer();
      const response = await server.send({
        path: '/api/info',
        headers: { Origin: 'https://attacker.example' },
      });
      expect(response.status).toBe(403);
      expect(response.body).toBe('{"error":"forbidden"}');
    });

    it('rejects a Host header that is not an IP literal (DNS rebinding)', async () => {
      const server = await startTestServer();
      const response = await server.send({
        path: '/api/info',
        headers: { Host: 'attacker.example' },
        skipHostnameCheck: true,
      });
      expect(response.status).toBe(403);
    });

    it('returns 404 for unknown paths without any detail', async () => {
      const server = await startTestServer();
      const response = await server.send({ path: '/api/v1/../../etc/passwd' });
      expect(response.status).toBe(404);
      expect(response.body).toBe('{"error":"not_found"}');
      expect(response.headers.connection).toBe('close');
    });

    it('returns 405 with the allowed methods for a wrong method', async () => {
      const server = await startTestServer();
      const response = await server.send({ method: 'DELETE', path: '/api/info' });
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe('GET');
      expect(response.body).toBe('{"error":"method_not_allowed"}');
    });

    it('rejects a body on routes that take none', async () => {
      const server = await startTestServer();
      const response = await server.send({
        path: '/api/info',
        headers: { 'Content-Length': 10 },
        body: 'unexpected',
      });
      expect(response.status).toBe(413);
    });

    it('hides internal errors from the client', async () => {
      const server = await startTestServer({
        markUntrusted: () => Promise.reject(new Error('C:\\Users\\secret\\path failed')),
      });
      const response = await server.upload('photo.jpg', 'data');

      expect(response.status).toBe(500);
      expect(response.body).toBe('{"error":"internal_error"}');
      expect(server.logger.lines.join('\n')).toContain('secret');
    });
  });

  describe('authentication', () => {
    it('requires a token', async () => {
      const server = await startTestServer();
      const response = await server.send({ path: '/api/v1/status' });
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toBe('{"error":"unauthorized"}');
    });

    it('reports the paired device and the limits for a valid token', async () => {
      const server = await startTestServer({ settings: { maxConcurrentUploads: 3 } });
      const response = await server.send({
        path: '/api/v1/status',
        headers: { Authorization: `Bearer ${server.token}` },
      });
      expect(response.status).toBe(200);
      expect(json(response.body)).toEqual({
        pairedDevice: { id: server.device.id, name: 'Test iPhone' },
        limits: { maxFileSizeBytes: 1024 * 1024, maxConcurrentUploads: 3 },
      });
    });

    it('rate-limits failed attempts, even for a valid token afterwards', async () => {
      const server = await startTestServer();
      const wrong = { Authorization: `Bearer ${issueSecret().value}` };
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await server.send({ path: '/api/v1/status', headers: wrong })).status).toBe(401);
      }

      const blocked = await server.send({
        path: '/api/v1/status',
        headers: { Authorization: `Bearer ${server.token}` },
      });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('rejects a revoked device immediately', async () => {
      const server = await startTestServer();
      await server.devices.revoke(server.device.id);
      const response = await server.send({
        path: '/api/v1/status',
        headers: { Authorization: `Bearer ${server.token}` },
      });
      expect(response.status).toBe(401);
    });

    it('never writes the token to the log', async () => {
      const server = await startTestServer();
      await server.send({ path: '/api/v1/status', headers: { Authorization: 'Bearer wrong' } });
      await server.upload('photo.jpg', 'data');
      await server.send({ path: '/api/v1/status' });

      expect(server.logger.lines.length).toBeGreaterThan(0);
      expect(server.logger.lines.join('\n')).not.toContain(server.token);
    });
  });

  describe('uploads', () => {
    it('saves the file and reports its final name', async () => {
      const server = await startTestServer();
      const response = await server.upload('Fotoğraf 1.jpg', 'image bytes');

      expect(response.status).toBe(201);
      expect(json(response.body)).toEqual({ fileName: 'Fotoğraf 1.jpg' });
      const savedPath = path.join(server.receiveFolder, 'Fotoğraf 1.jpg');
      expect(await readFile(savedPath, 'utf8')).toBe('image bytes');
      expect(server.received).toEqual([
        { path: savedPath, fileName: 'Fotoğraf 1.jpg', sizeBytes: 11 },
      ]);
      if (process.platform === 'win32') {
        expect(await readFile(`${savedPath}:Zone.Identifier`, 'ascii')).toContain('ZoneId=3');
      }
    });

    it('does not overwrite and does not let the name escape the folder', async () => {
      const server = await startTestServer();
      await server.upload('photo.jpg', 'first');
      const second = await server.upload('..\\..\\photo.jpg', 'second');

      expect(json(second.body)).toEqual({ fileName: 'photo (1).jpg' });
      expect((await filesIn(server.receiveFolder)).sort()).toEqual(['photo (1).jpg', 'photo.jpg']);
    });

    it('writes nothing for an unauthenticated upload', async () => {
      const server = await startTestServer();
      const response = await server.upload('photo.jpg', 'data', { Authorization: 'Bearer nope' });
      expect(response.status).toBe(401);
      expect(await filesIn(server.receiveFolder)).toEqual([]);
    });

    it('requires Content-Length', async () => {
      const server = await startTestServer();
      const headers = server.uploadHeaders('photo.jpg', 4);
      delete headers['Content-Length'];
      const response = await server.send({
        method: 'POST',
        path: '/api/v1/files',
        headers: { ...headers, 'Transfer-Encoding': 'chunked' },
        body: 'data',
      });
      expect(response.status).toBe(411);
    });

    it('requires the octet-stream content type', async () => {
      const server = await startTestServer();
      const response = await server.upload('photo.jpg', 'data', { 'Content-Type': 'text/plain' });
      expect(response.status).toBe(415);
    });

    it.each([
      ['a malformed percent-encoding', { 'Ilet-File-Name': '%E0%A4%A' }],
      ['two file names', { 'Ilet-File-Name': ['a.jpg', 'b.jpg'] }],
    ])('rejects %s', async (_description, headers) => {
      const server = await startTestServer();
      const response = await server.upload('photo.jpg', 'data', headers);
      expect(response.status).toBe(400);
      expect(response.body).toBe('{"error":"invalid_request"}');
    });

    it('rejects a missing file name', async () => {
      const server = await startTestServer();
      const headers = server.uploadHeaders('photo.jpg', 4);
      delete headers['Ilet-File-Name'];
      const response = await server.send({
        method: 'POST',
        path: '/api/v1/files',
        headers,
        body: 'data',
      });
      expect(response.status).toBe(400);
    });

    it('rejects files over the size limit', async () => {
      const server = await startTestServer({ settings: { maxFileSizeBytes: 3 } });
      const response = await server.upload('photo.jpg', 'data');
      expect(response.status).toBe(413);
      expect(await filesIn(server.receiveFolder)).toEqual([]);
    });

    it('asks for the body only after the checks pass (Expect: 100-continue)', async () => {
      const server = await startTestServer();
      const send = (authorization: string) =>
        new Promise<{ continued: boolean; status: number }>((resolve, reject) => {
          let continued = false;
          const request = httpsRequest({
            host: '127.0.0.1',
            port: server.port,
            method: 'POST',
            path: '/api/v1/files',
            headers: {
              ...server.uploadHeaders('photo.jpg', 4),
              Authorization: authorization,
              Expect: '100-continue',
            },
            ca: server.certificatePem,
            agent: false,
          });
          request.on('continue', () => {
            continued = true;
            request.end('data');
          });
          request.on('response', (response) => {
            response.resume();
            resolve({ continued, status: response.statusCode ?? 0 });
          });
          request.on('error', reject);
        });

      expect(await send('Bearer wrong')).toEqual({ continued: false, status: 401 });
      expect(await send(`Bearer ${server.token}`)).toEqual({ continued: true, status: 201 });
    });

    it('limits concurrent uploads', async () => {
      const server = await startTestServer({ settings: { maxConcurrentUploads: 1 } });
      const first = startPartialUpload(server, 10, Buffer.alloc(5));
      await vi.waitFor(async () => {
        expect((await filesIn(server.receiveFolder)).length).toBe(1);
      });

      const second = await server.upload('second.jpg', 'data');
      expect(second.status).toBe(503);
      expect(second.headers['retry-after']).toBe('2');

      first.request.end(Buffer.alloc(5));
      expect(await first.outcome).toBe('status 201');
    });

    it('deletes the partial file when the phone disconnects', async () => {
      const server = await startTestServer();
      const upload = startPartialUpload(server, 1000, Buffer.alloc(100));
      await vi.waitFor(async () => {
        expect((await filesIn(server.receiveFolder)).length).toBe(1);
      });

      upload.request.destroy();

      await vi.waitFor(async () => {
        expect(await filesIn(server.receiveFolder)).toEqual([]);
      });
    });

    it('ends stalled uploads after the idle timeout and deletes them', async () => {
      const server = await startTestServer({ limits: { idleTimeoutMs: 300 } });
      const upload = startPartialUpload(server, 1000, Buffer.alloc(100));

      expect(await upload.outcome).toMatch(/^error/);
      await vi.waitFor(async () => {
        expect(await filesIn(server.receiveFolder)).toEqual([]);
      });
    });

    it('aborts uploads of a device as soon as it is revoked', async () => {
      const server = await startTestServer();
      const upload = startPartialUpload(server, 1000, Buffer.alloc(100));
      await vi.waitFor(async () => {
        expect((await filesIn(server.receiveFolder)).length).toBe(1);
      });

      await server.devices.revoke(server.device.id);

      expect(await upload.outcome).toMatch(/^(error|status 401)/);
      await vi.waitFor(async () => {
        expect(await filesIn(server.receiveFolder)).toEqual([]);
      });
      expect(server.received).toEqual([]);
    });
  });
});

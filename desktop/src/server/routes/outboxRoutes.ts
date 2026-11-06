import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';

import type { Outbox, OutboxDownload } from '../../outbox/outbox';
import { isOutboxId } from '../../outbox/outboxId';
import {
  ApiPath,
  MediaType,
  RequestHeader,
  SECURITY_RESPONSE_HEADERS,
} from '../../protocol/constants';
import { hasErrorCode, ProtocolError } from '../../shared/errors';
import { isRecord } from '../../shared/validation';
import { type JsonBodyLimits, readJsonBody } from '../requestBody';
import { HttpStatus, sendJson } from '../responses';
import type { PairedDeviceRoute } from '../routing';

/** Errors with which a download ends when the phone closes the connection. */
const CONNECTION_CLOSED_CODES = ['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'EPIPE'];

/** `GET /api/v1/outbox` (PROTOCOL.md section 5.5): the files waiting for this device. */
export function outboxListRoute(outbox: Outbox): PairedDeviceRoute {
  return {
    method: 'GET',
    path: ApiPath.outbox,
    access: 'paired-device',
    acceptsBody: false,
    handle: ({ response, device }) => {
      const files = outbox.list(device.id).map(({ id, name, sizeBytes, queuedAt, expiresAt }) => ({
        id,
        name,
        sizeBytes,
        queuedAt,
        expiresAt,
      }));
      sendJson(response, HttpStatus.ok, { files });
    },
  };
}

/** `GET /api/v1/outbox/file` (PROTOCOL.md section 5.6): one file, by its ID only. */
export function outboxFileRoute(outbox: Outbox): PairedDeviceRoute {
  return {
    method: 'GET',
    path: ApiPath.outboxFile,
    access: 'paired-device',
    acceptsBody: false,
    handle: async ({ request, response, device }) => {
      const download = await outbox.startDownload(device.id, readFileId(request));
      try {
        await sendCopy(response, download);
      } finally {
        await download.finish();
      }
    },
  };
}

/** `POST /api/v1/outbox/received` (PROTOCOL.md section 5.7): the device stored a file. */
export function outboxReceivedRoute(outbox: Outbox, limits: JsonBodyLimits): PairedDeviceRoute {
  return {
    method: 'POST',
    path: ApiPath.outboxReceived,
    access: 'paired-device',
    acceptsBody: true,
    handle: async ({ request, response, device }) => {
      const id = parseReceivedRequest(await readJsonBody(request, response, limits));
      await outbox.confirm(device.id, id);
      sendJson(response, HttpStatus.ok, {});
    },
  };
}

/** `{ "id": "…" }`; other keys are ignored. */
function parseReceivedRequest(body: unknown): string {
  if (isRecord(body)) {
    const { id } = body;
    if (isOutboxId(id)) {
      return id;
    }
  }
  throw new ProtocolError('invalid_request');
}

/** Exactly one `Ilet-File-Id` header holding an entry ID. */
function readFileId(request: IncomingMessage): string {
  const values = request.headersDistinct[RequestHeader.fileId] ?? [];
  const [id] = values;
  if (values.length !== 1 || !isOutboxId(id)) {
    throw new ProtocolError('invalid_request');
  }
  return id;
}

/**
 * Streams the copy with its exact length. `strictContentLength` makes Node.js fail the response
 * instead of sending a body of another length.
 */
async function sendCopy(response: ServerResponse, download: OutboxDownload): Promise<void> {
  const { entry, handle, signal } = download;
  signal.throwIfAborted();
  response.strictContentLength = true;
  response.writeHead(HttpStatus.ok, {
    ...SECURITY_RESPONSE_HEADERS,
    'Content-Type': MediaType.download,
    'Content-Length': entry.sizeBytes,
  });
  if (entry.sizeBytes === 0) {
    response.end();
    return;
  }
  try {
    await pipeline(
      handle.createReadStream({ start: 0, end: entry.sizeBytes - 1, autoClose: false }),
      response,
      { signal },
    );
  } catch (error) {
    if (signal.aborted) {
      // The device was removed, or the file cancelled: a ProtocolError, which is not logged.
      throw signal.reason;
    }
    if (CONNECTION_CLOSED_CODES.some((code) => hasErrorCode(error, code))) {
      // The phone went away. It starts again from the beginning next time.
      return;
    }
    throw error;
  }
}

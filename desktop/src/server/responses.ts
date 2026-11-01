import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';

import {
  BEARER_SCHEME,
  ERROR_HTTP_STATUS,
  MediaType,
  SECURITY_RESPONSE_HEADERS,
} from '../protocol/constants';
import { ProtocolError } from '../shared/errors';
import { errorFields, type Logger } from '../shared/logger';

export const HttpStatus = { ok: 200, created: 201 } as const;

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...SECURITY_RESPONSE_HEADERS,
    ...headers,
    'Content-Type': MediaType.json,
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

/**
 * Sends `{ "error": code }` and closes the connection, so an unread request body cannot be
 * streamed at us any longer. Unexpected errors become `internal_error` and are logged here;
 * their details never reach the client.
 */
export function sendError(response: ServerResponse, error: unknown, logger: Logger): void {
  const protocolError = error instanceof ProtocolError ? error : undefined;
  if (protocolError === undefined) {
    logger.error('request failed', errorFields(error));
  }
  if (response.headersSent || response.destroyed) {
    response.destroy();
    return;
  }
  const code = protocolError?.code ?? 'internal_error';
  sendJson(response, ERROR_HTTP_STATUS[code], { error: code }, errorHeaders(protocolError));
}

function errorHeaders(error: ProtocolError | undefined): OutgoingHttpHeaders {
  const allowedMethods = error?.allowedMethods ?? [];
  const retryAfterSeconds = error?.retryAfterSeconds;
  return {
    Connection: 'close',
    ...(error?.code === 'unauthorized' ? { 'WWW-Authenticate': BEARER_SCHEME } : {}),
    ...(retryAfterSeconds === undefined ? {} : { 'Retry-After': String(retryAfterSeconds) }),
    ...(allowedMethods.length === 0 ? {} : { Allow: allowedMethods.join(', ') }),
  };
}

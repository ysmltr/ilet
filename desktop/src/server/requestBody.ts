import type { IncomingMessage, ServerResponse } from 'node:http';

import { EXPECT_CONTINUE, MediaType, RequestHeader } from '../protocol/constants';
import { ProtocolError } from '../shared/errors';

const DECIMAL_DIGITS = /^\d+$/;
const MEDIA_TYPE_PARAMETER_SEPARATOR = ';';

export interface JsonBodyLimits {
  readonly maxJsonBodyBytes: number;
  readonly jsonBodyTimeoutMs: number;
}

/** The size must be known up front for the limit checks, so chunked bodies are refused. */
export function readContentLength(request: IncomingMessage): number {
  const contentLength = request.headers[RequestHeader.contentLength];
  if (
    request.headers[RequestHeader.transferEncoding] !== undefined ||
    contentLength === undefined
  ) {
    throw new ProtocolError('length_required');
  }
  if (!DECIMAL_DIGITS.test(contentLength)) {
    throw new ProtocolError('invalid_request');
  }
  const sizeBytes = Number(contentLength);
  if (!Number.isSafeInteger(sizeBytes)) {
    throw new ProtocolError('payload_too_large');
  }
  return sizeBytes;
}

/** Compares only the media type: parameters such as `charset` are ignored. */
export function requireMediaType(request: IncomingMessage, mediaType: string): void {
  const received = request.headers[RequestHeader.contentType]
    ?.split(MEDIA_TYPE_PARAMETER_SEPARATOR)[0]
    ?.trim()
    .toLowerCase();
  if (received !== mediaType) {
    throw new ProtocolError('unsupported_media_type');
  }
}

/** Call only after every check passed: the client sends the body after `100 Continue`. */
export function sendContinueIfExpected(request: IncomingMessage, response: ServerResponse): void {
  if (request.headers[RequestHeader.expect]?.toLowerCase() === EXPECT_CONTINUE) {
    response.writeContinue();
  }
}

/**
 * Reads a small JSON body. It must arrive completely within the time limit, so a client without
 * credentials cannot keep a connection busy by sending one byte at a time.
 */
export async function readJsonBody(
  request: IncomingMessage,
  response: ServerResponse,
  limits: JsonBodyLimits,
): Promise<unknown> {
  requireMediaType(request, MediaType.json);
  const sizeBytes = readContentLength(request);
  if (sizeBytes > limits.maxJsonBodyBytes) {
    throw new ProtocolError('payload_too_large');
  }
  sendContinueIfExpected(request, response);
  const text = await readText(request, limits.jsonBodyTimeoutMs);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProtocolError('invalid_request', { cause: error });
  }
}

async function readText(request: IncomingMessage, timeoutMs: number): Promise<string> {
  const deadline = setTimeout(() => {
    request.destroy(new ProtocolError('invalid_request'));
  }, timeoutMs);
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of request as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
  } finally {
    clearTimeout(deadline);
  }
  return Buffer.concat(chunks).toString('utf8');
}

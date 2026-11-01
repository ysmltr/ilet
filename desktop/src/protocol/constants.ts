/**
 * Wire-protocol constants shared with the iOS app. Every value is specified in PROTOCOL.md
 * (section numbers in brackets); change both together.
 */

export const APP_NAME = 'ilet';

export const PROTOCOL_VERSION = 1;

/** [2] On a phone keypad, 4-5-3-8 spells I-L-E-T. */
export const DEFAULT_PORT = 45380;

/** [2] TLS 1.3 suites first; TLS 1.2 only with forward-secret AEAD suites for ECDSA keys. */
export const TLS_MIN_VERSION = 'TLSv1.2';
export const TLS_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
].join(':');

/** [2.1] Server certificate profile. */
export const CERTIFICATE_COMMON_NAME = APP_NAME;
/** RFC 5280 §4.1.2.5: the value for "no well-defined expiration date". */
export const CERTIFICATE_NOT_AFTER = new Date(Date.UTC(9999, 11, 31, 23, 59, 59));
export const CERTIFICATE_DNS_NAMES = ['localhost'] as const;
/** 127.0.0.1 and ::1, as the raw bytes a subjectAltName stores. */
export const CERTIFICATE_IP_ADDRESSES = [
  [127, 0, 0, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
] as const;

/** [3.1] Access tokens and pairing secrets: random bytes, base64url without padding. */
export const SECRET_BYTES = 32;

/** [3.1] Failed authentications allowed per client address within one window. */
export const AUTH_FAILURE_LIMIT = { maxFailures: 10, windowMs: 60_000 } as const;

/** [3.3] */
export const SERVER_LIMITS = {
  tlsHandshakeTimeoutMs: 10_000,
  headersTimeoutMs: 10_000,
  idleTimeoutMs: 30_000,
  keepAliveTimeoutMs: 5_000,
  maxHeaderBytes: 16 * 1024,
  maxConnections: 32,
} as const;

export const DEFAULT_MAX_FILE_SIZE_BYTES = 8 * 1024 ** 3;
export const DEFAULT_MAX_CONCURRENT_UPLOADS = 4;

/** [3.2] Sent with `too_many_uploads`. */
export const UPLOAD_RETRY_AFTER_SECONDS = 2;

/** [4.2] Display and device names, in UTF-16 code units (fits a 255-byte mDNS TXT entry). */
export const MAX_DISPLAY_NAME_LENGTH = 64;

/** [5] */
export const ApiPath = {
  info: '/api/info',
  status: '/api/v1/status',
  files: '/api/v1/files',
} as const;

/** Request header names, lower-case as Node.js exposes them. */
export const RequestHeader = {
  authorization: 'authorization',
  contentLength: 'content-length',
  contentType: 'content-type',
  expect: 'expect',
  fileName: 'ilet-file-name',
  host: 'host',
  origin: 'origin',
  transferEncoding: 'transfer-encoding',
} as const;

export const MediaType = {
  json: 'application/json; charset=utf-8',
  upload: 'application/octet-stream',
} as const;

export const EXPECT_CONTINUE = '100-continue';
export const BEARER_SCHEME = 'Bearer';

/** [3] Sent with every response. */
export const SECURITY_RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
} as const;

/** [3.2] Error codes and their HTTP status. */
export const ERROR_HTTP_STATUS = {
  invalid_request: 400,
  incomplete_upload: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  length_required: 411,
  payload_too_large: 413,
  unsupported_media_type: 415,
  too_many_requests: 429,
  internal_error: 500,
  too_many_uploads: 503,
  insufficient_storage: 507,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

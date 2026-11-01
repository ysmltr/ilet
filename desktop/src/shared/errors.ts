import type { ErrorCode } from '../protocol/constants';

export interface ProtocolErrorOptions {
  readonly retryAfterSeconds?: number;
  readonly allowedMethods?: readonly string[];
  readonly cause?: unknown;
}

/** A failure the client is told about with one of the wire error codes from PROTOCOL.md. */
export class ProtocolError extends Error {
  override readonly name = 'ProtocolError';
  readonly retryAfterSeconds: number | undefined;
  readonly allowedMethods: readonly string[];

  constructor(
    readonly code: ErrorCode,
    options: ProtocolErrorOptions = {},
  ) {
    super(code, { cause: options.cause });
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.allowedMethods = options.allowedMethods ?? [];
  }
}

export type StartupErrorCode =
  'secure_storage_unavailable' | 'data_file_invalid' | 'unsupported_platform' | 'port_in_use';

export interface StartupErrorOptions {
  /** Shown in logs, for example the path of a damaged file. Never a secret. */
  readonly detail?: string;
  readonly cause?: unknown;
}

/** A failure that stops the server core from starting. */
export class StartupError extends Error {
  override readonly name = 'StartupError';

  constructor(
    readonly code: StartupErrorCode,
    options: StartupErrorOptions = {},
  ) {
    super(options.detail === undefined ? code : `${code}: ${options.detail}`, {
      cause: options.cause,
    });
  }
}

/** True for Node.js system errors such as `ENOENT`. */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

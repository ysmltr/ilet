import { randomBytes } from 'node:crypto';

import { OUTBOX_FILE_ID_BYTES } from '../protocol/constants';
import { isLowercaseHex } from '../shared/validation';

const HEX_ENCODING = 'hex';
const ID_LENGTH = OUTBOX_FILE_ID_BYTES * 2;
const PART_SUFFIX = '.part';

/** A new outbox entry ID (PROTOCOL.md section 5.4): random, so it cannot be guessed. */
export function newOutboxId(): string {
  return randomBytes(OUTBOX_FILE_ID_BYTES).toString(HEX_ENCODING);
}

/** Checked before an ID from a phone or from the window is used anywhere. */
export function isOutboxId(value: unknown): value is string {
  return isLowercaseHex(value, ID_LENGTH);
}

/** A copy is named by its ID only; while it is being written, the name ends in ".part". */
export function partFileNameOf(id: string): string {
  return `${id}${PART_SUFFIX}`;
}

export interface OutboxFileName {
  readonly id: string;
  readonly partial: boolean;
}

/** What a name in the outbox folder is, if the outbox made it; `undefined` for any other name. */
export function parseOutboxFileName(name: string): OutboxFileName | undefined {
  const partial = name.endsWith(PART_SUFFIX);
  const id = partial ? name.slice(0, -PART_SUFFIX.length) : name;
  return isOutboxId(id) ? { id, partial } : undefined;
}

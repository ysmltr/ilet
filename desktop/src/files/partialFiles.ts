import { randomBytes } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { hasErrorCode } from '../shared/errors';

const PART_FILE_PREFIX = '.ilet-';
const PART_FILE_SUFFIX = '.part';
const PART_FILE_RANDOM_BYTES = 16;
const HEX_CHARACTERS = /^[0-9a-f]+$/;

/** A random name for an upload in progress, for example ".ilet-3f9c…a1.part". */
export function newPartFileName(): string {
  return `${PART_FILE_PREFIX}${randomBytes(PART_FILE_RANDOM_BYTES).toString('hex')}${PART_FILE_SUFFIX}`;
}

/** Only names created by `newPartFileName`, so user files are never touched. */
export function isPartFileName(name: string): boolean {
  if (!name.startsWith(PART_FILE_PREFIX) || !name.endsWith(PART_FILE_SUFFIX)) {
    return false;
  }
  const randomPart = name.slice(PART_FILE_PREFIX.length, -PART_FILE_SUFFIX.length);
  return randomPart.length === PART_FILE_RANDOM_BYTES * 2 && HEX_CHARACTERS.test(randomPart);
}

/** Deletes partial files left by a crash or power loss. Returns how many were deleted. */
export async function removeStalePartFiles(folder: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return 0;
    }
    throw error;
  }
  const staleNames = names.filter(isPartFileName);
  await Promise.all(staleNames.map((name) => rm(path.join(folder, name), { force: true })));
  return staleNames.length;
}

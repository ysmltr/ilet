import { open, readFile, rename } from 'node:fs/promises';

import { hasErrorCode, StartupError } from './errors';

const TEMP_FILE_SUFFIX = '.tmp';
/** Owner read/write only. Windows ignores it; the profile folder's ACL protects the file there. */
const OWNER_ONLY_MODE = 0o600;
const JSON_INDENT = 2;

/** Reads a JSON data file. Returns `undefined` when the file does not exist. */
export async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new StartupError('data_file_invalid', { detail: filePath, cause: error });
  }
}

/**
 * Writes the whole file to a temporary sibling, flushes it to disk and renames it over the
 * target, so a crash never leaves a half-written file. Callers must not write the same file
 * concurrently.
 */
export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}${TEMP_FILE_SUFFIX}`;
  const handle = await open(tempPath, 'w', OWNER_ONLY_MODE);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, JSON_INDENT)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, filePath);
}

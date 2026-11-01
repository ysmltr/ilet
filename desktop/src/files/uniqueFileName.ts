import { open } from 'node:fs/promises';
import path from 'node:path';

import { hasErrorCode } from '../shared/errors';
import { resolveInsideFolder } from './pathContainment';

const MAX_NAME_ATTEMPTS = 1000;

/** `numberedFileName("photo.jpg", 2)` is "photo (2).jpg"; attempt 0 is the name itself. */
export function numberedFileName(fileName: string, attempt: number): string {
  if (attempt === 0) {
    return fileName;
  }
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  return `${stem} (${String(attempt)})${extension}`;
}

/**
 * Claims a free name in `folder` by creating an empty placeholder with an exclusive create. The
 * file system checks and creates in one step, so an existing file can never be chosen, even if
 * something else creates it at the same moment. Returns the placeholder's path.
 */
export async function claimUniqueFile(folder: string, fileName: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const candidate = resolveInsideFolder(folder, numberedFileName(fileName, attempt));
    try {
      const placeholder = await open(candidate, 'wx');
      await placeholder.close();
      return candidate;
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) {
        throw error;
      }
    }
  }
  throw new Error(`no free file name after ${String(MAX_NAME_ATTEMPTS)} attempts`);
}

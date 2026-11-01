import assert from 'node:assert/strict';
import path from 'node:path';

/**
 * Joins a sanitized file name to a folder and asserts that the result is a direct child of that
 * folder. A failure means a bug in sanitization, so it throws instead of trying to repair.
 */
export function resolveInsideFolder(folder: string, fileName: string): string {
  const resolvedFolder = path.resolve(folder);
  const resolvedFile = path.resolve(resolvedFolder, fileName);
  assert.equal(path.dirname(resolvedFile), resolvedFolder, 'file path must stay in the folder');
  assert.equal(path.basename(resolvedFile), fileName, 'file name must not change when resolved');
  return resolvedFile;
}

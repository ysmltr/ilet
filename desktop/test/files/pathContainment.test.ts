import { AssertionError } from 'node:assert';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveInsideFolder } from '../../src/files/pathContainment';

const folder = path.resolve('receive-folder');
/** Backslash is a path separator only on Windows. */
const windowsOnlyEscapes = process.platform === 'win32' ? ['..\\escape.txt', 'sub\\photo.jpg'] : [];

describe('resolveInsideFolder', () => {
  it('returns the path of a direct child', () => {
    expect(resolveInsideFolder(folder, 'photo.jpg')).toBe(path.join(folder, 'photo.jpg'));
  });

  it.each([
    '../escape.txt',
    'sub/photo.jpg',
    path.resolve('elsewhere', 'photo.jpg'),
    '',
    '.',
    '..',
    ...windowsOnlyEscapes,
  ])('rejects %j', (fileName) => {
    expect(() => resolveInsideFolder(folder, fileName)).toThrow(AssertionError);
  });
});

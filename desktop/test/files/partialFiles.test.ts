import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isPartFileName,
  newPartFileName,
  removeStalePartFiles,
} from '../../src/files/partialFiles';
import { createTempFolder } from '../helpers/fakes';

describe('partial files', () => {
  it('recognizes its own names', () => {
    expect(isPartFileName(newPartFileName())).toBe(true);
  });

  it('creates a different name every time', () => {
    expect(newPartFileName()).not.toBe(newPartFileName());
  });

  it.each(['photo.part', '.ilet-notes.part', '.ilet-.part', `.ilet-${'g'.repeat(32)}.part`])(
    'does not claim the user file %j',
    (name) => {
      expect(isPartFileName(name)).toBe(false);
    },
  );

  it('removes only stale partial files', async () => {
    const folder = await createTempFolder();
    const stale = newPartFileName();
    await writeFile(path.join(folder, stale), 'partial');
    await writeFile(path.join(folder, 'photo.part'), 'user file');
    await writeFile(path.join(folder, 'photo.jpg'), 'user file');

    expect(await removeStalePartFiles(folder)).toBe(1);
    expect((await readdir(folder)).sort()).toEqual(['photo.jpg', 'photo.part']);
  });

  it('accepts a receive folder that does not exist yet', async () => {
    const folder = await createTempFolder();
    expect(await removeStalePartFiles(path.join(folder, 'missing'))).toBe(0);
  });
});

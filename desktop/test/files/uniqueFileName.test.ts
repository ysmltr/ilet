import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { claimUniqueFile, numberedFileName } from '../../src/files/uniqueFileName';
import { createTempFolder } from '../helpers/fakes';

describe('numberedFileName', () => {
  it.each([
    ['photo.jpg', 0, 'photo.jpg'],
    ['photo.jpg', 1, 'photo (1).jpg'],
    ['photo.jpg', 12, 'photo (12).jpg'],
    ['archive.tar.gz', 2, 'archive.tar (2).gz'],
    ['README', 3, 'README (3)'],
    ['.htaccess', 1, '.htaccess (1)'],
  ])('numbers %j attempt %i as %j', (name, attempt, expected) => {
    expect(numberedFileName(name, attempt)).toBe(expected);
  });
});

describe('claimUniqueFile', () => {
  it('claims the name itself when it is free', async () => {
    const folder = await createTempFolder();
    const claimed = await claimUniqueFile(folder, 'photo.jpg');
    expect(claimed).toBe(path.join(folder, 'photo.jpg'));
    expect((await stat(claimed)).size).toBe(0);
  });

  it('never touches an existing file', async () => {
    const folder = await createTempFolder();
    await writeFile(path.join(folder, 'photo.jpg'), 'original');
    await writeFile(path.join(folder, 'photo (1).jpg'), 'first copy');

    const claimed = await claimUniqueFile(folder, 'photo.jpg');

    expect(claimed).toBe(path.join(folder, 'photo (2).jpg'));
    expect(await readFile(path.join(folder, 'photo.jpg'), 'utf8')).toBe('original');
    expect(await readFile(path.join(folder, 'photo (1).jpg'), 'utf8')).toBe('first copy');
  });

  it('treats a folder with the same name as taken', async () => {
    const folder = await createTempFolder();
    await mkdir(path.join(folder, 'photo.jpg'));
    expect(await claimUniqueFile(folder, 'photo.jpg')).toBe(path.join(folder, 'photo (1).jpg'));
  });

  it.runIf(process.platform === 'win32')('respects case-insensitive names on Windows', async () => {
    const folder = await createTempFolder();
    await writeFile(path.join(folder, 'PHOTO.JPG'), 'original');
    expect(await claimUniqueFile(folder, 'photo.jpg')).toBe(path.join(folder, 'photo (1).jpg'));
  });

  it('gives concurrent claims different names', async () => {
    const folder = await createTempFolder();
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimUniqueFile(folder, 'photo.jpg')),
    );
    expect(new Set(claims).size).toBe(5);
  });
});

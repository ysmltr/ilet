import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultSettings, loadOrCreateSettings } from '../../src/settings/settings';
import { StartupError } from '../../src/shared/errors';
import { createTempFolder } from '../helpers/fakes';

const downloadsFolder = path.resolve('Downloads');
const defaults = defaultSettings({ hostname: 'DESKTOP-4F2K', downloadsFolder });

describe('defaultSettings', () => {
  it('uses the host name, Downloads/ilet and the default port', () => {
    expect(defaults).toEqual({
      displayName: 'DESKTOP-4F2K',
      receiveFolder: path.join(downloadsFolder, 'ilet'),
      port: 45380,
      maxFileSizeBytes: 8 * 1024 ** 3,
      maxConcurrentUploads: 4,
    });
  });

  it('cleans the host name and falls back to the app name', () => {
    expect(defaultSettings({ hostname: 'PC‮\n', downloadsFolder }).displayName).toBe('PC');
    expect(defaultSettings({ hostname: '\u0000', downloadsFolder }).displayName).toBe('ilet');
  });
});

describe('loadOrCreateSettings', () => {
  it('writes the defaults on first launch and reads them back', async () => {
    const filePath = path.join(await createTempFolder(), 'settings.json');

    expect(await loadOrCreateSettings(filePath, defaults)).toEqual(defaults);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ formatVersion: 1, ...defaults });
    expect(await loadOrCreateSettings(filePath, defaults)).toEqual(defaults);
  });

  it('accepts edited values within their limits', async () => {
    const filePath = path.join(await createTempFolder(), 'settings.json');
    const edited = { ...defaults, port: 50000, maxFileSizeBytes: 1024, maxConcurrentUploads: 1 };
    await writeFile(filePath, JSON.stringify({ formatVersion: 1, ...edited }));

    expect(await loadOrCreateSettings(filePath, defaults)).toEqual(edited);
  });

  it.each([
    ['a privileged port', { port: 80 }],
    ['a fractional size', { maxFileSizeBytes: 1.5 }],
    ['zero concurrent uploads', { maxConcurrentUploads: 0 }],
    ['a relative receive folder', { receiveFolder: 'Downloads' }],
    ['an unclean display name', { displayName: 'PC\n' }],
    ['a missing field', { port: undefined }],
    ['the wrong version', { formatVersion: 2 }],
  ])('refuses %s', async (_description, change) => {
    const filePath = path.join(await createTempFolder(), 'settings.json');
    await writeFile(filePath, JSON.stringify({ formatVersion: 1, ...defaults, ...change }));
    await expect(loadOrCreateSettings(filePath, defaults)).rejects.toThrow(StartupError);
  });
});

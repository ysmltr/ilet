import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../../src/settings/settings';
import { SettingsStore } from '../../src/settings/settingsStore';
import { createTempFolder } from '../helpers/fakes';

async function openStore(): Promise<{ store: SettingsStore; filePath: string; folder: string }> {
  const folder = await createTempFolder();
  const filePath = path.join(folder, 'settings.json');
  const defaults = defaultSettings({ hostname: 'TEST-PC', downloadsFolder: folder });
  return { store: await SettingsStore.open(filePath, defaults), filePath, folder };
}

describe('SettingsStore', () => {
  it('saves a change before it takes effect, and keeps it for the next start', async () => {
    const { store, filePath, folder } = await openStore();
    const receiveFolder = path.join(folder, 'Phone');

    await store.update({ receiveFolder });

    expect(store.current.receiveFolder).toBe(receiveFolder);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ receiveFolder });
    const reopened = await SettingsStore.open(filePath, store.current);
    expect(reopened.current.receiveFolder).toBe(receiveFolder);
  });

  it('refuses an invalid change and keeps the current settings', async () => {
    const { store, filePath } = await openStore();
    const before = await readFile(filePath, 'utf8');

    await expect(store.update({ receiveFolder: 'relative\\folder' })).rejects.toThrow();

    expect(store.current.receiveFolder).not.toBe('relative\\folder');
    expect(await readFile(filePath, 'utf8')).toBe(before);
  });
});

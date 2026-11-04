import { mkdir, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeZoneIdentifier } from '../../src/files/markOfTheWeb';
import {
  checkReceiveFolder,
  isForbiddenReceiveFolder,
  type ReceiveFolderRules,
  windowsReceiveFolderRules,
} from '../../src/settings/receiveFolder';
import { createMemoryLogger, createTempFolder } from '../helpers/fakes';

const runsOnWindows = process.platform === 'win32';
const HOME = 'C:\\Users\\Yesim';

const noRules = (homeFolder: string): ReceiveFolderRules => ({
  forbiddenTrees: [],
  forbiddenFolders: [],
  homeFolder,
  ignoreCase: true,
});

/** A folder and a junction that leads to it: one folder under two names. */
async function folderWithJunction(): Promise<{ real: string; junction: string }> {
  const root = await createTempFolder();
  const real = path.join(root, 'real');
  const junction = path.join(root, 'innocent-looking');
  await mkdir(real);
  await symlink(real, junction, 'junction');
  return { real, junction };
}

describe.runIf(runsOnWindows)('isForbiddenReceiveFolder', () => {
  const rules = windowsReceiveFolderRules({
    homeFolder: HOME,
    appFolders: ['C:\\Users\\Yesim\\AppData\\Local\\Programs\\ilet', 'D:\\PortableApps\\ilet'],
    env: {
      SystemRoot: 'C:\\Windows',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      ProgramData: 'C:\\ProgramData',
      // Away from the home folder, as folder redirection can put them.
      APPDATA: 'E:\\Profiles\\Yesim\\Roaming',
      LOCALAPPDATA: 'F:\\Yesim\\Local',
      PATH: 'C:\\Windows\\system32;C:\\Tools\\bin;"C:\\Quoted Tools";relative\\bin;',
    },
  });

  it.each([
    'C:\\Users\\Yesim\\Downloads\\ilet',
    'C:\\Users\\Yesim\\Desktop',
    'C:\\Users\\Yesim\\Documents\\Phone',
    'C:\\Tools\\bin\\photos',
    'D:\\Photos',
    'E:\\Profiles\\Yesim\\Documents',
  ])('allows %s', async (folder) => {
    expect(await isForbiddenReceiveFolder(folder, rules)).toBe(false);
  });

  it.each([
    [
      'the user Startup folder',
      'C:\\Users\\Yesim\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
    ],
    [
      'the folder of app aliases on PATH',
      'C:\\Users\\Yesim\\AppData\\Local\\Microsoft\\WindowsApps',
    ],
    [
      'the Startup folder for all users',
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp',
    ],
    [
      'a redirected user Startup folder',
      'E:\\Profiles\\Yesim\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
    ],
    ['a program in a moved local AppData', 'F:\\Yesim\\Local\\Programs\\Something'],
    ['the Windows folder', 'C:\\Windows\\Temp'],
    ['a program folder', 'C:\\Program Files (x86)\\Something'],
    ['ilet’s own program folder', 'D:\\PortableApps\\ilet\\resources'],
    ['the home folder itself', HOME],
    ['a folder on PATH', 'C:\\Tools\\bin'],
    ['a quoted folder on PATH', 'C:\\Quoted Tools'],
    ['a hidden settings folder', 'C:\\Users\\Yesim\\.ssh'],
    ['a folder inside a hidden one', 'C:\\Users\\Yesim\\.config\\app'],
    ['a different spelling', 'c:\\users\\YESIM\\appdata\\local\\temp'],
    ['a drive root', 'D:\\'],
    ['a drive root without a backslash', 'E:'],
    ['a path that climbs back in', 'C:\\Users\\Yesim\\Desktop\\..\\AppData'],
  ])('forbids %s', async (_case, folder) => {
    expect(await isForbiddenReceiveFolder(folder, rules)).toBe(true);
  });

  it('follows a junction in a folder that does not exist yet', async () => {
    const { real, junction } = await folderWithJunction();
    const rules = { ...noRules('C:\\Elsewhere'), forbiddenTrees: [real] };

    // Like a stored receive folder, which is made only when the first file arrives.
    const later = path.join(junction, 'later', 'ilet');

    expect(await isForbiddenReceiveFolder(later, rules)).toBe(true);
  });
});

describe.runIf(runsOnWindows)('checkReceiveFolder', () => {
  it('accepts a folder that can hold marked files, and leaves nothing behind', async () => {
    const folder = await createTempFolder();
    const check = await checkReceiveFolder(
      folder,
      noRules('C:\\Elsewhere'),
      writeZoneIdentifier,
      createMemoryLogger(),
    );

    // By its real path, which can be spelled differently (C:\Users\RUNNER~1 is a short name).
    expect(check).toEqual({ ok: true, folder: await realpath(folder) });
    expect(await readdir(folder)).toEqual([]);
  });

  it('follows a junction into a forbidden folder and refuses it', async () => {
    const { real, junction } = await folderWithJunction();
    const rules = { ...noRules('C:\\Elsewhere'), forbiddenTrees: [real] };

    const check = await checkReceiveFolder(
      junction,
      rules,
      writeZoneIdentifier,
      createMemoryLogger(),
    );

    expect(check).toEqual({ ok: false, problem: 'system-folder' });
  });

  it.each<[string, (junction: string) => Partial<ReceiveFolderRules>, string]>([
    ['a folder inside a forbidden tree', (junction) => ({ forbiddenTrees: [junction] }), 'inside'],
    ['a forbidden folder', (junction) => ({ forbiddenFolders: [junction] }), ''],
    ['a hidden folder in the home folder', (junction) => ({ homeFolder: junction }), '.ssh'],
  ])('refuses %s that the rules name through a junction', async (_case, rulesFor, subfolder) => {
    const { real, junction } = await folderWithJunction();
    const chosen = path.join(real, subfolder);
    await mkdir(chosen, { recursive: true });
    const rules = { ...noRules('C:\\Elsewhere'), ...rulesFor(junction) };

    const check = await checkReceiveFolder(
      chosen,
      rules,
      writeZoneIdentifier,
      createMemoryLogger(),
    );

    expect(check).toEqual({ ok: false, problem: 'system-folder' });
  });

  it('refuses a file and a folder that does not exist', async () => {
    const root = await createTempFolder();
    const file = path.join(root, 'file.txt');
    await writeFile(file, 'x');
    const rules = noRules('C:\\Elsewhere');

    for (const target of [file, path.join(root, 'missing')]) {
      expect(
        await checkReceiveFolder(target, rules, writeZoneIdentifier, createMemoryLogger()),
      ).toEqual({
        ok: false,
        problem: 'not-a-folder',
      });
    }
  });

  it('refuses a drive that cannot mark files, and removes its test file', async () => {
    const folder = await createTempFolder();
    const failingMarker = (): Promise<void> =>
      Promise.reject(new Error('no alternate data streams'));

    const check = await checkReceiveFolder(
      folder,
      noRules('C:\\Elsewhere'),
      failingMarker,
      createMemoryLogger(),
    );

    expect(check).toEqual({ ok: false, problem: 'cannot-mark-files' });
    expect(await readdir(folder)).toEqual([]);
  });
});

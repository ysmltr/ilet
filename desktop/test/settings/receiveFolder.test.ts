import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
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

describe.runIf(runsOnWindows)('isForbiddenReceiveFolder', () => {
  const rules = windowsReceiveFolderRules({
    homeFolder: HOME,
    appFolders: ['C:\\Users\\Yesim\\AppData\\Local\\Programs\\ilet', 'D:\\PortableApps\\ilet'],
    env: {
      SystemRoot: 'C:\\Windows',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      ProgramData: 'C:\\ProgramData',
      PATH: 'C:\\Windows\\system32;C:\\Tools\\bin;"C:\\Quoted Tools";relative\\bin;',
    },
  });

  it.each([
    'C:\\Users\\Yesim\\Downloads\\ilet',
    'C:\\Users\\Yesim\\Desktop',
    'C:\\Users\\Yesim\\Documents\\Phone',
    'C:\\Tools\\bin\\photos',
    'D:\\Photos',
  ])('allows %s', (folder) => {
    expect(isForbiddenReceiveFolder(folder, rules)).toBe(false);
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
  ])('forbids %s', (_case, folder) => {
    expect(isForbiddenReceiveFolder(folder, rules)).toBe(true);
  });
});

describe.runIf(runsOnWindows)('checkReceiveFolder', () => {
  const noRules = (homeFolder: string): ReceiveFolderRules => ({
    forbiddenTrees: [],
    forbiddenFolders: [],
    homeFolder,
    ignoreCase: true,
  });

  it('accepts a folder that can hold marked files, and leaves nothing behind', async () => {
    const folder = await createTempFolder();
    const check = await checkReceiveFolder(
      folder,
      noRules('C:\\Elsewhere'),
      writeZoneIdentifier,
      createMemoryLogger(),
    );

    expect(check).toEqual({ ok: true, folder });
    expect(await readdir(folder)).toEqual([]);
  });

  it('follows a junction into a forbidden folder and refuses it', async () => {
    const root = await createTempFolder();
    const forbidden = path.join(root, 'forbidden');
    const junction = path.join(root, 'innocent-looking');
    await mkdir(forbidden);
    await symlink(forbidden, junction, 'junction');
    const rules = { ...noRules('C:\\Elsewhere'), forbiddenTrees: [forbidden] };

    const check = await checkReceiveFolder(
      junction,
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

import { realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { UntrustedFileMarker } from '../files/markOfTheWeb';
import { newPartFileName } from '../files/partialFiles';
import type { ReceiveFolderProblem } from '../ipc/contract';
import { errorFields, type Logger } from '../shared/logger';

/**
 * Folders that must never receive files. Windows or other programs run or read files from them
 * by themselves, so a file sent there could be executed without anyone opening it.
 */
export interface ReceiveFolderRules {
  /** These folders and everything inside them. */
  readonly forbiddenTrees: readonly string[];
  /** These folders themselves; their subfolders are fine. */
  readonly forbiddenFolders: readonly string[];
  /** Hidden folders below it (".ssh", ".config") hold settings that programs read. */
  readonly homeFolder: string;
  /** Windows paths ignore case. */
  readonly ignoreCase: boolean;
}

export type ReceiveFolderCheck =
  | { readonly ok: true; readonly folder: string }
  | { readonly ok: false; readonly problem: ReceiveFolderProblem };

export interface WindowsFolders {
  readonly homeFolder: string;
  /** ilet's own program and data folders. */
  readonly appFolders: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

/** The rules with each folder named twice: as written, and by its real path. */
interface ResolvedRules {
  readonly forbiddenTrees: readonly string[];
  readonly forbiddenFolders: readonly string[];
  readonly homeFolders: readonly string[];
  readonly ignoreCase: boolean;
}

const HIDDEN_FOLDER_PREFIX = '.';
const APP_DATA_VARIABLES = ['APPDATA', 'LOCALAPPDATA'];
const SYSTEM_FOLDER_VARIABLES = ['SystemRoot', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData'];
/** \\server\share. (\\?\C:\… and \\.\C:\… name local paths.) */
const NETWORK_PATH = /^\\\\[^\\?.]/;

export function windowsReceiveFolderRules({
  homeFolder,
  appFolders,
  env,
}: WindowsFolders): ReceiveFolderRules {
  const fromEnvironment = (name: string): string[] => {
    const value = env[name];
    return value === undefined || value === '' ? [] : [value];
  };
  return {
    forbiddenTrees: [
      // The Startup folder, programs' settings and data, and WindowsApps, which is on PATH.
      path.join(homeFolder, 'AppData'),
      // The same folders where Windows keeps them, in case they were moved or redirected.
      ...APP_DATA_VARIABLES.flatMap(fromEnvironment),
      // Windows, programs, and the Startup folder for all users (in ProgramData).
      ...SYSTEM_FOLDER_VARIABLES.flatMap(fromEnvironment),
      ...appFolders,
    ],
    // Programs read settings files from the home folder, and run programs found on PATH.
    forbiddenFolders: [homeFolder, ...searchPathFolders(env['PATH'])],
    homeFolder,
    ignoreCase: true,
  };
}

/**
 * Whether files must not go to this folder, which need not exist yet. The folder and every folder
 * in the rules are also compared by their real paths, with links, junctions and short names
 * (C:\PROGRA~1) resolved, so that no forbidden folder can be reached under another name.
 */
export async function isForbiddenReceiveFolder(
  folder: string,
  rules: ReceiveFolderRules,
): Promise<boolean> {
  return isForbiddenUnderAnyName([folder, await realPathOf(folder)], rules);
}

/** Checks a folder the user picked, including a test write, before files are saved there. */
export async function checkReceiveFolder(
  chosenFolder: string,
  rules: ReceiveFolderRules,
  markUntrusted: UntrustedFileMarker,
  logger: Logger,
): Promise<ReceiveFolderCheck> {
  let folder: string;
  try {
    // Links and junctions are resolved, so they cannot lead into a forbidden folder.
    folder = await realpath(chosenFolder);
    if (!(await stat(folder)).isDirectory()) {
      return { ok: false, problem: 'not-a-folder' };
    }
  } catch {
    return { ok: false, problem: 'not-a-folder' };
  }
  if (await isForbiddenUnderAnyName([chosenFolder, folder], rules)) {
    return { ok: false, problem: 'system-folder' };
  }
  return writeTestFile(folder, markUntrusted, logger);
}

async function isForbiddenUnderAnyName(
  names: readonly string[],
  rules: ReceiveFolderRules,
): Promise<boolean> {
  const bothNames = async (folders: readonly string[]): Promise<string[]> =>
    (await Promise.all(folders.map(async (folder) => [folder, await realPathOf(folder)]))).flat();
  const [forbiddenTrees, forbiddenFolders, homeFolders] = await Promise.all([
    bothNames(rules.forbiddenTrees),
    bothNames(rules.forbiddenFolders),
    bothNames([rules.homeFolder]),
  ]);
  const resolved = { forbiddenTrees, forbiddenFolders, homeFolders, ignoreCase: rules.ignoreCase };
  return names.some((name) => isForbiddenName(name, resolved));
}

function isForbiddenName(folder: string, rules: ResolvedRules): boolean {
  const comparable = (value: string): string => {
    const resolved = path.resolve(value);
    return rules.ignoreCase ? resolved.toLowerCase() : resolved;
  };
  const target = comparable(folder);
  const pathInside = (parent: string): string | undefined => {
    const relative = path.relative(comparable(parent), target);
    return relative === '' || isDescendant(relative) ? relative : undefined;
  };
  const hiddenFolderBelowHome = rules.homeFolders.some((home) =>
    (pathInside(home) ?? '')
      .split(path.sep)
      .some((segment) => segment.startsWith(HIDDEN_FOLDER_PREFIX)),
  );
  // A drive's top folder: Windows reads autorun.inf there, and a program installed under a path
  // with spaces but no quotes ("D:\Program Files\…") can be started as "D:\Program.exe".
  const isDriveRoot = path.parse(target).root === target;
  return (
    isDriveRoot ||
    rules.forbiddenTrees.some((tree) => pathInside(tree) !== undefined) ||
    rules.forbiddenFolders.some((forbidden) => comparable(forbidden) === target) ||
    hiddenFolderBelowHome
  );
}

/**
 * A folder's real path: links, junctions and short names resolved. Of a folder that does not
 * exist (yet), the nearest existing parent is resolved and the rest kept as written. A network
 * path is kept as written: it is its own real path, and an unreachable server would hold up the
 * check.
 */
async function realPathOf(folder: string): Promise<string> {
  const absolute = path.resolve(folder);
  if (NETWORK_PATH.test(absolute)) {
    return absolute;
  }
  try {
    return await realpath(absolute);
  } catch {
    const parent = path.dirname(absolute);
    return parent === absolute
      ? absolute
      : path.join(await realPathOf(parent), path.basename(absolute));
  }
}

/**
 * Received files are marked as downloaded from the internet. That fails on drives without NTFS
 * streams (FAT32, exFAT), so a test file proves the folder can hold marked files.
 */
async function writeTestFile(
  folder: string,
  markUntrusted: UntrustedFileMarker,
  logger: Logger,
): Promise<ReceiveFolderCheck> {
  // Named like a partial upload, so a leftover is removed like one when ilet starts.
  const testPath = path.join(folder, newPartFileName());
  try {
    await writeFile(testPath, '', { flag: 'wx' });
  } catch {
    return { ok: false, problem: 'not-writable' };
  }
  try {
    await markUntrusted(testPath);
    return { ok: true, folder };
  } catch {
    return { ok: false, problem: 'cannot-mark-files' };
  } finally {
    await rm(testPath, { force: true }).catch((error: unknown) => {
      logger.warn('could not delete a test file', errorFields(error));
    });
  }
}

/** A relative path that stays inside its base: not "..", not "../x", not on another drive. */
function isDescendant(relative: string): boolean {
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function searchPathFolders(searchPath: string | undefined): string[] {
  return (searchPath ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter((entry) => path.isAbsolute(entry));
}

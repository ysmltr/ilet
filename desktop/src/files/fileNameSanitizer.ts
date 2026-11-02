import path from 'node:path';

import { APP_NAME } from '../protocol/constants';
import { removeInvisibleCharacters, truncateToLength } from '../shared/text';

/** In UTF-16 code units. Leaves room under Windows' 255 limit for " (n)" and the safety suffixes. */
export const MAX_FILE_NAME_LENGTH = 150;
/** Longer "extensions" are treated as part of the name when shortening. */
const MAX_PRESERVED_EXTENSION_LENGTH = 16;

const PATH_SEPARATORS = /[/\\]/;
/** Characters Windows does not allow in file names (control characters are removed earlier). */
const WINDOWS_INVALID_CHARACTERS = /[<>:"|?*]/g;
const LEADING_SPACES = /^ +/;
/** Windows silently drops trailing dots and spaces, which would change the name we checked. */
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;
const REPLACEMENT_CHARACTER = '_';
const FALLBACK_NAME_PREFIX = `${APP_NAME}-`;

/** Device names that Windows reserves even with an extension ("NUL.txt"); compared upper-case. */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'CONIN$',
  'CONOUT$',
  ...['COM', 'LPT'].flatMap((port) =>
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '¹', '²', '³'].map(
      (suffix) => `${port}${suffix}`,
    ),
  ),
]);

/**
 * Types that Windows Explorer parses as soon as it displays a folder. Their icon or location
 * fields can point to `\\attacker\share`, which makes Windows send the user's NTLM hash to the
 * attacker without a click. Appending `.txt` makes Explorer treat them as plain text.
 */
const SHELL_PARSED_EXTENSIONS = [
  '.lnk',
  '.url',
  '.scf',
  '.library-ms',
  '.searchconnector-ms',
  '.theme',
  '.themepack',
  '.desktopthemepackfile',
];
/** Explorer reads autorun.inf at a drive's root for the drive's icon and name. */
const SHELL_PARSED_FILE_NAMES = ['desktop.ini', 'autorun.inf'];
const NEUTRAL_EXTENSION = '.txt';

/**
 * Turns a client-supplied file name into a safe Windows file name. It never contains a path,
 * so it cannot leave the target folder. Returns `fallbackName` when nothing usable remains.
 */
export function sanitizeFileName(rawName: string, fallbackName: string): string {
  const shortened = limitLength(trim(cleanCharacters(lastPathSegment(rawName))));
  if (shortened === '') {
    return fallbackName;
  }
  // These run last: they only add characters at the start or end, so no later step can undo them.
  return neutralizeShellParsedType(avoidReservedName(shortened));
}

/** "ilet-20261101-153012", in local time. */
export function fallbackFileName(now: Date): string {
  const twoDigits = (value: number): string => String(value).padStart(2, '0');
  const date = `${String(now.getFullYear())}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}`;
  const time = `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
  return `${FALLBACK_NAME_PREFIX}${date}-${time}`;
}

function lastPathSegment(name: string): string {
  return name.split(PATH_SEPARATORS).at(-1) ?? '';
}

function cleanCharacters(name: string): string {
  return removeInvisibleCharacters(name).replace(WINDOWS_INVALID_CHARACTERS, REPLACEMENT_CHARACTER);
}

function trim(name: string): string {
  return name.replace(LEADING_SPACES, '').replace(TRAILING_DOTS_AND_SPACES, '');
}

function limitLength(name: string): string {
  if (name.length <= MAX_FILE_NAME_LENGTH) {
    return name;
  }
  const extension = path.extname(name);
  const keptExtension = extension.length <= MAX_PRESERVED_EXTENSION_LENGTH ? extension : '';
  const stem = name.slice(0, name.length - keptExtension.length);
  const shortenedStem = trim(truncateToLength(stem, MAX_FILE_NAME_LENGTH - keptExtension.length));
  return shortenedStem === '' ? '' : `${shortenedStem}${keptExtension}`;
}

function avoidReservedName(name: string): string {
  const baseName = (name.split('.')[0] ?? '').trimEnd().toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(baseName) ? `${REPLACEMENT_CHARACTER}${name}` : name;
}

function neutralizeShellParsedType(name: string): string {
  const lowerCaseName = name.toLowerCase();
  const isShellParsed =
    SHELL_PARSED_FILE_NAMES.includes(lowerCaseName) ||
    SHELL_PARSED_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension));
  return isShellParsed ? `${name}${NEUTRAL_EXTENSION}` : name;
}

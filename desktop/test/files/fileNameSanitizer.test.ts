import { describe, expect, it } from 'vitest';

import {
  fallbackFileName,
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
} from '../../src/files/fileNameSanitizer';
import { resolveInsideFolder } from '../../src/files/pathContainment';

const FALLBACK = 'fallback-name';
const sanitize = (name: string): string => sanitizeFileName(name, FALLBACK);

describe('sanitizeFileName', () => {
  it.each([
    'IMG_0001.HEIC',
    'Fotoğraf çekimi şubat ü ö ı İ.jpg',
    'report (final).pdf',
    '.htaccess',
    'archive.tar.gz',
  ])('keeps the ordinary name %j', (name) => {
    expect(sanitize(name)).toBe(name);
  });

  it.each([
    ['../../evil.exe', 'evil.exe'],
    ['..\\..\\Windows\\System32\\evil.dll', 'evil.dll'],
    ['C:\\Users\\Public\\a.txt', 'a.txt'],
    ['/etc/passwd', 'passwd'],
    ['\\\\server\\share\\x.jpg', 'x.jpg'],
  ])('keeps only the last path segment of %j', (name, expected) => {
    expect(sanitize(name)).toBe(expected);
  });

  it.each(['', ' ', '.', '..', '...', ' . . ', 'folder/', '\u202E', '\u0000\u0001'])(
    'falls back to the generated name for %j',
    (name) => {
      expect(sanitize(name)).toBe(FALLBACK);
    },
  );

  it('removes control characters', () => {
    expect(sanitize('a\u0000b\u001fc\u007f.txt')).toBe('abc.txt');
  });

  it('removes the right-to-left override that disguises executables', () => {
    expect(sanitize('invoice\u202Egpj.exe')).toBe('invoicegpj.exe');
  });

  it('removes zero-width and other invisible characters', () => {
    expect(sanitize('ph\u200Bo\u200Dt\uFEFFo\u2066.jpg')).toBe('photo.jpg');
  });

  it('turns every kind of space into a plain space', () => {
    expect(sanitize('my\u00A0holiday\u3000photo.jpg')).toBe('my holiday photo.jpg');
  });

  it('normalizes to NFC', () => {
    expect(sanitize('cafe\u0301.jpg')).toBe('caf\u00E9.jpg');
  });

  it('replaces characters that Windows does not allow', () => {
    expect(sanitize('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
  });

  it('cannot address an alternate data stream', () => {
    expect(sanitize('photo.jpg:Zone.Identifier')).toBe('photo.jpg_Zone.Identifier');
  });

  it('removes trailing dots and spaces and leading spaces', () => {
    expect(sanitize('  evil.exe. . ')).toBe('evil.exe');
  });

  it.each([
    ['CON', '_CON'],
    ['con.txt', '_con.txt'],
    ['NUL.tar.gz', '_NUL.tar.gz'],
    ['Aux', '_Aux'],
    ['COM1.jpg', '_COM1.jpg'],
    ['lpt9', '_lpt9'],
    ['COM0', '_COM0'],
    ['LPT¹.txt', '_LPT¹.txt'],
    ['CONIN$', '_CONIN$'],
    ['CON .txt', '_CON .txt'],
  ])('prefixes the Windows device name %j', (name, expected) => {
    expect(sanitize(name)).toBe(expected);
  });

  it.each(['console.txt', 'CON1.txt', 'COM10.txt', 'nullable.txt'])(
    'does not touch %j, which is not a device name',
    (name) => {
      expect(sanitize(name)).toBe(name);
    },
  );

  it.each([
    ['evil.url', 'evil.url.txt'],
    ['EVIL.LNK', 'EVIL.LNK.txt'],
    ['icon.scf', 'icon.scf.txt'],
    ['x.library-ms', 'x.library-ms.txt'],
    ['x.searchConnector-ms', 'x.searchConnector-ms.txt'],
    ['dark.theme', 'dark.theme.txt'],
    ['dark.themepack', 'dark.themepack.txt'],
    ['desktop.ini', 'desktop.ini.txt'],
    ['Desktop.INI', 'Desktop.INI.txt'],
    ['shortcut.url. ', 'shortcut.url.txt'],
  ])('neutralizes the shell-parsed file %j', (name, expected) => {
    expect(sanitize(name)).toBe(expected);
  });

  it('shortens long names and keeps the extension', () => {
    const result = sanitize(`${'a'.repeat(300)}.jpg`);
    expect(result).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(result.endsWith('.jpg')).toBe(true);
  });

  it('does not keep an implausibly long extension when shortening', () => {
    const result = sanitize(`photo.${'x'.repeat(300)}`);
    expect(result).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(result.startsWith('photo.')).toBe(true);
  });

  it('never splits a surrogate pair when shortening', () => {
    const result = sanitize(`${'😀'.repeat(100)}.png`);
    expect(result.length).toBeLessThanOrEqual(MAX_FILE_NAME_LENGTH);
    expect(result).not.toMatch(/\p{Cs}/u);
    expect(result.endsWith('.png')).toBe(true);
  });

  it('cannot be tricked into a shell-parsed type by shortening', () => {
    const crafted = `${'A'.repeat(MAX_FILE_NAME_LENGTH - '.url'.length)}.url.${'x'.repeat(20)}`;
    expect(sanitize(crafted).endsWith('.url.txt')).toBe(true);
  });

  it.each([
    '../../../../Windows/win.ini',
    'C:evil.exe',
    '\\\\?\\C:\\Windows\\evil.exe',
    '..\u202E/..',
    'a/../../b',
    ' ../ ',
    'CON/../NUL',
  ])('always produces a name that stays inside the folder: %j', (name) => {
    const folder = process.platform === 'win32' ? 'C:\\receive' : '/receive';
    expect(() => resolveInsideFolder(folder, sanitize(name))).not.toThrow();
  });
});

describe('fallbackFileName', () => {
  it('uses the local date and time', () => {
    expect(fallbackFileName(new Date(2026, 10, 1, 15, 30, 12))).toBe('ilet-20261101-153012');
  });
});

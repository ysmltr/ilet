import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseSendToRequest,
  SEND_TO_SHORTCUT_NAME,
  sendToPaths,
} from '../../src/ui/sendToArguments';

const EXE = 'C:\\Program Files\\ilet\\ilet.exe';
const A = 'C:\\Users\\me\\Desktop\\report.pdf';
const B = 'D:\\Photos\\--inspect=9229.jpg';

describe('sendToPaths', () => {
  it('takes the files after --send-to-iphone --, whatever they are called', () => {
    expect(sendToPaths([EXE, '--send-to-iphone', '--', A, B])).toEqual([A, B]);
  });

  it.each([
    ['an ordinary start', [EXE]],
    ['a start with Windows', [EXE, '--hidden']],
    ['the switch without the end of switches', [EXE, '--send-to-iphone', A]],
    ['the switch without files', [EXE, '--send-to-iphone', '--']],
  ])('finds no files in %s', (_, argv: string[]) => {
    expect(sendToPaths(argv)).toBeUndefined();
  });
});

describe('parseSendToRequest', () => {
  it('accepts the files a second instance passed on', () => {
    expect(parseSendToRequest({ sendToIphone: [A, B] })).toEqual([A, B]);
  });

  it.each([
    ['nothing', undefined],
    ['text', A],
    ['a list without the key', [A]],
    ['one path instead of a list', { sendToIphone: A }],
    ['a path that is not text', { sendToIphone: [A, 42] }],
    ['an empty list', { sendToIphone: [] }],
    ['too many paths', { sendToIphone: Array<string>(1001).fill(A) }],
  ])('refuses %s', (_, additionalData: unknown) => {
    expect(parseSendToRequest(additionalData)).toBeUndefined();
  });
});

describe('the Send to shortcut', () => {
  it('is deleted again by the uninstaller', () => {
    const installerScript = readFileSync(path.resolve('installer', 'installer.nsh'), 'utf8');
    expect(installerScript).toContain(`!define ILET_SEND_TO_SHORTCUT "${SEND_TO_SHORTCUT_NAME}"`);
    expect(installerScript).toContain('Delete "$SENDTO\\${ILET_SEND_TO_SHORTCUT}"');
  });
});

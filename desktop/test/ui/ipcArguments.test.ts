import { describe, expect, it } from 'vitest';

import {
  booleanArgument,
  deviceIdArgument,
  droppedPathsArgument,
  noArguments,
  outboxIdArgument,
  renameDeviceArguments,
} from '../../src/ui/ipcArguments';

const DEVICE_ID = '0b9c6a51-1f0e-4f35-a3e5-1b2c3d4e5f60';
const OUTBOX_ID = '3f9c2a8e5b7d4c1e9a0b6f8d2c4e1a3b';
const A_PATH = 'C:\\Users\\me\\a.txt';

describe('IPC argument parsers', () => {
  it('accept exactly the arguments of their channel', () => {
    expect(noArguments([])).toEqual([]);
    expect(deviceIdArgument([DEVICE_ID])).toEqual([DEVICE_ID]);
    expect(renameDeviceArguments([DEVICE_ID, 'iPhone'])).toEqual([DEVICE_ID, 'iPhone']);
    expect(booleanArgument([true])).toEqual([true]);
    expect(outboxIdArgument([OUTBOX_ID])).toEqual([OUTBOX_ID]);
    expect(droppedPathsArgument([[A_PATH]])).toEqual([[A_PATH]]);
  });

  it.each([
    ['extra arguments', noArguments, [1]],
    ['a device ID that is not a UUID', deviceIdArgument, ['../../settings.json']],
    ['a device ID with an extra argument', deviceIdArgument, [DEVICE_ID, 'x']],
    ['a name that is not text', renameDeviceArguments, [DEVICE_ID, { toString: () => 'iPhone' }]],
    [
      'a name longer than the input field allows',
      renameDeviceArguments,
      [DEVICE_ID, 'x'.repeat(65)],
    ],
    ['a missing name', renameDeviceArguments, [DEVICE_ID]],
    ['a boolean as text', booleanArgument, ['true']],
    ['an outbox ID with a path in it', outboxIdArgument, ['..\\..\\outbox.json']],
    ['an upper-case outbox ID', outboxIdArgument, [OUTBOX_ID.toUpperCase()]],
    ['a drop without paths', droppedPathsArgument, [[]]],
    ['a drop with a path that is not text', droppedPathsArgument, [[A_PATH, 42]]],
    ['a drop of one path, not a list', droppedPathsArgument, [A_PATH]],
    ['a drop of over 1000 paths', droppedPathsArgument, [Array<string>(1001).fill(A_PATH)]],
    ['a path longer than Windows allows', droppedPathsArgument, [[`C:\\${'a'.repeat(32_767)}`]]],
  ])('reject %s', (_case, parse, args: unknown[]) => {
    expect(parse(args)).toBeUndefined();
  });
});

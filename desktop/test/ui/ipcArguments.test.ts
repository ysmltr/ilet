import { describe, expect, it } from 'vitest';

import {
  booleanArgument,
  deviceIdArgument,
  noArguments,
  renameDeviceArguments,
} from '../../src/ui/ipcArguments';

const DEVICE_ID = '0b9c6a51-1f0e-4f35-a3e5-1b2c3d4e5f60';

describe('IPC argument parsers', () => {
  it('accept exactly the arguments of their channel', () => {
    expect(noArguments([])).toEqual([]);
    expect(deviceIdArgument([DEVICE_ID])).toEqual([DEVICE_ID]);
    expect(renameDeviceArguments([DEVICE_ID, 'iPhone'])).toEqual([DEVICE_ID, 'iPhone']);
    expect(booleanArgument([true])).toEqual([true]);
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
  ])('reject %s', (_case, parse, args: unknown[]) => {
    expect(parse(args)).toBeUndefined();
  });
});

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createWindowsProfileReader,
  parseNetworkProfiles,
  type ProgramRunner,
} from '../../src/network/networkProfiles';
import { createMemoryLogger } from '../helpers/fakes';

const runsOnWindows = process.platform === 'win32';
const SYSTEM_ROOT = 'C:\\Windows';
const POWERSHELL_QUERY_TIMEOUT_MS = 20_000;

describe('parseNetworkProfiles', () => {
  it('reads the adapter names and categories', () => {
    const output =
      '[{"category":0,"name":"Wi-Fi"},{"category":1,"name":"Ethernet"},{"category":2,"name":"Şirket ağı"}]';
    expect(parseNetworkProfiles(output)).toEqual([
      { interfaceName: 'Wi-Fi', category: 'public' },
      { interfaceName: 'Ethernet', category: 'private' },
      { interfaceName: 'Şirket ağı', category: 'domain' },
    ]);
  });

  it('reads a PC without connected networks', () => {
    expect(parseNetworkProfiles('[]')).toEqual([]);
  });

  it.each([
    ['an error message', 'Get-NetConnectionProfile : Access is denied.'],
    ['an object instead of a list', '{"category":0,"name":"Wi-Fi"}'],
    ['an unknown category', '[{"category":7,"name":"Wi-Fi"}]'],
    ['a category as text', '[{"category":"Public","name":"Wi-Fi"}]'],
    ['a missing name', '[{"category":0}]'],
    ['an empty name', '[{"category":0,"name":""}]'],
  ])('treats %s as unknown categories', (_case, output) => {
    expect(parseNetworkProfiles(output)).toBeUndefined();
  });
});

describe('createWindowsProfileReader', () => {
  it('runs Windows PowerShell by its full path, with a fixed command', async () => {
    const calls: { program: string; args: readonly string[] }[] = [];
    const run: ProgramRunner = (program, args) => {
      calls.push({ program, args });
      return Promise.resolve('[]');
    };

    expect(await createWindowsProfileReader(SYSTEM_ROOT, createMemoryLogger(), run)()).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.program).toBe(
      path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    );
    expect(calls[0]?.args.slice(0, 4)).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
    ]);
  });

  it('reports unknown categories when PowerShell fails, and logs why', async () => {
    const logger = createMemoryLogger();
    const read = createWindowsProfileReader(SYSTEM_ROOT, logger, () =>
      Promise.reject(new Error('timed out')),
    );

    expect(await read()).toBeUndefined();
    expect(logger.lines.join('\n')).toContain('could not read the network categories');
  });

  it('reports unknown categories for output it does not understand', async () => {
    const logger = createMemoryLogger();
    const read = createWindowsProfileReader(SYSTEM_ROOT, logger, () => Promise.resolve('{}'));

    expect(await read()).toBeUndefined();
    expect(logger.lines.join('\n')).toContain('unexpected format');
  });

  it.runIf(runsOnWindows)(
    'reads the networks of this PC',
    async () => {
      const read = createWindowsProfileReader(
        process.env['SystemRoot'] ?? SYSTEM_ROOT,
        createMemoryLogger(),
      );
      expect(Array.isArray(await read())).toBe(true);
    },
    POWERSHELL_QUERY_TIMEOUT_MS,
  );
});

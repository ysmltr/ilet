import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { errorFields, type Logger } from '../shared/logger';
import { isRecord } from '../shared/validation';

/** How Windows classifies a network; its firewall trusts Public networks least. */
export type NetworkCategory = 'public' | 'private' | 'domain';

export interface NetworkProfile {
  /** The adapter's name, as `os.networkInterfaces()` reports it. */
  readonly interfaceName: string;
  readonly category: NetworkCategory;
}

/** Resolves to `undefined` when the categories are unknown: another platform, or a failed query. */
export type NetworkProfileReader = () => Promise<readonly NetworkProfile[] | undefined>;

/** Runs a program with fixed arguments and resolves to what it printed. */
export type ProgramRunner = (program: string, args: readonly string[]) => Promise<string>;

/** The NetworkCategory values of Windows' MSFT_NetConnectionProfile. */
const CATEGORY_BY_VALUE: ReadonlyMap<number, NetworkCategory> = new Map([
  [0, 'public'],
  [1, 'private'],
  [2, 'domain'],
]);

const QUERY_TIMEOUT_MS = 10_000;
const MAX_QUERY_OUTPUT_BYTES = 256 * 1024;

/**
 * Lists the connected networks as JSON. The command is a constant, so no outside text ever
 * reaches PowerShell. UTF-8 output keeps localized adapter names intact, and `-InputObject` keeps
 * a single network in an array.
 */
const PROFILE_QUERY = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '$profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object ' +
    '{ @{ name = $_.InterfaceAlias; category = [int]$_.NetworkCategory } })',
  'ConvertTo-Json -InputObject $profiles -Compress',
].join('; ');

/** Windows has no other API for the network category that Node.js or Electron can call. */
export function createWindowsProfileReader(
  systemRoot: string,
  logger: Logger,
  run: ProgramRunner = runProgram,
): NetworkProfileReader {
  // The full path, so that a powershell.exe elsewhere on PATH is never run instead.
  const powerShell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROFILE_QUERY];
  return async () => {
    try {
      const profiles = parseNetworkProfiles(await run(powerShell, args));
      if (profiles === undefined) {
        logger.warn('network categories have an unexpected format');
      }
      return profiles;
    } catch (error) {
      logger.warn('could not read the network categories', errorFields(error));
      return undefined;
    }
  };
}

export function parseNetworkProfiles(output: string): NetworkProfile[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const profiles: NetworkProfile[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry['name'] !== 'string' || entry['name'] === '') {
      return undefined;
    }
    const category =
      typeof entry['category'] === 'number' ? CATEGORY_BY_VALUE.get(entry['category']) : undefined;
    if (category === undefined) {
      return undefined;
    }
    profiles.push({ interfaceName: entry['name'], category });
  }
  return profiles;
}

const execFileAsync = promisify(execFile);

async function runProgram(program: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync(program, args, {
    encoding: 'utf8',
    timeout: QUERY_TIMEOUT_MS,
    maxBuffer: MAX_QUERY_OUTPUT_BYTES,
    windowsHide: true,
  });
  return stdout;
}

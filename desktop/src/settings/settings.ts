import path from 'node:path';

import {
  APP_NAME,
  DEFAULT_MAX_CONCURRENT_UPLOADS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_PORT,
} from '../protocol/constants';
import { StartupError } from '../shared/errors';
import { readJsonFile, writeJsonFileAtomic } from '../shared/jsonFile';
import { sanitizeDisplayName } from '../shared/text';
import { isIntegerInRange, isRecord } from '../shared/validation';

export interface Settings {
  readonly displayName: string;
  readonly receiveFolder: string;
  readonly port: number;
  readonly maxFileSizeBytes: number;
  readonly maxConcurrentUploads: number;
}

export interface SettingsEnvironment {
  readonly hostname: string;
  readonly downloadsFolder: string;
}

const SETTINGS_FORMAT_VERSION = 1;
/** Ports below 1024 are privileged on macOS and Linux. */
const PORT_RANGE = { min: 1024, max: 65_535 } as const;
const MAX_FILE_SIZE_RANGE = { min: 1, max: Number.MAX_SAFE_INTEGER } as const;
const CONCURRENT_UPLOADS_RANGE = { min: 1, max: 16 } as const;

export function defaultSettings(environment: SettingsEnvironment): Settings {
  return {
    displayName: sanitizeDisplayName(environment.hostname) || APP_NAME,
    receiveFolder: path.join(environment.downloadsFolder, APP_NAME),
    port: DEFAULT_PORT,
    maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
    maxConcurrentUploads: DEFAULT_MAX_CONCURRENT_UPLOADS,
  };
}

/** Loads the settings file, creating it with `defaults` on first launch. */
export async function loadOrCreateSettings(
  filePath: string,
  defaults: Settings,
): Promise<Settings> {
  const stored = await readJsonFile(filePath);
  if (stored === undefined) {
    await saveSettings(filePath, defaults);
    return defaults;
  }
  const settings = parseSettings(stored);
  if (settings === undefined) {
    throw new StartupError('data_file_invalid', { detail: filePath });
  }
  return settings;
}

export async function saveSettings(filePath: string, settings: Settings): Promise<void> {
  await writeJsonFileAtomic(filePath, { formatVersion: SETTINGS_FORMAT_VERSION, ...settings });
}

/** The same rules that a settings file must pass when it is loaded. */
export function areValidSettings(settings: Settings): boolean {
  return parseSettings({ formatVersion: SETTINGS_FORMAT_VERSION, ...settings }) !== undefined;
}

function parseSettings(value: unknown): Settings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const {
    formatVersion,
    displayName,
    receiveFolder,
    port,
    maxFileSizeBytes,
    maxConcurrentUploads,
  } = value;
  const valid =
    formatVersion === SETTINGS_FORMAT_VERSION &&
    typeof displayName === 'string' &&
    displayName !== '' &&
    sanitizeDisplayName(displayName) === displayName &&
    typeof receiveFolder === 'string' &&
    path.isAbsolute(receiveFolder) &&
    isIntegerInRange(port, PORT_RANGE.min, PORT_RANGE.max) &&
    isIntegerInRange(maxFileSizeBytes, MAX_FILE_SIZE_RANGE.min, MAX_FILE_SIZE_RANGE.max) &&
    isIntegerInRange(
      maxConcurrentUploads,
      CONCURRENT_UPLOADS_RANGE.min,
      CONCURRENT_UPLOADS_RANGE.max,
    );
  return valid
    ? { displayName, receiveFolder, port, maxFileSizeBytes, maxConcurrentUploads }
    : undefined;
}

import { writeFile } from 'node:fs/promises';

import { StartupError } from '../shared/errors';

/** Marks a file as coming from an untrusted source, so the OS warns before running it. */
export type UntrustedFileMarker = (filePath: string) => Promise<void>;

/** The NTFS alternate data stream that browsers write for downloads. */
const ZONE_IDENTIFIER_STREAM = ':Zone.Identifier';
/** URLZONE_INTERNET: SmartScreen and Office Protected View treat the file as an internet download. */
const INTERNET_ZONE_ID = 3;
const ZONE_IDENTIFIER_CONTENT = `[ZoneTransfer]\r\nZoneId=${String(INTERNET_ZONE_ID)}\r\n`;

export async function writeZoneIdentifier(filePath: string): Promise<void> {
  await writeFile(`${filePath}${ZONE_IDENTIFIER_STREAM}`, ZONE_IDENTIFIER_CONTENT, 'ascii');
}

/** There is no marker for other platforms yet, so the server refuses to run there. */
export function createUntrustedFileMarker(platform: NodeJS.Platform): UntrustedFileMarker {
  if (platform === 'win32') {
    return writeZoneIdentifier;
  }
  throw new StartupError('unsupported_platform', { detail: platform });
}

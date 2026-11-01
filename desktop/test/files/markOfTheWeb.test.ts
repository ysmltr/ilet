import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createUntrustedFileMarker, writeZoneIdentifier } from '../../src/files/markOfTheWeb';
import { StartupError } from '../../src/shared/errors';
import { createTempFolder } from '../helpers/fakes';

describe('Mark-of-the-Web', () => {
  it.runIf(process.platform === 'win32')(
    'writes the Internet zone and survives a rename',
    async () => {
      const folder = await createTempFolder();
      const partPath = path.join(folder, 'upload.part');
      const finalPath = path.join(folder, 'photo.jpg');
      await writeFile(partPath, 'data');

      await writeZoneIdentifier(partPath);
      await rename(partPath, finalPath);

      const zone = await readFile(`${finalPath}:Zone.Identifier`, 'ascii');
      expect(zone).toBe('[ZoneTransfer]\r\nZoneId=3\r\n');
      expect(await readFile(finalPath, 'utf8')).toBe('data');
    },
  );

  it('uses the Zone.Identifier marker on Windows', () => {
    expect(createUntrustedFileMarker('win32')).toBe(writeZoneIdentifier);
  });

  it('refuses platforms without a marker instead of saving unmarked files', () => {
    expect(() => createUntrustedFileMarker('linux')).toThrow(StartupError);
  });
});

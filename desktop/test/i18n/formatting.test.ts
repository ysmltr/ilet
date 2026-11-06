import { describe, expect, it } from 'vitest';

import { formatBytes } from '../../src/i18n/formatting';

describe('formatBytes', () => {
  it.each([
    [0, '0 bytes', '0 bayt'],
    [1, '1 byte', '1 bayt'],
    [1023, '1,023 bytes', '1.023 bayt'],
    [1024, '1 kB', '1 kB'],
    [1536, '1.5 kB', '1,5 kB'],
    [13_002_342, '12.4 MB', '12,4 MB'],
    [8 * 1024 ** 3, '8 GB', '8 GB'],
    [5 * 1024 ** 4, '5 TB', '5 TB'],
  ])('shows %d bytes in steps of 1024', (bytes, english, turkish) => {
    expect(formatBytes(bytes, 'en')).toBe(english);
    expect(formatBytes(bytes, 'tr')).toBe(turkish);
  });
});

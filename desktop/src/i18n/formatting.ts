import type { Language } from './messages';

const BYTES_PER_UNIT = 1024;
/** As Windows Explorer shows sizes: steps of 1024, named kB, MB, GB, TB. */
const LARGER_UNITS = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** "512 bytes", "1.5 MB", "8 GB" (in Turkish "512 bayt", "1,5 MB", "8 GB"). */
export function formatBytes(bytes: number, language: Language): string {
  if (bytes < BYTES_PER_UNIT) {
    return new Intl.NumberFormat(language, {
      style: 'unit',
      unit: 'byte',
      unitDisplay: 'long',
    }).format(bytes);
  }
  let value = bytes / BYTES_PER_UNIT;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < LARGER_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: LARGER_UNITS[unitIndex] ?? 'terabyte',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

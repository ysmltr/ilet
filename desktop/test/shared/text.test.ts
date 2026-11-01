import { describe, expect, it } from 'vitest';

import { formatLogLine } from '../../src/shared/logger';
import {
  removeInvisibleCharacters,
  sanitizeDisplayName,
  truncateToLength,
} from '../../src/shared/text';

describe('removeInvisibleCharacters', () => {
  it('removes control, format and separator characters', () => {
    expect(removeInvisibleCharacters('a\u0007b‮c​d﻿e f')).toBe('abcdef');
  });

  it('keeps Turkish letters and emoji', () => {
    expect(removeInvisibleCharacters('İstanbul’da çay 🍵')).toBe('İstanbul’da çay 🍵');
  });
});

describe('truncateToLength', () => {
  it('stops before a surrogate pair that does not fit', () => {
    expect(truncateToLength('ab😀', 3)).toBe('ab');
    expect(truncateToLength('ab😀', 4)).toBe('ab😀');
  });
});

describe('sanitizeDisplayName', () => {
  it('collapses and trims spaces', () => {
    expect(sanitizeDisplayName('  My    iPhone  ')).toBe('My iPhone');
  });

  it('limits the length to 64 code units', () => {
    expect(sanitizeDisplayName('x'.repeat(100))).toHaveLength(64);
  });
});

describe('formatLogLine', () => {
  it('escapes values so they cannot forge extra log lines', () => {
    const line = formatLogLine(
      'warn',
      'authentication failed',
      { device: 'phone\n2026-01-01T00:00:00.000Z INFO forged' },
      new Date('2026-11-01T12:00:00.000Z'),
    );
    expect(line).not.toContain('\n');
    expect(line).toBe(
      '2026-11-01T12:00:00.000Z WARN authentication failed device="phone\\n2026-01-01T00:00:00.000Z INFO forged"',
    );
  });
});

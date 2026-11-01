import { describe, expect, it } from 'vitest';

import { objectIdentifier, octetString, time, unsignedInteger } from '../../src/identity/der';

const hex = (buffer: Buffer): string => buffer.toString('hex');

describe('DER encoding', () => {
  it('encodes object identifiers (X.690 example: ecdsa-with-SHA256)', () => {
    expect(hex(objectIdentifier('1.2.840.10045.4.3.2'))).toBe('06082a8648ce3d040302');
  });

  it('uses the short length form below 128 bytes and the long form above', () => {
    expect(hex(octetString(Buffer.alloc(127))).slice(0, 4)).toBe('047f');
    expect(hex(octetString(Buffer.alloc(128))).slice(0, 6)).toBe('048180');
    expect(hex(octetString(Buffer.alloc(300))).slice(0, 8)).toBe('0482012c');
  });

  it('encodes integers in minimal positive form', () => {
    expect(hex(unsignedInteger(Buffer.of(0x00, 0x00, 0x05)))).toBe('020105');
    expect(hex(unsignedInteger(Buffer.of(0x80)))).toBe('02020080');
    expect(hex(unsignedInteger(Buffer.of(0x00)))).toBe('020100');
  });

  it('uses UTCTime through 2049 and GeneralizedTime afterwards', () => {
    expect(time(new Date(Date.UTC(2026, 10, 1, 15, 30, 12))).toString('latin1')).toBe(
      '\x17\x0d261101153012Z',
    );
    expect(time(new Date(Date.UTC(9999, 11, 31, 23, 59, 59))).toString('latin1')).toBe(
      '\x18\x0f99991231235959Z',
    );
  });
});

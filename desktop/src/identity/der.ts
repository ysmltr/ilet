/**
 * A minimal DER (ASN.1 Distinguished Encoding Rules, ITU-T X.690) writer with only what a
 * self-signed X.509 certificate needs.
 */
import assert from 'node:assert/strict';

const Tag = {
  boolean: 0x01,
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  objectIdentifier: 0x06,
  utf8String: 0x0c,
  utcTime: 0x17,
  generalizedTime: 0x18,
  sequence: 0x30,
  set: 0x31,
} as const;

const CONTEXT_SPECIFIC_PRIMITIVE = 0x80;
const CONTEXT_SPECIFIC_CONSTRUCTED = 0xa0;
const MAX_SHORT_FORM_LENGTH = 0x7f;
const LONG_FORM_LENGTH_FLAG = 0x80;
const BYTE_VALUES = 0x100;
const MAX_POSITIVE_FIRST_BYTE = 0x7f;
const BASE128_RADIX = 0x80;
const BASE128_CONTINUATION_FLAG = 0x80;
const OID_FIRST_ARC_MULTIPLIER = 40;
const TRUE_BYTE = 0xff;
const NO_UNUSED_BITS = 0x00;
/** RFC 5280 §4.1.2.5: dates through 2049 use UTCTime, later dates GeneralizedTime. */
const LAST_UTC_TIME_YEAR = 2049;
const UTC_TIME_YEAR_DIGITS = 2;
const ISO_DATE_TIME_TO_SECONDS_LENGTH = 'YYYY-MM-DDTHH:MM:SS'.length;

function encodeLength(length: number): Buffer {
  if (length <= MAX_SHORT_FORM_LENGTH) {
    return Buffer.of(length);
  }
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / BYTE_VALUES)) {
    bytes.unshift(remaining % BYTE_VALUES);
  }
  return Buffer.of(LONG_FORM_LENGTH_FLAG | bytes.length, ...bytes);
}

function element(tag: number, content: Uint8Array): Buffer {
  return Buffer.concat([Buffer.of(tag), encodeLength(content.length), content]);
}

function base128(value: number): number[] {
  const digits = [value % BASE128_RADIX];
  for (
    let remaining = Math.floor(value / BASE128_RADIX);
    remaining > 0;
    remaining = Math.floor(remaining / BASE128_RADIX)
  ) {
    digits.unshift((remaining % BASE128_RADIX) | BASE128_CONTINUATION_FLAG);
  }
  return digits;
}

export function sequence(...items: readonly Uint8Array[]): Buffer {
  return element(Tag.sequence, Buffer.concat(items));
}

export function set(...items: readonly Uint8Array[]): Buffer {
  return element(Tag.set, Buffer.concat(items));
}

/** A non-negative INTEGER from big-endian bytes, in DER's minimal two's-complement form. */
export function unsignedInteger(bigEndianBytes: Uint8Array): Buffer {
  let start = 0;
  while (start < bigEndianBytes.length - 1 && bigEndianBytes[start] === 0) {
    start += 1;
  }
  const minimal = bigEndianBytes.subarray(start);
  const needsSignByte = (minimal[0] ?? 0) > MAX_POSITIVE_FIRST_BYTE;
  return element(Tag.integer, needsSignByte ? Buffer.concat([Buffer.of(0), minimal]) : minimal);
}

export function objectIdentifier(dottedOid: string): Buffer {
  const [first, second, ...rest] = dottedOid.split('.').map(Number);
  assert(first !== undefined && second !== undefined, `invalid object identifier ${dottedOid}`);
  const arcs = [first * OID_FIRST_ARC_MULTIPLIER + second, ...rest];
  return element(Tag.objectIdentifier, Buffer.from(arcs.flatMap(base128)));
}

export function booleanTrue(): Buffer {
  return element(Tag.boolean, Buffer.of(TRUE_BYTE));
}

export function utf8String(text: string): Buffer {
  return element(Tag.utf8String, Buffer.from(text, 'utf8'));
}

export function octetString(content: Uint8Array): Buffer {
  return element(Tag.octetString, content);
}

/** A BIT STRING made of whole bytes. */
export function bitString(content: Uint8Array): Buffer {
  return element(Tag.bitString, Buffer.concat([Buffer.of(NO_UNUSED_BITS), content]));
}

/** `[tagNumber] EXPLICIT`: wraps a complete element. */
export function explicitTag(tagNumber: number, content: Uint8Array): Buffer {
  return element(CONTEXT_SPECIFIC_CONSTRUCTED | tagNumber, content);
}

/** `[tagNumber] IMPLICIT` for a primitive type: replaces the type's own tag. */
export function implicitPrimitiveTag(tagNumber: number, content: Uint8Array): Buffer {
  return element(CONTEXT_SPECIFIC_PRIMITIVE | tagNumber, content);
}

/** A certificate Time in UTC, whole seconds (RFC 5280 §4.1.2.5). */
export function time(date: Date): Buffer {
  const digits = date.toISOString().slice(0, ISO_DATE_TIME_TO_SECONDS_LENGTH).replace(/[-T:]/g, '');
  return date.getUTCFullYear() <= LAST_UTC_TIME_YEAR
    ? element(Tag.utcTime, Buffer.from(`${digits.slice(UTC_TIME_YEAR_DIGITS)}Z`, 'ascii'))
    : element(Tag.generalizedTime, Buffer.from(`${digits}Z`, 'ascii'));
}

import { MAX_DISPLAY_NAME_LENGTH } from '../protocol/constants';

/**
 * Control (Cc), format (Cf, for example the right-to-left override U+202E), lone surrogate
 * (Cs), line separator (Zl) and paragraph separator (Zp) characters. They are invisible or change
 * how the surrounding text is displayed.
 */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;
const SPACE_SEPARATORS = /\p{Zs}/gu;
const REPEATED_SPACES = / {2,}/g;

/** NFC-normalizes text, removes invisible characters and turns every kind of space into " ". */
export function removeInvisibleCharacters(text: string): string {
  return text.normalize('NFC').replace(INVISIBLE_CHARACTERS, '').replace(SPACE_SEPARATORS, ' ');
}

/** Shortens text to at most `maxLength` UTF-16 code units without splitting a surrogate pair. */
export function truncateToLength(text: string, maxLength: number): string {
  let result = '';
  for (const codePoint of text) {
    if (result.length + codePoint.length > maxLength) {
      break;
    }
    result += codePoint;
  }
  return result;
}

/** Shortens text to at most `maxBytes` bytes of UTF-8 without splitting a character. */
export function truncateToUtf8Bytes(text: string, maxBytes: number): string {
  let result = '';
  let byteCount = 0;
  for (const codePoint of text) {
    byteCount += Buffer.byteLength(codePoint);
    if (byteCount > maxBytes) {
      break;
    }
    result += codePoint;
  }
  return result;
}

/** Cleans a human-readable device or display name. The result can be empty. */
export function sanitizeDisplayName(name: string): string {
  const cleaned = removeInvisibleCharacters(name).replace(REPEATED_SPACES, ' ').trim();
  return truncateToLength(cleaned, MAX_DISPLAY_NAME_LENGTH).trimEnd();
}

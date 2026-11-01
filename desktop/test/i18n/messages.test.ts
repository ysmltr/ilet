import { describe, expect, it } from 'vitest';

import {
  createTranslator,
  isMessageKey,
  type MessageKey,
  messagesFor,
  resolveLanguage,
} from '../../src/i18n/messages';

const PLACEHOLDER = /\{\w+\}/g;
const placeholdersOf = (text: string): string[] =>
  [...text.matchAll(PLACEHOLDER)].map(String).sort();

describe('messages', () => {
  it('has the same placeholders in English and Turkish', () => {
    const english = messagesFor('en');
    const turkish = messagesFor('tr');
    for (const key of Object.keys(english) as MessageKey[]) {
      expect(placeholdersOf(turkish[key]), key).toEqual(placeholdersOf(english[key]));
    }
  });

  it('fills in placeholders', () => {
    expect(createTranslator('tr')('pairedWith', { name: 'Yeşim’in iPhone’u' })).toBe(
      'Yeşim’in iPhone’u eşleştirildi.',
    );
    expect(createTranslator('en')('expiresIn', { time: '1:59' })).toBe('Expires in 1:59');
  });

  it('recognizes message keys', () => {
    expect(isMessageKey('pairNewDevice')).toBe(true);
    expect(isMessageKey('toString')).toBe(false);
  });
});

describe('resolveLanguage', () => {
  it.each([
    [['tr-TR', 'en-US'], 'tr'],
    [['TR'], 'tr'],
    [['de-DE', 'en-GB'], 'en'],
    [['de-DE'], 'en'],
    [[], 'en'],
  ])('picks a supported language from %j', (preferred, expected) => {
    expect(resolveLanguage(preferred)).toBe(expected);
  });
});

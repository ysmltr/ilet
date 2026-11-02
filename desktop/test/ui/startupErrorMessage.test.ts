import { describe, expect, it } from 'vitest';

import { createTranslator } from '../../src/i18n/messages';
import { StartupError } from '../../src/shared/errors';
import { startupErrorMessage } from '../../src/ui/startupErrorMessage';

const translate = createTranslator('en');

describe('startupErrorMessage', () => {
  it('explains a known startup problem without technical details', () => {
    const message = startupErrorMessage(
      new StartupError('port_in_use', { detail: '45380' }),
      translate,
    );
    expect(message).toBe(translate('startupPortInUse'));
    expect(message).not.toContain('45380');
  });

  it('gives a general message for anything else', () => {
    expect(startupErrorMessage(new Error('EACCES: C:\\secret\\path'), translate)).toBe(
      translate('startupUnexpectedError'),
    );
  });
});

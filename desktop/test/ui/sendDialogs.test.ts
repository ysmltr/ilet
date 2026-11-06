import { describe, expect, it } from 'vitest';

import { createTranslator } from '../../src/i18n/messages';
import type { SendFailure } from '../../src/outbox/outbox';
import {
  MAX_DEVICE_BUTTONS,
  sendFailureQuestion,
  sendQuestion,
  type SendTarget,
} from '../../src/ui/sendDialogs';

const translate = createTranslator('en');
const PHONE: SendTarget = { id: 'phone', name: 'Yeşim’s iPhone' };

function devices(count: number): SendTarget[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `device-${String(index)}`,
    name: `iPhone ${String(index)}`,
  }));
}

describe('sendQuestion', () => {
  it('names a single file and offers its device, with Cancel as the default', () => {
    const { question, targets } = sendQuestion(['report.pdf'], [PHONE], translate);
    expect(question).toEqual({
      type: 'question',
      title: 'Send files',
      message: 'Send “report.pdf”?',
      detail: 'Files wait on this PC until ilet on the iPhone fetches them, for up to 24 hours.',
      buttons: ['Send to Yeşim’s iPhone', 'Cancel'],
    });
    expect(targets).toEqual([PHONE]);
  });

  it('lists up to ten files and counts the rest', () => {
    const names = Array.from({ length: 12 }, (_, index) => `IMG_${String(index)}.JPG`);
    const { question } = sendQuestion(names, [PHONE], translate);
    expect(question.message).toBe('Send 12 files?');
    expect(question.detail.split('\n')).toEqual([
      ...names.slice(0, 10),
      '…and 2 more',
      '',
      'Files wait on this PC until ilet on the iPhone fetches them, for up to 24 hours.',
    ]);
  });

  it('offers the newest devices first, at most eight', () => {
    const paired = devices(10);
    const { question, targets } = sendQuestion(['a.txt'], paired, translate);
    expect(targets).toHaveLength(MAX_DEVICE_BUTTONS);
    expect(targets[0]).toEqual(paired[9]);
    expect(question.buttons).toHaveLength(MAX_DEVICE_BUTTONS + 1);
    expect(question.buttons.at(-1)).toBe('Cancel');
  });

  it('shows an "&" in a device name as it is, not as a keyboard shortcut', () => {
    const { question } = sendQuestion(['a.txt'], [{ id: 'x', name: 'Tom & Ada' }], translate);
    expect(question.buttons[0]).toBe('Send to Tom && Ada');
  });
});

describe('sendFailureQuestion', () => {
  it('says why each file was not sent', () => {
    const failed: SendFailure[] = [
      { name: 'movie.mov', problem: 'too-large' },
      { name: 'Photos', problem: 'not-a-file' },
    ];
    const question = sendFailureQuestion(failed, '8 GB', translate);
    expect(question.message).toBe('2 files were not sent.');
    expect(question.detail).toBe(
      'movie.mov: larger than 8 GB.\nPhotos: folders cannot be sent, only files.',
    );
    expect(question.buttons).toEqual(['OK']);
  });

  it('names a single file', () => {
    const question = sendFailureQuestion(
      [{ name: 'a.txt', problem: 'outbox-full' }],
      '8 GB',
      translate,
    );
    expect(question.message).toBe('“a.txt” was not sent.');
    expect(question.detail).toBe('a.txt: 200 files are already waiting for this iPhone.');
  });
});

import type { Translate } from '../i18n/messages';
import type { SendFailure } from '../outbox/outbox';
import { OUTBOX_LIMITS } from '../protocol/constants';
import type { Question } from './appWindow';

/** Longer lists end with "…and 7 more". */
const MAX_LISTED_LINES = 10;
/** More buttons would not fit on the screen; the newest devices are offered. */
export const MAX_DEVICE_BUTTONS = 8;
const LINE_BREAK = '\n';
const PARAGRAPH_BREAK = '\n\n';
/** Windows reads "&" in a button as the marker of its keyboard shortcut; "&&" is a plain "&". */
const ACCESS_KEY_MARKER = /&/g;
const ESCAPED_ACCESS_KEY_MARKER = '&&';

export interface SendTarget {
  readonly id: string;
  readonly name: string;
}

export interface SendQuestion {
  readonly question: Question;
  /** The device behind each button, in order. The last button, Cancel, has none. */
  readonly targets: readonly SendTarget[];
}

/**
 * Names the files and asks which device gets them: one button per device, newest first, then
 * Cancel, which is also the default. This is the confirmation for drops and Send to, so the user
 * sees which files leave the PC before anything is copied.
 */
export function sendQuestion(
  names: readonly string[],
  devices: readonly SendTarget[],
  translate: Translate,
): SendQuestion {
  const targets = devices.slice(-MAX_DEVICE_BUTTONS).reverse();
  const [onlyName] = names;
  const single = names.length === 1 && onlyName !== undefined;
  return {
    question: {
      type: 'question',
      title: translate('sendFilesTitle'),
      message: single
        ? translate('sendOneFileQuestion', { file: onlyName })
        : translate('sendFilesQuestion', { count: String(names.length) }),
      detail: single
        ? translate('sendFilesDetail')
        : [listOf(names, translate), translate('sendFilesDetail')].join(PARAGRAPH_BREAK),
      buttons: [
        ...targets.map(({ name }) => buttonLabel(translate('sendTo', { device: name }))),
        translate('cancel'),
      ],
    },
    targets,
  };
}

/** Which files were not sent, and why. `maxFileSize` is the formatted size limit. */
export function sendFailureQuestion(
  failed: readonly SendFailure[],
  maxFileSize: string,
  translate: Translate,
): Question {
  const [onlyFailure] = failed;
  return {
    type: 'warning',
    title: translate('sendFilesTitle'),
    message:
      failed.length === 1 && onlyFailure !== undefined
        ? translate('oneFileNotSent', { file: onlyFailure.name })
        : translate('filesNotSent', { count: String(failed.length) }),
    detail: listOf(
      failed.map((failure) => problemText(failure, maxFileSize, translate)),
      translate,
    ),
    buttons: [translate('ok')],
  };
}

/** A message with only an OK button. */
export function sendMessage(message: string, translate: Translate): Question {
  return {
    type: 'info',
    title: translate('sendFilesTitle'),
    message,
    detail: '',
    buttons: [translate('ok')],
  };
}

function problemText(failure: SendFailure, maxFileSize: string, translate: Translate): string {
  const file = { file: failure.name };
  switch (failure.problem) {
    case 'not-a-local-file':
      return translate('problemNotALocalFile', file);
    case 'not-a-file':
      return translate('problemNotAFile', file);
    case 'unreadable':
      return translate('problemUnreadable', file);
    case 'too-large':
      return translate('problemTooLarge', { ...file, max: maxFileSize });
    case 'no-space':
      return translate('problemNoSpace', file);
    case 'outbox-full':
      return translate('problemOutboxFull', {
        ...file,
        max: String(OUTBOX_LIMITS.maxFilesPerDevice),
      });
    case 'device-removed':
      return translate('problemDeviceRemoved', file);
  }
}

function listOf(lines: readonly string[], translate: Translate): string {
  const listed = lines.slice(0, MAX_LISTED_LINES);
  const rest = lines.length - listed.length;
  const more = rest > 0 ? [translate('moreFileNames', { count: String(rest) })] : [];
  return [...listed, ...more].join(LINE_BREAK);
}

function buttonLabel(text: string): string {
  return text.replace(ACCESS_KEY_MARKER, ESCAPED_ACCESS_KEY_MARKER);
}

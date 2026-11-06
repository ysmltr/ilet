import { isRecord } from '../shared/validation';
import { isPathList } from './ipcArguments';

/**
 * Explorer's Send to shortcut starts ilet as `ilet.exe --send-to-iphone -- <files>`. After `--`,
 * Chromium reads nothing as a switch, whatever a file is called.
 */
export const SEND_TO_ARGUMENT = '--send-to-iphone';
export const END_OF_SWITCHES = '--';

/** What Explorer shows under Send to. The uninstaller deletes the shortcut by this name. */
export const SEND_TO_SHORTCUT_NAME = 'iPhone (ilet).lnk';

/** What a second instance passes to the running one (`requestSingleInstanceLock`). */
export interface SendToRequest {
  readonly sendToIphone: readonly string[];
}

/** The files after `--send-to-iphone --`, or `undefined` when Send to did not start ilet. */
export function sendToPaths(argv: readonly string[]): readonly string[] | undefined {
  const index = argv.indexOf(SEND_TO_ARGUMENT);
  if (index === -1 || argv[index + 1] !== END_OF_SWITCHES) {
    return undefined;
  }
  const paths = argv.slice(index + 2);
  return isPathList(paths) ? paths : undefined;
}

/**
 * The files a second instance passed on. Any program can start one, so the data is checked like
 * a message from the window, and the user confirms the files before anything is copied.
 */
export function parseSendToRequest(additionalData: unknown): readonly string[] | undefined {
  if (!isRecord(additionalData)) {
    return undefined;
  }
  const { sendToIphone } = additionalData;
  return isPathList(sendToIphone) ? sendToIphone : undefined;
}

import type { MessageKey, Translate } from '../i18n/messages';
import { StartupError, type StartupErrorCode } from '../shared/errors';

const MESSAGE_BY_CODE: Readonly<Record<StartupErrorCode, MessageKey>> = {
  port_in_use: 'startupPortInUse',
  secure_storage_unavailable: 'startupSecureStorageUnavailable',
  data_file_invalid: 'startupDataFileInvalid',
  unsupported_platform: 'startupUnsupportedPlatform',
};

/** What to tell the user when ilet cannot start. Details stay in the log. */
export function startupErrorMessage(error: unknown, translate: Translate): string {
  return translate(
    error instanceof StartupError ? MESSAGE_BY_CODE[error.code] : 'startupUnexpectedError',
  );
}

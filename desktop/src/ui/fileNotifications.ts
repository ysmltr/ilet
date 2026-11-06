import type { Translate } from '../i18n/messages';
import { BatchedNotifications, type ShowNotification } from './batchedNotifications';

export type { NotificationContent } from './batchedNotifications';

export interface ReceivedFileNotice {
  readonly filePath: string;
  readonly fileName: string;
  readonly deviceName: string;
}

export interface FileNotificationDependencies {
  readonly show: ShowNotification;
  /** Shows the file selected in Explorer. Received files are never opened. */
  readonly reveal: (filePath: string) => void;
  readonly translate: Translate;
}

/**
 * The first file is announced at once. Files arriving during the quiet period that follows are
 * counted and announced together when it ends; clicking reveals the latest of them.
 */
export class FileNotifications {
  private readonly batch: BatchedNotifications<ReceivedFileNotice>;

  constructor({ show, reveal, translate }: FileNotificationDependencies) {
    this.batch = new BatchedNotifications(show, {
      one: ({ fileName, deviceName }) => ({
        title: translate('fileReceivedTitle'),
        body: translate('fileReceivedBody', { file: fileName, device: deviceName }),
      }),
      more: (count, { fileName, deviceName }) => ({
        title:
          count === 1
            ? translate('oneMoreFileReceivedTitle')
            : translate('moreFilesReceivedTitle', { count: String(count) }),
        body: translate('latestFileBody', { file: fileName, device: deviceName }),
      }),
      onClick: ({ filePath }) => {
        reveal(filePath);
      },
    });
  }

  fileReceived(notice: ReceivedFileNotice): void {
    this.batch.add(notice);
  }
}

export interface DeliveredFileNotice {
  readonly fileName: string;
  readonly deviceName: string;
}

/** Files that a phone fetched and confirmed. Clicking opens ilet's window. */
export function deliveryNotifications(
  show: ShowNotification,
  translate: Translate,
  openWindow: () => void,
): BatchedNotifications<DeliveredFileNotice> {
  return new BatchedNotifications<DeliveredFileNotice>(show, {
    one: ({ fileName, deviceName }) => ({
      title: translate('fileDeliveredTitle'),
      body: translate('fileDeliveredBody', { file: fileName, device: deviceName }),
    }),
    more: (count, { fileName, deviceName }) => ({
      title:
        count === 1
          ? translate('oneMoreFileDeliveredTitle')
          : translate('moreFilesDeliveredTitle', { count: String(count) }),
      body: translate('latestFileDeliveredBody', { file: fileName, device: deviceName }),
    }),
    onClick: openWindow,
  });
}

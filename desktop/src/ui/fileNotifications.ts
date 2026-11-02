import type { Translate } from '../i18n/messages';

/** At most one notification per period, so a burst of files cannot flood the screen. */
const QUIET_PERIOD_MS = 3_000;

export interface ReceivedFileNotice {
  readonly filePath: string;
  readonly fileName: string;
  readonly deviceName: string;
}

export interface NotificationContent {
  readonly title: string;
  readonly body: string;
}

export interface FileNotificationDependencies {
  readonly show: (content: NotificationContent, onClick: () => void) => void;
  /** Shows the file selected in Explorer. Received files are never opened. */
  readonly reveal: (filePath: string) => void;
  readonly translate: Translate;
}

interface PendingFiles {
  readonly count: number;
  readonly latest: ReceivedFileNotice;
}

/**
 * The first file is announced at once. Files arriving during the quiet period that follows are
 * counted and announced together when it ends; clicking reveals the latest of them.
 */
export class FileNotifications {
  private quietPeriod: ReturnType<typeof setTimeout> | undefined;
  private pending: PendingFiles | undefined;

  constructor(private readonly dependencies: FileNotificationDependencies) {}

  fileReceived(notice: ReceivedFileNotice): void {
    if (this.quietPeriod !== undefined) {
      this.pending = { count: (this.pending?.count ?? 0) + 1, latest: notice };
      return;
    }
    const { translate } = this.dependencies;
    this.show(
      {
        title: translate('fileReceivedTitle'),
        body: translate('fileReceivedBody', { file: notice.fileName, device: notice.deviceName }),
      },
      notice,
    );
  }

  private showPending(): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending === undefined) {
      return;
    }
    const { translate } = this.dependencies;
    const { count, latest } = pending;
    this.show(
      {
        title:
          count === 1
            ? translate('oneMoreFileReceivedTitle')
            : translate('moreFilesReceivedTitle', { count: String(count) }),
        body: translate('latestFileBody', { file: latest.fileName, device: latest.deviceName }),
      },
      latest,
    );
  }

  private show(content: NotificationContent, revealed: ReceivedFileNotice): void {
    const { show, reveal } = this.dependencies;
    show(content, () => {
      reveal(revealed.filePath);
    });
    this.quietPeriod = setTimeout(() => {
      this.quietPeriod = undefined;
      this.showPending();
    }, QUIET_PERIOD_MS);
  }
}

/** At most one notification per period, so a burst of files cannot flood the screen. */
const QUIET_PERIOD_MS = 3_000;

export interface NotificationContent {
  readonly title: string;
  readonly body: string;
}

export type ShowNotification = (content: NotificationContent, onClick: () => void) => void;

export interface BatchWording<Notice> {
  /** The first notice, shown at once. */
  readonly one: (notice: Notice) => NotificationContent;
  /** The notices that came during the quiet period after it, shown together when it ends. */
  readonly more: (count: number, latest: Notice) => NotificationContent;
  /** Clicking acts on the notice shown, or on the latest of those summed up. */
  readonly onClick: (notice: Notice) => void;
}

/** Announces the first notice at once, and sums up those of a burst that follows it. */
export class BatchedNotifications<Notice> {
  private quietPeriod: ReturnType<typeof setTimeout> | undefined;
  private pending: { readonly count: number; readonly latest: Notice } | undefined;

  constructor(
    private readonly show: ShowNotification,
    private readonly wording: BatchWording<Notice>,
  ) {}

  add(notice: Notice): void {
    if (this.quietPeriod !== undefined) {
      this.pending = { count: (this.pending?.count ?? 0) + 1, latest: notice };
      return;
    }
    this.present(this.wording.one(notice), notice);
  }

  private showPending(): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) {
      this.present(this.wording.more(pending.count, pending.latest), pending.latest);
    }
  }

  private present(content: NotificationContent, notice: Notice): void {
    this.show(content, () => {
      this.wording.onClick(notice);
    });
    this.quietPeriod = setTimeout(() => {
      this.quietPeriod = undefined;
      this.showPending();
    }, QUIET_PERIOD_MS);
  }
}

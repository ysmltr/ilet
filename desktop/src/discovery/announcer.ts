import { errorFields, type Logger } from '../shared/logger';
import { type Advertiser, type MdnsResponderFactory, startAdvertising } from './serviceAdvertiser';
import type { ServiceAnnouncement } from './serviceAnnouncement';

/**
 * Keeps the announcement on the adapters that the network monitor allows. It is restarted only
 * when that set changes, and changes are applied one at a time, in order.
 */
export class Announcer {
  private advertiser: Advertiser | undefined;
  /** Identifies the adapters announced on; `undefined` before the first change. */
  private adaptersKey: string | undefined;
  private stopped = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly announcement: ServiceAnnouncement,
    private readonly createResponder: MdnsResponderFactory,
    private readonly logger: Logger,
  ) {}

  /** `undefined` announces on every adapter; an empty list announces nowhere. */
  announceOn(adapters: readonly string[] | undefined): Promise<void> {
    return this.enqueue(() => this.apply(adapters));
  }

  /** Withdraws the announcement for good. */
  stop(): Promise<void> {
    return this.enqueue(async () => {
      this.stopped = true;
      await this.withdraw();
    });
  }

  private enqueue(change: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(change).catch((error: unknown) => {
      this.logger.warn('could not change the network announcement', errorFields(error));
    });
    return this.queue;
  }

  private async apply(adapters: readonly string[] | undefined): Promise<void> {
    const key = JSON.stringify(adapters === undefined ? null : [...adapters].sort());
    if (this.stopped || key === this.adaptersKey) {
      return;
    }
    await this.withdraw();
    this.adaptersKey = key;
    if (adapters?.length === 0) {
      // No Private network, or (for the Store version) another network is connected too.
      this.logger.info('not announcing on any adapter');
      return;
    }
    this.advertiser = startAdvertising(
      this.announcement,
      () => this.createResponder(adapters),
      this.logger,
    );
  }

  private async withdraw(): Promise<void> {
    await this.advertiser?.stop();
    this.advertiser = undefined;
  }
}

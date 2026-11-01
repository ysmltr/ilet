export interface FailureLimitPolicy {
  readonly maxFailures: number;
  readonly windowMs: number;
}

interface FailureWindow {
  readonly startedAt: number;
  failures: number;
}

/** Bounds memory when many addresses fail; the oldest windows are dropped first. */
const MAX_TRACKED_CLIENTS = 1024;

/** Counts failed attempts per client in fixed time windows and blocks clients over the limit. */
export class FailureRateLimiter {
  private readonly windows = new Map<string, FailureWindow>();

  constructor(
    private readonly policy: FailureLimitPolicy,
    private readonly now: () => number,
  ) {}

  /** Milliseconds until `client` may try again; 0 when it is not blocked. */
  blockedForMs(client: string): number {
    const window = this.activeWindow(client);
    if (window === undefined || window.failures < this.policy.maxFailures) {
      return 0;
    }
    return window.startedAt + this.policy.windowMs - this.now();
  }

  recordFailure(client: string): void {
    const window = this.activeWindow(client);
    if (window !== undefined) {
      window.failures += 1;
      return;
    }
    this.makeRoom();
    this.windows.set(client, { startedAt: this.now(), failures: 1 });
  }

  private activeWindow(client: string): FailureWindow | undefined {
    const window = this.windows.get(client);
    if (window !== undefined && this.isExpired(window)) {
      this.windows.delete(client);
      return undefined;
    }
    return window;
  }

  private makeRoom(): void {
    if (this.windows.size < MAX_TRACKED_CLIENTS) {
      return;
    }
    for (const [client, window] of this.windows) {
      if (this.isExpired(window)) {
        this.windows.delete(client);
      }
    }
    // A Map iterates in insertion order, so the first key is the oldest window.
    const oldestClient = this.windows.keys().next().value;
    if (this.windows.size >= MAX_TRACKED_CLIENTS && oldestClient !== undefined) {
      this.windows.delete(oldestClient);
    }
  }

  private isExpired(window: FailureWindow): boolean {
    return this.now() - window.startedAt >= this.policy.windowMs;
  }
}

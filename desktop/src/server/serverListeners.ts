import type { Server } from 'node:https';

import { errorCodeOf } from '../shared/errors';
import { errorFields, type Logger } from '../shared/logger';
import { closeServer, listen } from './httpsServer';

/** An address that is not ready yet (Windows is still setting it up, for example). */
const DEFAULT_RETRY_DELAY_MS = 5_000;

export interface ServerListenersOptions {
  /** A new server, not yet listening; all of them share one request handler and budget. */
  readonly createServer: () => Server;
  readonly port: number;
  readonly logger: Logger;
  readonly retryDelayMs?: number;
}

interface Listener {
  /** Set while listening. */
  server: Server | undefined;
  retry: ReturnType<typeof setTimeout> | undefined;
  /** Why the last attempt failed. */
  failure: Error | undefined;
}

/**
 * Listens on a set of addresses, one server each, and follows the changes of that set. Changes
 * are applied one at a time, in order. An address that cannot be listened on is tried again
 * until it leaves the set.
 */
export class ServerListeners {
  private readonly listeners = new Map<string, Listener>();
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly options: ServerListenersOptions) {}

  /**
   * Listens on the first set. If no address of it could be listened on, closes everything and
   * rejects with the first address's error: `port_in_use` when another program has the port.
   */
  async start(addresses: readonly string[]): Promise<void> {
    await this.update(addresses);
    const failure =
      addresses[0] === undefined ? undefined : this.listeners.get(addresses[0])?.failure;
    if (failure !== undefined && !this.isListening()) {
      await this.close();
      throw failure;
    }
  }

  update(addresses: readonly string[]): Promise<void> {
    return this.enqueue(() => this.apply(addresses));
  }

  /** Stops listening for good, which closes the open connections and so aborts their uploads. */
  close(): Promise<void> {
    return this.enqueue(async () => {
      this.closed = true;
      await this.apply([]);
    });
  }

  private isListening(): boolean {
    return [...this.listeners.values()].some(({ server }) => server !== undefined);
  }

  private enqueue(change: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(change).catch((error: unknown) => {
      this.options.logger.warn('could not change where the server listens', errorFields(error));
    });
    return this.queue;
  }

  private async apply(addresses: readonly string[]): Promise<void> {
    const wanted = new Set(this.closed ? [] : addresses);
    // Removed first, so that no address stays open longer than it must.
    for (const [address, listener] of [...this.listeners]) {
      if (!wanted.has(address)) {
        this.listeners.delete(address);
        await this.stopListening(address, listener);
      }
    }
    for (const address of wanted) {
      if (!this.listeners.has(address)) {
        const listener: Listener = { server: undefined, retry: undefined, failure: undefined };
        this.listeners.set(address, listener);
        await this.tryListen(address, listener);
      }
    }
  }

  private async tryListen(address: string, listener: Listener): Promise<void> {
    const { logger } = this.options;
    // A fresh server each time: one whose listen failed keeps nothing worth reusing.
    const server = this.options.createServer();
    try {
      await listen(server, address, this.options.port, logger);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      // Logged once per reason, not on every attempt.
      if (
        listener.failure === undefined ||
        errorCodeOf(listener.failure) !== errorCodeOf(failure)
      ) {
        logger.warn('could not listen on an address, trying again', {
          address,
          error: errorCodeOf(failure),
        });
      }
      listener.failure = failure;
      listener.retry = setTimeout(() => {
        void this.enqueue(() => this.retry(address, listener));
      }, this.options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
      listener.retry.unref();
      return;
    }
    listener.server = server;
    listener.failure = undefined;
    logger.info('listening', { address });
  }

  private async retry(address: string, listener: Listener): Promise<void> {
    listener.retry = undefined;
    // The address left the set while the timer ran, or came back as another listener.
    if (this.listeners.get(address) === listener) {
      await this.tryListen(address, listener);
    }
  }

  private async stopListening(address: string, listener: Listener): Promise<void> {
    clearTimeout(listener.retry);
    if (listener.server === undefined) {
      return;
    }
    try {
      await closeServer(listener.server);
      this.options.logger.info('stopped listening', { address });
    } catch (error) {
      this.options.logger.warn('could not stop listening on an address', {
        address,
        ...errorFields(error),
      });
    }
  }
}

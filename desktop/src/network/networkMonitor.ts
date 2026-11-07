import { errorFields, type Logger } from '../shared/logger';
import {
  type NetworkExposure,
  networkExposure,
  sameExposure,
  UNKNOWN_EXPOSURE,
} from './networkExposure';
import type { NetworkInterfaces } from './networkInterfaces';
import type { NetworkProfileReader } from './networkProfiles';

/** Listing the adapters is cheap, so joining a network or unplugging a cable is noticed quickly. */
const ADAPTER_CHECK_INTERVAL_MS = 10_000;
/** A category can change without any adapter changing: the user switches it in Windows Settings. */
const PROFILE_REFRESH_INTERVAL_MS = 5 * 60_000;
/**
 * Until a first query succeeds, it is tried again sooner, because until then the Store version
 * listens on 127.0.0.1 only. One can fail while Windows starts, when PowerShell is slow.
 */
const UNKNOWN_RETRY_INTERVAL_MS = 30_000;
/** Only until the first five-minute refresh, which carries on after that. */
const MAX_UNKNOWN_RETRIES = PROFILE_REFRESH_INTERVAL_MS / UNKNOWN_RETRY_INTERVAL_MS - 1;

export interface NetworkMonitorDependencies {
  readonly readProfiles: NetworkProfileReader;
  readonly networkInterfaces: () => NetworkInterfaces;
  readonly logger: Logger;
}

type ExposureListener = (exposure: NetworkExposure) => void;

/** Keeps track of which connected networks Windows classifies as Public. */
export class NetworkMonitor {
  private exposure: NetworkExposure = UNKNOWN_EXPOSURE;
  private categoriesKnown = false;
  private unknownRetries = 0;
  private adaptersKey = '';
  private reading: Promise<void> | undefined;
  private readonly listeners = new Set<ExposureListener>();
  private readonly timers: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly dependencies: NetworkMonitorDependencies) {}

  get current(): NetworkExposure {
    return this.exposure;
  }

  /** Listeners hear only about real changes. */
  onChange(listener: ExposureListener): void {
    this.listeners.add(listener);
  }

  /** Reads the categories again. Calls made while a query runs share it. */
  refresh(): Promise<void> {
    this.reading ??= this.read().finally(() => {
      this.reading = undefined;
    });
    return this.reading;
  }

  start(): void {
    this.timers.push(
      setInterval(() => {
        this.refreshIfAdaptersChanged();
      }, ADAPTER_CHECK_INTERVAL_MS),
      setInterval(() => {
        void this.refresh();
      }, PROFILE_REFRESH_INTERVAL_MS),
      setInterval(() => {
        this.retryIfUnknown();
      }, UNKNOWN_RETRY_INTERVAL_MS),
    );
  }

  stop(): void {
    for (const timer of this.timers.splice(0)) {
      clearInterval(timer);
    }
  }

  private retryIfUnknown(): void {
    if (!this.categoriesKnown && this.unknownRetries < MAX_UNKNOWN_RETRIES) {
      this.unknownRetries += 1;
      void this.refresh();
    }
  }

  private refreshIfAdaptersChanged(): void {
    if (adaptersKey(this.dependencies.networkInterfaces()) !== this.adaptersKey) {
      void this.refresh();
    }
  }

  private async read(): Promise<void> {
    const { readProfiles, networkInterfaces, logger } = this.dependencies;
    try {
      const interfaces = networkInterfaces();
      this.adaptersKey = adaptersKey(interfaces);
      const profiles = await readProfiles();
      // A failed query keeps what was known, so a passing error cannot reopen a Public network.
      if (profiles === undefined && this.categoriesKnown) {
        return;
      }
      this.categoriesKnown = profiles !== undefined;
      const next = networkExposure(profiles, interfaces);
      if (sameExposure(next, this.exposure)) {
        return;
      }
      this.exposure = next;
      logger.info('network exposure changed', {
        publicNetworks: next.publicNetworks.join(', '),
        domainNetworks: next.domainNetworks.join(', '),
        privateAdapters: next.announceOn?.join(', ') ?? 'unknown',
        otherNetworkConnected: next.otherNetworkConnected,
      });
      for (const listener of this.listeners) {
        listener(next);
      }
    } catch (error) {
      logger.warn('could not check the networks', errorFields(error));
    }
  }
}

/** Changes whenever an adapter or one of its addresses appears or disappears. */
function adaptersKey(interfaces: NetworkInterfaces): string {
  const adapters = Object.entries(interfaces).map(
    ([name, infos = []]) =>
      `${name}=${infos
        .map((info) => info.address)
        .sort()
        .join(',')}`,
  );
  return adapters.sort().join(';');
}

import { DNS_SD_SERVICE_TYPE } from '../protocol/constants';
import { errorFields, type Logger } from '../shared/logger';
import type { ServiceAnnouncement } from './serviceAnnouncement';

const ANNOUNCEMENT_FAILED = 'could not announce the server on the local network';

/** What ilet asks the responder to announce: a subset of ciao's `ServiceOptions`. */
export interface MdnsServiceDefinition {
  readonly name: string;
  readonly type: string;
  readonly hostname: string;
  readonly port: number;
  readonly txt: Readonly<Record<string, string>>;
}

/** The parts of an announced service that ilet uses; ciao's `CiaoService` has this shape. */
export interface MdnsService {
  /** Resolves once the name is probed unique on the network and announced. */
  advertise(): Promise<void>;
  /** Sends goodbye packets, or cancels probing, and makes the service unusable. */
  destroy(): Promise<void>;
  on(event: 'name-change', listener: (name: string) => void): unknown;
}

/** The parts of an mDNS responder that ilet uses; ciao's `Responder` has this shape. */
export interface MdnsResponder {
  createService(definition: MdnsServiceDefinition): MdnsService;
  /** Closes the sockets. Must be called exactly once for each responder. */
  shutdown(): Promise<void>;
}

export type MdnsResponderFactory = () => MdnsResponder;

export interface Advertiser {
  /** Withdraws the announcement and closes the sockets. Never rejects; later calls do nothing. */
  stop(): Promise<void>;
}

/**
 * Announces the server in the background. Discovery only helps a phone find the new address of a
 * PC it already paired with, so a failure here is logged and never stops the server.
 */
export function startAdvertising(
  announcement: ServiceAnnouncement,
  createResponder: MdnsResponderFactory,
  logger: Logger,
): Advertiser {
  let responder: MdnsResponder | undefined;
  let service: MdnsService | undefined;
  try {
    responder = createResponder();
    service = responder.createService({
      name: announcement.instanceName,
      type: DNS_SD_SERVICE_TYPE,
      hostname: announcement.hostname,
      port: announcement.port,
      txt: announcement.txt,
    });
  } catch (error) {
    // ciao checks names with assertions; for example, it rejects a name that ends in " (0)".
    logger.warn(ANNOUNCEMENT_FAILED, errorFields(error));
  }

  let stopping: Promise<void> | undefined;
  service?.on('name-change', (name) => {
    logger.info('another device on the network uses this name, announcing as', { name });
  });
  // Not awaited: checking that the name is unique takes about a second and must not delay startup.
  service?.advertise().then(
    () => {
      // Stopping while the name is being checked also resolves, but nothing was announced.
      if (stopping === undefined) {
        logger.info('announced on the local network');
      }
    },
    (error: unknown) => {
      logger.warn(ANNOUNCEMENT_FAILED, errorFields(error));
    },
  );

  return {
    stop: () => {
      stopping ??= withdraw(service, responder).catch((error: unknown) => {
        logger.warn('could not withdraw the network announcement', errorFields(error));
      });
      return stopping;
    },
  };
}

async function withdraw(
  service: MdnsService | undefined,
  responder: MdnsResponder | undefined,
): Promise<void> {
  try {
    // Destroying, not just ending, also cancels an announcement the responder would retry later.
    await service?.destroy();
  } finally {
    await responder?.shutdown();
  }
}

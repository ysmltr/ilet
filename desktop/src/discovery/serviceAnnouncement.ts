import {
  APP_NAME,
  HOSTNAME_DEVICE_ID_LENGTH,
  MAX_INSTANCE_NAME_BYTES,
  TxtKey,
} from '../protocol/constants';
import { sanitizeDisplayName, truncateToUtf8Bytes } from '../shared/text';

/**
 * Room for the " (2)", " (3)", … that the responder appends while another device on the network
 * uses the same name (RFC 6762 §9), so the renamed instance name still fits one DNS label.
 */
const RENAME_SUFFIX_RESERVE_BYTES = ' (999)'.length;

/** What the PC announces on the local network (PROTOCOL.md section 6). */
export interface ServiceAnnouncement {
  /** Listed by generic Bonjour browsers; the iPhone app shows the TXT name instead. */
  readonly instanceName: string;
  /** A name of its own, so it never clashes with the name Windows announces for the PC. */
  readonly hostname: string;
  readonly port: number;
  readonly txt: Readonly<Record<string, string>>;
}

export interface AnnouncedServer {
  readonly deviceId: string;
  readonly displayName: string;
  readonly port: number;
}

export function serviceAnnouncement(server: AnnouncedServer): ServiceAnnouncement {
  return {
    instanceName: instanceName(server.displayName),
    hostname: `${APP_NAME}-${server.deviceId.slice(0, HOSTNAME_DEVICE_ID_LENGTH)}`,
    port: server.port,
    // Anyone on the network can read the TXT record, so it must never contain more than this.
    txt: { [TxtKey.deviceId]: server.deviceId, [TxtKey.displayName]: server.displayName },
  };
}

/**
 * The display name as a single DNS label. The mDNS library does not escape dots, so a dot would
 * split the name into several labels; it becomes a space instead.
 */
function instanceName(displayName: string): string {
  const withoutDots = sanitizeDisplayName(displayName.replaceAll('.', ' '));
  const maxBytes = MAX_INSTANCE_NAME_BYTES - RENAME_SUFFIX_RESERVE_BYTES;
  return truncateToUtf8Bytes(withoutDots, maxBytes).trimEnd() || APP_NAME;
}

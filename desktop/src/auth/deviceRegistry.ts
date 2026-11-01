import { randomUUID } from 'node:crypto';

import { ProtocolError, StartupError } from '../shared/errors';
import { readJsonFile, writeJsonFileAtomic } from '../shared/jsonFile';
import { sanitizeDisplayName } from '../shared/text';
import { isIsoTimestamp, isRecord, isSha256Hex, isUuid } from '../shared/validation';
import { hashPresentedSecret, issueSecret, secretHashesEqual } from './secrets';

const DEVICES_FORMAT_VERSION = 1;
const HASH_ENCODING = 'hex';

export interface PairedDevice {
  readonly id: string;
  readonly name: string;
  readonly pairedAt: string;
}

export interface RegisteredDevice {
  readonly device: PairedDevice;
  /** The plaintext access token. It is returned once and never stored. */
  readonly token: string;
}

interface StoredDevice extends PairedDevice {
  readonly tokenHash: Buffer;
}

type RevocationListener = (deviceId: string) => void;

/** Paired devices and the hashes of their access tokens. */
export class DeviceRegistry {
  private devices: readonly StoredDevice[];
  private readonly revocationListeners = new Set<RevocationListener>();
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    devices: readonly StoredDevice[],
    private readonly now: () => Date,
  ) {
    this.devices = devices;
  }

  static async open(filePath: string, now: () => Date): Promise<DeviceRegistry> {
    const stored = await readJsonFile(filePath);
    const devices = stored === undefined ? [] : parseDevicesFile(stored, filePath);
    return new DeviceRegistry(filePath, devices, now);
  }

  list(): readonly PairedDevice[] {
    return this.devices.map(toPairedDevice);
  }

  async register(requestedName: string): Promise<RegisteredDevice> {
    const name = sanitizeDisplayName(requestedName);
    if (name === '') {
      throw new ProtocolError('invalid_request');
    }
    const { value: token, hash } = issueSecret();
    const device: StoredDevice = {
      id: randomUUID(),
      name,
      pairedAt: this.now().toISOString(),
      tokenHash: hash,
    };
    this.devices = [...this.devices, device];
    await this.persist();
    return { device: toPairedDevice(device), token };
  }

  /** Returns the device that owns `token`, or `undefined`. */
  authenticate(token: string): PairedDevice | undefined {
    const presentedHash = hashPresentedSecret(token);
    if (presentedHash === undefined) {
      return undefined;
    }
    let match: StoredDevice | undefined;
    // Every device is compared, so the time taken does not reveal which one matched.
    for (const device of this.devices) {
      if (secretHashesEqual(presentedHash, device.tokenHash)) {
        match = device;
      }
    }
    return match && toPairedDevice(match);
  }

  /**
   * Revocation takes effect in memory before the file is written, so the very next request is
   * rejected, and listeners abort that device's uploads in progress.
   */
  async revoke(deviceId: string): Promise<boolean> {
    const remaining = this.devices.filter((device) => device.id !== deviceId);
    if (remaining.length === this.devices.length) {
      return false;
    }
    this.devices = remaining;
    for (const listener of this.revocationListeners) {
      listener(deviceId);
    }
    await this.persist();
    return true;
  }

  onRevoked(listener: RevocationListener): void {
    this.revocationListeners.add(listener);
  }

  /** Writes run one at a time, and each writes the latest state. */
  private persist(): Promise<void> {
    const write = this.pendingWrite.then(() =>
      writeJsonFileAtomic(this.filePath, toDevicesFile(this.devices)),
    );
    // The caller receives this write's error through `write`; the queue only needs to know it
    // finished, so that a failed write does not block later ones.
    this.pendingWrite = write.then(
      () => undefined,
      () => undefined,
    );
    return write;
  }
}

function toPairedDevice({ id, name, pairedAt }: StoredDevice): PairedDevice {
  return { id, name, pairedAt };
}

function toDevicesFile(devices: readonly StoredDevice[]): unknown {
  return {
    formatVersion: DEVICES_FORMAT_VERSION,
    devices: devices.map(({ id, name, pairedAt, tokenHash }) => ({
      id,
      name,
      pairedAt,
      tokenSha256: tokenHash.toString(HASH_ENCODING),
    })),
  };
}

function parseDevicesFile(value: unknown, filePath: string): StoredDevice[] {
  const invalid = new StartupError('data_file_invalid', { detail: filePath });
  if (!isRecord(value)) {
    throw invalid;
  }
  const { formatVersion, devices } = value;
  if (formatVersion !== DEVICES_FORMAT_VERSION || !Array.isArray(devices)) {
    throw invalid;
  }
  return devices.map((entry: unknown) => {
    const device = parseStoredDevice(entry);
    if (device === undefined) {
      throw invalid;
    }
    return device;
  });
}

function parseStoredDevice(value: unknown): StoredDevice | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, name, pairedAt, tokenSha256 } = value;
  if (
    !isUuid(id) ||
    typeof name !== 'string' ||
    name === '' ||
    !isIsoTimestamp(pairedAt) ||
    !isSha256Hex(tokenSha256)
  ) {
    return undefined;
  }
  return { id, name, pairedAt, tokenHash: Buffer.from(tokenSha256, HASH_ENCODING) };
}

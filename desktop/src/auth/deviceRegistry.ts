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

type RegistrationListener = (device: PairedDevice) => void;
type RevocationListener = (deviceId: string) => void;

/** A new list of devices, and what the caller learns from the change. */
interface DevicesChange<Result> {
  readonly devices: readonly StoredDevice[];
  readonly result: Result;
}

/** Paired devices and the hashes of their access tokens. */
export class DeviceRegistry {
  private devices: readonly StoredDevice[];
  private readonly registrationListeners = new Set<RegistrationListener>();
  private readonly revocationListeners = new Set<RevocationListener>();
  private pendingChange: Promise<void> = Promise.resolve();

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

  /** False as soon as the device's removal has been saved. */
  has(deviceId: string): boolean {
    return this.devices.some((device) => device.id === deviceId);
  }

  /** Listeners hear about the new device only after it has been saved. */
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
    await this.change((devices) => ({ devices: [...devices, device], result: undefined }));
    const pairedDevice = toPairedDevice(device);
    for (const listener of this.registrationListeners) {
      listener(pairedDevice);
    }
    return { device: pairedDevice, token };
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
   * The removal is saved first, then the token stops working at once and listeners abort that
   * device's uploads in progress. If saving fails, nothing changes and the error is thrown.
   */
  async revoke(deviceId: string): Promise<boolean> {
    const revoked = await this.change((devices) => {
      const remaining = devices.filter((device) => device.id !== deviceId);
      return remaining.length === devices.length
        ? { devices, result: false }
        : { devices: remaining, result: true };
    });
    if (revoked) {
      for (const listener of this.revocationListeners) {
        listener(deviceId);
      }
    }
    return revoked;
  }

  /** Resolves to the renamed device, or `undefined` when no device has this ID. */
  async rename(deviceId: string, requestedName: string): Promise<PairedDevice | undefined> {
    const name = sanitizeDisplayName(requestedName);
    if (name === '') {
      // Callers check names before renaming; an empty one here is a bug.
      throw new RangeError('device name is empty');
    }
    const renamed = await this.change((devices) => {
      const device = devices.find((candidate) => candidate.id === deviceId);
      if (device === undefined) {
        return { devices, result: undefined };
      }
      const updated: StoredDevice = { ...device, name };
      return {
        devices: devices.map((candidate) => (candidate === device ? updated : candidate)),
        result: updated,
      };
    });
    return renamed && toPairedDevice(renamed);
  }

  onRegistered(listener: RegistrationListener): void {
    this.registrationListeners.add(listener);
  }

  onRevoked(listener: RevocationListener): void {
    this.revocationListeners.add(listener);
  }

  /**
   * Changes run one at a time, each on the latest list. A change is saved before it takes
   * effect, so memory never holds a change the file lacks: a removal that could not be saved
   * must not look done and then be undone by a restart.
   */
  private change<Result>(
    apply: (devices: readonly StoredDevice[]) => DevicesChange<Result>,
  ): Promise<Result> {
    const step = this.pendingChange.then(async () => {
      const { devices, result } = apply(this.devices);
      if (devices !== this.devices) {
        await writeJsonFileAtomic(this.filePath, toDevicesFile(devices));
        this.devices = devices;
      }
      return result;
    });
    // The caller receives this change's error through `step`; the queue only needs to know it
    // finished, so that a failed change does not block later ones.
    this.pendingChange = step.then(
      () => undefined,
      () => undefined,
    );
    return step;
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

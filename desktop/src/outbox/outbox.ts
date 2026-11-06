import { createWriteStream } from 'node:fs';
import { type FileHandle, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { ByteLimitCounter } from '../files/byteLimitCounter';
import type { AvailableSpaceProbe } from '../files/diskSpace';
import {
  fallbackFileName,
  isWindowsDeviceName,
  sanitizeFileName,
} from '../files/fileNameSanitizer';
import { FREE_SPACE_RESERVE_BYTES } from '../files/fileReceiver';
import { resolveInsideFolder } from '../files/pathContainment';
import { TransferSlots } from '../files/transferSlots';
import { DOWNLOAD_RETRY_AFTER_SECONDS, OUTBOX_LIMITS } from '../protocol/constants';
import { errorCodeOf, hasErrorCode, ProtocolError, StartupError } from '../shared/errors';
import { readJsonFile, writeJsonFileAtomic } from '../shared/jsonFile';
import type { Logger } from '../shared/logger';
import { isIntegerInRange, isIsoTimestamp, isRecord, isUuid } from '../shared/validation';
import { isLocalDrivePath } from './localFilePath';
import { isOutboxId, newOutboxId, parseOutboxFileName, partFileNameOf } from './outboxId';

const OUTBOX_FORMAT_VERSION = 1;
/** Longer than any name `sanitizeFileName` returns; a longer stored name means a damaged list. */
const MAX_STORED_NAME_LENGTH = 255;

/** A copy is no longer served once its time is up, and deleted at the next sweep. */
export const OUTBOX_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** The most files that one file dialog, drop or Send to may send. */
export const MAX_FILES_PER_SEND = 50;

export interface OutboxEntry {
  readonly id: string;
  readonly deviceId: string;
  /** Cleaned like the name of a received file (PROTOCOL.md section 5.3); never used as a path. */
  readonly name: string;
  readonly sizeBytes: number;
  /** ISO 8601 timestamps. */
  readonly queuedAt: string;
  readonly expiresAt: string;
}

export type SendProblem =
  | 'not-a-local-file'
  | 'not-a-file'
  | 'unreadable'
  | 'too-large'
  | 'no-space'
  | 'outbox-full'
  | 'device-removed';

export interface SendFailure {
  /** The file's cleaned name, for the message. Its path is never shown or logged. */
  readonly name: string;
  readonly problem: SendProblem;
}

export interface SendResult {
  readonly queued: readonly OutboxEntry[];
  readonly failed: readonly SendFailure[];
}

export interface OutboxDownload {
  readonly entry: OutboxEntry;
  /** The copy, open for reading. */
  readonly handle: FileHandle;
  /** Aborted when the device is removed, or when the file is cancelled or expires meanwhile. */
  readonly signal: AbortSignal;
  /** Closes the copy and frees the download slot. */
  finish(): Promise<void>;
}

export interface OutboxDependencies {
  /** Holds the copies, each named by its ID: a folder of ilet's own, never the receive folder. */
  readonly folder: string;
  /** The list of entries, saved before each change takes effect. */
  readonly listFile: string;
  /** Asked at every send, so a device removed meanwhile gets nothing. */
  readonly isPaired: (deviceId: string) => boolean;
  readonly maxFileSizeBytes: () => number;
  readonly availableBytes: AvailableSpaceProbe;
  readonly now: () => Date;
  readonly logger: Logger;
}

type ChangeListener = () => void;
type DeliveryListener = (entry: OutboxEntry) => void;

/** A new list of entries, and what the caller learns from the change. */
interface EntriesChange<Result> {
  readonly entries: readonly OutboxEntry[];
  readonly result: Result;
}

interface ActiveDownload {
  readonly id: string;
  readonly stop: AbortController;
}

/**
 * The files waiting for paired devices (PROTOCOL.md section 5.4, THREAT_MODEL.md section 4.7).
 * Each one is a copy, made when the user sent the file, in ilet's own folder and named only by a
 * random ID: a device asks for a file by that ID, never by a path, and only for its own files.
 */
export class Outbox {
  private entries: readonly OutboxEntry[];
  private readonly downloadSlots = new TransferSlots(OUTBOX_LIMITS.maxConcurrentDownloads);
  private readonly activeDownloads = new Set<ActiveDownload>();
  private readonly changeListeners = new Set<ChangeListener>();
  private readonly deliveryListeners = new Set<DeliveryListener>();
  private pendingChange: Promise<void> = Promise.resolve();
  /** Sends and device removals, one at a time: each free-space check sees the copies before it. */
  private pendingSend: Promise<void> = Promise.resolve();

  private constructor(
    private readonly dependencies: OutboxDependencies,
    entries: readonly OutboxEntry[],
  ) {
    this.entries = entries;
  }

  /**
   * Loads the entries and drops those that ended while ilet was not running: expired ones, those
   * of devices that are no longer paired, and those whose copy is missing. Copies without an
   * entry and partial copies are deleted.
   */
  static async open(dependencies: OutboxDependencies): Promise<Outbox> {
    const { folder, listFile, isPaired, now, logger } = dependencies;
    await mkdir(folder, { recursive: true });
    const stored = await readEntries(listFile, logger);
    const kept: OutboxEntry[] = [];
    for (const entry of stored ?? []) {
      if (isPaired(entry.deviceId) && !isExpired(entry, now()) && (await hasCopy(folder, entry))) {
        kept.push(entry);
      }
    }
    // Saved before any copy goes, like every change. A missing list is created.
    if (kept.length !== stored?.length) {
      await writeJsonFileAtomic(listFile, toListFile(kept));
    }
    const removed = await removeLeftovers(folder, new Set(kept.map(({ id }) => id)), logger);
    if (removed > 0) {
      logger.info('removed copies from an earlier run', { count: removed });
    }
    return new Outbox(dependencies, kept);
  }

  /** The files still waiting, oldest first: all of them, or one device's. */
  list(deviceId?: string): readonly OutboxEntry[] {
    const now = this.dependencies.now();
    return this.entries.filter(
      (entry) => !isExpired(entry, now) && (deviceId === undefined || entry.deviceId === deviceId),
    );
  }

  /**
   * Copies files into a device's outbox. Each file succeeds or fails on its own. The caller has
   * made sure that the user chose these files for this device.
   */
  send(deviceId: string, sourcePaths: readonly string[]): Promise<SendResult> {
    if (sourcePaths.length > MAX_FILES_PER_SEND) {
      throw new RangeError('too many files for one send');
    }
    return this.oneAtATime(() => this.copyAll(deviceId, sourcePaths));
  }

  /**
   * Opens one of the device's copies for downloading. A file of another device, an unknown one
   * and an expired one all give `file_gone`, so IDs cannot be probed.
   */
  async startDownload(deviceId: string, id: string): Promise<OutboxDownload> {
    const entry = this.list(deviceId).find((candidate) => candidate.id === id);
    if (entry === undefined) {
      throw new ProtocolError('file_gone');
    }
    const slot = this.downloadSlots.tryAcquire(deviceId);
    if (slot === undefined) {
      throw new ProtocolError('too_many_downloads', {
        retryAfterSeconds: DOWNLOAD_RETRY_AFTER_SECONDS,
      });
    }
    const download: ActiveDownload = { id, stop: new AbortController() };
    this.activeDownloads.add(download);
    const release = (): void => {
      this.activeDownloads.delete(download);
      slot.release();
    };
    let handle: FileHandle;
    try {
      handle = await this.openCopy(entry);
    } catch (error) {
      release();
      throw error;
    }
    return {
      entry,
      handle,
      signal: AbortSignal.any([slot.signal, download.stop.signal]),
      finish: async () => {
        release();
        await handle.close();
      },
    };
  }

  /** The device stored the file, so its copy goes. An ID it does not have changes nothing. */
  async confirm(deviceId: string, id: string): Promise<void> {
    const delivered = await this.remove((entry) => entry.deviceId === deviceId && entry.id === id);
    for (const entry of delivered) {
      for (const listener of this.deliveryListeners) {
        listener(entry);
      }
    }
  }

  /** The user cancelled the file in the window. A download in progress stops. */
  async cancel(id: string): Promise<boolean> {
    return (await this.remove((entry) => entry.id === id)).length > 0;
  }

  /** The device was removed: its downloads stop at once, and its copies go. */
  async removeDevice(deviceId: string): Promise<void> {
    this.downloadSlots.abortTransfersFrom(deviceId);
    // Behind a send in progress, so that no copy for the device can be added afterwards.
    await this.oneAtATime(async () => {
      await this.remove((entry) => entry.deviceId === deviceId);
    });
  }

  /** Deletes the copies whose time is up. They stopped being served when it was. */
  async removeExpired(): Promise<void> {
    const now = this.dependencies.now();
    await this.remove((entry) => isExpired(entry, now));
  }

  /** Called after every change to the list, once it has been saved. */
  onChange(listener: ChangeListener): void {
    this.changeListeners.add(listener);
  }

  /** Called when a device confirms one of its files. */
  onDelivered(listener: DeliveryListener): void {
    this.deliveryListeners.add(listener);
  }

  private oneAtATime<Result>(task: () => Promise<Result>): Promise<Result> {
    const step = this.pendingSend.then(task);
    this.pendingSend = step.then(
      () => undefined,
      () => undefined,
    );
    return step;
  }

  private async copyAll(deviceId: string, sourcePaths: readonly string[]): Promise<SendResult> {
    const queued: OutboxEntry[] = [];
    const failed: SendFailure[] = [];
    for (const sourcePath of sourcePaths) {
      const waiting = this.list(deviceId).length + queued.length;
      const outcome = await this.copy(deviceId, sourcePath, waiting);
      if ('problem' in outcome) {
        failed.push(outcome);
      } else {
        queued.push(outcome);
      }
    }
    if (queued.length === 0) {
      return { queued, failed };
    }
    let added: boolean;
    try {
      added = await this.change((entries) =>
        this.dependencies.isPaired(deviceId)
          ? { entries: [...entries, ...queued], result: true }
          : { entries, result: false },
      );
    } catch (error) {
      await this.removeCopies(queued);
      throw error;
    }
    if (!added) {
      await this.removeCopies(queued);
      const removed = queued.map(({ name }): SendFailure => ({ name, problem: 'device-removed' }));
      return { queued: [], failed: [...removed, ...failed] };
    }
    this.dependencies.logger.info('files queued for a device', {
      count: queued.length,
      bytes: queued.reduce((total, { sizeBytes }) => total + sizeBytes, 0),
    });
    return { queued, failed };
  }

  /** Checks one file and copies it. Its path is used only here, and never logged. */
  private async copy(
    deviceId: string,
    sourcePath: string,
    waiting: number,
  ): Promise<OutboxEntry | SendFailure> {
    const now = this.dependencies.now();
    const fileName = path.win32.basename(sourcePath);
    const name = sendNameOf(sourcePath, now);
    const failure = (problem: SendProblem): SendFailure => ({ name, problem });
    // Decided on the text alone, before anything touches the file system (THREAT_MODEL.md T43).
    if (!isLocalDrivePath(sourcePath)) {
      return failure('not-a-local-file');
    }
    if (isWindowsDeviceName(fileName)) {
      return failure('not-a-file');
    }
    if (!this.dependencies.isPaired(deviceId)) {
      return failure('device-removed');
    }
    if (waiting >= OUTBOX_LIMITS.maxFilesPerDevice) {
      return failure('outbox-full');
    }
    let source: FileHandle;
    try {
      source = await open(sourcePath, 'r');
    } catch (error) {
      return failure(hasErrorCode(error, 'EISDIR') ? 'not-a-file' : 'unreadable');
    }
    try {
      // The open file is checked, not its path, so a file swapped meanwhile changes nothing.
      let sizeBytes: number;
      try {
        const stats = await source.stat();
        if (!stats.isFile()) {
          return failure('not-a-file');
        }
        sizeBytes = stats.size;
      } catch {
        return failure('unreadable');
      }
      if (sizeBytes > this.dependencies.maxFileSizeBytes()) {
        return failure('too-large');
      }
      const available = await this.dependencies.availableBytes(this.dependencies.folder);
      if (available < sizeBytes + FREE_SPACE_RESERVE_BYTES) {
        return failure('no-space');
      }
      const id = newOutboxId();
      const problem = await this.writeCopy(source, id, sizeBytes);
      if (problem !== undefined) {
        return failure(problem);
      }
      return {
        id,
        deviceId,
        name,
        sizeBytes,
        queuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + OUTBOX_LIMITS.fileLifetimeMs).toISOString(),
      };
    } finally {
      await source.close();
    }
  }

  /**
   * Writes the copy as "<id>.part" and renames it to "<id>" once its byte count is the size the
   * file had when it was opened. A file that changes size while it is copied is not sent.
   */
  private async writeCopy(
    source: FileHandle,
    id: string,
    sizeBytes: number,
  ): Promise<SendProblem | undefined> {
    const partPath = resolveInsideFolder(this.dependencies.folder, partFileNameOf(id));
    try {
      const counter = new ByteLimitCounter(sizeBytes);
      // `flush` puts the copy on disk before the list that names it is saved.
      await pipeline(
        source.createReadStream({ start: 0, autoClose: false }),
        counter,
        createWriteStream(partPath, { flags: 'wx', flush: true }),
      );
      if (counter.bytes !== sizeBytes) {
        await this.removeFile(partPath);
        return 'unreadable';
      }
      await rename(partPath, this.copyPath(id));
      return undefined;
    } catch (error) {
      await this.removeFile(partPath);
      if (hasErrorCode(error, 'ENOSPC')) {
        return 'no-space';
      }
      // It grew while it was copied, or could not be read to the end.
      this.dependencies.logger.warn('could not copy a file to send', { error: errorCodeOf(error) });
      return 'unreadable';
    }
  }

  /** The copy, checked against its entry. A missing or damaged copy ends the entry. */
  private async openCopy(entry: OutboxEntry): Promise<FileHandle> {
    let handle: FileHandle | undefined;
    try {
      handle = await open(this.copyPath(entry.id), 'r');
      const stats = await handle.stat();
      if (stats.isFile() && stats.size === entry.sizeBytes) {
        return handle;
      }
    } catch (error) {
      await handle?.close();
      if (!hasErrorCode(error, 'ENOENT')) {
        throw error;
      }
      handle = undefined;
    }
    await handle?.close();
    this.dependencies.logger.warn('a copy waiting for a device was missing or damaged');
    await this.remove((candidate) => candidate.id === entry.id);
    throw new ProtocolError('file_gone');
  }

  private async remove(matches: (entry: OutboxEntry) => boolean): Promise<readonly OutboxEntry[]> {
    const removed = await this.change((entries) => {
      const gone = entries.filter(matches);
      return gone.length === 0
        ? { entries, result: gone }
        : { entries: entries.filter((entry) => !matches(entry)), result: gone };
    });
    const removedIds = new Set(removed.map(({ id }) => id));
    for (const download of this.activeDownloads) {
      if (removedIds.has(download.id)) {
        download.stop.abort(new ProtocolError('file_gone'));
      }
    }
    await this.removeCopies(removed);
    return removed;
  }

  /**
   * Changes run one at a time, each on the latest list. A change is saved before it takes
   * effect, so after a crash no entry names a copy that was already deleted.
   */
  private change<Result>(
    apply: (entries: readonly OutboxEntry[]) => EntriesChange<Result>,
  ): Promise<Result> {
    const step = this.pendingChange.then(async () => {
      const { entries, result } = apply(this.entries);
      if (entries !== this.entries) {
        await writeJsonFileAtomic(this.dependencies.listFile, toListFile(entries));
        this.entries = entries;
        for (const listener of this.changeListeners) {
          listener();
        }
      }
      return result;
    });
    this.pendingChange = step.then(
      () => undefined,
      () => undefined,
    );
    return step;
  }

  private copyPath(id: string): string {
    return resolveInsideFolder(this.dependencies.folder, id);
  }

  private async removeCopies(entries: readonly OutboxEntry[]): Promise<void> {
    await Promise.all(entries.map(({ id }) => this.removeFile(this.copyPath(id))));
  }

  /** A copy that cannot be deleted now has no entry any more, so the next start deletes it. */
  private async removeFile(filePath: string): Promise<void> {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      this.dependencies.logger.warn('could not delete a copy', { error: errorCodeOf(error) });
    }
  }
}

/**
 * The name a file gets in the outbox, which is also how dialogs show it: its own name, cleaned
 * like the name of a received file, so it never holds a path or text that reads differently.
 */
export function sendNameOf(sourcePath: string, now: Date): string {
  return sanitizeFileName(path.win32.basename(sourcePath), fallbackFileName(now));
}

function isExpired(entry: OutboxEntry, now: Date): boolean {
  return Date.parse(entry.expiresAt) <= now.getTime();
}

/** An unreadable copy counts as missing: its entry is dropped, and the copy deleted if it can be. */
async function hasCopy(folder: string, entry: OutboxEntry): Promise<boolean> {
  try {
    const stats = await stat(resolveInsideFolder(folder, entry.id));
    return stats.isFile() && stats.size === entry.sizeBytes;
  } catch {
    return false;
  }
}

/** Deletes partial copies and copies without an entry. Names the outbox never makes stay. */
async function removeLeftovers(
  folder: string,
  keptIds: ReadonlySet<string>,
  logger: Logger,
): Promise<number> {
  const leftovers = (await readdir(folder)).filter((name) => {
    const parsed = parseOutboxFileName(name);
    return parsed !== undefined && (parsed.partial || !keptIds.has(parsed.id));
  });
  const results = await Promise.allSettled(
    leftovers.map((name) => rm(resolveInsideFolder(folder, name), { force: true })),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn('could not delete a copy', { error: errorCodeOf(result.reason) });
    }
  }
  return results.filter(({ status }) => status === 'fulfilled').length;
}

/**
 * The stored entries, or `undefined` when there is no list yet. A damaged list counts as empty,
 * so its copies become leftovers: losing the files waiting is better than not starting.
 */
async function readEntries(listFile: string, logger: Logger): Promise<OutboxEntry[] | undefined> {
  let stored: unknown;
  try {
    stored = await readJsonFile(listFile);
  } catch (error) {
    if (!(error instanceof StartupError)) {
      throw error;
    }
    stored = null;
  }
  if (stored === undefined) {
    return undefined;
  }
  const entries = parseListFile(stored);
  if (entries === undefined) {
    logger.warn('the list of files waiting for devices was damaged; they are deleted');
  }
  return entries;
}

function parseListFile(value: unknown): OutboxEntry[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { formatVersion, files } = value;
  if (formatVersion !== OUTBOX_FORMAT_VERSION || !Array.isArray(files)) {
    return undefined;
  }
  const entries: OutboxEntry[] = [];
  const ids = new Set<string>();
  for (const item of files as readonly unknown[]) {
    const entry = parseEntry(item);
    if (entry === undefined || ids.has(entry.id)) {
      return undefined;
    }
    ids.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

function parseEntry(value: unknown): OutboxEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, deviceId, name, sizeBytes, queuedAt, expiresAt } = value;
  if (
    !isOutboxId(id) ||
    !isUuid(deviceId) ||
    typeof name !== 'string' ||
    name === '' ||
    name.length > MAX_STORED_NAME_LENGTH ||
    !isIntegerInRange(sizeBytes, 0, Number.MAX_SAFE_INTEGER) ||
    !isIsoTimestamp(queuedAt) ||
    !isIsoTimestamp(expiresAt)
  ) {
    return undefined;
  }
  return { id, deviceId, name, sizeBytes, queuedAt, expiresAt };
}

function toListFile(entries: readonly OutboxEntry[]): unknown {
  return {
    formatVersion: OUTBOX_FORMAT_VERSION,
    files: entries.map(({ id, deviceId, name, sizeBytes, queuedAt, expiresAt }) => ({
      id,
      deviceId,
      name,
      sizeBytes,
      queuedAt,
      expiresAt,
    })),
  };
}

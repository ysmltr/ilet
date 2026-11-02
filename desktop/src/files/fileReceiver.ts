import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { UPLOAD_RETRY_AFTER_SECONDS } from '../protocol/constants';
import { ProtocolError } from '../shared/errors';
import { errorFields, type Logger } from '../shared/logger';
import { ByteLimitCounter } from './byteLimitCounter';
import type { AvailableSpaceProbe } from './diskSpace';
import { fallbackFileName, sanitizeFileName } from './fileNameSanitizer';
import type { UntrustedFileMarker } from './markOfTheWeb';
import { newPartFileName } from './partialFiles';
import { resolveInsideFolder } from './pathContainment';
import { claimUniqueFile } from './uniqueFileName';
import { UploadSlots } from './uploadSlots';

/** Free space that must remain once every upload in progress has finished. */
export const FREE_SPACE_RESERVE_BYTES = 512 * 1024 ** 2;

export interface ReceivePolicy {
  readonly receiveFolder: string;
  readonly maxFileSizeBytes: number;
  readonly maxConcurrentUploads: number;
}

export interface FileReceiverDependencies {
  /**
   * Read once per upload, so a folder changed during an upload cannot put its .part file and its
   * final name in two different folders.
   */
  readonly policy: () => ReceivePolicy;
  readonly markUntrusted: UntrustedFileMarker;
  readonly availableBytes: AvailableSpaceProbe;
  readonly now: () => Date;
  readonly logger: Logger;
}

export interface IncomingFile {
  readonly deviceId: string;
  /** Comes from the client, so it is never used as a path without sanitizing. */
  readonly requestedName: string;
  readonly sizeBytes: number;
  readonly content: Readable;
  /** Called once every check has passed, right before the content is read. */
  readonly onAccepted: () => void;
}

export interface ReceivedFile {
  readonly path: string;
  readonly fileName: string;
  readonly sizeBytes: number;
}

/**
 * Saves uploads into the receive folder. Content is streamed to a ".part" file, its size is
 * checked, it is marked as untrusted, and only then is it renamed. A final file name therefore
 * never holds partial or unmarked data.
 */
export class FileReceiver {
  private readonly slots: UploadSlots;

  constructor(private readonly dependencies: FileReceiverDependencies) {
    this.slots = new UploadSlots(dependencies.policy().maxConcurrentUploads);
  }

  async receive(file: IncomingFile): Promise<ReceivedFile> {
    const { receiveFolder, maxFileSizeBytes } = this.dependencies.policy();
    if (file.sizeBytes > maxFileSizeBytes) {
      throw new ProtocolError('payload_too_large');
    }
    const slot = this.slots.tryAcquire(file.deviceId, file.sizeBytes);
    if (slot === undefined) {
      throw new ProtocolError('too_many_uploads', {
        retryAfterSeconds: UPLOAD_RETRY_AFTER_SECONDS,
      });
    }
    try {
      await mkdir(receiveFolder, { recursive: true });
      await this.ensureFreeSpace(receiveFolder);
      file.onAccepted();
      return await this.store(file, receiveFolder, slot.signal);
    } finally {
      slot.release();
    }
  }

  abortUploadsFrom(deviceId: string): void {
    this.slots.abortUploadsFrom(deviceId);
  }

  private async ensureFreeSpace(receiveFolder: string): Promise<void> {
    const available = await this.dependencies.availableBytes(receiveFolder);
    // reservedBytes() includes this upload and every other upload in progress.
    if (available < this.slots.reservedBytes() + FREE_SPACE_RESERVE_BYTES) {
      throw new ProtocolError('insufficient_storage');
    }
  }

  private async store(
    file: IncomingFile,
    receiveFolder: string,
    signal: AbortSignal,
  ): Promise<ReceivedFile> {
    const partPath = resolveInsideFolder(receiveFolder, newPartFileName());
    try {
      await this.writePartFile(file, partPath, signal);
      await this.dependencies.markUntrusted(partPath);
      signal.throwIfAborted();
      return await this.publish(partPath, receiveFolder, file);
    } catch (error) {
      await this.removeFile(partPath);
      const abortReason: unknown = signal.reason;
      throw signal.aborted ? abortReason : error;
    }
  }

  private async writePartFile(
    file: IncomingFile,
    partPath: string,
    signal: AbortSignal,
  ): Promise<void> {
    const counter = new ByteLimitCounter(file.sizeBytes);
    // `flush` puts the data on disk before the client is told the file was saved.
    const output = createWriteStream(partPath, { flags: 'wx', flush: true });
    await pipeline(file.content, counter, output, { signal });
    if (counter.bytes !== file.sizeBytes) {
      throw new ProtocolError('incomplete_upload');
    }
  }

  private async publish(
    partPath: string,
    receiveFolder: string,
    file: IncomingFile,
  ): Promise<ReceivedFile> {
    const fileName = sanitizeFileName(
      file.requestedName,
      fallbackFileName(this.dependencies.now()),
    );
    const finalPath = await claimUniqueFile(receiveFolder, fileName);
    try {
      // This replaces only the empty placeholder that claimUniqueFile just created.
      await rename(partPath, finalPath);
    } catch (error) {
      await this.removeFile(finalPath);
      throw error;
    }
    return { path: finalPath, fileName: path.basename(finalPath), sizeBytes: file.sizeBytes };
  }

  /** Cleanup must not hide the original error, so its own failure is logged, not thrown. */
  private async removeFile(filePath: string): Promise<void> {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      this.dependencies.logger.error('could not delete an incomplete file', errorFields(error));
    }
  }
}

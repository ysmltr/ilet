import { ProtocolError } from '../shared/errors';

export interface UploadSlot {
  /** Aborted when the device that owns the upload is revoked. */
  readonly signal: AbortSignal;
  release(): void;
}

interface ActiveUpload {
  readonly deviceId: string;
  readonly sizeBytes: number;
  readonly controller: AbortController;
}

/** Limits concurrent uploads and remembers how much disk space they will need. */
export class UploadSlots {
  private readonly active = new Set<ActiveUpload>();

  constructor(private readonly maxConcurrentUploads: number) {}

  /** Returns `undefined` when every slot is busy. */
  tryAcquire(deviceId: string, sizeBytes: number): UploadSlot | undefined {
    if (this.active.size >= this.maxConcurrentUploads) {
      return undefined;
    }
    const upload: ActiveUpload = { deviceId, sizeBytes, controller: new AbortController() };
    this.active.add(upload);
    return {
      signal: upload.controller.signal,
      release: () => {
        this.active.delete(upload);
      },
    };
  }

  /** Total size of all uploads in progress. */
  reservedBytes(): number {
    let total = 0;
    for (const upload of this.active) {
      total += upload.sizeBytes;
    }
    return total;
  }

  abortUploadsFrom(deviceId: string): void {
    for (const upload of this.active) {
      if (upload.deviceId === deviceId) {
        upload.controller.abort(new ProtocolError('unauthorized'));
      }
    }
  }
}

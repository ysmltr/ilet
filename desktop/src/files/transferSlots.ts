import { ProtocolError } from '../shared/errors';

export interface TransferSlot {
  /** Aborted when the device that owns the transfer is revoked. */
  readonly signal: AbortSignal;
  release(): void;
}

interface ActiveTransfer {
  readonly deviceId: string;
  readonly sizeBytes: number;
  readonly controller: AbortController;
}

/**
 * Limits concurrent transfers (uploads, or downloads from the outbox) and remembers how much disk
 * space the uploads in progress will need.
 */
export class TransferSlots {
  private readonly active = new Set<ActiveTransfer>();

  constructor(private readonly maxConcurrentTransfers: number) {}

  /** Returns `undefined` when every slot is busy. */
  tryAcquire(deviceId: string, sizeBytes = 0): TransferSlot | undefined {
    if (this.active.size >= this.maxConcurrentTransfers) {
      return undefined;
    }
    const transfer: ActiveTransfer = { deviceId, sizeBytes, controller: new AbortController() };
    this.active.add(transfer);
    return {
      signal: transfer.controller.signal,
      release: () => {
        this.active.delete(transfer);
      },
    };
  }

  /** Total size of all transfers in progress. */
  reservedBytes(): number {
    let total = 0;
    for (const transfer of this.active) {
      total += transfer.sizeBytes;
    }
    return total;
  }

  abortTransfersFrom(deviceId: string): void {
    for (const transfer of this.active) {
      if (transfer.deviceId === deviceId) {
        transfer.controller.abort(new ProtocolError('unauthorized'));
      }
    }
  }
}

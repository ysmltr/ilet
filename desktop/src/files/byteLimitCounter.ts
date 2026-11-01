import { Transform, type TransformCallback } from 'node:stream';

import { ProtocolError } from '../shared/errors';

/** Passes data through, counts it, and fails as soon as more than `limit` bytes arrive. */
export class ByteLimitCounter extends Transform {
  private count = 0;

  constructor(private readonly limit: number) {
    super();
  }

  get bytes(): number {
    return this.count;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.count += chunk.length;
    if (this.count > this.limit) {
      callback(new ProtocolError('payload_too_large'));
      return;
    }
    callback(null, chunk);
  }
}

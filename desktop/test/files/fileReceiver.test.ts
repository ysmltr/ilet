import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
  FileReceiver,
  FREE_SPACE_RESERVE_BYTES,
  type IncomingFile,
  type ReceivePolicy,
} from '../../src/files/fileReceiver';
import { isPartFileName } from '../../src/files/partialFiles';
import { ProtocolError } from '../../src/shared/errors';
import { createMemoryLogger, createTempFolder } from '../helpers/fakes';

const DEVICE_ID = 'device-1';
const PLENTY_OF_SPACE = Number.MAX_SAFE_INTEGER;

interface ReceiverSetup {
  readonly folder: string;
  readonly receiver: FileReceiver;
  readonly markUntrusted: ReturnType<typeof vi.fn<(filePath: string) => Promise<void>>>;
}

async function setUp(
  overrides: Partial<ReceivePolicy> & { availableBytes?: number } = {},
): Promise<ReceiverSetup> {
  const folder = path.join(await createTempFolder(), 'receive');
  const markUntrusted = vi.fn<(filePath: string) => Promise<void>>(() => Promise.resolve());
  const receiver = new FileReceiver({
    policy: {
      receiveFolder: folder,
      maxFileSizeBytes: overrides.maxFileSizeBytes ?? 1024,
      maxConcurrentUploads: overrides.maxConcurrentUploads ?? 2,
    },
    markUntrusted,
    availableBytes: () => Promise.resolve(overrides.availableBytes ?? PLENTY_OF_SPACE),
    now: () => new Date(2026, 10, 1, 15, 30, 12),
    logger: createMemoryLogger(),
  });
  return { folder, receiver, markUntrusted };
}

function incoming(content: Readable | string, overrides: Partial<IncomingFile> = {}): IncomingFile {
  const stream = typeof content === 'string' ? Readable.from([Buffer.from(content)]) : content;
  return {
    deviceId: DEVICE_ID,
    requestedName: 'photo.jpg',
    sizeBytes: typeof content === 'string' ? Buffer.byteLength(content) : 0,
    content: stream,
    onAccepted: () => undefined,
    ...overrides,
  };
}

async function filesIn(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
}

async function expectProtocolError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(ProtocolError);
  expect((error as ProtocolError).code).toBe(code);
}

describe('FileReceiver', () => {
  it('saves the content under the sanitized name', async () => {
    const { folder, receiver } = await setUp();

    const received = await receiver.receive(incoming('hello', { requestedName: '../x/a:b.txt' }));

    expect(received.fileName).toBe('a_b.txt');
    expect(received.path).toBe(path.join(folder, 'a_b.txt'));
    expect(await readFile(received.path, 'utf8')).toBe('hello');
    expect(await filesIn(folder)).toEqual(['a_b.txt']);
  });

  it('never overwrites an existing file', async () => {
    const { folder, receiver } = await setUp();
    await receiver.receive(incoming('first'));

    const second = await receiver.receive(incoming('second'));

    expect(second.fileName).toBe('photo (1).jpg');
    expect(await readFile(path.join(folder, 'photo.jpg'), 'utf8')).toBe('first');
  });

  it('marks the partial file as untrusted before it gets its final name', async () => {
    const { folder, receiver, markUntrusted } = await setUp();
    markUntrusted.mockImplementation(async (filePath) => {
      expect(isPartFileName(path.basename(filePath))).toBe(true);
      await expect(access(path.join(folder, 'photo.jpg'))).rejects.toThrow();
    });

    await receiver.receive(incoming('data'));

    expect(markUntrusted).toHaveBeenCalledOnce();
  });

  it('keeps nothing when marking the file fails', async () => {
    const { folder, receiver, markUntrusted } = await setUp();
    markUntrusted.mockRejectedValue(new Error('no alternate data streams'));

    await expect(receiver.receive(incoming('data'))).rejects.toThrow('no alternate data streams');
    expect(await filesIn(folder)).toEqual([]);
  });

  it('rejects content shorter than announced and deletes it', async () => {
    const { folder, receiver } = await setUp();
    await expectProtocolError(
      receiver.receive(incoming('short', { sizeBytes: 10 })),
      'incomplete_upload',
    );
    expect(await filesIn(folder)).toEqual([]);
  });

  it('rejects content longer than announced and deletes it', async () => {
    const { folder, receiver } = await setUp();
    await expectProtocolError(
      receiver.receive(incoming('far too long', { sizeBytes: 3 })),
      'payload_too_large',
    );
    expect(await filesIn(folder)).toEqual([]);
  });

  it('deletes the partial file when the connection breaks', async () => {
    const { folder, receiver } = await setUp();
    const content = new PassThrough();
    const upload = receiver.receive(incoming(content, { sizeBytes: 100 }));
    content.write(Buffer.alloc(10));
    await vi.waitFor(async () => {
      expect((await filesIn(folder)).length).toBe(1);
    });
    content.destroy(new Error('connection reset'));

    await expect(upload).rejects.toThrow('connection reset');
    expect(await filesIn(folder)).toEqual([]);
  });

  it('rejects files over the size limit before reading them', async () => {
    const { receiver } = await setUp({ maxFileSizeBytes: 4 });
    const onAccepted = vi.fn();
    await expectProtocolError(
      receiver.receive(incoming('12345', { onAccepted })),
      'payload_too_large',
    );
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('rejects a file when the disk would get too full', async () => {
    const { folder, receiver } = await setUp({ availableBytes: FREE_SPACE_RESERVE_BYTES + 4 });
    const onAccepted = vi.fn();
    await expectProtocolError(
      receiver.receive(incoming('12345', { onAccepted })),
      'insufficient_storage',
    );
    expect(onAccepted).not.toHaveBeenCalled();
    expect(await filesIn(folder)).toEqual([]);
  });

  it('counts uploads in progress when checking free space', async () => {
    const { receiver } = await setUp({ availableBytes: FREE_SPACE_RESERVE_BYTES + 150 });
    const slow = new PassThrough();
    const first = receiver.receive(incoming(slow, { sizeBytes: 100 }));
    await vi.waitFor(() => {
      expect(slow.listenerCount('data')).toBeGreaterThan(0);
    });

    await expectProtocolError(
      receiver.receive(incoming('x'.repeat(100), { requestedName: 'other.jpg' })),
      'insufficient_storage',
    );
    slow.end(Buffer.alloc(100));
    await first;
  });

  it('limits concurrent uploads and frees the slot afterwards', async () => {
    const { receiver } = await setUp({ maxConcurrentUploads: 1 });
    const slow = new PassThrough();
    const first = receiver.receive(incoming(slow, { sizeBytes: 3 }));

    const rejected: unknown = await receiver
      .receive(incoming('abc'))
      .catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(ProtocolError);
    expect((rejected as ProtocolError).code).toBe('too_many_uploads');
    expect((rejected as ProtocolError).retryAfterSeconds).toBeGreaterThan(0);

    slow.end('abc');
    await first;
    await expect(receiver.receive(incoming('abc'))).resolves.toBeDefined();
  });

  it('calls onAccepted once the checks pass', async () => {
    const { receiver } = await setUp();
    const onAccepted = vi.fn();
    await receiver.receive(incoming('data', { onAccepted }));
    expect(onAccepted).toHaveBeenCalledOnce();
  });

  it('aborts and deletes the uploads of a revoked device', async () => {
    const { folder, receiver } = await setUp();
    const content = new PassThrough();
    const upload = receiver.receive(incoming(content, { sizeBytes: 100 }));
    content.write(Buffer.alloc(10));
    await vi.waitFor(async () => {
      expect((await filesIn(folder)).length).toBe(1);
    });

    receiver.abortUploadsFrom(DEVICE_ID);

    await expectProtocolError(upload, 'unauthorized');
    expect(await filesIn(folder)).toEqual([]);
  });

  it('does not abort uploads of other devices', async () => {
    const { receiver } = await setUp();
    const content = new PassThrough();
    const upload = receiver.receive(incoming(content, { sizeBytes: 3 }));
    receiver.abortUploadsFrom('another-device');
    content.end('abc');
    await expect(upload).resolves.toMatchObject({ fileName: 'photo.jpg' });
  });

  it('uses the generated name when nothing usable remains', async () => {
    const { receiver } = await setUp();
    const received = await receiver.receive(incoming('data', { requestedName: '..' }));
    expect(received.fileName).toBe('ilet-20261101-153012');
  });

  it('leaves files that are not its own partial files alone', async () => {
    const { folder, receiver } = await setUp();
    await receiver.receive(incoming('data'));
    await writeFile(path.join(folder, 'notes.part'), 'user file');
    await expect(receiver.receive(incoming('more'))).resolves.toBeDefined();
    expect(await filesIn(folder)).toContain('notes.part');
  });
});

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  MAX_FILES_PER_SEND,
  Outbox,
  type OutboxDependencies,
  type OutboxEntry,
  type SendFailure,
} from '../../src/outbox/outbox';
import { OUTBOX_LIMITS } from '../../src/protocol/constants';
import { ProtocolError } from '../../src/shared/errors';
import { createMemoryLogger, createTempFolder, type MemoryLogger } from '../helpers/fakes';

const DEVICE_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const OTHER_DEVICE_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const START = new Date('2026-11-06T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

interface Setup {
  readonly copies: string;
  readonly sources: string;
  readonly dependencies: OutboxDependencies;
  readonly outbox: Outbox;
  readonly logger: MemoryLogger;
  readonly paired: Set<string>;
  advance(ms: number): void;
  /** Creates a file to send and returns its path. */
  source(name: string, content?: string): Promise<string>;
  /** Sends one file that must be queued, and returns its entry. */
  queue(name: string, content?: string, deviceId?: string): Promise<OutboxEntry>;
}

async function setUp(overrides: Partial<OutboxDependencies> = {}): Promise<Setup> {
  const root = await createTempFolder();
  const copies = path.join(root, 'outbox');
  const sources = path.join(root, 'to-send');
  await mkdir(sources);
  const logger = createMemoryLogger();
  const paired = new Set([DEVICE_ID, OTHER_DEVICE_ID]);
  let now = START;
  const dependencies: OutboxDependencies = {
    folder: copies,
    listFile: path.join(root, 'outbox.json'),
    isPaired: (deviceId) => paired.has(deviceId),
    maxFileSizeBytes: () => 1024,
    availableBytes: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
    now: () => now,
    logger,
    ...overrides,
  };
  const outbox = await Outbox.open(dependencies);
  const source = async (name: string, content = 'hello'): Promise<string> => {
    const sourcePath = path.join(sources, name);
    await writeFile(sourcePath, content);
    return sourcePath;
  };
  return {
    copies,
    sources,
    dependencies,
    outbox,
    logger,
    paired,
    advance: (ms) => {
      now = new Date(now.getTime() + ms);
    },
    source,
    queue: async (name, content, deviceId = DEVICE_ID) => {
      const { queued, failed } = await outbox.send(deviceId, [await source(name, content)]);
      expect(failed).toEqual([]);
      return only(queued);
    },
  };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) {
    throw new Error('expected one item');
  }
  return item;
}

function problems(failed: readonly SendFailure[]): string[] {
  return failed.map(({ problem }) => problem);
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
}

async function expectProtocolError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await rejectionOf(promise);
  expect(error).toBeInstanceOf(ProtocolError);
  expect((error as ProtocolError).code).toBe(code);
}

describe('Outbox', () => {
  describe('sending', () => {
    it('copies a chosen file and lists it for its device only, for 24 hours', async () => {
      const setup = await setUp();
      const entry = await setup.queue('report.pdf', 'report content');

      expect(entry).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown,
        deviceId: DEVICE_ID,
        name: 'report.pdf',
        sizeBytes: 14,
        queuedAt: START.toISOString(),
        expiresAt: new Date(START.getTime() + 24 * HOUR_MS).toISOString(),
      });
      expect(setup.outbox.list(DEVICE_ID)).toEqual([entry]);
      expect(setup.outbox.list(OTHER_DEVICE_ID)).toEqual([]);
      // The copy is named by its ID alone.
      expect(await readdir(setup.copies)).toEqual([entry.id]);
      expect(await readFile(path.join(setup.copies, entry.id), 'utf8')).toBe('report content');
    });

    it('serves the copy made when the file was sent, not the file as it is now', async () => {
      const setup = await setUp();
      const source = await setup.source('notes.txt', 'first');
      const entry = only((await setup.outbox.send(DEVICE_ID, [source])).queued);
      await writeFile(source, 'changed afterwards');

      const download = await setup.outbox.startDownload(DEVICE_ID, entry.id);
      try {
        expect(await download.handle.readFile('utf8')).toBe('first');
      } finally {
        await download.finish();
      }
    });

    it('cleans the name as for received files', async () => {
      const setup = await setUp();
      const entry = await setup.queue('photo\u202Egpj.exe');
      expect(entry.name).toBe('photogpj.exe');
    });

    it.each([
      ['a network path', '\\\\server\\share\\report.pdf'],
      ['a long path', '\\\\?\\C:\\report.pdf'],
      ['a device path', '\\\\.\\C:\\report.pdf'],
      ['a relative path', 'report.pdf'],
      ['a drive-relative path', 'C:report.pdf'],
      ['an alternate data stream', 'C:\\report.pdf:hidden'],
      ['a control character', 'C:\\report\u0007.pdf'],
    ])('refuses %s before touching the file system', async (_, sourcePath) => {
      const setup = await setUp();
      const { queued, failed } = await setup.outbox.send(DEVICE_ID, [sourcePath]);
      expect(queued).toEqual([]);
      expect(problems(failed)).toEqual(['not-a-local-file']);
    });

    it.each(['NUL', 'con.txt', 'COM1.log', 'aux .txt'])(
      'refuses the device name %s',
      async (fileName) => {
        const setup = await setUp();
        const { failed } = await setup.outbox.send(DEVICE_ID, [path.join(setup.sources, fileName)]);
        expect(problems(failed)).toEqual(['not-a-file']);
      },
    );

    it('refuses folders, missing files, files over the limit and a full disk', async () => {
      const setup = await setUp({ maxFileSizeBytes: () => 4 });
      const folder = path.join(setup.sources, 'Photos');
      await mkdir(folder);
      const { failed } = await setup.outbox.send(DEVICE_ID, [
        folder,
        path.join(setup.sources, 'missing.txt'),
        await setup.source('large.bin', '12345'),
      ]);
      expect(failed).toEqual([
        { name: 'Photos', problem: 'not-a-file' },
        { name: 'missing.txt', problem: 'unreadable' },
        { name: 'large.bin', problem: 'too-large' },
      ]);

      const full = await setUp({ availableBytes: () => Promise.resolve(0) });
      const result = await full.outbox.send(DEVICE_ID, [await full.source('a.txt')]);
      expect(problems(result.failed)).toEqual(['no-space']);
      expect(await readdir(full.copies)).toEqual([]);
    });

    it('queues each file on its own', async () => {
      const setup = await setUp();
      const { queued, failed } = await setup.outbox.send(DEVICE_ID, [
        await setup.source('a.txt'),
        path.join(setup.sources, 'missing.txt'),
        await setup.source('b.txt'),
      ]);
      expect(queued.map(({ name }) => name)).toEqual(['a.txt', 'b.txt']);
      expect(problems(failed)).toEqual(['unreadable']);
    });

    // It makes 201 real copies, each flushed to disk: a few seconds, more on a CI runner.
    it('takes at most 50 files at once and 200 per device', { timeout: 30_000 }, async () => {
      const setup = await setUp();
      const source = await setup.source('a.txt');
      expect(() => setup.outbox.send(DEVICE_ID, Array<string>(51).fill(source))).toThrow(
        RangeError,
      );
      const batches = OUTBOX_LIMITS.maxFilesPerDevice / MAX_FILES_PER_SEND;
      for (let batch = 0; batch < batches; batch += 1) {
        const { failed } = await setup.outbox.send(
          DEVICE_ID,
          Array<string>(MAX_FILES_PER_SEND).fill(source),
        );
        expect(failed).toEqual([]);
      }

      const { failed } = await setup.outbox.send(DEVICE_ID, [source]);
      expect(problems(failed)).toEqual(['outbox-full']);
      // The limit is per device.
      expect((await setup.outbox.send(OTHER_DEVICE_ID, [source])).queued).toHaveLength(1);
    });

    it('sends nothing to a device that was removed while its files were copied', async () => {
      const isPaired = vi
        .fn<(deviceId: string) => boolean>()
        .mockReturnValueOnce(true)
        .mockReturnValue(false);
      const setup = await setUp({ isPaired });
      const { queued, failed } = await setup.outbox.send(DEVICE_ID, [await setup.source('a.txt')]);
      expect(queued).toEqual([]);
      expect(failed).toEqual([{ name: 'a.txt', problem: 'device-removed' }]);
      expect(setup.outbox.list()).toEqual([]);
      expect(await readdir(setup.copies)).toEqual([]);
    });

    it('saves the list before reporting the change', async () => {
      const setup = await setUp();
      const changes = vi.fn();
      setup.outbox.onChange(changes);
      const entry = await setup.queue('a.txt');

      expect(changes).toHaveBeenCalledTimes(1);
      const saved: unknown = JSON.parse(await readFile(setup.dependencies.listFile, 'utf8'));
      expect(saved).toEqual({ formatVersion: 1, files: [entry] });
    });

    it('logs counts and sizes, never names or paths', async () => {
      const setup = await setUp();
      await setup.outbox.send(DEVICE_ID, [
        await setup.source('salary-review.pdf'),
        path.join(setup.sources, 'missing-secret.txt'),
      ]);
      const log = setup.logger.lines.join('\n');
      expect(log).toContain('files queued for a device');
      expect(log).not.toContain('salary');
      expect(log).not.toContain('secret');
      expect(log).not.toContain('to-send');
    });
  });

  describe('downloads', () => {
    it('serves a copy only to its own device', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');

      await expectProtocolError(setup.outbox.startDownload(OTHER_DEVICE_ID, entry.id), 'file_gone');
      await expectProtocolError(setup.outbox.startDownload(DEVICE_ID, 'f'.repeat(32)), 'file_gone');
      const download = await setup.outbox.startDownload(DEVICE_ID, entry.id);
      expect(download.entry).toEqual(entry);
      await download.finish();
    });

    it('stops serving a file when its 24 hours are up, and the sweep deletes it', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');

      setup.advance(24 * HOUR_MS - 1);
      expect(setup.outbox.list(DEVICE_ID)).toHaveLength(1);
      setup.advance(1);
      expect(setup.outbox.list(DEVICE_ID)).toEqual([]);
      await expectProtocolError(setup.outbox.startDownload(DEVICE_ID, entry.id), 'file_gone');

      await setup.outbox.removeExpired();
      expect(await readdir(setup.copies)).toEqual([]);
    });

    it('ends a download under way when its 24 hours are up', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');
      setup.advance(24 * HOUR_MS - 1000);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const finished = await setup.outbox.startDownload(DEVICE_ID, entry.id);
        await finished.finish();
        // A download that finished in time leaves no timer behind.
        expect(vi.getTimerCount()).toBe(0);

        const download = await setup.outbox.startDownload(DEVICE_ID, entry.id);
        vi.advanceTimersByTime(999);
        expect(download.signal.aborted).toBe(false);
        vi.advanceTimersByTime(1);
        expect(download.signal.aborted).toBe(true);
        expect(download.signal.reason).toMatchObject({ code: 'file_gone' });
        await download.finish();
      } finally {
        vi.useRealTimers();
      }
    });

    it('allows four downloads at a time', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');
      const downloads = await Promise.all(
        Array.from({ length: OUTBOX_LIMITS.maxConcurrentDownloads }, () =>
          setup.outbox.startDownload(DEVICE_ID, entry.id),
        ),
      );

      const error = await rejectionOf(setup.outbox.startDownload(DEVICE_ID, entry.id));
      expect(error).toBeInstanceOf(ProtocolError);
      expect(error).toMatchObject({ code: 'too_many_downloads', retryAfterSeconds: 2 });

      await Promise.all(downloads.map((download) => download.finish()));
      const next = await setup.outbox.startDownload(DEVICE_ID, entry.id);
      await next.finish();
    });

    it('ends a download when its file is cancelled', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');
      const download = await setup.outbox.startDownload(DEVICE_ID, entry.id);
      expect(download.signal.aborted).toBe(false);

      expect(await setup.outbox.cancel(entry.id)).toBe(true);
      expect(download.signal.aborted).toBe(true);
      expect(download.signal.reason).toMatchObject({ code: 'file_gone' });
      await download.finish();
      expect(setup.outbox.list()).toEqual([]);
      expect(await readdir(setup.copies)).toEqual([]);
      expect(await setup.outbox.cancel(entry.id)).toBe(false);
    });

    it("ends a removed device's downloads and deletes its files", async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');
      const othersEntry = await setup.queue('b.txt', 'b', OTHER_DEVICE_ID);
      const download = await setup.outbox.startDownload(DEVICE_ID, entry.id);

      setup.paired.delete(DEVICE_ID);
      await setup.outbox.removeDevice(DEVICE_ID);
      expect(download.signal.aborted).toBe(true);
      expect(download.signal.reason).toMatchObject({ code: 'unauthorized' });
      await download.finish();
      expect(setup.outbox.list()).toEqual([othersEntry]);
      expect(await readdir(setup.copies)).toEqual([othersEntry.id]);
    });

    it('drops an entry whose copy was changed on disk', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt', 'hello');
      await writeFile(path.join(setup.copies, entry.id), 'changed by someone else');

      await expectProtocolError(setup.outbox.startDownload(DEVICE_ID, entry.id), 'file_gone');
      expect(setup.outbox.list()).toEqual([]);
      expect(await readdir(setup.copies)).toEqual([]);
    });
  });

  describe('confirming', () => {
    it('deletes the entry and its copy, once, and only for its own device', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');
      const delivered = vi.fn();
      setup.outbox.onDelivered(delivered);

      await setup.outbox.confirm(OTHER_DEVICE_ID, entry.id);
      expect(setup.outbox.list()).toEqual([entry]);
      expect(delivered).not.toHaveBeenCalled();

      await setup.outbox.confirm(DEVICE_ID, entry.id);
      await setup.outbox.confirm(DEVICE_ID, entry.id);
      expect(setup.outbox.list()).toEqual([]);
      expect(await readdir(setup.copies)).toEqual([]);
      expect(delivered).toHaveBeenCalledTimes(1);
      expect(delivered).toHaveBeenCalledWith(entry);
    });
  });

  describe('after a restart', () => {
    it('keeps the files still waiting', async () => {
      const setup = await setUp();
      const entry = await setup.queue('a.txt');
      const reopened = await Outbox.open(setup.dependencies);
      expect(reopened.list()).toEqual([entry]);
    });

    it('drops expired files, files of removed devices and missing copies', async () => {
      const setup = await setUp();
      await setup.queue('expired.txt');
      setup.advance(HOUR_MS);
      const kept = await setup.queue('kept.txt');
      await setup.queue('removed-device.txt', 'x', OTHER_DEVICE_ID);
      const missing = await setup.queue('missing.txt');
      await rm(path.join(setup.copies, missing.id));
      setup.paired.delete(OTHER_DEVICE_ID);
      setup.advance(23 * HOUR_MS);

      const reopened = await Outbox.open(setup.dependencies);
      expect(reopened.list()).toEqual([kept]);
      expect(await readdir(setup.copies)).toEqual([kept.id]);
      const saved: unknown = JSON.parse(await readFile(setup.dependencies.listFile, 'utf8'));
      expect(saved).toEqual({ formatVersion: 1, files: [kept] });
    });

    it('deletes partial and unknown copies, and leaves other files alone', async () => {
      const setup = await setUp();
      await writeFile(path.join(setup.copies, `${'a'.repeat(32)}.part`), 'partial');
      await writeFile(path.join(setup.copies, 'b'.repeat(32)), 'no entry');
      await writeFile(path.join(setup.copies, 'notes.txt'), 'not made by the outbox');

      await Outbox.open(setup.dependencies);
      expect(await readdir(setup.copies)).toEqual(['notes.txt']);
    });

    it.each([
      ['not JSON', '{ not json'],
      ['of an unknown format', JSON.stringify({ formatVersion: 2, files: [] })],
      [
        'with a path for an ID',
        JSON.stringify({
          formatVersion: 1,
          files: [
            {
              id: '..\\..\\paired-devices.json',
              deviceId: DEVICE_ID,
              name: 'a.txt',
              sizeBytes: 1,
              queuedAt: START.toISOString(),
              expiresAt: START.toISOString(),
            },
          ],
        }),
      ],
    ])('treats a list %s as empty and deletes its copies', async (_, content) => {
      const setup = await setUp();
      await setup.queue('a.txt');
      await writeFile(setup.dependencies.listFile, content);

      const reopened = await Outbox.open(setup.dependencies);
      expect(reopened.list()).toEqual([]);
      expect(await readdir(setup.copies)).toEqual([]);
      expect(setup.logger.lines.join('\n')).toContain('damaged');
    });
  });
});

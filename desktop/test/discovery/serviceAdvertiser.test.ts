import { describe, expect, it, vi } from 'vitest';

import { type Advertiser, startAdvertising } from '../../src/discovery/serviceAdvertiser';
import { serviceAnnouncement } from '../../src/discovery/serviceAnnouncement';
import { FakeMdnsResponder } from '../helpers/fakeMdns';
import { createMemoryLogger, type MemoryLogger } from '../helpers/fakes';

const DEVICE_ID = '6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23';
const announcement = serviceAnnouncement({
  deviceId: DEVICE_ID,
  displayName: 'DESKTOP-4F2K',
  port: 45380,
});

function start(responder: FakeMdnsResponder): { advertiser: Advertiser; logger: MemoryLogger } {
  const logger = createMemoryLogger();
  return { advertiser: startAdvertising(announcement, () => responder, logger), logger };
}

function logText(logger: MemoryLogger): string {
  return logger.lines.join('\n');
}

/** Lets every promise callback that is already queued run. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('startAdvertising', () => {
  it('announces the ilet service with the names, port and TXT record', () => {
    const responder = new FakeMdnsResponder();
    start(responder);

    expect(responder.definitions).toEqual([
      {
        name: 'DESKTOP-4F2K',
        type: 'ilet',
        hostname: 'ilet-6f1c2a8e',
        port: 45380,
        txt: { id: DEVICE_ID, name: 'DESKTOP-4F2K' },
      },
    ]);
    expect(responder.calls).toEqual(['advertise']);
  });

  it('logs when the announcement is out', async () => {
    const { logger } = start(new FakeMdnsResponder());
    await vi.waitFor(() => {
      expect(logText(logger)).toContain('INFO announced on the local network');
    });
  });

  it('logs the new name when another device already uses the name', () => {
    const responder = new FakeMdnsResponder();
    const { logger } = start(responder);
    responder.renameService('DESKTOP-4F2K (2)');
    expect(logText(logger)).toContain('name="DESKTOP-4F2K (2)"');
  });

  it('withdraws the service, then closes the responder, and only once', async () => {
    const responder = new FakeMdnsResponder();
    const { advertiser } = start(responder);
    await advertiser.stop();
    await advertiser.stop();
    expect(responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
  });

  it('does not report an announcement that stopping cancelled', async () => {
    const responder = new FakeMdnsResponder();
    let finishProbing: () => void = () => undefined;
    responder.advertiseResult = () =>
      new Promise<void>((resolve) => {
        finishProbing = resolve;
      });
    const { advertiser, logger } = start(responder);

    await advertiser.stop();
    finishProbing();
    await settle();

    expect(logText(logger)).not.toContain('announced on the local network');
  });

  it('keeps the server going when the responder rejects the name', async () => {
    const responder = new FakeMdnsResponder();
    responder.createServiceError = new Error('Failed to extract name number');
    const { advertiser, logger } = start(responder);

    expect(logText(logger)).toContain('WARN could not announce the server on the local network');
    await advertiser.stop();
    expect(responder.calls).toEqual(['shutdown']);
  });

  it('keeps the server going when no responder can be created', async () => {
    const logger = createMemoryLogger();
    const advertiser = startAdvertising(
      announcement,
      () => {
        throw new Error('no network interfaces');
      },
      logger,
    );

    expect(logText(logger)).toContain('WARN could not announce the server on the local network');
    await expect(advertiser.stop()).resolves.toBeUndefined();
  });

  it('logs a failed announcement instead of rejecting', async () => {
    const responder = new FakeMdnsResponder();
    responder.advertiseResult = () => Promise.reject(new Error('socket error'));
    const { logger } = start(responder);

    await vi.waitFor(() => {
      expect(logText(logger)).toMatch(/WARN could not announce .* detail="socket error"/);
    });
  });

  it('still closes the responder when withdrawing fails, and does not reject', async () => {
    const responder = new FakeMdnsResponder();
    responder.destroyResult = () => Promise.reject(new Error('goodbye failed'));
    const { advertiser, logger } = start(responder);

    await expect(advertiser.stop()).resolves.toBeUndefined();
    expect(responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
    expect(logText(logger)).toContain('WARN could not withdraw the network announcement');
  });
});

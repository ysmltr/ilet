import { describe, expect, it } from 'vitest';

import { Announcer } from '../../src/discovery/announcer';
import { serviceAnnouncement } from '../../src/discovery/serviceAnnouncement';
import { FakeMdnsResponder } from '../helpers/fakeMdns';
import { createMemoryLogger } from '../helpers/fakes';

interface CreatedResponder {
  readonly adapters: readonly string[] | undefined;
  readonly responder: FakeMdnsResponder;
}

function setUp(): { announcer: Announcer; created: CreatedResponder[] } {
  const created: CreatedResponder[] = [];
  const announcer = new Announcer(
    serviceAnnouncement({
      deviceId: '6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23',
      displayName: 'DESKTOP-4F2K',
      port: 45380,
    }),
    (adapters) => {
      const responder = new FakeMdnsResponder();
      created.push({ adapters, responder });
      return responder;
    },
    createMemoryLogger(),
  );
  return { announcer, created };
}

describe('Announcer', () => {
  it('announces on the given adapters, or on all of them for undefined', async () => {
    const { announcer, created } = setUp();
    await announcer.announceOn(['Ethernet']);
    await announcer.announceOn(undefined);

    expect(created.map(({ adapters }) => adapters)).toEqual([['Ethernet'], undefined]);
  });

  it('does not restart for the same adapters in another order', async () => {
    const { announcer, created } = setUp();
    await announcer.announceOn(['Ethernet', 'Wi-Fi']);
    await announcer.announceOn(['Wi-Fi', 'Ethernet']);

    expect(created).toHaveLength(1);
  });

  it('withdraws the old announcement before making the new one', async () => {
    const { announcer, created } = setUp();
    await announcer.announceOn(['Wi-Fi']);
    await announcer.announceOn(['Ethernet']);

    expect(created[0]?.responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
    expect(created[1]?.adapters).toEqual(['Ethernet']);
  });

  it('announces nowhere for an empty list', async () => {
    const { announcer, created } = setUp();
    await announcer.announceOn(['Wi-Fi']);
    await announcer.announceOn([]);

    expect(created).toHaveLength(1);
    expect(created[0]?.responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
  });

  it('stays quiet once stopped', async () => {
    const { announcer, created } = setUp();
    await announcer.announceOn(['Wi-Fi']);
    await announcer.stop();
    await announcer.announceOn(['Ethernet']);

    expect(created).toHaveLength(1);
    expect(created[0]?.responder.calls).toEqual(['advertise', 'destroy', 'shutdown']);
  });
});

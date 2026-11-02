import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NetworkInterfaces } from '../../src/network/networkInterfaces';
import { NetworkMonitor } from '../../src/network/networkMonitor';
import type { NetworkProfile } from '../../src/network/networkProfiles';
import { createMemoryLogger } from '../helpers/fakes';
import { ipv4 } from '../helpers/networkFakes';

const ADAPTER_CHECK_INTERVAL_MS = 10_000;
const PROFILE_REFRESH_INTERVAL_MS = 5 * 60_000;
const WIFI_PUBLIC: readonly NetworkProfile[] = [{ interfaceName: 'Wi-Fi', category: 'public' }];

function setUp(initialProfiles: readonly NetworkProfile[] | undefined) {
  let profiles = initialProfiles;
  let adapters: NetworkInterfaces = { 'Wi-Fi': [ipv4('192.168.1.20')] };
  const readProfiles = vi.fn(() => Promise.resolve(profiles));
  const monitor = new NetworkMonitor({
    readProfiles,
    networkInterfaces: () => adapters,
    logger: createMemoryLogger(),
  });
  return {
    monitor,
    readProfiles,
    setProfiles: (next: readonly NetworkProfile[] | undefined) => {
      profiles = next;
    },
    setAdapters: (next: NetworkInterfaces) => {
      adapters = next;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NetworkMonitor', () => {
  it('tells listeners about a change, and only once', async () => {
    const { monitor } = setUp(WIFI_PUBLIC);
    const listener = vi.fn();
    monitor.onChange(listener);

    await monitor.refresh();
    await monitor.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(monitor.current.publicNetworks).toEqual(['Wi-Fi']);
    expect(monitor.current.acceptedLocalAddresses).toEqual(new Set());
  });

  it('keeps what it knew when a later query fails', async () => {
    const { monitor, setProfiles } = setUp(WIFI_PUBLIC);
    await monitor.refresh();

    setProfiles(undefined);
    await monitor.refresh();

    expect(monitor.current.acceptedLocalAddresses).toEqual(new Set());
  });

  it('shares one query between overlapping refreshes', async () => {
    const { monitor, readProfiles } = setUp([]);
    await Promise.all([monitor.refresh(), monitor.refresh()]);
    expect(readProfiles).toHaveBeenCalledTimes(1);
  });

  it('reads again when an adapter changes, and only then', async () => {
    vi.useFakeTimers();
    const { monitor, readProfiles, setAdapters } = setUp([]);
    await monitor.refresh();
    monitor.start();

    await vi.advanceTimersByTimeAsync(ADAPTER_CHECK_INTERVAL_MS);
    expect(readProfiles).toHaveBeenCalledTimes(1);

    setAdapters({ 'Wi-Fi': [ipv4('192.168.1.21')] });
    await vi.advanceTimersByTimeAsync(ADAPTER_CHECK_INTERVAL_MS);
    expect(readProfiles).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it('reads again every five minutes, for a category switched in Windows Settings', async () => {
    vi.useFakeTimers();
    const { monitor, readProfiles, setProfiles } = setUp(WIFI_PUBLIC);
    await monitor.refresh();
    monitor.start();

    setProfiles([{ interfaceName: 'Wi-Fi', category: 'private' }]);
    await vi.advanceTimersByTimeAsync(PROFILE_REFRESH_INTERVAL_MS);

    expect(readProfiles).toHaveBeenCalledTimes(2);
    expect(monitor.current.publicNetworks).toEqual([]);
    monitor.stop();
  });
});

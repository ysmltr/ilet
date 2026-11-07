import { describe, expect, it } from 'vitest';

import { firewallBlocksOtherNetworks, packagingOf } from '../../src/app/packaging';

describe('packagingOf', () => {
  it('tells the installer, the Store package and a development build apart', () => {
    expect(packagingOf(true, undefined)).toBe('installer');
    expect(packagingOf(true, false)).toBe('installer');
    expect(packagingOf(true, true)).toBe('store');
    expect(packagingOf(false, undefined)).toBe('development');
    expect(packagingOf(false, true)).toBe('development');
  });
});

describe('firewallBlocksOtherNetworks', () => {
  it('holds only for the installer, whose rules block every network but Private ones', () => {
    expect(firewallBlocksOtherNetworks('installer')).toBe(true);
    expect(firewallBlocksOtherNetworks('store')).toBe(false);
    expect(firewallBlocksOtherNetworks('development')).toBe(false);
  });
});

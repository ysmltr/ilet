import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { DeviceRegistry } from '../../src/auth/deviceRegistry';
import { issueSecret } from '../../src/auth/secrets';
import { ProtocolError, StartupError } from '../../src/shared/errors';
import { createTempFolder } from '../helpers/fakes';

const PAIRED_AT = new Date('2026-11-01T12:00:00.000Z');

async function openRegistry(): Promise<{ registry: DeviceRegistry; filePath: string }> {
  const filePath = path.join(await createTempFolder(), 'paired-devices.json');
  return { registry: await DeviceRegistry.open(filePath, () => PAIRED_AT), filePath };
}

describe('DeviceRegistry', () => {
  it('registers a device and authenticates its token', async () => {
    const { registry } = await openRegistry();
    const { device, token } = await registry.register('Yeşim’s iPhone');

    expect(device).toMatchObject({ name: 'Yeşim’s iPhone', pairedAt: PAIRED_AT.toISOString() });
    expect(registry.authenticate(token)).toEqual(device);
  });

  it('stores only a hash of the token', async () => {
    const { registry, filePath } = await openRegistry();
    const { token } = await registry.register('iPhone');

    const stored = await readFile(filePath, 'utf8');
    expect(stored).not.toContain(token);
    expect(stored).toMatch(/"tokenSha256": "[0-9a-f]{64}"/);
  });

  it('rejects unknown and malformed tokens', async () => {
    const { registry } = await openRegistry();
    await registry.register('iPhone');

    expect(registry.authenticate(issueSecret().value)).toBeUndefined();
    expect(registry.authenticate('not a token')).toBeUndefined();
    expect(registry.authenticate('')).toBeUndefined();
  });

  it('tells devices apart by their tokens', async () => {
    const { registry } = await openRegistry();
    const first = await registry.register('First');
    const second = await registry.register('Second');

    expect(registry.authenticate(first.token)?.id).toBe(first.device.id);
    expect(registry.authenticate(second.token)?.id).toBe(second.device.id);
  });

  it('revokes once saved, notifies listeners and persists the change', async () => {
    const { registry, filePath } = await openRegistry();
    const { device, token } = await registry.register('iPhone');
    const listener = vi.fn();
    registry.onRevoked(listener);

    await expect(registry.revoke(device.id)).resolves.toBe(true);
    expect(registry.authenticate(token)).toBeUndefined();
    expect(listener).toHaveBeenCalledWith(device.id);

    const reopened = await DeviceRegistry.open(filePath, () => PAIRED_AT);
    expect(reopened.authenticate(token)).toBeUndefined();
    expect(reopened.list()).toEqual([]);
  });

  it('tells listeners about a new device once it is saved', async () => {
    const { registry, filePath } = await openRegistry();
    const savedWhenNotified: boolean[] = [];
    registry.onRegistered((device) => {
      savedWhenNotified.push(readFileSync(filePath, 'utf8').includes(device.id));
    });

    await registry.register('iPhone');

    expect(savedWhenNotified).toEqual([true]);
  });

  it('reports revoking an unknown device', async () => {
    const { registry } = await openRegistry();
    await expect(registry.revoke('0b9c6a51-1f0e-4f35-a3e5-1b2c3d4e5f60')).resolves.toBe(false);
  });

  it('keeps pairings across restarts', async () => {
    const { registry, filePath } = await openRegistry();
    const { device, token } = await registry.register('iPhone');

    const reopened = await DeviceRegistry.open(filePath, () => PAIRED_AT);

    expect(reopened.list()).toEqual([device]);
    expect(reopened.authenticate(token)).toEqual(device);
  });

  it('cleans device names and refuses empty ones', async () => {
    const { registry } = await openRegistry();
    const { device } = await registry.register('  Evil‮\nPhone  ');
    expect(device.name).toBe('EvilPhone');

    const error: unknown = await registry.register('​\u0000').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProtocolError);
    expect((error as ProtocolError).code).toBe('invalid_request');
  });

  it('renames a device, cleans the name and keeps its token working', async () => {
    const { registry, filePath } = await openRegistry();
    const { device, token } = await registry.register('iPhone');

    const renamed = await registry.rename(device.id, '  Yeşim’s   iPhone‮ ');

    expect(renamed).toEqual({ ...device, name: 'Yeşim’s iPhone' });
    expect(registry.authenticate(token)?.name).toBe('Yeşim’s iPhone');
    const reopened = await DeviceRegistry.open(filePath, () => PAIRED_AT);
    expect(reopened.list()).toEqual([renamed]);
  });

  it('reports renaming an unknown device', async () => {
    const { registry } = await openRegistry();
    expect(await registry.rename('0b9c6a51-1f0e-4f35-a3e5-1b2c3d4e5f60', 'iPhone')).toBeUndefined();
  });

  it('refuses a name that is empty once cleaned', async () => {
    const { registry } = await openRegistry();
    const { device } = await registry.register('iPhone');
    await expect(registry.rename(device.id, ' ​ ')).rejects.toThrow(RangeError);
    expect(registry.list()[0]?.name).toBe('iPhone');
  });

  it('changes nothing when a removal or pairing cannot be saved', async () => {
    const { registry, filePath } = await openRegistry();
    const { device, token } = await registry.register('iPhone');
    const listener = vi.fn();
    registry.onRevoked(listener);
    // A folder where the temporary file must go makes every write fail.
    await mkdir(`${filePath}.tmp`);

    await expect(registry.revoke(device.id)).rejects.toThrow();
    await expect(registry.register('iPad')).rejects.toThrow();
    expect(registry.authenticate(token)).toEqual(device);
    expect(registry.list()).toEqual([device]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('serializes concurrent writes so the last state wins', async () => {
    const { registry, filePath } = await openRegistry();
    await Promise.all(['A', 'B', 'C'].map((name) => registry.register(name)));

    const reopened = await DeviceRegistry.open(filePath, () => PAIRED_AT);
    expect(reopened.list().map((device) => device.name)).toEqual(['A', 'B', 'C']);
  });

  it.each([
    ['not JSON', '{'],
    ['the wrong version', JSON.stringify({ formatVersion: 99, devices: [] })],
    [
      'a bad hash',
      JSON.stringify({
        formatVersion: 1,
        devices: [
          {
            id: '0b9c6a51-1f0e-4f35-a3e5-1b2c3d4e5f60',
            name: 'iPhone',
            pairedAt: PAIRED_AT.toISOString(),
            tokenSha256: 'not-a-hash',
          },
        ],
      }),
    ],
  ])('refuses to start with %s in the file', async (_description, content) => {
    const filePath = path.join(await createTempFolder(), 'paired-devices.json');
    await writeFile(filePath, content);
    await expect(DeviceRegistry.open(filePath, () => PAIRED_AT)).rejects.toThrow(StartupError);
  });
});

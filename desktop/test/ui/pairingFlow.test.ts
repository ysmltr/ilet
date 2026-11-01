import type { NetworkInterfaceInfo } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { PairingCodes } from '../../src/pairing/pairingCodes';
import { pairingPayload } from '../../src/pairing/pairingPayload';
import { type PairingFlowDependencies, startPairing } from '../../src/ui/pairingFlow';
import { encodeQrMatrix } from '../../src/ui/qrMatrix';
import { decodeQrMatrix } from '../helpers/qrDecoding';

const QUIET_ZONE_MODULES = 4;
const wifi: NetworkInterfaceInfo = {
  address: '192.168.1.20',
  family: 'IPv4',
  internal: false,
  netmask: '255.255.255.0',
  mac: '00:00:00:00:00:00',
  cidr: '192.168.1.20/24',
};

const codes = new PairingCodes(Date.now);
afterEach(() => {
  codes.cancel();
});

function dependencies(online: boolean): PairingFlowDependencies {
  return {
    codes,
    deviceId: '6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23',
    displayName: 'DESKTOP-4F2K',
    port: 45380,
    fingerprint: 'ab'.repeat(32),
    networkInterfaces: () => (online ? { 'Wi-Fi': [wifi] } : {}),
  };
}

describe('pairingPayload', () => {
  it('is compact JSON with the keys in the order of PROTOCOL.md', () => {
    const payload = pairingPayload({
      deviceId: 'id',
      displayName: 'PC',
      addresses: ['192.168.1.20'],
      port: 45380,
      fingerprint: 'fp',
      secret: 'secret',
    });
    expect(payload).toBe(
      '{"ilet":1,"id":"id","name":"PC","addresses":["192.168.1.20"],"port":45380,"fingerprint":"fp","secret":"secret"}',
    );
  });
});

describe('encodeQrMatrix', () => {
  it('produces a code that an independent reader decodes, with a four-module quiet zone', () => {
    const text = '{"ilet":1,"name":"Yeşim’in bilgisayarı"}';
    const matrix = encodeQrMatrix(text);

    expect(decodeQrMatrix(matrix)).toBe(text);
    for (const row of matrix.slice(0, QUIET_ZONE_MODULES)) {
      expect(row.every((isDark) => !isDark)).toBe(true);
    }
  });
});

describe('startPairing', () => {
  it('shows a QR code that carries a working one-time secret', () => {
    const result = startPairing(dependencies(true));
    if (result.status !== 'started') {
      throw new Error(`unexpected status ${result.status}`);
    }

    const payload = JSON.parse(decodeQrMatrix(result.qr)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      ilet: 1,
      id: '6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23',
      name: 'DESKTOP-4F2K',
      addresses: ['192.168.1.20'],
      port: 45380,
      fingerprint: 'ab'.repeat(32),
    });
    expect(codes.redeem(String(payload['secret']))).toBe(true);
  });

  it('reports a missing network instead of showing a code no phone could use', () => {
    codes.start();
    expect(startPairing(dependencies(false))).toEqual({ status: 'no-network' });
    expect(codes.isActive()).toBe(false);
  });
});

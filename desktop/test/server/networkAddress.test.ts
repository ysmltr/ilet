import { describe, expect, it } from 'vitest';

import { parseBearerToken } from '../../src/server/authentication';
import {
  isAllowedHostHeader,
  isLocalNetworkAddress,
  normalizeAddress,
} from '../../src/server/networkAddress';

describe('isLocalNetworkAddress', () => {
  it.each([
    '192.168.1.20',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.254',
    '169.254.10.10',
    '127.0.0.1',
    '::1',
    '::ffff:192.168.1.20',
    '::FFFF:127.0.0.1',
    'fe80::1%12',
    'fd12:3456:789a::1',
  ])('accepts the local address %s', (address) => {
    expect(isLocalNetworkAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '100.64.0.1',
    '::ffff:8.8.8.8',
    '2001:db8::1',
    'not-an-address',
    '',
    undefined,
  ])('rejects %s', (address) => {
    expect(isLocalNetworkAddress(address)).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('unwraps IPv4-mapped addresses and drops zones', () => {
    expect(normalizeAddress('::ffff:192.168.1.20')).toBe('192.168.1.20');
    expect(normalizeAddress('FE80::1%en0')).toBe('fe80::1');
  });
});

describe('isAllowedHostHeader', () => {
  it.each([
    '192.168.1.20:45380',
    '192.168.1.20',
    '[fe80::1%25en0]:45380',
    '[::1]:45380',
    'localhost:45380',
    'LOCALHOST',
  ])('accepts %s', (host) => {
    expect(isAllowedHostHeader(host)).toBe(true);
  });

  it.each([
    'attacker.example',
    'attacker.example:45380',
    '192.168.1.20.nip.io',
    'localhost.attacker.example',
    '[attacker.example]',
    '[::1',
    '',
    undefined,
  ])('rejects %s, as a DNS-rebinding request would carry it', (host) => {
    expect(isAllowedHostHeader(host)).toBe(false);
  });
});

describe('parseBearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['Basic abc', undefined],
    ['Bearer', undefined],
    ['Bearer a b', undefined],
    [undefined, undefined],
  ])('parses %j', (header, expected) => {
    expect(parseBearerToken(header)).toBe(expected);
  });
});

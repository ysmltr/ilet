import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_PORT } from '../../src/protocol/constants';

/** The NSIS script that adds the Windows Firewall rules when ilet is installed. */
const installerScript = readFileSync(path.resolve('installer', 'installer.nsh'), 'utf8');
/** RFC 6762: Multicast DNS always uses this port. */
const MDNS_PORT = 5353;

describe('installer firewall rules', () => {
  it('allow only the ports ilet uses, and only on Private networks', () => {
    const allowed = [...installerScript.matchAll(/action=allow ([^']*)'/g)].map(([, rule]) => rule);
    expect(allowed).toEqual([
      `profile=private protocol=TCP localport=${String(DEFAULT_PORT)}`,
      `profile=private protocol=UDP localport=${String(MDNS_PORT)}`,
    ]);
  });

  it('block ilet on Public and Domain networks', () => {
    expect(installerScript).toContain('action=block profile=public,domain');
  });

  it('are all removed again on uninstall', () => {
    const added = [...installerScript.matchAll(/'name="\$\{(\w+)\}" action=/g)].map(
      ([, name]) => name,
    );
    expect(added).toHaveLength(3);
    for (const name of added) {
      expect(installerScript).toContain(`'delete rule name="\${${name ?? ''}}"'`);
    }
  });
});

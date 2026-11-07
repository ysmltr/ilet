import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_PORT } from '../../src/protocol/constants';
import { HIDDEN_START_ARGUMENT } from '../../src/settings/startWithWindows';

/** The Store package's manifest, which electron-builder fills in (the appx section of its config). */
const manifest = readFileSync(path.resolve('installer', 'appxmanifest.xml'), 'utf8');
/** RFC 6762: Multicast DNS always uses this port. */
const MDNS_PORT = 5353;
/** What electron-builder 26 fills in. Any other macro, even in a comment, stops the build. */
const KNOWN_MACROS = new Set([
  'arch',
  'backgroundColor',
  'capabilities',
  'defaultTile',
  'description',
  'displayName',
  'executable',
  'extensions',
  'identityName',
  'lockScreen',
  'logo',
  'maxVersionTested',
  'minVersion',
  'publisher',
  'publisherDisplayName',
  'resourceLanguages',
  'splashScreen',
  'square150x150Logo',
  'square44x44Logo',
  'version',
  'applicationId',
]);

/** The start tags of the elements with this name. */
function elements(name: string): string[] {
  return [...manifest.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'g'))].map(([tag]) => tag);
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, name = '', value = '']) => [name, value]),
  );
}

describe('Store package manifest', () => {
  it('lets phones in on Private networks only, on the ports ilet uses', () => {
    expect(elements('desktop2:Rule').map(attributes)).toEqual([
      {
        Direction: 'in',
        IPProtocol: 'TCP',
        Profile: 'private',
        LocalPortMin: String(DEFAULT_PORT),
        LocalPortMax: String(DEFAULT_PORT),
      },
      {
        Direction: 'in',
        IPProtocol: 'UDP',
        Profile: 'private',
        LocalPortMin: String(MDNS_PORT),
        LocalPortMax: String(MDNS_PORT),
      },
    ]);
  });

  it('starts with Windows only once the user turns it on, and then in the tray', () => {
    const startupTasks = elements('desktop:StartupTask').map(attributes);
    expect(startupTasks).toHaveLength(1);
    expect(startupTasks[0]?.['Enabled']).toBe('false');

    const extensions = elements('desktop:Extension').map(attributes);
    const startup = extensions.find(({ Category }) => Category === 'windows.startupTask');
    expect(startup?.['uap10:Parameters']).toBe(HIDDEN_START_ARGUMENT);
  });

  it('keeps what ilet writes in AppData and the registry private to the package', () => {
    // Windows virtualizes both unless the manifest opts out; an opt-out would need a capability.
    expect(manifest).not.toMatch(/unvirtualizedResources|WriteVirtualization/);
    expect(manifest).not.toMatch(/<(rescap:)?Capability\b/);
  });

  it('uses only the macros that electron-builder fills in', () => {
    const macros = [...manifest.matchAll(/\$\{(\w+)\}/g)].map(([, name = '']) => name);
    expect(macros.length).toBeGreaterThan(0);
    expect(macros.filter((name) => !KNOWN_MACROS.has(name))).toEqual([]);
  });
});

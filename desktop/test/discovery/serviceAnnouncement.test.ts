import { describe, expect, it } from 'vitest';

import { serviceAnnouncement } from '../../src/discovery/serviceAnnouncement';
import { sanitizeDisplayName } from '../../src/shared/text';

const DEVICE_ID = '6f1c2a8e-3a0b-4c55-9d2e-0b8a4f7c1d23';
/** RFC 1035 §2.3.4 and RFC 6763 §6.1. */
const MAX_LABEL_BYTES = 63;
const MAX_TXT_ENTRY_BYTES = 255;

function announce(displayName: string): ReturnType<typeof serviceAnnouncement> {
  return serviceAnnouncement({ deviceId: DEVICE_ID, displayName, port: 45380 });
}

describe('serviceAnnouncement', () => {
  it('puts only the device ID and the display name in the TXT record', () => {
    expect(announce('Yeşim’s PC').txt).toEqual({ id: DEVICE_ID, name: 'Yeşim’s PC' });
  });

  it('uses a host name of its own, made from the device ID', () => {
    expect(announce('DESKTOP-4F2K').hostname).toBe('ilet-6f1c2a8e');
  });

  it('announces the server port', () => {
    expect(announce('DESKTOP-4F2K').port).toBe(45380);
  });

  it('uses the display name as the instance name', () => {
    expect(announce('Yeşim’s PC').instanceName).toBe('Yeşim’s PC');
  });

  it('replaces dots, which would split the instance name into several DNS labels', () => {
    expect(announce('Mr. Smith’s PC v1.2').instanceName).toBe('Mr Smith’s PC v1 2');
    expect(announce('...').instanceName).toBe('ilet');
  });

  it('keeps the instance name within one DNS label, even after a rename to "(999)"', () => {
    for (const character of ['x', 'ş', '€', '😀']) {
      const { instanceName } = announce(sanitizeDisplayName(character.repeat(100)));
      expect(Buffer.byteLength(`${instanceName} (999)`)).toBeLessThanOrEqual(MAX_LABEL_BYTES);
      expect(instanceName).not.toBe('');
      // Whole characters only: half of an emoji would be left over here.
      expect(instanceName.replaceAll(character, '')).toBe('');
    }
  });

  it('keeps every TXT entry within the 255-byte limit', () => {
    // 3 bytes of UTF-8 is the most a single UTF-16 code unit can need.
    const longestName = sanitizeDisplayName('€'.repeat(100));
    for (const [key, value] of Object.entries(announce(longestName).txt)) {
      expect(Buffer.byteLength(`${key}=${value}`)).toBeLessThanOrEqual(MAX_TXT_ENTRY_BYTES);
    }
  });
});

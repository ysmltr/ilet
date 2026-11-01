import { describe, expect, it } from 'vitest';

import { APP_ENTRY_URL, isAppUrl, resolveRendererAsset } from '../../src/ui/appUrl';
import { type IpcSender, isFromAppWindow } from '../../src/ui/trustedSender';

describe('resolveRendererAsset', () => {
  it.each([
    ['ilet://ui/index.html', 'index.html', 'text/html; charset=utf-8'],
    ['ilet://ui/renderer.js', 'renderer.js', 'text/javascript; charset=utf-8'],
    ['ilet://ui/styles.css', 'styles.css', 'text/css; charset=utf-8'],
    ['ilet://ui/icon.svg', 'icon.svg', 'image/svg+xml'],
    ['ilet://ui/index.html?x=1#top', 'index.html', 'text/html; charset=utf-8'],
  ])('serves the bundled file %s', (url, fileName, contentType) => {
    expect(resolveRendererAsset(url)).toEqual({ fileName, contentType });
  });

  it.each([
    'ilet://ui/main.js',
    'ilet://ui/preload.js',
    'ilet://ui/../main.js',
    'ilet://ui/%2e%2e/main.js',
    'ilet://ui/renderer/../../package.json',
    'ilet://ui/',
    'ilet://other/index.html',
    'file:///C:/Windows/win.ini',
    'https://ui/index.html',
    'not a url',
  ])('serves nothing for %s', (url) => {
    expect(resolveRendererAsset(url)).toBeUndefined();
  });
});

describe('isAppUrl', () => {
  it('accepts only the app scheme and host', () => {
    expect(isAppUrl(APP_ENTRY_URL)).toBe(true);
    expect(isAppUrl('https://attacker.example/index.html')).toBe(false);
    expect(isAppUrl('ilet://attacker/index.html')).toBe(false);
  });
});

describe('isFromAppWindow', () => {
  const appContents = { id: 'app window' };
  const topFrame = { url: APP_ENTRY_URL, parent: null };

  it('accepts the top frame of the app window', () => {
    expect(isFromAppWindow({ sender: appContents, senderFrame: topFrame }, appContents)).toBe(true);
  });

  it.each<[string, IpcSender]>([
    ['another window', { sender: { id: 'other window' }, senderFrame: topFrame }],
    ['an iframe', { sender: appContents, senderFrame: { url: APP_ENTRY_URL, parent: topFrame } }],
    [
      'a navigated page',
      { sender: appContents, senderFrame: { url: 'https://x.test', parent: null } },
    ],
    ['a destroyed frame', { sender: appContents, senderFrame: null }],
  ])('refuses %s', (_description, event) => {
    expect(isFromAppWindow(event, appContents)).toBe(false);
  });
});

import { app, type Session } from 'electron';

/** The window only loads ilet:// pages, so it never needs these schemes. */
const BLOCKED_NETWORK_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

/**
 * Applies to every web contents the app ever creates: a page cannot navigate, open windows or
 * embed `<webview>` tags. Must be installed before the first window opens.
 */
export function installNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    contents.on('will-redirect', (event) => {
      event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

/** Denies every permission request (camera, notifications, …) and all network requests. */
export function lockDownSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest({ urls: BLOCKED_NETWORK_URLS }, (_details, callback) => {
    callback({ cancel: true });
  });
}

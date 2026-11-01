/**
 * The window is served from this custom protocol instead of file://. A file:// page could ask
 * for other files on disk; this protocol can only return the files listed below.
 */
export const APP_SCHEME = 'ilet';
const APP_HOST = 'ui';
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

export interface RendererAsset {
  readonly fileName: string;
  readonly contentType: string;
}

/** Every file the window may load. Any other path is answered with 404. */
const RENDERER_ASSETS: ReadonlyMap<string, RendererAsset> = new Map([
  ['/index.html', { fileName: 'index.html', contentType: 'text/html; charset=utf-8' }],
  ['/renderer.js', { fileName: 'renderer.js', contentType: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { fileName: 'styles.css', contentType: 'text/css; charset=utf-8' }],
  ['/icon.svg', { fileName: 'icon.svg', contentType: 'image/svg+xml' }],
]);

export function isAppUrl(url: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { protocol, host } = new URL(url);
  return protocol === `${APP_SCHEME}:` && host === APP_HOST;
}

export function resolveRendererAsset(url: string): RendererAsset | undefined {
  return isAppUrl(url) ? RENDERER_ASSETS.get(new URL(url).pathname) : undefined;
}

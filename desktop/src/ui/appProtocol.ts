import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { protocol } from 'electron';

import { APP_SCHEME, resolveRendererAsset } from './appUrl';

const HTTP_NOT_FOUND = 404;

/** The page may run only its own bundled script and style; it can load nothing else. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  // Trusted Types: the page can never write HTML (innerHTML and the like), only text.
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

/**
 * Must run before the app is ready. `standard` gives pages on the scheme a normal origin, so
 * the CSP's 'self' means exactly this scheme and host.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true } },
  ]);
}

export function serveRendererAssets(rendererFolder: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const asset = resolveRendererAsset(request.url);
    if (asset === undefined) {
      return new Response(null, { status: HTTP_NOT_FOUND });
    }
    const body = await readFile(path.join(rendererFolder, asset.fileName));
    return new Response(body, {
      headers: {
        'Content-Type': asset.contentType,
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

// Bundles the code that runs inside the window. The sandboxed preload script and the page
// cannot load other files at run time, so each becomes a single file.
import { copyFileSync, mkdirSync } from 'node:fs';

import { build } from 'esbuild';

const RENDERER_OUTPUT = 'dist/renderer';
const common = { bundle: true, target: 'es2023', platform: 'browser', logLevel: 'warning' };

await build({
  ...common,
  entryPoints: ['src/preload/preload.ts'],
  outfile: 'dist/preload.js',
  format: 'cjs',
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: ['src/renderer/renderer.ts'],
  outfile: `${RENDERER_OUTPUT}/renderer.js`,
  format: 'iife',
});

mkdirSync(RENDERER_OUTPUT, { recursive: true });
copyFileSync('src/renderer/index.html', `${RENDERER_OUTPUT}/index.html`);
copyFileSync('src/renderer/styles.css', `${RENDERER_OUTPUT}/styles.css`);
copyFileSync('../branding/ilet-icon.svg', `${RENDERER_OUTPUT}/icon.svg`);

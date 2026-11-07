// Renders the icon files from the SVG masters in ../branding, with Microsoft Edge in headless
// mode, which comes with Windows: the .ico files of the desktop app, the images of its Microsoft
// Store package, and the iPhone app's icon and logo (the drawing without its tile, on the launch
// screen and the welcome page).
// Run it after changing an SVG: npm run icons
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const BRANDING_FOLDER = path.resolve('../branding');
const FULL_DRAWING = 'ilet-icon.svg';
// The phone and computer are unreadable below 48 pixels, so smaller sizes use the simple mark.
const SIMPLE_MARK = 'ilet-tray.svg';
const ICONS = [
  {
    file: 'ilet.ico',
    images: [
      ...[16, 20, 24, 32].map((size) => ({ size, svg: SIMPLE_MARK })),
      ...[48, 64, 128, 256].map((size) => ({ size, svg: FULL_DRAWING })),
    ],
  },
  {
    file: 'ilet-tray.ico',
    images: [16, 20, 24, 32, 40, 48, 64].map((size) => ({ size, svg: SIMPLE_MARK })),
  },
];

/**
 * The Store package's images, which installer/appxmanifest.xml names. Its background colour is
 * transparent, so Windows shows them as they are. On the Start menu's tiles the icon takes two
 * thirds of the tile's height, as Microsoft suggests; the taskbar and the app list get the sizes
 * of ilet.ico ("unplated": without a tile of the accent colour behind them).
 */
const STORE_ASSETS_FOLDER = path.resolve('installer/appx');
const STORE_TILE_ICON_SIZE = 100;
const STORE_ASSETS = [
  { file: 'StoreLogo.png', svg: FULL_DRAWING, width: 50, height: 50 },
  {
    file: 'Square150x150Logo.png',
    svg: FULL_DRAWING,
    width: 150,
    height: 150,
    iconSize: STORE_TILE_ICON_SIZE,
  },
  {
    file: 'Wide310x150Logo.png',
    svg: FULL_DRAWING,
    width: 310,
    height: 150,
    iconSize: STORE_TILE_ICON_SIZE,
  },
  { file: 'Square44x44Logo.png', svg: SIMPLE_MARK, width: 44, height: 44 },
  ...[16, 24, 32, 48, 256].map((size) => ({
    file: `Square44x44Logo.targetsize-${size}_altform-unplated.png`,
    svg: size < 48 ? SIMPLE_MARK : FULL_DRAWING,
    width: size,
    height: size,
  })),
];

const IOS_ASSETS_FOLDER = path.resolve('../ios/Ilet/Resources/Assets.xcassets');
const IOS_APP_ICON = path.join(IOS_ASSETS_FOLDER, 'AppIcon.appiconset', 'AppIcon.png');
const IOS_APP_ICON_SIZE = 1024;
/** The background colour of ilet-icon.svg. iOS rounds the corners itself, so they are filled. */
const IOS_APP_ICON_BACKGROUND = '#F3F8FC';
/** The tile behind the drawing in ilet-icon.svg, which the logo leaves out. */
const TILE = /<rect id="tile"[^>]*\/>\s*/;
const FULL_VIEW_BOX = 'viewBox="0 0 1024 1024"';
/** The part of ilet-icon.svg that holds the drawing, in the logo's proportions (5:4). */
const IOS_LOGO_VIEW_BOX = 'viewBox="103 189 820 656"';
const IOS_LOGO_FOLDER = path.join(IOS_ASSETS_FOLDER, 'Logo.imageset');
/** The logo's size in points; the image set holds it at each screen scale. */
const IOS_LOGO_POINTS = { width: 200, height: 160 };
const IOS_SCALES = [
  { scale: 1, suffix: '' },
  { scale: 2, suffix: '@2x' },
  { scale: 3, suffix: '@3x' },
];

const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_COLOR_TYPE_OFFSET = 25;
const PNG_COLOR_TYPE_RGB = 2;
/** Every complete PNG ends with this IEND chunk. */
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const ICO_TYPE_ICON = 1;
const ICO_BITS_PER_PIXEL = 32;
/** An ICO entry stores sizes in one byte; 0 stands for 256. */
const ICO_LARGEST_SIZE = 256;
const BROWSER_TIMEOUT_MS = 60_000;
const POLL_MS = 100;

function findEdge() {
  const programFolders = [process.env['ProgramFiles(x86)'], process.env['ProgramFiles']];
  const edge = programFolders
    .filter((folder) => folder !== undefined)
    .map((folder) => path.join(folder, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    .find((candidate) => existsSync(candidate));
  if (edge === undefined) {
    throw new Error('Microsoft Edge was not found. This script runs on Windows.');
  }
  return edge;
}

/** Waits until the browser has written the whole PNG, then reads it. */
async function readFinishedPng(file) {
  const deadline = Date.now() + BROWSER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const data = readFileSync(file);
      if (data.length > PNG_END.length && data.subarray(-PNG_END.length).equals(PNG_END)) {
        return data;
      }
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Edge did not write ${path.basename(file)}`);
}

/** Deletes `folder`, waiting while a browser that is still closing holds files in it. */
async function removeWhenFree(folder) {
  const deadline = Date.now() + BROWSER_TIMEOUT_MS;
  for (;;) {
    try {
      rmSync(folder, { recursive: true, force: true });
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await sleep(POLL_MS);
    }
  }
}

/**
 * Renders SVG source to a PNG of exactly `width` x `height` pixels, the drawing filling it or, with
 * `iconSize`, as a square of that size in its middle. Edge's launcher exits at once and leaves the
 * work to a browser process, which writes the screenshot a moment later and then keeps its
 * profile for a few seconds; waiting for both means one browser at a time and nothing left behind.
 */
async function renderPng(edge, workFolder, { name, svg, width, height, background, iconSize }) {
  const page = path.join(workFolder, `${name}.html`);
  const png = path.join(workFolder, `${name}.png`);
  const profile = path.join(workFolder, `profile-${name}`);
  writeFileSync(
    page,
    `<!doctype html><body style="margin:0;background:${background ?? 'transparent'};` +
      `width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" ` +
      `width="${iconSize ?? width}" height="${iconSize ?? height}" style="display:block"></body>`,
  );
  execFileSync(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      // Nothing to download for a local page: this also lets the browser close sooner.
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${width},${height}`,
      `--screenshot=${png}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore' },
  );
  const data = await readFinishedPng(png);
  await removeWhenFree(profile);
  const renderedWidth = data.readUInt32BE(PNG_WIDTH_OFFSET);
  const renderedHeight = data.readUInt32BE(PNG_HEIGHT_OFFSET);
  if (renderedWidth !== width || renderedHeight !== height) {
    throw new Error(
      `${name} rendered at ${renderedWidth}x${renderedHeight} instead of ${width}x${height}`,
    );
  }
  return data;
}

/** An ICO file whose images are PNGs, which Windows supports since Vista. */
function icoFile(images) {
  const header = Buffer.alloc(ICO_HEADER_BYTES);
  header.writeUInt16LE(ICO_TYPE_ICON, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(ICO_ENTRY_BYTES);
    const storedSize = size === ICO_LARGEST_SIZE ? 0 : size;
    entry.writeUInt8(storedSize, 0);
    entry.writeUInt8(storedSize, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(ICO_BITS_PER_PIXEL, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

/** The drawing of ilet-icon.svg without its tile, cut to the logo's proportions. */
function logoSvg(drawing) {
  if (!drawing.includes(FULL_VIEW_BOX)) {
    throw new Error(`${FULL_DRAWING} has a new viewBox: update IOS_LOGO_VIEW_BOX`);
  }
  return drawing.replace(TILE, '').replace(FULL_VIEW_BOX, IOS_LOGO_VIEW_BOX);
}

const edge = findEdge();
const workFolder = mkdtempSync(path.join(os.tmpdir(), 'ilet-icons-'));
try {
  for (const icon of ICONS) {
    const images = [];
    for (const { size, svg } of icon.images) {
      const source = readFileSync(path.join(BRANDING_FOLDER, svg), 'utf8');
      const name = `${svg}-${size}`;
      const data = await renderPng(edge, workFolder, {
        name,
        svg: source,
        width: size,
        height: size,
      });
      images.push({ size, data });
    }
    writeFileSync(path.join(BRANDING_FOLDER, icon.file), icoFile(images));
    process.stdout.write(`${icon.file}: ${images.map(({ size }) => size).join(', ')} px\n`);
  }

  mkdirSync(STORE_ASSETS_FOLDER, { recursive: true });
  for (const { file, svg, width, height, iconSize } of STORE_ASSETS) {
    const source = readFileSync(path.join(BRANDING_FOLDER, svg), 'utf8');
    const name = path.parse(file).name;
    const data = await renderPng(edge, workFolder, { name, svg: source, width, height, iconSize });
    writeFileSync(path.join(STORE_ASSETS_FOLDER, file), data);
    process.stdout.write(`${file}: ${width}x${height} px\n`);
  }

  const drawing = readFileSync(path.join(BRANDING_FOLDER, FULL_DRAWING), 'utf8');
  const tile = drawing.match(TILE);
  if (tile === null) {
    throw new Error(`${FULL_DRAWING} has no <rect id="tile">, which the logo leaves out`);
  }
  if (!tile[0].includes(`fill="${IOS_APP_ICON_BACKGROUND}"`)) {
    throw new Error(`${FULL_DRAWING} has a new tile colour: update IOS_APP_ICON_BACKGROUND`);
  }
  const appIcon = await renderPng(edge, workFolder, {
    name: 'app-icon',
    svg: drawing,
    width: IOS_APP_ICON_SIZE,
    height: IOS_APP_ICON_SIZE,
    background: IOS_APP_ICON_BACKGROUND,
  });
  // The App Store refuses an icon with an alpha channel, even a fully opaque one. Edge writes an
  // opaque page as RGB; this check catches it if that ever changes.
  if (appIcon[PNG_COLOR_TYPE_OFFSET] !== PNG_COLOR_TYPE_RGB) {
    throw new Error('the iPhone app icon must be an RGB PNG without an alpha channel');
  }
  writeFileSync(IOS_APP_ICON, appIcon);
  process.stdout.write(`${path.basename(IOS_APP_ICON)}: ${IOS_APP_ICON_SIZE} px, opaque RGB\n`);

  const logo = logoSvg(drawing);
  for (const { scale, suffix } of IOS_SCALES) {
    const width = IOS_LOGO_POINTS.width * scale;
    const height = IOS_LOGO_POINTS.height * scale;
    const name = `Logo${suffix}`;
    const data = await renderPng(edge, workFolder, { name, svg: logo, width, height });
    writeFileSync(path.join(IOS_LOGO_FOLDER, `${name}.png`), data);
    process.stdout.write(`${name}.png: ${width}x${height} px\n`);
  }
} finally {
  await removeWhenFree(workFolder);
}

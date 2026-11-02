// Renders the .ico files the app ships from the SVG masters in ../branding, with Microsoft Edge
// in headless mode, which comes with Windows. Run it after changing an SVG: npm run icons
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
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

const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const ICO_TYPE_ICON = 1;
const ICO_BITS_PER_PIXEL = 32;
/** An ICO entry stores sizes in one byte; 0 stands for 256. */
const ICO_LARGEST_SIZE = 256;

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

function renderPng(edge, workFolder, { size, svg }) {
  const source = readFileSync(path.join(BRANDING_FOLDER, svg)).toString('base64');
  const page = path.join(workFolder, `${svg}-${size}.html`);
  const png = path.join(workFolder, `${svg}-${size}.png`);
  writeFileSync(
    page,
    `<!doctype html><body style="margin:0"><img src="data:image/svg+xml;base64,${source}" ` +
      `width="${size}" height="${size}" style="display:block"></body>`,
  );
  execFileSync(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${path.join(workFolder, 'profile')}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${png}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore' },
  );
  const data = readFileSync(png);
  const width = data.readUInt32BE(PNG_WIDTH_OFFSET);
  const height = data.readUInt32BE(PNG_HEIGHT_OFFSET);
  if (width !== size || height !== size) {
    throw new Error(`${svg} rendered at ${width}x${height} instead of ${size}x${size}`);
  }
  return { size, data };
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

const edge = findEdge();
const workFolder = mkdtempSync(path.join(os.tmpdir(), 'ilet-icons-'));
try {
  for (const icon of ICONS) {
    const images = icon.images.map((image) => renderPng(edge, workFolder, image));
    writeFileSync(path.join(BRANDING_FOLDER, icon.file), icoFile(images));
    process.stdout.write(`${icon.file}: ${images.map(({ size }) => size).join(', ')} px\n`);
  }
} finally {
  rmSync(workFolder, { recursive: true, force: true });
}

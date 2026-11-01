import { decodeQR } from 'qr/decode.js';

import type { QrMatrix } from '../../src/ipc/contract';

const PIXELS_PER_MODULE = 4;
const RGB_CHANNELS = 3;
const DARK = 0;
const LIGHT = 255;

/** Renders the matrix like a screen would and decodes it with an independent QR reader. */
export function decodeQrMatrix(matrix: QrMatrix): string {
  const side = matrix.length * PIXELS_PER_MODULE;
  const data = new Uint8Array(side * side * RGB_CHANNELS).fill(LIGHT);
  matrix.forEach((row, moduleY) => {
    row.forEach((isDark, moduleX) => {
      if (!isDark) {
        return;
      }
      for (let dy = 0; dy < PIXELS_PER_MODULE; dy += 1) {
        for (let dx = 0; dx < PIXELS_PER_MODULE; dx += 1) {
          const pixel =
            (moduleY * PIXELS_PER_MODULE + dy) * side + moduleX * PIXELS_PER_MODULE + dx;
          data.fill(DARK, pixel * RGB_CHANNELS, (pixel + 1) * RGB_CHANNELS);
        }
      }
    });
  });
  return decodeQR({ width: side, height: side, data }, { format: 'RGB' });
}

import type { QrMatrix } from '../ipc/contract';

/** Target on-screen size; the result is rounded down to whole device pixels per module. */
const QR_DISPLAY_SIZE_PX = 240;
const DARK_MODULE_COLOR = '#000000';
const LIGHT_MODULE_COLOR = '#ffffff';

/**
 * Draws the code with whole device pixels per module, so module edges stay sharp. It is drawn
 * from data, never from markup, so nothing in it can run as HTML.
 */
export function drawQrCode(canvas: HTMLCanvasElement, matrix: QrMatrix): void {
  const scale = window.devicePixelRatio;
  const moduleCount = matrix.length;
  const modulePixels = Math.max(1, Math.floor((QR_DISPLAY_SIZE_PX * scale) / moduleCount));
  const sidePixels = moduleCount * modulePixels;
  canvas.width = sidePixels;
  canvas.height = sidePixels;
  canvas.style.width = `${String(sidePixels / scale)}px`;
  canvas.style.height = canvas.style.width;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2D canvas is not available');
  }
  context.fillStyle = LIGHT_MODULE_COLOR;
  context.fillRect(0, 0, sidePixels, sidePixels);
  context.fillStyle = DARK_MODULE_COLOR;
  matrix.forEach((row, y) => {
    row.forEach((isDark, x) => {
      if (isDark) {
        context.fillRect(x * modulePixels, y * modulePixels, modulePixels, modulePixels);
      }
    });
  });
}

import { encodeQR } from 'qr';

import type { QrMatrix } from '../ipc/contract';

/** ISO/IEC 18004 asks for a light border ("quiet zone") of four modules around the code. */
const QUIET_ZONE_MODULES = 4;

/** Error correction level M recovers about 15%: enough on a screen, and the code stays sparse. */
export function encodeQrMatrix(text: string): QrMatrix {
  return encodeQR(text, 'raw', { ecc: 'medium', border: QUIET_ZONE_MODULES });
}

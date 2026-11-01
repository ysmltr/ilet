/**
 * The contract between the main process and the window. The preload script exposes exactly
 * `IletBridge` as `window.ilet`; nothing else from Electron or Node.js reaches the page.
 */

export const BRIDGE_NAME = 'ilet';

export const IpcChannel = {
  startPairing: 'pairing:start',
  cancelPairing: 'pairing:cancel',
  pairingEvent: 'pairing:event',
} as const;

/** QR code modules, row by row (`true` is dark), quiet zone included. */
export type QrMatrix = readonly (readonly boolean[])[];

export type StartPairingResult =
  | { readonly status: 'started'; readonly qr: QrMatrix; readonly expiresAt: number }
  | { readonly status: 'no-network' };

export type PairingEvent =
  { readonly type: 'paired'; readonly deviceName: string } | { readonly type: 'expired' };

export interface IletBridge {
  startPairing(): Promise<StartPairingResult>;
  cancelPairing(): void;
  onPairingEvent(listener: (event: PairingEvent) => void): void;
}

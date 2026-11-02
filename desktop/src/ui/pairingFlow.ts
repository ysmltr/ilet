import type { StartPairingResult } from '../ipc/contract';
import type { NetworkInterfaces } from '../network/networkInterfaces';
import { selectPairingAddresses } from '../pairing/pairingAddresses';
import type { PairingCodes } from '../pairing/pairingCodes';
import { pairingPayload } from '../pairing/pairingPayload';
import { encodeQrMatrix } from './qrMatrix';

export interface PairingFlowDependencies {
  readonly codes: PairingCodes;
  readonly deviceId: string;
  readonly displayName: string;
  readonly port: number;
  readonly fingerprint: string;
  readonly networkInterfaces: () => NetworkInterfaces;
}

/** Creates a new pairing code and the QR code that carries it to the phone. */
export function startPairing(dependencies: PairingFlowDependencies): StartPairingResult {
  const addresses = selectPairingAddresses(dependencies.networkInterfaces());
  if (addresses.length === 0) {
    dependencies.codes.cancel();
    return { status: 'no-network' };
  }
  const { secret, expiresAt } = dependencies.codes.start();
  const payload = pairingPayload({
    deviceId: dependencies.deviceId,
    displayName: dependencies.displayName,
    addresses,
    port: dependencies.port,
    fingerprint: dependencies.fingerprint,
    secret,
  });
  return { status: 'started', qr: encodeQrMatrix(payload), expiresAt };
}

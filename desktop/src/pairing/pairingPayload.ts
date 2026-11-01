import { PAIRING_PAYLOAD_VERSION } from '../protocol/constants';

export interface PairingPayloadFields {
  readonly deviceId: string;
  readonly displayName: string;
  readonly addresses: readonly string[];
  readonly port: number;
  readonly fingerprint: string;
  readonly secret: string;
}

/** The QR code content (PROTOCOL.md section 4.2): compact JSON with the keys in spec order. */
export function pairingPayload(fields: PairingPayloadFields): string {
  return JSON.stringify({
    ilet: PAIRING_PAYLOAD_VERSION,
    id: fields.deviceId,
    name: fields.displayName,
    addresses: fields.addresses,
    port: fields.port,
    fingerprint: fields.fingerprint,
    secret: fields.secret,
  });
}

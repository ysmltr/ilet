import { createHash, generateKeyPairSync, randomBytes, sign, X509Certificate } from 'node:crypto';

import {
  CERTIFICATE_COMMON_NAME,
  CERTIFICATE_DNS_NAMES,
  CERTIFICATE_IP_ADDRESSES,
  CERTIFICATE_NOT_AFTER,
} from '../protocol/constants';
import {
  bitString,
  booleanTrue,
  explicitTag,
  implicitPrimitiveTag,
  objectIdentifier,
  octetString,
  sequence,
  set,
  time,
  unsignedInteger,
  utf8String,
} from './der';

const Oid = {
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  basicConstraints: '2.5.29.19',
  extendedKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17',
  serverAuth: '1.3.6.1.5.5.7.3.1',
} as const;

const NAMED_CURVE = 'P-256';
/** X.509 version numbers are zero-based: 2 means v3. */
const X509_VERSION_3 = 2;
const SERIAL_NUMBER_BYTES = 16;
const TbsCertificateTag = { version: 0, extensions: 3 } as const;
const GeneralNameTag = { dnsName: 2, ipAddress: 7 } as const;

export interface CertificateAndKey {
  readonly certificatePem: string;
  readonly privateKeyPem: string;
}

/**
 * Creates the desktop's self-signed ECDSA P-256 certificate (profile: PROTOCOL.md section 2.1).
 * Node.js can sign but has no API to build certificates, so the RFC 5280 structure is encoded
 * here. Nothing trusts the certificate's contents: clients pin its exact bytes.
 */
export function createSelfSignedCertificate(notBefore: Date): CertificateAndKey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: NAMED_CURVE });
  const signatureAlgorithm = sequence(objectIdentifier(Oid.ecdsaWithSha256));
  const name = distinguishedName(CERTIFICATE_COMMON_NAME);
  const tbsCertificate = sequence(
    explicitTag(TbsCertificateTag.version, unsignedInteger(Buffer.of(X509_VERSION_3))),
    unsignedInteger(randomBytes(SERIAL_NUMBER_BYTES)),
    signatureAlgorithm,
    name, // Issuer and subject are the same: the certificate signs itself.
    sequence(time(notBefore), time(CERTIFICATE_NOT_AFTER)),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    explicitTag(TbsCertificateTag.extensions, sequence(...extensions())),
  );
  const signature = sign('sha256', tbsCertificate, privateKey);
  const certificate = new X509Certificate(
    sequence(tbsCertificate, signatureAlgorithm, bitString(signature)),
  );
  return {
    certificatePem: certificate.toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

/** SHA-256 of the DER-encoded certificate, lowercase hex (PROTOCOL.md section 2.2). */
export function certificateFingerprint(certificate: X509Certificate): string {
  return createHash('sha256').update(certificate.raw).digest('hex');
}

function distinguishedName(commonName: string): Buffer {
  return sequence(set(sequence(objectIdentifier(Oid.commonName), utf8String(commonName))));
}

function extensions(): Buffer[] {
  const subjectAltNames = [
    ...CERTIFICATE_DNS_NAMES.map((dnsName) =>
      implicitPrimitiveTag(GeneralNameTag.dnsName, Buffer.from(dnsName, 'ascii')),
    ),
    ...CERTIFICATE_IP_ADDRESSES.map((address) =>
      implicitPrimitiveTag(GeneralNameTag.ipAddress, Buffer.from(address)),
    ),
  ];
  return [
    // An empty BasicConstraints means cA = FALSE (the DEFAULT, which DER omits).
    extension(Oid.basicConstraints, true, sequence()),
    extension(Oid.extendedKeyUsage, false, sequence(objectIdentifier(Oid.serverAuth))),
    extension(Oid.subjectAltName, false, sequence(...subjectAltNames)),
  ];
}

function extension(oid: string, critical: boolean, value: Buffer): Buffer {
  // `critical` defaults to FALSE, and DER omits default values.
  const criticalFlag = critical ? [booleanTrue()] : [];
  return sequence(objectIdentifier(oid), ...criticalFlag, octetString(value));
}

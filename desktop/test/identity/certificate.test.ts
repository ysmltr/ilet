import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  certificateFingerprint,
  createSelfSignedCertificate,
} from '../../src/identity/certificate';

const NOT_BEFORE = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));
const { certificatePem, privateKeyPem } = createSelfSignedCertificate(NOT_BEFORE);
const certificate = new X509Certificate(certificatePem);

describe('createSelfSignedCertificate', () => {
  it('creates a self-signed ECDSA P-256 certificate', () => {
    expect(certificate.publicKey.asymmetricKeyType).toBe('ec');
    expect(certificate.publicKey.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
    expect(certificate.subject).toBe('CN=ilet');
    expect(certificate.issuer).toBe('CN=ilet');
    expect(certificate.verify(certificate.publicKey)).toBe(true);
  });

  it('pairs with the returned private key', () => {
    expect(certificate.checkPrivateKey(createPrivateKey(privateKeyPem))).toBe(true);
  });

  it('follows the profile in PROTOCOL.md section 2.1', () => {
    expect(certificate.ca).toBe(false);
    expect(certificate.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']);
    expect(certificate.subjectAltName).toBe(
      'DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1',
    );
    expect(new Date(certificate.validFrom).getTime()).toBe(NOT_BEFORE.getTime());
    expect(certificate.validTo).toBe('Dec 31 23:59:59 9999 GMT');
  });

  it('creates a new key and serial number every time', () => {
    const other = createSelfSignedCertificate(NOT_BEFORE);
    const otherCertificate = new X509Certificate(other.certificatePem);
    expect(otherCertificate.serialNumber).not.toBe(certificate.serialNumber);
    expect(other.privateKeyPem).not.toBe(privateKeyPem);
  });
});

describe('certificateFingerprint', () => {
  it('is the lowercase hex SHA-256 of the DER bytes', () => {
    const expected = createHash('sha256').update(certificate.raw).digest('hex');
    expect(certificateFingerprint(certificate)).toBe(expected);
    expect(certificateFingerprint(certificate)).toMatch(/^[0-9a-f]{64}$/);
  });
});

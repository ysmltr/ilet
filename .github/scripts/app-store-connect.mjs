// The TestFlight workflow's helper for the App Store Connect API. It finds the team's distribution
// certificate that belongs to the private key in the APPLE_DISTRIBUTION_KEY secret, and for each
// App ID (the app's and its extension's) an App Store provisioning profile with that certificate,
// which it makes the first time. It writes certificate.cer and <App ID>.mobileprovision for the
// signing step and prints only identifiers and dates: never a token, a key or a certificate's
// name, which holds the account holder's name.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… node app-store-connect.mjs --api-key AuthKey.p8 \
//     --distribution-key distribution.key --bundle-id com.example.app \
//     --bundle-id com.example.app.share --out folder
import { Buffer } from 'node:buffer';
import { createPrivateKey, sign, X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const API = 'https://api.appstoreconnect.apple.com';
/** Apple accepts tokens that live up to 20 minutes; one run of this helper takes seconds. */
const TOKEN_LIFETIME_SECONDS = 5 * 60;
/** The most items the API returns at once; a team has far fewer certificates and profiles. */
const PAGE_SIZE = '200';
/** The certificate types that sign for the App Store: Apple Distribution and the older iOS one. */
const DISTRIBUTION_TYPES = new Set(['DISTRIBUTION', 'IOS_DISTRIBUTION']);
const PROFILE_TYPE = 'IOS_APP_STORE';
/** App IDs become file names, so only the characters that Apple allows in them are accepted. */
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9.-]+$/;

/**
 * A token for the App Store Connect API: a JWT signed with the API key (ES256).
 * @param {{ apiKey: import('node:crypto').KeyObject, keyId: string, issuerId: string, now?: number }} options
 */
export function makeToken({ apiKey, keyId, issuerId, now = Date.now() }) {
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const claims = {
    iss: issuerId,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
    aud: 'appstoreconnect-v1',
  };
  const unsigned = [header, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  // A JWT holds the two numbers of an ECDSA signature side by side, not in DER.
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: apiKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsigned}.${signature.toString('base64url')}`;
}

/**
 * A function that sends one request to the API and returns its parsed answer. A failed request
 * throws with Apple's explanation, never with the token.
 * @param {{ token: string, baseUrl?: string, fetchImpl?: typeof fetch }} options
 */
export function connect({ token, baseUrl = API, fetchImpl = fetch }) {
  /**
   * @param {string} method
   * @param {string} resource such as /v1/certificates?limit=200
   * @param {unknown} [body]
   */
  return async (method, resource, body) => {
    const response = await fetchImpl(new URL(resource, baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      const [where] = resource.split('?');
      throw new Error(`${method} ${where} failed with HTTP ${response.status}: ${explain(text)}`);
    }
    return text === '' ? undefined : JSON.parse(text);
  };
}

/** The explanation in an error answer of the API: {"errors": [{"detail": …}, …]}. */
function explain(text) {
  try {
    const details = JSON.parse(text).errors.map((error) => error.detail ?? error.title);
    if (details.length > 0) return redactNames(details.join(' '));
  } catch {
    // Not Apple's error format; the status code has to do.
  }
  return 'Apple gave no explanation.';
}

/** Replaces the person's name in certificate names such as "Apple Distribution: Name (TEAMID)". */
export function redactNames(text) {
  return text.replace(
    /((?:Apple|iPhone|iOS) (?:Distribution|Development|Developer)): [^"(]+/g,
    '$1: <name> ',
  );
}

/**
 * Finds the distribution certificate that belongs to `distributionKey`, and for each App ID in
 * `bundleIds` an App Store profile with that certificate, which is made if there is none yet.
 * @param {{ call: ReturnType<typeof connect>, distributionKey: import('node:crypto').KeyObject, bundleIds: string[], now?: number }} options
 */
export async function findSigningFiles({ call, distributionKey, bundleIds, now = Date.now() }) {
  const certificate = await findCertificate(call, distributionKey, now);
  const profiles = [];
  for (const bundleId of bundleIds) {
    const app = await findApp(call, bundleId);
    const { profile, made } = await findOrMakeProfile(call, certificate, app);
    profiles.push({ bundleId, profile, made });
  }
  return { certificate, profiles };
}

async function findCertificate(call, distributionKey, now) {
  const { data } = await call('GET', `/v1/certificates?limit=${PAGE_SIZE}`);
  const keys = data.filter((item) => belongsTo(item, distributionKey));
  const usable = keys
    .filter(
      (item) =>
        DISTRIBUTION_TYPES.has(item.attributes.certificateType) &&
        Date.parse(item.attributes.expirationDate) > now,
    )
    .sort(
      (a, b) => Date.parse(b.attributes.expirationDate) - Date.parse(a.attributes.expirationDate),
    );
  if (usable.length > 0) return usable[0];
  throw new Error(
    keys.length === 0
      ? 'No certificate of this team belongs to the key in APPLE_DISTRIBUTION_KEY. Make an Apple ' +
          'Distribution certificate from ilet-distribution.csr, and check that the secret holds ' +
          'the whole ilet-distribution.key (ios/APP_STORE.md).'
      : 'The certificate for the key in APPLE_DISTRIBUTION_KEY has expired or is not an Apple ' +
          'Distribution certificate. Make an Apple Distribution certificate (ios/APP_STORE.md).',
  );
}

function belongsTo(item, distributionKey) {
  try {
    const der = Buffer.from(item.attributes.certificateContent, 'base64');
    return new X509Certificate(der).checkPrivateKey(distributionKey);
  } catch {
    // A certificate with another kind of key, or without content.
    return false;
  }
}

async function findApp(call, identifier) {
  const query = new URLSearchParams({ 'filter[identifier]': identifier, limit: PAGE_SIZE });
  const { data } = await call('GET', `/v1/bundleIds?${query}`);
  // The filter also matches App IDs that only start with this one.
  const app = data.find((item) => item.attributes.identifier === identifier);
  if (app === undefined) {
    throw new Error(
      `This team has no App ID ${identifier}. Register it on developer.apple.com (Identifiers, +, ` +
        "App IDs) with the App Groups capability set to the app's group (ios/APP_STORE.md).",
    );
  }
  return app;
}

async function findOrMakeProfile(call, certificate, app) {
  // One profile per App ID and certificate, kept for later runs. Apple marks a profile invalid when
  // the App ID changes (a new capability, for example); then it is replaced.
  const name = `${app.attributes.identifier} TestFlight ${certificate.id}`;
  const { data } = await call('GET', `/v1/bundleIds/${app.id}/profiles?limit=${PAGE_SIZE}`);
  const named = data.filter(
    (item) => item.attributes.name === name && item.attributes.profileType === PROFILE_TYPE,
  );
  const active = named.find((item) => item.attributes.profileState === 'ACTIVE');
  if (active !== undefined) return { profile: active, made: false };
  for (const item of named) await call('DELETE', `/v1/profiles/${item.id}`);
  const { data: profile } = await call('POST', '/v1/profiles', {
    data: {
      type: 'profiles',
      attributes: { name, profileType: PROFILE_TYPE },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: app.id } },
        certificates: { data: [{ type: 'certificates', id: certificate.id }] },
      },
    },
  });
  return { profile, made: true };
}

/** Prints a GitHub workflow command, which has to stay on one line. */
function annotate(kind, title, message) {
  const line = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  process.stdout.write(`::${kind} title=${title}::${line}\n`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      'api-key': { type: 'string' },
      'distribution-key': { type: 'string' },
      'bundle-id': { type: 'string', multiple: true },
      out: { type: 'string' },
    },
  });
  const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId } = process.env;
  const apiKeyPath = values['api-key'];
  const distributionKeyPath = values['distribution-key'];
  const bundleIds = values['bundle-id'] ?? [];
  const folder = values.out;
  if (!keyId || !issuerId || !apiKeyPath || !distributionKeyPath || !folder) {
    throw new Error('Usage: see the top of app-store-connect.mjs.');
  }
  if (bundleIds.length === 0 || !bundleIds.every((id) => BUNDLE_ID_PATTERN.test(id))) {
    throw new Error('Each --bundle-id must be an App ID such as com.example.app.');
  }
  const token = makeToken({
    apiKey: createPrivateKey(readFileSync(apiKeyPath)),
    keyId,
    issuerId,
  });
  const { certificate, profiles } = await findSigningFiles({
    call: connect({ token }),
    distributionKey: createPrivateKey(readFileSync(distributionKeyPath)),
    bundleIds,
  });
  const files = { 'certificate.cer': certificate.attributes.certificateContent };
  for (const { bundleId, profile } of profiles) {
    files[`${bundleId}.mobileprovision`] = profile.attributes.profileContent;
  }
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(folder, file), Buffer.from(content, 'base64'));
  }
  const used = profiles.map(
    ({ profile, made }) => `${made ? 'made' : 'reused'} "${profile.attributes.name}"`,
  );
  annotate(
    'notice',
    'Signing',
    `Certificate ${certificate.id}, valid until ${certificate.attributes.expirationDate}; ` +
      `provisioning profiles: ${used.join(', ')}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((/** @type {unknown} */ error) => {
    annotate('error', 'App Store Connect', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

// Tests for app-store-connect.mjs, with made-up keys and a fake App Store Connect. The made-up
// certificates come from OpenSSL, which Git for Windows and GitHub's Macs have.
//   node --test .github/scripts/app-store-connect.test.mjs
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { connect, findSigningFiles, makeToken, redactNames } from './app-store-connect.mjs';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const NEXT_YEAR = '2027-11-04T12:00:00.000+00:00';
const LAST_YEAR = '2025-11-04T12:00:00.000+00:00';
const BUNDLE_ID = 'com.example.ilet';

describe('makeToken', () => {
  it('makes the ES256 token that Apple describes, valid for five minutes', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const token = makeToken({
      apiKey: privateKey,
      keyId: 'ABCDE12345',
      issuerId: 'issuer',
      now: 1_700_000_000_900,
    });
    const [header, claims, signature] = token.split('.');
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());
    assert.deepEqual(decode(header), { alg: 'ES256', kid: 'ABCDE12345', typ: 'JWT' });
    assert.deepEqual(decode(claims), {
      iss: 'issuer',
      iat: 1_700_000_000,
      exp: 1_700_000_300,
      aud: 'appstoreconnect-v1',
    });
    const raw = Buffer.from(signature, 'base64url');
    assert.equal(raw.length, 64);
    const options = { key: publicKey, dsaEncoding: 'ieee-p1363' };
    assert.ok(verify('sha256', Buffer.from(`${header}.${claims}`), options, raw));
  });
});

describe('connect', () => {
  it('sends the token and the body as JSON, and reads the answer', async () => {
    const requests = [];
    const call = connect({
      token: 'the-token',
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify({ data: { id: 'P1' } }), { status: 201 });
      },
    });
    assert.deepEqual(await call('POST', '/v1/profiles', { data: { type: 'profiles' } }), {
      data: { id: 'P1' },
    });
    assert.equal(requests[0].url, 'https://api.appstoreconnect.apple.com/v1/profiles');
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.headers.authorization, 'Bearer the-token');
    assert.equal(requests[0].init.headers['content-type'], 'application/json');
    assert.equal(requests[0].init.body, '{"data":{"type":"profiles"}}');
  });

  it('accepts an empty answer, as for a deletion', async () => {
    const call = connect({
      token: 'the-token',
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(await call('DELETE', '/v1/profiles/P1'), undefined);
  });

  it("explains a failure with Apple's words, without the token or a person's name", async () => {
    const answer = {
      errors: [
        {
          status: '409',
          detail: 'Conflict with "Apple Distribution: Jane Doe (TEAM123456)".',
        },
      ],
    };
    const call = connect({
      token: 'the-token',
      fetchImpl: async () => new Response(JSON.stringify(answer), { status: 409 }),
    });
    await assert.rejects(call('GET', '/v1/certificates?limit=200'), (error) => {
      assert.equal(
        error.message,
        'GET /v1/certificates failed with HTTP 409: ' +
          'Conflict with "Apple Distribution: <name> (TEAM123456)".',
      );
      return true;
    });
  });

  it('explains a failure without an error answer by its status', async () => {
    const call = connect({
      token: 'the-token',
      fetchImpl: async () => new Response('<html>Bad gateway</html>', { status: 502 }),
    });
    await assert.rejects(call('GET', '/v1/certificates'), {
      message: 'GET /v1/certificates failed with HTTP 502: Apple gave no explanation.',
    });
  });
});

describe('redactNames', () => {
  it('replaces the name in every kind of certificate name', () => {
    assert.equal(
      redactNames('Apple Development: Ayşe Yılmaz (T1), iPhone Distribution: Jo Ann (T2)'),
      'Apple Development: <name> (T1), iPhone Distribution: <name> (T2)',
    );
  });
});

describe('findSigningFiles', () => {
  let folder;
  let ours;
  let theirs;

  before(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'ilet-asc-test-'));
    ours = makeCertificate(folder, 'ours');
    theirs = makeCertificate(folder, 'theirs');
  });

  after(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  /** Certificates as the API lists them; `content` is a certificate from makeCertificate. */
  function certificate(id, content, certificateType = 'DISTRIBUTION', expirationDate = NEXT_YEAR) {
    return { id, attributes: { certificateType, expirationDate, certificateContent: content } };
  }

  function profile(id, name, profileState = 'ACTIVE') {
    const attributes = { name, profileState, profileType: 'IOS_APP_STORE', profileContent: 'AA==' };
    return { id, attributes };
  }

  function app(id, identifier) {
    return { id, attributes: { identifier } };
  }

  /**
   * A fake App Store Connect that answers from `answers`, keyed by method and path, and records
   * each request with its query and body.
   */
  function fakeApple(answers) {
    const requests = [];
    const call = async (method, resource, body) => {
      const url = new URL(resource, 'https://api.example');
      const key = `${method} ${url.pathname}`;
      requests.push({ key, query: Object.fromEntries(url.searchParams), body });
      if (!(key in answers)) throw new Error(`unexpected request ${key}`);
      const answer = answers[key];
      return typeof answer === 'function' ? answer(body) : answer;
    };
    return { call, requests };
  }

  function standardAnswers(certificates, profiles) {
    return {
      'GET /v1/certificates': { data: certificates },
      'GET /v1/bundleIds': { data: [app('A2', `${BUNDLE_ID}.share`), app('A1', BUNDLE_ID)] },
      'GET /v1/bundleIds/A1/profiles': { data: profiles },
    };
  }

  it("finds the key's distribution certificate and reuses its profile", async () => {
    const certificates = [
      certificate('C1', theirs.content),
      certificate('C2', ours.content, 'DEVELOPMENT'),
      certificate('C3', ours.content, 'DISTRIBUTION', LAST_YEAR),
      certificate('C4', ours.content),
      certificate('C5', 'bm90IGEgY2VydGlmaWNhdGU='),
    ];
    const profiles = [
      profile('P1', `${BUNDLE_ID} TestFlight C1`),
      profile('P2', `${BUNDLE_ID} TestFlight C4`),
    ];
    const apple = fakeApple(standardAnswers(certificates, profiles));
    const result = await findSigningFiles({
      call: apple.call,
      distributionKey: ours.key,
      bundleIds: [BUNDLE_ID],
      now: NOW,
    });
    assert.equal(result.certificate.id, 'C4');
    assert.deepEqual(summarize(result.profiles), [[BUNDLE_ID, 'P2', false]]);
    assert.deepEqual(
      apple.requests.map(({ key, query }) => [key, query]),
      [
        ['GET /v1/certificates', { limit: '200' }],
        ['GET /v1/bundleIds', { 'filter[identifier]': BUNDLE_ID, limit: '200' }],
        ['GET /v1/bundleIds/A1/profiles', { limit: '200' }],
      ],
    );
  });

  it('replaces an invalid profile with a new one', async () => {
    const answers = standardAnswers(
      [certificate('C4', ours.content, 'IOS_DISTRIBUTION')],
      [profile('P3', `${BUNDLE_ID} TestFlight C4`, 'INVALID')],
    );
    answers['DELETE /v1/profiles/P3'] = undefined;
    answers['POST /v1/profiles'] = (body) => ({
      data: profile('P4', body.data.attributes.name),
    });
    const apple = fakeApple(answers);
    const result = await findSigningFiles({
      call: apple.call,
      distributionKey: ours.key,
      bundleIds: [BUNDLE_ID],
      now: NOW,
    });
    assert.deepEqual(summarize(result.profiles), [[BUNDLE_ID, 'P4', true]]);
    assert.deepEqual(
      apple.requests.slice(3).map(({ key }) => key),
      ['DELETE /v1/profiles/P3', 'POST /v1/profiles'],
    );
    assert.deepEqual(apple.requests[4].body, {
      data: {
        type: 'profiles',
        attributes: { name: `${BUNDLE_ID} TestFlight C4`, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: 'A1' } },
          certificates: { data: [{ type: 'certificates', id: 'C4' }] },
        },
      },
    });
  });

  it('signs the app and its extension with the same certificate', async () => {
    const share = `${BUNDLE_ID}.share`;
    const answers = standardAnswers(
      [certificate('C4', ours.content)],
      [profile('P2', `${BUNDLE_ID} TestFlight C4`)],
    );
    answers['GET /v1/bundleIds/A2/profiles'] = { data: [] };
    answers['POST /v1/profiles'] = (body) => ({
      data: profile('P5', body.data.attributes.name),
    });
    const apple = fakeApple(answers);
    const result = await findSigningFiles({
      call: apple.call,
      distributionKey: ours.key,
      bundleIds: [BUNDLE_ID, share],
      now: NOW,
    });
    assert.equal(result.certificate.id, 'C4');
    assert.deepEqual(summarize(result.profiles), [
      [BUNDLE_ID, 'P2', false],
      [share, 'P5', true],
    ]);
    assert.deepEqual(
      apple.requests.map(({ key, query }) => [key, query]),
      [
        ['GET /v1/certificates', { limit: '200' }],
        ['GET /v1/bundleIds', { 'filter[identifier]': BUNDLE_ID, limit: '200' }],
        ['GET /v1/bundleIds/A1/profiles', { limit: '200' }],
        ['GET /v1/bundleIds', { 'filter[identifier]': share, limit: '200' }],
        ['GET /v1/bundleIds/A2/profiles', { limit: '200' }],
        ['POST /v1/profiles', {}],
      ],
    );
    assert.deepEqual(apple.requests[5].body.data, {
      type: 'profiles',
      attributes: { name: `${share} TestFlight C4`, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: 'A2' } },
        certificates: { data: [{ type: 'certificates', id: 'C4' }] },
      },
    });
  });

  it('says what to do when no certificate belongs to the key', async () => {
    const apple = fakeApple(standardAnswers([certificate('C1', theirs.content)], []));
    await assert.rejects(
      findSigningFiles({ call: apple.call, distributionKey: ours.key, bundleIds: [BUNDLE_ID] }),
      /^Error: No certificate of this team belongs to the key in APPLE_DISTRIBUTION_KEY\./,
    );
  });

  it('refuses a certificate of the wrong type or an expired one', async () => {
    const certificates = [
      certificate('C2', ours.content, 'DEVELOPMENT'),
      certificate('C3', ours.content, 'DISTRIBUTION', LAST_YEAR),
    ];
    const apple = fakeApple(standardAnswers(certificates, []));
    await assert.rejects(
      findSigningFiles({
        call: apple.call,
        distributionKey: ours.key,
        bundleIds: [BUNDLE_ID],
        now: NOW,
      }),
      /has expired or is not an Apple Distribution certificate/,
    );
  });

  it('says how to register an App ID that is missing', async () => {
    const answers = standardAnswers([certificate('C4', ours.content)], []);
    answers['GET /v1/bundleIds'] = { data: [app('A2', `${BUNDLE_ID}.share`)] };
    const apple = fakeApple(answers);
    await assert.rejects(
      findSigningFiles({
        call: apple.call,
        distributionKey: ours.key,
        bundleIds: [BUNDLE_ID],
        now: NOW,
      }),
      (error) => {
        assert.ok(error.message.startsWith(`This team has no App ID ${BUNDLE_ID}. Register it`));
        assert.ok(error.message.includes('App Groups capability'));
        return true;
      },
    );
  });
});

/** Each profile as [App ID, profile ID, whether it was made now]. */
function summarize(profiles) {
  return profiles.map((entry) => [entry.bundleId, entry.profile.id, entry.made]);
}

/** A self-signed certificate (base64 DER, as the API sends it) and its private key. */
function makeCertificate(folder, name) {
  const key = path.join(folder, `${name}.key`);
  const certificate = path.join(folder, `${name}.cer`);
  execFileSync(
    'openssl',
    [
      ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${name}`],
      ...['-keyout', key, '-outform', 'DER', '-out', certificate],
    ],
    { stdio: 'ignore' },
  );
  return {
    key: createPrivateKey(readFileSync(key)),
    content: readFileSync(certificate).toString('base64'),
  };
}

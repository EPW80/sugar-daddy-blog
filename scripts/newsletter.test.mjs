import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare, Response } from 'miniflare';

const origin = 'https://publication.test';
const endpoint = `${origin}/api/newsletter/subscribe`;
const migration = await readFile(
  new URL('../migrations/0001_signup_limits.sql', import.meta.url),
  'utf8',
);
const contacts = new Map();
const providerRequests = [];
let providerFailure = false;

const script = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const runtime = new Miniflare({
  workers: [
    {
      config: {
        name: 'newsletter-test',
        compatibilityDate: '2026-11-22',
        manifest: {
          mainModule: 'index.js',
          modules: { 'index.js': { type: 'esm', contents: script } },
        },
        env: {
          SIGNUP_LIMITS: { type: 'd1', id: 'newsletter-test' },
          SIGNUP_ENABLED: { type: 'text', value: 'true' },
          SIGNUP_LIMIT_KEY: { type: 'text', value: 'local-test-key' },
          MAILCHIMP_API_KEY: { type: 'text', value: 'local-test-token' },
          MAILCHIMP_SERVER: { type: 'text', value: 'us1' },
          MAILCHIMP_AUDIENCE_ID: { type: 'text', value: 'audience' },
          CONSENT_VERSION: { type: 'text', value: 'inner-circle-v1' },
        },
      },
      dev: {
        outboundService: {
          type: 'fetcher',
          async handler(request) {
            assert.equal(request.url, 'https://us1.api.mailchimp.com/3.0/lists/audience/members');
            assert.equal(request.method, 'POST');
            assert.equal(request.headers.get('Authorization'), 'Bearer local-test-token');
            const member = await request.json();
            providerRequests.push(member);
            if (providerFailure) throw new Error('Mock network timeout');
            if (contacts.has(member.email_address))
              return Response.json({ title: 'Member Exists' }, { status: 400 });
            contacts.set(member.email_address, member);
            return Response.json({ status: 'pending' });
          },
        },
      },
    },
  ],
});

let database;
before(async () => {
  database = await runtime.getD1Database('SIGNUP_LIMITS');
  await database.batch(
    migration
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => database.prepare(statement)),
  );
});
after(() => runtime.dispose());

function submit(email, { ip = '192.0.2.1', standalone = false, ...extra } = {}) {
  return runtime.dispatchFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({
      email,
      source: standalone ? 'inner-circle-page' : 'homepage-popup',
      page: standalone ? '/inner-circle/' : '/',
      ...extra,
    }),
  });
}

test('new signup is pending and a duplicate preserves the original consent metadata', async () => {
  const first = await submit(' First@Example.test ');
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { ok: true });
  const duplicate = await submit('first@example.test', { standalone: true });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { ok: true });
  const stored = contacts.get('first@example.test');
  assert.equal(stored.status, 'pending');
  assert.ok(!Number.isNaN(Date.parse(stored.timestamp_signup)));
  assert.deepEqual(stored.merge_fields, {
    SDSOURCE: 'homepage-popup',
    SDCONSENT: 'inner-circle-v1',
  });
});

test('invalid requests, honeypot and unsupported routes stay out of the provider', async () => {
  const before = providerRequests.length;
  assert.equal((await submit('bad')).status, 422);
  assert.equal((await submit('reader@example.test', { page: '/x/' })).status, 422);
  assert.equal((await submit('reader@example.test', { website: 'filled' })).status, 400);
  assert.equal((await submit('reader@example.test', { padding: 'x'.repeat(2048) })).status, 422);
  assert.equal((await runtime.dispatchFetch(endpoint)).status, 405);
  const unknown = await runtime.dispatchFetch(`${origin}/api/missing`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: 'Not found' });
  assert.equal(providerRequests.length, before);
});

test('concurrent requests enforce the shared email limit and store only hashed identifiers', async () => {
  const email = 'race@example.test';
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      submit(email, { ip: `192.0.2.${index + 20}`, standalone: true }),
    ),
  );
  assert.deepEqual(
    responses.map(({ status }) => status).sort(),
    [201, 409, 409, 429, 429, 429, 429, 429],
  );
  assert.equal(contacts.get(email).merge_fields.SDSOURCE, 'inner-circle-page');
  for (const response of responses.filter(({ status }) => status === 429)) {
    const seconds = Number(response.headers.get('Retry-After'));
    assert.ok(seconds > 0 && seconds <= 3600);
  }
  const { results } = await database.prepare('SELECT key FROM signup_limits').all();
  assert.ok(results.length > 0);
  for (const { key } of results) assert.match(key, /^[a-f0-9]{64}$/);
});

test('IP limit applies across unique emails and old windows do not block new ones', async () => {
  const ip = '192.0.2.40';
  const responses = await Promise.all(
    Array.from({ length: 11 }, (_, index) => submit(`limit${index}@example.test`, { ip })),
  );
  assert.equal(responses.filter(({ status }) => status === 201).length, 10);
  assert.equal(responses.filter(({ status }) => status === 429).length, 1);
  await database.prepare('UPDATE signup_limits SET expires_at = 0').run();
  assert.equal((await submit('limit0@example.test', { ip })).status, 409);
});

test('a provider timeout remains retryable', async () => {
  providerFailure = true;
  try {
    const response = await submit('timeout@example.test');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally {
    providerFailure = false;
  }
  assert.equal((await submit('timeout@example.test')).status, 201);
});

test('the canonical signup redirect preserves the query', async () => {
  const url = `${origin}/inner-circle?from=review`;
  const response = await runtime.dispatchFetch(url, { redirect: 'manual' });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), `${origin}/inner-circle/?from=review`);
});

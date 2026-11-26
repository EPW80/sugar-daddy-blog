import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, Response } from 'miniflare';

const migration = await readFile(
  new URL('../migrations/0001_signup_limits.sql', import.meta.url),
  'utf8',
);
const script = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
export function createNewsletterFixture() {
  const contacts = new Map();
  const providerRequests = [];
  let providerFailure = false;
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

  return {
    runtime,
    contacts,
    providerRequests,
    setProviderFailure(value) {
      providerFailure = value;
    },
    async migrate() {
      const database = await runtime.getD1Database('SIGNUP_LIMITS');
      await database.batch(
        migration
          .split(';')
          .map((statement) => statement.trim())
          .filter(Boolean)
          .map((statement) => database.prepare(statement)),
      );
      return database;
    },
  };
}

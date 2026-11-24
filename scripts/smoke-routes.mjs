import assert from 'node:assert/strict';

async function main() {
  const baseUrl = URL.parse(process.argv[2] ?? '');
  const cloudflare = process.argv.includes('--cloudflare');
  const signupEnabled = process.argv.includes('--signup-enabled');
  if (!baseUrl || !['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error(
      'Usage: npm run smoke:routes -- <http(s)://host> [--cloudflare] [--signup-enabled]',
    );
  }

  function request(path, accept = 'text/html') {
    return fetch(new URL(path, baseUrl), {
      headers: { Accept: accept },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
  }

  async function expectStatus(path, status, accept) {
    const response = await request(path, accept);
    assert.equal(response.status, status, `${path} should return HTTP ${status}`);
    return response;
  }

  const home = await expectStatus('/', 200);
  assert.match(await home.text(), /A little more discipline/, 'Homepage content is missing');
  const signup = await expectStatus('/inner-circle/', 200);
  assert.match(await signup.text(), /id="sd-signup-email"/, 'Inner Circle form is missing');

  for (const [path, title] of [
    ['/issues/01/', 'Issue No. 01'],
    ['/articles/sunday-wind-down/', 'The Sunday wind-down'],
    ['/articles/training-on-a-busy-week/', 'Training on a busy week'],
    ['/articles/questions-before-bloodwork/', 'What to ask before bloodwork'],
    ['/editorial-standards/', 'Editorial standards and corrections'],
  ]) {
    const page = await expectStatus(path, 200);
    assert.ok((await page.text()).includes(`<h1>${title}</h1>`), `${path} heading is missing`);
  }

  const redirect = await request('/inner-circle?from=review');
  const location = redirect.headers.get('location');
  await redirect.body?.cancel();
  assert.ok([301, 308].includes(redirect.status), '/inner-circle should redirect permanently');
  assert.ok(location, 'The redirect has no Location header');
  assert.equal(
    new URL(location, baseUrl).href,
    new URL('/inner-circle/?from=review', baseUrl).href,
    'The redirect should add a trailing slash and preserve the query',
  );

  const missingPage = await expectStatus('/__sugar-daddy-smoke__/missing?from=review', 404);
  assert.match(missingPage.headers.get('content-type') ?? '', /^text\/html\b/i);
  const html = await missingPage.text();
  assert.match(html, /class="sd-not-found\b/, 'The 404 recovery page is missing');
  const stylesheet = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/i)?.[1];
  assert.ok(stylesheet, 'The recovery page stylesheet is missing');
  const css = await expectStatus(new URL(stylesheet, missingPage.url), 200, 'text/css');
  assert.match(css.headers.get('content-type') ?? '', /^text\/css\b/i);
  await css.body?.cancel();

  for (const [path, accept] of [
    ['/assets/__sugar-daddy-smoke__.js', 'application/javascript'],
    ['/api/__sugar-daddy-smoke__', 'application/json'],
  ]) {
    const response = await expectStatus(path, 404, accept);
    if (cloudflare && path.startsWith('/api/'))
      assert.deepEqual(await response.json(), { error: 'Not found' });
    else await response.body?.cancel();
  }

  if (cloudflare) {
    const endpoint = '/api/newsletter/subscribe';
    const get = await expectStatus(endpoint, 405, 'application/json');
    assert.equal(get.headers.get('Allow'), 'POST');
    await get.body?.cancel();
    const invalid = await fetch(new URL(endpoint, baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(invalid.status, signupEnabled ? 422 : 503);
    assert.match(invalid.headers.get('content-type') ?? '', /^application\/json\b/i);
    await invalid.body?.cancel();
  }
  console.log(`Route smoke checks passed for ${baseUrl.origin}`);
}

try {
  await main();
} catch (error) {
  console.error(`Route smoke check failed: ${error.message}`);
  process.exitCode = 1;
}

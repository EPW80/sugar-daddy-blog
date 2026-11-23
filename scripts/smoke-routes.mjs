import assert from 'node:assert/strict';

async function main() {
  const baseUrl = URL.parse(process.argv[2] ?? '');
  if (!baseUrl || !['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('Usage: npm run smoke:routes -- <http(s)://host>');
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
    await response.body?.cancel();
  }
  console.log(`Route smoke checks passed for ${baseUrl.origin}`);
}

try {
  await main();
} catch (error) {
  console.error(`Route smoke check failed: ${error.message}`);
  process.exitCode = 1;
}

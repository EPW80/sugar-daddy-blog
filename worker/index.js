const signupPath = '/api/newsletter/subscribe';
const signupPages = {
  'homepage-popup': '/',
  'inner-circle-page': '/inner-circle/',
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function reply(status, body, headers) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function readSignup(request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    return null;

  const reader = request.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function counterKey(key, type, value) {
  const bytes = new TextEncoder().encode(`${type}:${value}`);
  const signature = await crypto.subtle.sign('HMAC', key, bytes);
  return new Uint8Array(signature).toHex();
}

async function reserveAttempt(database, key, now, windowSeconds, limit) {
  const expiresAt = (Math.floor(now / windowSeconds) + 1) * windowSeconds;
  const result = await database
    .prepare(
      `INSERT INTO signup_limits (key, expires_at, attempts)
       VALUES (?, ?, 1)
       ON CONFLICT (key, expires_at) DO UPDATE SET attempts = attempts + 1
       WHERE attempts < ?
       RETURNING attempts`,
    )
    .bind(key, expiresAt, limit)
    .first();
  return result ? 0 : expiresAt - now;
}

async function subscribe(request, env) {
  if (env.SIGNUP_ENABLED !== 'true') return reply(503, { error: 'Signup unavailable' });

  const data = await readSignup(request);
  if (typeof data?.website === 'string' && data.website.trim())
    return reply(400, { error: 'Invalid request' });

  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (
    !email ||
    email.length > 254 ||
    !emailPattern.test(email) ||
    typeof data.source !== 'string' ||
    !Object.hasOwn(signupPages, data.source) ||
    data.page !== signupPages[data.source]
  ) {
    return reply(422, { error: 'Invalid signup' });
  }

  const ip = request.headers.get('CF-Connecting-IP');
  if (
    !ip ||
    !env.SIGNUP_LIMITS ||
    !env.SIGNUP_LIMIT_KEY ||
    !env.MAILCHIMP_API_KEY ||
    !/^[a-z0-9]+$/.test(env.MAILCHIMP_SERVER ?? '') ||
    !/^[a-z0-9]+$/i.test(env.MAILCHIMP_AUDIENCE_ID ?? '') ||
    !env.CONSENT_VERSION
  ) {
    console.error('newsletter_signup', { outcome: 'configuration_error' });
    return reply(503, { error: 'Signup unavailable' });
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SIGNUP_LIMIT_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const now = Math.floor(Date.now() / 1000);
    const ipKey = await counterKey(key, 'ip', ip);
    let retryAfter = await reserveAttempt(env.SIGNUP_LIMITS, ipKey, now, 600, 10);
    if (!retryAfter) {
      const emailKey = await counterKey(key, 'email', email);
      retryAfter = await reserveAttempt(env.SIGNUP_LIMITS, emailKey, now, 3600, 3);
    }
    if (retryAfter) return reply(429, { error: 'Try again later' }, { 'Retry-After': retryAfter });
  } catch {
    console.error('newsletter_signup', { outcome: 'rate_limit_error' });
    return reply(503, { error: 'Signup temporarily unavailable' });
  }

  try {
    const provider = await fetch(
      `https://${env.MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/${env.MAILCHIMP_AUDIENCE_ID}/members`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MAILCHIMP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_address: email,
          status: 'pending',
          timestamp_signup: new Date().toISOString(),
          merge_fields: { SDSOURCE: data.source, SDCONSENT: env.CONSENT_VERSION },
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      },
    );
    const result = await provider.json();
    if (provider.ok && result?.status === 'pending') return reply(201, { ok: true });
    if (provider.status === 400 && result?.title === 'Member Exists')
      return reply(409, { ok: true });
    console.error('newsletter_signup', { outcome: 'provider_error', status: provider.status });
  } catch {
    console.error('newsletter_signup', { outcome: 'provider_unavailable' });
  }
  return reply(503, { error: 'Signup temporarily unavailable' });
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/inner-circle' && ['GET', 'HEAD'].includes(request.method)) {
      url.pathname += '/';
      return Response.redirect(url, 308);
    }
    if (url.pathname === signupPath) {
      return request.method === 'POST'
        ? subscribe(request, env)
        : reply(405, { error: 'Method not allowed' }, { Allow: 'POST' });
    }
    if (url.pathname.startsWith('/api/')) return reply(404, { error: 'Not found' });
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env) {
    await env.SIGNUP_LIMITS.prepare('DELETE FROM signup_limits WHERE expires_at <= ?')
      .bind(Math.floor(Date.now() / 1000))
      .run();
  },
};

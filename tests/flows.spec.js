import { test, expect } from '@playwright/test';

const newsletter = page => page.locator('.sd-announce').getByRole('link', { name: 'Inner Circle newsletter' });
const confirmation = 'If your address still needs confirmation, look for a link in your inbox or spam folder. Once confirmed, you’ll receive the Sunday letter.';

test('unconfigured production signup is unavailable without a misleading success', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?sd_intro=0');
  await page.clock.fastForward(2000);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole('dialog')).toBeHidden();
  const notices = page.locator('[data-signup-availability]:visible');
  await expect(notices).toHaveText(Array(3).fill('Sign-up coming soon'));
  await newsletter(page).press('Enter');
  await expect(page.locator('[data-signup-status]')).toHaveText('Sign-up coming soon');
  await expect(page.getByLabel('Email address')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request entry', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Close sign-up' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Not now' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sd_signup_v1'))?.subscribedAt)).toBeFalsy();
  await page.goto('/inner-circle/');
  await expect(page.getByRole('status')).toHaveText('Sign-up coming soon');
  await expect(page.getByLabel('Email address')).toBeDisabled();
});

for (const [name, options] of [
  ['Ctrl/Cmd-click', { modifiers: ['ControlOrMeta'] }],
  ['middle-click', { button: 'middle' }],
]) {
  test(`newsletter link supports native ${name}`, async ({ page, context }) => {
    await page.goto('/?sd_popup=0&sd_intro=0');
    const [tab] = await Promise.all([
      context.waitForEvent('page', { timeout: 5000 }),
      newsletter(page).click(options),
    ]);
    await expect(tab).toHaveURL(/\/inner-circle\/$/);
    await expect(tab.getByRole('heading', { name: 'Join the Inner Circle' })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
}

test('Cmd-click remains available to the browser', async ({ page }) => {
  await page.goto('/?sd_popup=0&sd_intro=0');
  const allowed = await newsletter(page).evaluate(link => {
    let defaultAllowed;
    document.addEventListener('click', event => {
      defaultAllowed = !event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
    return defaultAllowed;
  });
  expect(allowed).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
});

for (const path of ['/?sd_popup=0&sd_intro=0', '/inner-circle/']) {
  test(`new and duplicate acknowledgements allow changing addresses on ${path}`, async ({ page }) => {
    const emails = [];
    await page.route('**/api/newsletter/subscribe', async route => {
      emails.push(route.request().postDataJSON().email);
      await route.fulfill(emails.length === 1
        ? { status: 201, contentType: 'application/json', body: '{}' }
        : { status: 409 });
    });
    await page.goto(path);
    await page.evaluate(() => window.SDSignup.init({ endpoint: '/api/newsletter/subscribe' }));
    if (path.startsWith('/?')) {
      await expect(page.locator('[data-signup-availability]:visible')).toHaveCount(0);
      await newsletter(page).click();
    }
    const input = page.getByLabel('Email address');
    const submit = page.getByRole('button', { name: 'Request entry' });
    await input.fill('first@example.com');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeFocused();
    await expect(page.locator('[data-success-live]')).toHaveText(confirmation);
    const acknowledgement = await page.evaluate(() => localStorage.getItem('sd_signup_v1'));
    expect(JSON.parse(acknowledgement).subscribedAt).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Use a different email' }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
    await expect(page.getByRole('alert')).toBeEmpty();
    expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBe(acknowledgement);
    await input.fill('second@example.com');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeFocused();
    await expect(page.locator('[data-success-live]')).toHaveText(confirmation);
    expect(emails).toEqual(['first@example.com', 'second@example.com']);
  });
}

test('explicit demo sends no email, stores no subscription and emits no real conversion', async ({ page }) => {
  const posts = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.goto('/inner-circle/');
  await page.evaluate(() => {
    window.signupEvents = [];
    window.addEventListener('sd:analytics', event => window.signupEvents.push(event.detail));
    window.SDSignup.init({ demo: true });
  });
  await expect(page.locator('[data-signup-status]')).toHaveText('Demo sign-up. No email will be sent.');
  await page.getByLabel('Email address').fill('reader@example.com');
  await page.getByRole('button', { name: 'Request entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
  await expect(page.locator('[data-success-demo]')).toContainText('No email was sent');
  await expect(page.getByRole('button', { name: 'Use a different email' })).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBeNull();
  expect(await page.evaluate(() => window.signupEvents)).toEqual([{ name: 'signup_demo_complete', props: {} }]);
  expect(posts).toEqual([]);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Skip to sign-up' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeVisible();
});

test('a failed script leaves a safe form and visible reload instructions', async ({ page }) => {
  const transmissions = [];
  page.on('request', request => {
    if (request.method() === 'POST' || new URL(request.url()).searchParams.has('email')) transmissions.push(request.url());
  });
  await page.route('**/*.js', route => route.abort());
  await page.goto('/?sd_intro=0');
  await newsletter(page).click();
  await expect(page).toHaveURL(/\/inner-circle\/$/);
  await expect(page.locator('[data-signup-status]')).toContainText('reload this page');
  await expect(page.getByLabel('Email address')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request entry', exact: true })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/inner-circle\/$/);
  expect(transmissions).toEqual([]);
  await page.getByRole('link', { name: 'Back to Sugar Daddy' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A little more discipline');
});

test('320px signup supports API success, focus return and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let payload;
  await page.route('**/api/newsletter/subscribe', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/?sd_popup=0&sd_intro=0');
  await page.evaluate(() => window.SDSignup.init({ endpoint: '/api/newsletter/subscribe', demo: true }));
  const trigger = page.locator('.sd-announce').getByRole('link', { name: 'Inner Circle newsletter' });
  await trigger.click();
  await expect(page.getByLabel('Email address')).toBeFocused();
  await page.getByLabel('Email address').fill('reader@example.com');
  await page.getByRole('button', { name: 'Request entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeFocused();
  await expect(page.locator('[data-success-demo]')).toBeHidden();
  expect(payload).toEqual({ email: 'reader@example.com', source: 'homepage-popup', page: '/' });
  const stored = await page.evaluate(() => localStorage.getItem('sd_signup_v1'));
  expect(JSON.parse(stored).subscribedAt).toBeGreaterThan(0);
  expect(stored).not.toContain('reader@example.com');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('body')).not.toHaveClass(/sd-scroll-lock/);
});

test('every enabled link and fragment resolves; catalog and footer work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ['/', '/inner-circle/', '/404.html']) {
    await page.goto(`${path}?sd_popup=0&sd_intro=0`);
    const links = await page.locator('a[href]').evaluateAll(links => links.map(link => link.href));
    for (const href of new Set(links)) {
      const url = new URL(href);
      const response = await page.request.get(`${url.origin}${url.pathname}`);
      expect(response.status(), href).toBe(200);
      if (url.hash) {
        const html = await response.text();
        expect(html, href).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
      }
    }
  }
  await page.goto('/?sd_popup=0&sd_intro=0');
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveCount(5);
  await expect(page.locator('.sd-card a')).toHaveCount(0);
  await page.getByRole('link', { name: 'Explore sections' }).click();
  await expect(page.locator('#sd-catalog-title')).toBeInViewport();
  await page.locator('.sd-sectionnav').getByRole('link', { name: 'Raw Sugar', exact: true }).click();
  await expect(page.locator('#sd-section-raw-sugar')).toBeInViewport();
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Inner Circle newsletter' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-signup-status]')).toHaveText('Sign-up coming soon');
});

for (const width of [320, 390, 1199, 1200, 1440]) {
  test(`section links fit or scroll into view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?sd_popup=0&sd_intro=0');
    await page.evaluate(() => document.fonts.ready);
    const menu = page.getByRole('navigation', { name: 'Sections' });
    const links = await menu.getByRole('link').all();
    expect(links).toHaveLength(5);
    await expect(links[0]).toBeInViewport({ ratio: 1 });
    await links[0].focus();
    for (const [index, link] of links.entries()) {
      if (index) await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await expect(link).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const link of links) {
      const hash = await link.getAttribute('href');
      await link.press('Enter');
      await expect(page.locator(hash)).toBeInViewport();
      expect(new URL(page.url()).hash).toBe(hash);
    }
    await page.getByRole('link', { name: 'Explore sections' }).click();
    await expect(page.locator('#sd-catalog-title')).toBeInViewport();
  });
}

test('a directory URL without its trailing slash redirects to the page', async ({ page }) => {
  const redirect = await page.request.get('/inner-circle?from=review', { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe('/inner-circle/?from=review');
  const response = await page.goto('/inner-circle?from=review');
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/inner-circle\/\?from=review$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Join the Inner Circle' })).toBeVisible();
  // Directories without an index (and plain missing paths) are still real 404s.
  expect((await page.request.get('/licenses', { maxRedirects: 0 })).status()).toBe(404);
  expect((await page.request.get('/missing-page', { maxRedirects: 0 })).status()).toBe(404);
});

test('malformed percent-encoding is a 404, not a server error', async ({ page }) => {
  for (const path of ['/%E0%A4%A', '/%', '/a/%ZZ/b', '/inner-circle%']) {
    const response = await page.request.get(path, { headers: { Accept: 'text/html' }, maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toContain('This page isn’t on the menu.');
  }
  const asset = await page.request.get('/assets/%E0.css', { maxRedirects: 0 });
  expect(asset.status()).toBe(404);
  expect(await asset.text()).not.toContain('This page');
  const response = await page.goto('/%E0%A4%A');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page isn’t on the menu.');
});

test('missing pages return a real 404 with recovery; missing assets and API stay errors', async ({ page }) => {
  const response = await page.goto('/does-not-exist/nested?from=review');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page isn’t on the menu.');
  await page.getByRole('navigation', { name: 'Page recovery' }).getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/\/$/);
  const asset = await page.request.get('/assets/missing.js');
  expect(asset.status()).toBe(404);
  expect(await asset.text()).not.toContain('This page');
  const api = await page.request.post('/api/newsletter/subscribe', { data: { email: 'reader@example.com' } });
  expect(api.status()).toBe(404);
  // Internal documentation is not part of the deployment.
  expect((await page.request.get('/README.md')).status()).toBe(404);
  expect((await page.request.get('/licenses/barlow-OFL.txt')).status()).toBe(200);
});

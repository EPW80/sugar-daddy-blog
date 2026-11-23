import { expect, test } from '@playwright/test';

const email = 'reader@example.com';
const dialog = (page) => page.getByRole('dialog');
const trigger = (page) =>
  page.locator('.sd-announce').getByRole('link', { name: 'Inner Circle newsletter' });
const submit = (page) => page.getByRole('button', { name: 'Request entry', exact: true });

// The production build is unconfigured by default; design tests opt into demo explicitly.
async function visit(page, path = '/?sd_popup=0', options = { demo: true }) {
  const url = new URL(path, 'http://127.0.0.1:4173');
  if (url.pathname === '/') url.searchParams.set('sd_intro', '0');
  await page.goto(url.pathname + url.search + url.hash);
  await page.evaluate((options) => window.SDSignup.init(options), options);
}

// Resolves after the page has dispatched the scroll event, so the controller has already reacted.
async function scrollToRatio(page, ratio) {
  await page.evaluate(
    (ratio) =>
      new Promise((resolve) => {
        window.addEventListener('scroll', () => resolve(), { once: true });
        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * ratio);
      }),
    ratio,
  );
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

test('auto-opens at 40% scroll with keyboard focus trap, Escape, and return focus', async ({
  page,
}) => {
  await visit(page, '/');
  await expect(dialog(page)).toBeHidden();
  await scrollToRatio(page, 0.45);
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close sign-up' })).toBeFocused();
  await expect(page.locator('#sd-intro-page')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Not now' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close sign-up' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('#sd-intro-page')).not.toHaveAttribute('inert');
  await trigger(page).click();
  await expect(page.getByLabel('Email address')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
});

test('submit validation, loading, demo success, and email privacy', async ({ page }) => {
  await visit(page, '/?sd_popup=0');
  await trigger(page).click();
  await submit(page).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your email address to join.');
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Email address').fill('bad-address');
  await expect(page.getByRole('alert')).toBeEmpty();
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('doesn’t look right');
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
  await expect(dialog(page)).toHaveAccessibleName('Demo complete');
  await expect(page.locator('[data-success-demo]')).toContainText('No email was sent');
  const stored = await page.evaluate(() => localStorage.getItem('sd_signup_v1'));
  expect(stored).toBeNull();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(dialog(page)).toBeHidden();
  await trigger(page).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back to home' })).toBeFocused();
});

for (const state of ['subscribed', 'recent dismissal', 'expired dismissal']) {
  test(`automatic suppression: ${state}`, async ({ page }) => {
    await page.addInitScript((state) => {
      const timestamp = Date.now();
      localStorage.setItem(
        'sd_signup_v1',
        JSON.stringify(
          state === 'subscribed'
            ? { subscribedAt: timestamp }
            : { dismissedAt: timestamp - (state === 'expired dismissal' ? 15 * 864e5 : 0) },
        ),
      );
    }, state);
    await visit(page, '/');
    await scrollToRatio(page, 0.45);
    if (state === 'expired dismissal') await expect(dialog(page)).toBeVisible();
    else {
      await expect(dialog(page)).toBeHidden();
      await trigger(page).click();
      await expect(dialog(page)).toBeVisible();
    }
  });
}

test('QA override forces the popup for a subscriber on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem('sd_signup_v1', JSON.stringify({ subscribedAt: Date.now() })),
  );
  await visit(page, '/?sd_popup=1');
  await expect(dialog(page)).toBeVisible();
});

test('mobile waits for 40% scroll and presents a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/');
  await page.clock.fastForward(1700);
  await expect(dialog(page)).toBeHidden();
  await page.evaluate(() =>
    window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.45),
  );
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close sign-up' })).toBeFocused();
  const box = await dialog(page).boundingBox();
  expect(box.width).toBe(390);
  expect(box.height).toBeLessThanOrEqual(844 * 0.88 + 1);
  await expect
    .poll(async () => {
      const box = await dialog(page).boundingBox();
      return Math.round(box.y + box.height);
    })
    .toBe(844);
});

test('desktop also waits for 40% scroll, with no timed opening', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await visit(page, '/');
  await page.clock.fastForward(60000);
  await expect(dialog(page)).toBeHidden();
  await scrollToRatio(page, 0.39);
  await expect(dialog(page)).toBeHidden();
  await scrollToRatio(page, 0.41);
  await expect(dialog(page)).toBeVisible();
});

test('an automatic opening counts once per visit, even across a reload without closing', async ({
  page,
}) => {
  await visit(page, '/');
  await scrollToRatio(page, 0.45);
  await expect(dialog(page)).toBeVisible();
  // Leaving without closing records no dismissal, but the same visit must not see it again.
  await page.reload();
  await page.evaluate(() => window.SDSignup.init({ demo: true }));
  expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBeNull();
  await scrollToRatio(page, 0.1);
  await scrollToRatio(page, 0.9);
  await expect(dialog(page)).toBeHidden();
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
});

test('a new visit shows the popup again when nothing was dismissed', async ({ page, context }) => {
  await visit(page, '/');
  await scrollToRatio(page, 0.45);
  await expect(dialog(page)).toBeVisible();
  // A new tab has its own session, standing in for a later visit.
  const later = await context.newPage();
  await visit(later, '/');
  await scrollToRatio(later, 0.45);
  await expect(dialog(later)).toBeVisible();
  await later.close();
});

for (const status of [201, 409, 422, 429, 500]) {
  test(`API response ${status} follows the handoff contract`, async ({ page }) => {
    let payload;
    await page.route('**/api/newsletter/subscribe', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status, contentType: 'application/json', body: '{}' });
    });
    await visit(page, '/?sd_popup=0');
    await page.evaluate(() => window.SDSignup.init({ endpoint: '/api/newsletter/subscribe' }));
    await trigger(page).click();
    await page.getByLabel('Email address').fill(email);
    await submit(page).click();
    if ([201, 409].includes(status)) {
      await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
      await expect(page.locator('[data-success-live]')).toHaveText(
        'If your address still needs confirmation, look for a link in your inbox or spam folder. Once confirmed, you’ll receive the Sunday letter.',
      );
      expect(
        JSON.parse(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).subscribedAt,
      ).toBeGreaterThan(0);
    } else {
      await expect(page.getByRole('alert')).toContainText(
        status === 422
          ? 'wasn’t accepted'
          : status === 429
            ? 'Too many requests'
            : 'Something went wrong',
      );
      await expect(page.getByLabel('Email address')).toHaveValue(email);
      await expect(submit(page)).toBeEnabled();
      expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBeNull();
    }
    expect(payload).toEqual({ email, source: 'homepage-popup', page: '/' });
  });
}

test('offline error keeps the form ready for retry', async ({ page, context }) => {
  await visit(page, '/?sd_popup=0');
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await context.setOffline(true);
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('You appear to be offline.');
  await expect(submit(page)).toBeEnabled();
});

test('network failures let the reader retry', async ({ page }) => {
  await page.route('**/api/newsletter/subscribe', (route) => route.abort());
  await visit(page, '/?sd_popup=0');
  await page.evaluate(() => window.SDSignup.init({ endpoint: '/api/newsletter/subscribe' }));
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
  await expect(submit(page)).toBeEnabled();
});

for (const state of ['blocked', 'null', 'invalid JSON']) {
  test(`signup tolerates ${state} storage`, async ({ page }) => {
    await page.addInitScript((state) => {
      if (state === 'blocked')
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('Blocked');
          },
        });
      else localStorage.setItem('sd_signup_v1', state === 'null' ? 'null' : '{');
    }, state);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visit(page, '/?sd_popup=0');
    await trigger(page).click();
    await page.getByLabel('Email address').fill(email);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('close/reopen cancels the old exit and preserves pre-existing inert state', async ({
  page,
}) => {
  await visit(page, '/?sd_popup=0');
  await page.locator('main').evaluate((element) => {
    element.inert = true;
  });
  await trigger(page).click();
  await page.evaluate(() => {
    window.SDSignup.close();
    window.SDSignup.open();
  });
  await page.clock.fastForward(400);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/sd-scroll-lock/);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await expect(page.locator('body')).not.toHaveClass(/sd-scroll-lock/);
});

test('finishing signup after dismissal does not steal focus', async ({ page }) => {
  await visit(page, '/?sd_popup=0');
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.clock.fastForward(800);
  await expect(trigger(page)).toBeFocused();
  await expect(dialog(page)).toBeHidden();
});

test('reinitializing during submission restores a usable form and ignores the old result', async ({
  page,
}) => {
  await visit(page, '/?sd_popup=0');
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await page.evaluate(() => window.SDSignup.init({ demo: true }));
  await trigger(page).click();
  await expect(submit(page)).toBeEnabled();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false');
  // Let the former demo request complete; it must not update the new controller.
  await page.clock.fastForward(800);
  await expect(dialog(page)).toHaveAccessibleName('Join the Inner Circle');
  expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBeNull();
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
});

test('reinitializing after success resets view, labels and keyboard focus', async ({ page }) => {
  await visit(page, '/?sd_popup=0');
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
  await page.evaluate(() => window.SDSignup.init({ demo: true }));
  await trigger(page).click();
  await expect(dialog(page)).toHaveAccessibleName('Join the Inner Circle');
  await expect(page.getByLabel('Email address')).toBeFocused();
  await expect(page.locator('[data-view="success"]')).toBeHidden();
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
});

test('reduced-motion dismissal immediately restores focus and scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visit(page, '/?sd_popup=0');
  await trigger(page).click();
  await expect(page.getByLabel('Email address')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator('body')).not.toHaveClass(/sd-scroll-lock/);
});

for (const [name, contentType, body] of [
  ['HTML fallback', 'text/html', '<!doctype html><p>Fallback</p>'],
  ['malformed JSON', 'application/json', '{'],
  ['JSON null', 'application/json', 'null'],
  ['JSON array', 'application/json', '[]'],
  ['JSON scalar', 'application/json', 'true'],
  ['empty response', 'application/json', ''],
]) {
  test(`${name} cannot confirm a subscription`, async ({ page }) => {
    await page.route('**/api/subscribe', (route) =>
      route.fulfill({ status: 200, contentType, body }),
    );
    await visit(page, '/?sd_popup=0', { endpoint: '/api/subscribe' });
    await trigger(page).click();
    await page.getByLabel('Email address').fill(email);
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Something went wrong');
    await expect(submit(page)).toBeEnabled();
    await expect(page.getByLabel('Email address')).toHaveValue(email);
    await expect(page.getByLabel('Email address')).not.toHaveAttribute('aria-invalid');
    expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBeNull();
  });
}

test('redirected API responses cannot confirm a subscription', async ({ page }) => {
  await page.route('**/api/subscribe', (route) =>
    route.fulfill({ status: 302, headers: { location: '/inner-circle/' } }),
  );
  await visit(page, '/?sd_popup=0', { endpoint: '/api/subscribe' });
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
  await expect(submit(page)).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('sd_signup_v1'))).toBeNull();
});

test('a 409 response needs no body and remains indistinguishable from success', async ({
  page,
}) => {
  await page.route('**/api/subscribe', (route) => route.fulfill({ status: 409, body: '' }));
  await visit(page, '/?sd_popup=0', { endpoint: '/api/subscribe' });
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeFocused();
});

test('a stalled request times out and a retry can succeed', async ({ page }) => {
  const attempts = [];
  const pending = [];
  await page.route('**/api/subscribe', (route) => {
    attempts.push(route.request().postDataJSON().email);
    if (attempts.length === 1) {
      pending.push(route);
      return;
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json; charset=utf-8',
      body: '{}',
    });
  });
  await visit(page, '/?sd_popup=0', { endpoint: '/api/subscribe' });
  await trigger(page).click();
  await page.getByLabel('Email address').fill(email);
  const started = page.waitForRequest('**/api/subscribe');
  await submit(page).click();
  await started;
  await page.clock.fastForward(15001);
  await expect(page.getByRole('alert')).toHaveText('The request took too long. Please try again.');
  await expect(submit(page)).toBeEnabled();
  await expect(page.getByLabel('Email address')).toHaveValue(email);
  await pending[0].abort().catch(() => {});
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeFocused();
  expect(attempts).toEqual([email, email]);
});

test('resizing between breakpoints keeps the scroll trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.fastForward(5000);
  await expect(dialog(page)).toBeHidden();
  await scrollToRatio(page, 0.45);
  await expect(dialog(page)).toBeVisible();
});

for (const key of ['subscribedAt', 'dismissedAt']) {
  test(`pending automatic opening rechecks ${key}`, async ({ page }) => {
    await visit(page, '/');
    await page.evaluate(
      (key) => localStorage.setItem('sd_signup_v1', JSON.stringify({ [key]: Date.now() })),
      key,
    );
    await scrollToRatio(page, 0.45);
    await expect(dialog(page)).toBeHidden();
    await trigger(page).click();
    await expect(dialog(page)).toBeVisible();
  });

  test(`another tab's ${key} cancels pending automatic opening`, async ({ page, context }) => {
    await visit(page, '/');
    await page.evaluate(() => {
      window.signupStorageEvents = 0;
      window.addEventListener('storage', () => {
        window.signupStorageEvents++;
      });
    });
    const other = await context.newPage();
    await other.goto('/inner-circle/');
    await other.evaluate(
      (key) => localStorage.setItem('sd_signup_v1', JSON.stringify({ [key]: Date.now() })),
      key,
    );
    await expect.poll(() => page.evaluate(() => window.signupStorageEvents)).toBeGreaterThan(0);
    await scrollToRatio(page, 0.45);
    await expect(dialog(page)).toBeHidden();
    await trigger(page).click();
    await expect(dialog(page)).toBeVisible();
    await other.close();
  });
}

test('scrolling does not reopen a popup already dismissed in this visit, even with storage cleared', async ({
  page,
}) => {
  await visit(page, '/');
  await trigger(page).click();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await scrollToRatio(page, 0.45);
  await expect(dialog(page)).toBeHidden();
});

for (const path of ['/', '/inner-circle/']) {
  test(`${path} loads its fonts locally with no external requests`, async ({ page }) => {
    const external = [];
    const failedFonts = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') external.push(request.url());
    });
    page.on('response', (response) => {
      if (response.request().resourceType() === 'font' && !response.ok())
        failedFonts.push(response.url());
    });
    // A disconnected third party must have no effect on the page's typography.
    await page.route('https://**/*', (route) => route.abort());
    await visit(page, `${path}?sd_popup=0`);
    const fonts = await page.evaluate(async () => {
      const faces = [...document.fonts];
      await Promise.all(faces.map((face) => face.load()));
      return faces.map((face) => face.status);
    });
    expect(fonts).toHaveLength(9);
    expect(fonts.every((status) => status === 'loaded')).toBe(true);
    expect(failedFonts).toEqual([]);
    expect(external).toEqual([]);
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(2);
    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => link.href));
    expect(preloads.every((url) => url.includes('/assets/') && url.endsWith('.woff2'))).toBe(true);
    const duplicateLoads = await page.evaluate(() => {
      const names = performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('.woff2'))
        .map((entry) => entry.name);
      return names.length !== new Set(names).size;
    });
    expect(duplicateLoads).toBe(false);
  });
}

test('standalone signup uses the same form without a modal or inert background', async ({
  page,
}) => {
  await visit(page, '/inner-circle/');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Join the Inner Circle' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeFocused();
  await expect(page.locator('[inert]')).toHaveCount(0);
});

test('subscribe links reach the dedicated page without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await trigger(page).click();
  await expect(page).toHaveURL(/\/inner-circle\/$/);
  await expect(page.locator('.sd-noscript')).toBeVisible();
  await expect(page.locator('.sd-noscript')).toContainText(
    'Enable JavaScript to use this sign-up form.',
  );
  await context.close();
});

for (const [width, columns] of [
  [320, 1],
  [390, 1],
  [420, 2],
  [768, 3],
  [900, 3],
  [960, 3],
  [1200, 5],
  [1440, 5],
  [1920, 5],
]) {
  test(`layout at ${width}px fits the viewport with ${columns} catalog columns`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visit(page, '/?sd_popup=0');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A little more discipline. A lot less guesswork.',
    );
    await expect(page.locator('.sd-sectionnav li')).toHaveCount(5);
    await expect(page.locator('.sd-card')).toHaveCount(5);
    await page.evaluate(() => {
      for (const image of document.images) image.loading = 'eager';
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.images].every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      .toBe(true);
    const dimensions = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
      columns: getComputedStyle(
        document.querySelector('.sd-catalog__grid'),
      ).gridTemplateColumns.split(' ').length,
    }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.columns).toBe(columns);
    expect(errors).toEqual([]);
  });
}

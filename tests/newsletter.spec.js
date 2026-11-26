import { expect, test } from '@playwright/test';
import { createNewsletterFixture } from '../scripts/newsletter-fixture.mjs';

const endpoint = '/api/newsletter/subscribe';

test('both signup entry points reach the Worker with the correct attribution', async ({ page }) => {
  const { runtime, contacts, migrate } = createNewsletterFixture();
  try {
    await migrate();
    await page.route(`**${endpoint}`, async (route) => {
      const request = route.request();
      const response = await runtime.dispatchFetch(request.url(), {
        method: request.method(),
        headers: { ...request.headers(), 'CF-Connecting-IP': '192.0.2.1' },
        body: request.postData(),
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    for (const [path, email, source] of [
      ['/?sd_popup=0&sd_intro=0', 'popup@example.test', 'homepage-popup'],
      ['/inner-circle/', 'standalone@example.test', 'inner-circle-page'],
      ['/inner-circle/index.html', 'alias@example.test', 'inner-circle-page'],
    ]) {
      await page.goto(path);
      await page.evaluate((url) => window.SDSignup.init({ endpoint: url }), endpoint);
      if (source === 'homepage-popup')
        await page
          .locator('.sd-announce')
          .getByRole('link', { name: 'Inner Circle newsletter' })
          .click();
      await page.getByLabel('Email address').fill(email);
      await page.getByRole('button', { name: 'Request entry' }).click();
      await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeFocused();
      expect(contacts.get(email)).toMatchObject({
        status: 'pending',
        merge_fields: { SDSOURCE: source, SDCONSENT: 'inner-circle-v1' },
      });
    }
  } finally {
    await runtime.dispose();
  }
});

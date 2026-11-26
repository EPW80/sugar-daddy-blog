import { expect, test } from '@playwright/test';

const overlay = (page) => page.locator('#sd-intro');
const skipButton = (page) => page.getByRole('button', { name: 'Skip intro' });
const dialog = (page) => page.getByRole('dialog');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.introCompletions = 0;
    document.addEventListener('sd:intro-done', () => window.introCompletions++);
  });
});

test('plays once, completes naturally, and supports forced replay', async ({ page }) => {
  await page.addInitScript(() => {
    window.introAnimationEnded = false;
    document.addEventListener('animationend', (event) => {
      if (event.animationName === 'sdi-done') window.introAnimationEnded = true;
    });
  });
  await page.route(
    '**/assets/home-*.css',
    async (route) => {
      // A late stylesheet should still get the complete timeline.
      await new Promise((resolve) => setTimeout(resolve, 650));
      await route.continue();
    },
    { times: 1 },
  );
  await page.goto('/');
  await expect(overlay(page)).toBeVisible();
  await expect(page.locator('#sd-intro-page')).toHaveAttribute('inert', '');
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
  await page.evaluate(() => window.SDIntro.done);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('[inert]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/sd-intro-reveal/);
  expect(
    await page.evaluate(() => [
      window.SDIntro.playing,
      window.introCompletions,
      window.introAnimationEnded,
    ]),
  ).toEqual([false, 1, true]);

  await page.reload();
  await expect(overlay(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.introCompletions)).toBe(1);

  await page.goto('/?sd_intro=1');
  await expect(overlay(page)).toBeVisible();
  await page.evaluate(() => window.SDIntro.skip());
  await expect(overlay(page)).toHaveCount(0);
});

test('bypass and section links leave first play available', async ({ page }) => {
  await page.goto('/?sd_intro=0');
  await expect(overlay(page)).toHaveCount(0);
  await page.goto('/#sd-catalog-title');
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('#sd-catalog-title')).toBeInViewport();
  expect(await page.evaluate(() => sessionStorage.getItem('sd_intro_seen'))).toBeNull();
  await page.goto('/?sd_intro=1#sd-catalog-title');
  await expect(overlay(page)).toBeVisible();
});

test('reduced motion takes precedence over replay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?sd_intro=1');
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('[inert]')).toHaveCount(0);
  expect(
    await page.evaluate(() => [window.SDIntro.playing, sessionStorage.getItem('sd_intro_seen')]),
  ).toEqual([false, null]);
});

test.describe('touch intro skip', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('the first frame has a visible, tappable skip button', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(overlay(page)).toBeVisible();
    await expect(skipButton(page)).toHaveCSS('opacity', '1');
    expect(await skipButton(page).evaluate((button) => button.getAnimations().length)).toBe(0);
    await skipButton(page).tap();
    await expect(overlay(page)).toHaveCount(0);
    await expect(page.locator('#main')).toBeFocused();
  });
});

for (const key of ['Enter', 'Space', 'Escape']) {
  test(`skips with ${key} and focuses the main content`, async ({ page }) => {
    await page.goto('/');
    if (key !== 'Escape') {
      await page.keyboard.press('Tab');
      await expect(skipButton(page)).toBeFocused();
      await expect(skipButton(page)).toHaveCSS('opacity', '1');
    }
    await page.keyboard.press(key);
    await expect(overlay(page)).toHaveCount(0);
    await expect(page.locator('#main')).toBeFocused();
    await expect(page.locator('[inert]')).toHaveCount(0);
    expect(await page.evaluate(() => window.introCompletions)).toBe(1);
  });
}

test('watchdog releases the page without the app bundle or animation completion', async ({
  page,
}) => {
  await page.route('**/*.js', (route) => route.abort());
  await page.goto('/');
  await expect(overlay(page)).toBeVisible();
  await overlay(page).evaluate((root) => {
    root.style.animation = 'none';
  });
  await expect(overlay(page)).toHaveCount(0, { timeout: 5500 });
  await expect(page.locator('[inert]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => [window.SDIntro.playing, window.introCompletions])).toEqual([
    false,
    1,
  ]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the homepage is ready immediately and the skip link works', async ({ page }) => {
    await page.goto('/');
    await expect(overlay(page)).toBeHidden();
    await expect(page.locator('[inert]')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });
});

test('forced signup opens only after the intro releases its locks', async ({ page }) => {
  await page.goto('/?sd_popup=1');
  await expect(overlay(page)).toBeVisible();
  await expect(dialog(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Close sign-up' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('[inert]')).toHaveCount(0);
});

test('programmatic opens wait for completion and use only the current signup controller', async ({
  page,
}) => {
  await page.goto('/?sd_popup=0');
  await page.evaluate(() => {
    window.SDSignup.open();
    window.SDSignup.init({ demo: true });
    window.SDSignup.open();
  });
  await expect(dialog(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Email address')).toBeEnabled();
  await expect(dialog(page)).toHaveCount(1);
});

test('the normal scroll trigger works after the intro', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.SDSignup.init({ demo: true }));
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toHaveCount(0);
  await expect(dialog(page)).toBeHidden();
  await page.evaluate(() =>
    scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.41),
  );
  await expect(dialog(page)).toBeVisible();
});

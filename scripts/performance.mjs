import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

// An isolated, configured build measures readiness without enabling demo or altering dist/.
process.env.VITE_SIGNUP_ENDPOINT = '/api/newsletter/subscribe';
process.env.VITE_SIGNUP_DEMO = 'false';
const artifacts = resolve('performance-artifacts');
const outDir = resolve(artifacts, 'site');
await mkdir(artifacts, { recursive: true });
await build({ build: { outDir } });
const server = await preview({
  build: { outDir },
  preview: { host: '127.0.0.1', port: 4180, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch();
  const report = {
    measuredAt: new Date().toISOString(),
    browser: browser.version(),
    profile: {
      viewport: '390×844',
      cpuSlowdown: 4,
      latencyMs: 150,
      downloadBytesPerSecond: 200000,
      uploadBytesPerSecond: 93750,
      cache: 'disabled',
      endpoint: 'configured; no submissions',
    },
    pages: [],
  };
  for (const [name, path, skipMethod] of [
    ['home', '/?sd_intro=0'],
    ['signup', '/inner-circle/'],
    ['intro', '/'],
    ['intro-tap', '/', 'tap'],
    ['intro-escape', '/', 'escape'],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200000,
      uploadThroughput: 93750,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.sdPerformance = {
        lcpMs: null,
        shifts: [],
        signupReadyMs: null,
        openToFocusMs: null,
        introReadyMs: null,
        introSkipToUnlockMs: null,
        introSkipFocusedMain: null,
      };
      let skipAt;
      document.addEventListener(
        'click',
        (event) => {
          if (event.target.closest('.sdi-skip')) skipAt ??= performance.now();
        },
        true,
      );
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Escape' && window.SDIntro?.playing) skipAt ??= performance.now();
        },
        true,
      );
      document.addEventListener(
        'sd:intro-done',
        () => {
          const now = performance.now();
          window.sdPerformance.introReadyMs = now;
          if (skipAt != null) {
            window.sdPerformance.introSkipToUnlockMs = now - skipAt;
            window.sdPerformance.introSkipFocusedMain = document.activeElement?.id === 'main';
          }
        },
        { once: true },
      );
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.sdPerformance.lcpMs = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput)
            window.sdPerformance.shifts.push({ time: entry.startTime, value: entry.value });
        }
      }).observe({ type: 'layout-shift', buffered: true });
      const observer = new MutationObserver(() => {
        const root = document.querySelector('#sd-signup');
        if (root?.dataset.signupReady === 'true' && !root.querySelector('fieldset').disabled) {
          window.sdPerformance.signupReadyMs ??= performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true, attributes: true });
      let openAt;
      document.addEventListener(
        'click',
        (event) => {
          if (event.target.closest('[data-sd-signup-open]')) openAt = performance.now();
        },
        true,
      );
      document.addEventListener('focusin', (event) => {
        if (openAt != null && event.target.id === 'sd-signup-email')
          window.sdPerformance.openToFocusMs = performance.now() - openAt;
      });
    });
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,loading,blink.user_timing',
      transferMode: 'ReturnAsStream',
    });
    const url = new URL(path, server.resolvedUrls.local[0]);
    url.searchParams.set('sd_popup', '0');
    await page.goto(url.href, { waitUntil: skipMethod ? 'domcontentloaded' : 'load' });
    if (skipMethod) {
      const skipButton = page.getByRole('button', { name: 'Skip intro' });
      await skipButton.waitFor();
      if (skipMethod === 'tap') await skipButton.tap();
      else await page.keyboard.press('Escape');
    }
    if (name === 'intro' || skipMethod) await page.evaluate(() => window.SDIntro.done);
    await page.evaluate(() => document.fonts.ready);
    // Allow late font swaps and layout shifts to settle before interaction ends LCP observation.
    await page.waitForTimeout(2500);
    const measurement = await page.evaluate(() => {
      const fonts = performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname.endsWith('.woff2'));
      let cls = 0,
        session = 0,
        start = 0,
        previous = 0;
      for (const shift of window.sdPerformance.shifts) {
        if (shift.time - previous > 1000 || shift.time - start > 5000) {
          session = 0;
          start = shift.time;
        }
        session += shift.value;
        previous = shift.time;
        cls = Math.max(cls, session);
      }
      return {
        lcpMs: window.sdPerformance.lcpMs,
        cls,
        signupReadyMs: window.sdPerformance.signupReadyMs,
        fontRequests: fonts.length,
        fontEncodedBytes: fonts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        fontTransferBytes: fonts.reduce((sum, entry) => sum + entry.transferSize, 0),
        fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      };
    });
    if (name === 'intro') {
      measurement.introReadyMs = await page.evaluate(() => window.sdPerformance.introReadyMs);
    }
    if (skipMethod) {
      const { introSkipToUnlockMs, introSkipFocusedMain } = await page.evaluate(
        () => window.sdPerformance,
      );
      Object.assign(measurement, { introSkipToUnlockMs, introSkipFocusedMain });
    }
    // Capture complete artwork after taking viewport metrics, without changing the baseline.
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((image) => {
          image.loading = 'eager';
          return image.decode();
        }),
      );
    });
    await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
    if (name === 'home') {
      await page
        .locator('.sd-announce')
        .getByRole('link', { name: 'Inner Circle newsletter' })
        .click();
      await page.waitForFunction(
        () => document.activeElement?.id === 'sd-signup-email' && !document.activeElement.disabled,
      );
      measurement.openToFocusMs = await page.evaluate(() => window.sdPerformance.openToFocusMs);
      await page
        .locator('#sd-signup')
        .evaluate((root) =>
          Promise.all(root.getAnimations({ subtree: true }).map((animation) => animation.finished)),
        );
      await page.screenshot({ path: resolve(artifacts, 'mobile-modal.png') });
    }
    const traceComplete = new Promise((resolveTrace) =>
      cdp.once('Tracing.tracingComplete', resolveTrace),
    );
    await cdp.send('Tracing.end');
    const { stream } = await traceComplete;
    const chunks = [];
    let eof = false;
    while (!eof) {
      const chunk = await cdp.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
      eof = chunk.eof;
    }
    await cdp.send('IO.close', { handle: stream });
    await writeFile(resolve(artifacts, `${name}-trace.json`), Buffer.concat(chunks));
    report.pages.push({ name, path, ...measurement, errors });
    console.log(JSON.stringify(report.pages.at(-1)));
    await context.close();
  }
  await writeFile(resolve(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser?.close();
  await new Promise((resolveClose, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolveClose())),
  );
}

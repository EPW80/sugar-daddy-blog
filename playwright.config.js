import { defineConfig, devices } from '@playwright/test';

const testSite = 'node_modules/.cache/sugar-daddy-playwright';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit-smoke',
      testMatch: ['**/flows.spec.js', '**/intro.spec.js'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: `npm run build -- --outDir ${testSite} && npm run preview -- --outDir ${testSite} --port 4173 --strictPort`,
    env: { VITE_SIGNUP_ENDPOINT: '', VITE_SIGNUP_DEMO: 'false', SD_EDITORIAL_MODE: 'preview' },
    wait: { stdout: /Local:\s+http:\/\/127\.0\.0\.1:4173\// },
  },
});

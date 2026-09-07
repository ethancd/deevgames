import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: process.env.MUJU_BASE_URL ?? 'http://127.0.0.1:8927/muju/',
    browserName: process.env.PLAYWRIGHT_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    channel: process.env.PLAYWRIGHT_BROWSER === 'webkit' ? undefined : process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : 'chrome'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

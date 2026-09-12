import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['online.spec.ts', 'pass-play.spec.ts', 'player-side.spec.ts', 'action-budget.spec.ts'],
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:8928/muju/',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx server/index.ts',
    url: 'http://127.0.0.1:8928/api/muju/health',
    env: { PORT: '8928', HOST: '127.0.0.1', PUBLIC_URL: 'http://127.0.0.1:8928', MUJU_DB_PATH: ':memory:' },
    reuseExistingServer: false,
  },
});

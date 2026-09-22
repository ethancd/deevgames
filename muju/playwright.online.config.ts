import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // `ai-worker`, `phasing-ai` and `ai-timer` run here too (2026-09-21): the
  // cutover must not ship with no browser coverage of the AI path, and this is
  // the only config CI runs. They need no room — they play against the served
  // `dist` build in local storage — but they are the slowest cases here.
  testMatch: ['room-lifecycle.spec.ts', 'sounds.spec.ts', 'phone-playback.spec.ts', 'phasing.spec.ts', 'crystal-handicap.spec.ts', 'online.spec.ts', 'lobby.spec.ts', 'pass-play.spec.ts', 'player-side.spec.ts', 'action-budget.spec.ts', 'replay.spec.ts', 'upkeep.spec.ts', 'home-checkmate.spec.ts', 'painter.spec.ts', 'history.spec.ts', 'analysis.spec.ts', 'ai-worker.spec.ts', 'phasing-ai.spec.ts', 'ai-timer.spec.ts'],
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:8928/muju/',
    browserName: process.env.PLAYWRIGHT_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    channel: process.env.PLAYWRIGHT_BROWSER === 'webkit' || process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx server/index.ts',
    url: 'http://127.0.0.1:8928/api/muju/health',
    env: { PORT: '8928', HOST: '127.0.0.1', PUBLIC_URL: 'http://127.0.0.1:8928', MUJU_DB_PATH: ':memory:' },
    reuseExistingServer: false,
  },
});

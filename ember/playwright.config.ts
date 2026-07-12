import { defineConfig, devices } from '@playwright/test';

/**
 * EMBER — Playwright config (playwright.config.ts).
 *
 * Mirrors this repo's standard Playwright conventions (see e.g.
 * ../oracle/playwright.config.ts), adapted for EMBER: port 3003 (per
 * vite.config.ts), `npm run dev` as the web server, and only the
 * `chromium` project — the sandbox only guarantees Chromium is
 * preinstalled (PLAYWRIGHT_BROWSERS_PATH is set for it; firefox/webkit are
 * not installed here and `playwright install` must not be run per the task
 * brief).
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. vite.config.ts
     * sets `base: '/ember/'`, so the dev server serves the app under that
     * path (not '/') — confirmed empirically: `npm run dev` on :3003
     * redirects '/' (302) and serves 200 at '/ember/'. */
    baseURL: 'http://localhost:3003/ember/',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers. Only chromium — the only browser
   * this sandbox has preinstalled. */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // This sandbox's preinstalled browser cache
        // (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers) is pinned to an older
        // Chromium revision than the installed @playwright/test version
        // resolves by default (both the default headless-shell build AND
        // `channel: 'chromium'` 404 looking for a newer revision folder that
        // isn't there) — `playwright install` must not be run per the task
        // brief, so pin executablePath straight at the revision that IS
        // actually present instead of relying on revision auto-resolution.
        launchOptions: {
          executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        },
      },
    },
  ],

  /* Run the Vite dev server before starting the tests. */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3003/ember/',
    reuseExistingServer: !process.env.CI,
  },
});

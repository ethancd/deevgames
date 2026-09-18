import { defineConfig, devices } from '@playwright/test';

/**
 * DESIGN §6/M3: e2e coverage for the whole-turn worker path (protocol 3) and,
 * from M15 on, the hard engine's exposure. `--project=desktop` is the M3 gate
 * row; M15's gate row runs both projects (no `--project`).
 *
 * `webServer.command` builds before it previews (`npx vite build && npm run
 * preview -- --port 8927`) rather than the literal "vite preview --port 8927"
 * MILESTONES.md's prose gives, so this config is a single self-sufficient
 * command on a clean checkout — see DEVIATIONS.md under M3. Deliberately
 * `npx vite build`, not `npm run build`/`tsc && vite build`: this worktree is
 * shared with concurrent milestone agents, and `npm run build`'s `prebuild`
 * hook rebuilds the shared `src/ai/wasm/tactics.wasm` (`npm run ai:wasm`) —
 * exactly the WASM-recompile race the worktree rules ban `npm test` for.
 * `npx vite build` bundles against whatever `tactics.wasm` already exists on
 * disk without touching it, and skips the whole-project `tsc` pass too
 * (redundant with this milestone's own separate `tsc --noEmit` check, and
 * itself exposed to transient errors from other agents' concurrent edits).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['hard-ai.spec.ts'],
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:8927/muju/',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npx vite build && npm run preview -- --port 8927',
    url: 'http://127.0.0.1:8927/muju/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

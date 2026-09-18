import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // E0.5 (docs/hard-ai/e0/E0.5-RESOURCE-PROBE.md). Vitest's implicit 5 s
    // default is what three engine tests tripped when a 12-shard ladder run
    // saturated this box (POSTMORTEM-2026-09-15 §6): a test that normally takes
    // 3 s has no headroom at all under load. 10 s is the explicit floor for
    // every test in the repo; each engine/search/harness file states its own
    // measured ceiling with `vi.setConfig({ testTimeout })` at the top.
    testTimeout: 10_000,
    // Hooks here build fixtures and instantiate the WASM kernel, so they get
    // the same floor rather than vitest's separate 10 s hook default by accident.
    hookTimeout: 10_000,
  },
})

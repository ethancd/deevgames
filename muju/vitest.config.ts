import { defineConfig, defaultExclude } from 'vitest/config'

/**
 * Phasing migration exclusions, restored individually after their ports pass.
 * M2-STATUS.md preserves the original quarantine evidence; M4-STATUS.md records
 * the generator/table/search restoration and its independent replay checks.
 *
 * Only the two historical P6/P8 experiments remain from the M4 group. Their
 * Standard snapshots, old catalogue and exact performance/output pins remain
 * unchanged. Active *-phasing.test.ts files separately exercise the current
 * stop/cap/telemetry, complete-turn, determinism and TT-suppression contracts.
 * These historical files are not current Phasing acceptance tests.
 *
 * Seven suites-phasing test files cover the new M5 implementation by default.
 * The six retained historical M5 harness files and M6 evaluation ports remain
 * explicitly listed below; their old evidence is not current acceptance.
 * MUJU_RUN_QUARANTINE=1 is for explicitly named files during those ports;
 * it must not be used to report an unqualified full-suite migration pass.
 */
const PHASING_QUARANTINE = [
  // Historical Standard experiments; current contracts have active Phasing tests.
  'tests/ai/hard/p6-stoppable-generation.test.ts',
  'tests/ai/hard/p8-rescue-cap.test.ts',

  // --- M5: the lab suites and the reference/bench harnesses ------------------
  'tests/lab/suites.test.ts',                   // suites/run over the engine (0 passing: the file failed to collect)
  'tests/lab/exam.test.ts',                     // exam over search/root + pvs (23 passing)
  'tests/lab/reference.test.ts',                // engine reference determinism (21 passing)
  'tests/lab/analyze.test.ts',                  // analyze/replay over search/root (10 passing)
  'tests/lab/profile.test.ts',                  // bench/profile over the whole stack (7 passing)
  'tests/lab/turn-allowance.test.ts',           // search/pvs turn allowance (21 passing)

  // --- M6: the evaluation (eval/**) and the tables that feed it --------------
  'tests/ai/hard/eval-correct.test.ts',         // eval/evaluate + features + invariants (15 passing)
  'tests/ai/hard/approach-tie.test.ts',         // tables/approach tie-break (0 passing)
  'tests/lab/eval-audit.test.ts',               // audit/eval-audit over eval weights (3 passing)
  'tests/lab/recall.test.ts',                   // recall over eval weights (5 passing)
]

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: [...defaultExclude, ...(process.env.MUJU_RUN_QUARANTINE ? [] : PHASING_QUARANTINE)],
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

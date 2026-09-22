import { defineConfig, defaultExclude } from 'vitest/config'

/**
 * Phasing migration exclusions, restored individually after their ports pass.
 * M2-STATUS.md preserves the original quarantine evidence; M4-STATUS.md records
 * the generator/table/search restoration and its independent replay checks.
 *
 * MUJU_RUN_QUARANTINE=1 runs the named files during a port. It must never be
 * used to report an unqualified full-suite migration pass.
 *
 * WHAT THIS LIST IS FOR, AND WHAT IT IS NOT. Every entry is a file whose
 * expectations were written against Standard and have not yet been ported to
 * the canonical Phasing engine. It is not a list of tests that may be deleted:
 * a port moves an expectation onto the current oracle, it never drops one. Each
 * entry below therefore carries THREE things — why it still fails, the
 * milestone that owns the port, and its measured failure count, so a reader can
 * tell a one-line fix from a real piece of work without running anything.
 *
 * Counts measured 2026-09-19 with MUJU_RUN_QUARANTINE=1 on this tree. Nothing
 * here was restorable by the green-suite lane: every remaining failure is an
 * expectation owned by the generator/search, suites or evaluation milestones,
 * or (recall) is blocked on a tuned Phasing weight vector that does not exist
 * yet. The lane did migrate the weight LABELS inside the two files that named
 * `default-v1`, so no entry carries a stale reason on top of its real one.
 */
const PHASING_QUARANTINE = [
  // --- Historical Standard experiments (M4 group) ---------------------------
  // Frozen Standard snapshots, the old catalogue and exact performance/output
  // pins. These are HISTORICAL RECORDS, not current acceptance tests: the
  // active *-phasing.test.ts files carry the current stop/cap/telemetry,
  // complete-turn, determinism and TT-suppression contracts. A port would have
  // to re-measure the pins on Phasing positions, which makes them new
  // experiments rather than restorations. OWNER: none — retain as evidence.
  'tests/ai/hard/p6-stoppable-generation.test.ts',  // 4/5 fail: Standard position pins
  'tests/ai/hard/p8-rescue-cap.test.ts',            // 4/5 fail: Standard rung/output pins

  // --- M5: the lab suites and the reference/bench harnesses ------------------
  // suites/run: the file does not even COLLECT — its fixture imports a Standard
  // catalogue and the first pack throws `PackError: ruleset "standard" is not
  // "phasing"`. Needs Phasing suite fixtures. OWNER: M5 (lab/hard-ai/suites).
  'tests/lab/suites.test.ts',                   // collection error (0 of 0 run)
  // exam over search/root + pvs: Standard exam positions and per-position pins.
  // OWNER: M5.
  'tests/lab/exam.test.ts',                     // 8/31 fail
  // engine reference determinism: Standard reference artifacts. OWNER: M5.
  'tests/lab/reference.test.ts',                // 6/26 fail
  // analyze/replay over search/root: the replica refuses a reconstructed
  // Standard position, and the played-in-K-list check fails on the Phasing
  // generator. OWNER: M5 (analyze/replay; NOT the work-sweep path, which is
  // ported and green in tests/lab/analyze-work-sweep.test.ts).
  'tests/lab/analyze.test.ts',                  // 2/18 fail (6 skipped)
  // bench/profile over the whole stack: `completedIterations` is 0 at the
  // canonical initial position under the Phasing engine. OWNER: M5. Also the
  // slowest file here at ~51 s, so it is not a cheap restoration to attempt.
  'tests/lab/profile.test.ts',                  // 1/7 fail
  // bots/hard's wall allowance across a turn: written for the Standard
  // single-phase turn, so the place/action boundary and the substitute
  // phase-end action are now a different shape. Also pins `placeholder-m4`,
  // which is `placeholder-phasing` on this tree. OWNER: M4/M5 (bots/hard).
  'tests/lab/turn-allowance.test.ts',           // 4/24 fail

  // --- M6: the evaluation (eval/**) and the tables that feed it --------------
  // eval/evaluate + features + invariants: Standard feature expectations
  // against the 62-feature Phasing vector. OWNER: M6/M7 (eval).
  'tests/ai/hard/eval-correct.test.ts',         // 14/27 fail
  // tables/approach tie-break. OWNER: M6/M7 (tables).
  'tests/ai/hard/approach-tie.test.ts',         // 5/5 fail
  // audit/eval-audit over eval weights: antisymmetry over the old 58 features.
  // OWNER: M6/M7 (eval).
  'tests/lab/eval-audit.test.ts',               // 7/10 fail
  // recall over eval weights. The five label/identity tests PASS on this tree;
  // the two that remain measure a real recall column and both now read zero.
  // `lab/hard-ai/recall/fixtures.jsonl`'s single position carries no `ruleset`,
  // i.e. the retired Standard rules, and the Phasing-only replica refuses to
  // pack it (`src/ai/hard/core/state.ts`: `pack: ruleset "standard" is not
  // "phasing"`), which `recall/run.ts prepare()` turns into a skipped position.
  // Measured 2026-09-21 with MUJU_RUN_QUARANTINE=1: `base.positions === 0` and
  // `arm.positions === 0`, so the two cases compare two empty measurements
  // rather than two engines.
  // OWNER: whoever re-captures the recall corpus as Phasing positions. The note
  // that stood here blamed `A_A_WEIGHT_ARMS` — a list `tests/lab/ablate.test.ts`
  // emptied on 2026-09-20 when `phasing-hand-priors-v1` landed, and which no
  // longer exists anywhere in the tree.
  'tests/lab/recall.test.ts',                   // 2/7 fail (Standard-only corpus)
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

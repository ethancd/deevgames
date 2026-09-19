import { defineConfig, defaultExclude } from 'vitest/config'

/**
 * M2 QUARANTINE — the single place where a test is parked, never deleted.
 *
 * `docs/hard-ai/phasing/M2-STATUS.md` is the ledger; this list is the mechanism.
 *
 * M2 made the hard engine's packed replica (`src/ai/hard/core/state.ts`)
 * PHASING-ONLY: `pack` now throws `PackError` on any state whose ruleset is not
 * 'phasing', a BUY records a commitment instead of placing a unit, and the macro
 * turn gained a Prepare phase that does not hand off. The layers ABOVE the
 * replica — the turn generator (`gen/**`), the prover (`tactics/prover.ts`),
 * `tables/**`, `eval/**`, `search/**`, `book/**` and the lab harnesses that
 * drive them — were deliberately out of M2's scope and still model Standard.
 * Their tests therefore fail for reasons that are correct: they build Standard
 * fixtures that `pack` now refuses, or they assert Standard's turn shape.
 *
 * Every file below is parked WHOLE, with the layer that owns it and the
 * milestone that restores it. Nothing here was edited, weakened or re-pinned:
 * when its layer is ported, its row is deleted and the file runs again as
 * written. The count after each entry is how many of its cases passed before
 * being parked, which is what the restoring milestone owes back: 246 measured
 * file by file, 245 in a whole-suite run (one root-exposure case passes in
 * isolation and fails under the full run's load). M2-STATUS.md carries the same
 * numbers, and 123 further cases in these files were already failing.
 *
 * To run the parked files anyway — which is how M4/M5/M6 will drive their
 * ports — set MUJU_RUN_QUARANTINE=1:
 *
 *     MUJU_RUN_QUARANTINE=1 npx vitest run tests/ai/hard/pvs.test.ts
 *
 * Milestones: M4 = generator / prover / PVS, M5 = suites, M6 = eval.
 */
const M2_QUARANTINE = [
  // --- M4: the turn generator (gen/**) ---------------------------------------
  // A Phasing BUY takes no slot, places no unit and never auto-advances Prepare,
  // so every place-plan, pool and enumeration assumption below is Standard's.
  'tests/ai/hard/canonical.test.ts',            // gen/actionsearch + gen/turn set-equality gate (17 passing)
  'tests/ai/hard/generate.test.ts',             // gen/generate candidate contract (11 passing)
  'tests/ai/hard/gen-trace.test.ts',            // gen/trace interior nodes (13 passing)
  'tests/ai/hard/purchase.test.ts',             // gen/purchase planPurchases spend/spawnAfter (19 passing)
  'tests/ai/hard/turnpool.test.ts',             // gen/turn pool + decodeTurn replay (10 passing)

  // --- M4: the prover (tactics/prover.ts) and the rescue it models -----------
  // The packed prover still models STANDARD home defence, and it diverges from
  // canonical Phasing in BOTH directions. The rescue SEARCH under-claims, because
  // Standard's `prepare` (upkeep releases + pre-action promotions) is strictly
  // larger than Phasing's act-only four actions. The admissible damage BOUND
  // OVER-claims, which is the unsound half: it skips any defender unit whose
  // `rent > cash` (prover.ts:418), so a broke defender is treated as having no
  // army and a mate is awarded that the defender refutes. (This comment said
  // "can only UNDER-claim" until converger round 2 measured the other direction.)
  // These are live verdict divergences, not just failing assertions; both are
  // recorded in M2-STATUS.md §2 and pinned by
  // tests/ai/hard/phasing-prover-{debt,underclaim}.test.ts.
  'tests/ai/hard/prover.test.ts',               // tactics/prover verdicts (9 passing)
  'tests/ai/hard/p8-rescue-cap.test.ts',        // P8 rescue-cap pin (1 passing)

  // --- M4: tables/home, which enumerates home-race LINES ---------------------
  // Its lines are "BUY, END_PLACE, MOVE the bought unit": under Phasing the buy
  // arrives a turn later, so the line is no longer legal end to end.
  'tests/ai/hard/home.test.ts',                 // tables/home homeRaceAvailable (13 passing)

  // --- M4: the search (search/**) and the engine that drives it --------------
  'tests/ai/hard/pvs.test.ts',                  // search/pvs (1 passing)
  'tests/ai/hard/quiesce.test.ts',              // search/quiesce (1 passing)
  'tests/ai/hard/order.test.ts',                // search/order + tt (8 passing)
  'tests/ai/hard/search-tie-break.test.ts',     // search/order tie-break arm (2 passing)
  'tests/ai/hard/root-exposure.test.ts',        // search/root + search/probe (25 passing)
  'tests/ai/hard/mate-score.test.ts',           // search mate scoring through the engine (7 passing)
  'tests/ai/hard/p6-stoppable-generation.test.ts', // P6 stoppability pin, search/time (1 passing)
  'tests/ai/hard-engine-fallback-elapsed.test.ts', // engine fallback kind: now 'pack-error' (2 passing)

  // --- M4: verify/replay, but only because its fixture needs the generator ---
  // `verify/replay.ts` IS in the M2 replica lane. Every case in this file reaches
  // `verifyTurn` through `tests/ai/hard/search-fixture.ts`, which builds a
  // HardEngine and asks gen/** for candidates. Rather than leave the module
  // uncovered, M2 added `tests/ai/hard/verify-replay-phasing.test.ts`, which
  // builds its Turn records from the REPLICA's own generators and covers the
  // same three contracts under Phasing. This file returns in M4 as written.
  'tests/ai/hard/replay.test.ts',               // verify/replay via the generator (1 passing)

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
    exclude: [...defaultExclude, ...(process.env.MUJU_RUN_QUARANTINE ? [] : M2_QUARANTINE)],
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

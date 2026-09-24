# Hard purchase menu: every class reaches the evaluator (2026-09-23)

**What was wrong.** `src/ai/hard/gen/purchase.ts planPurchases` wrote plans in cheapest-first
enumeration order and stopped at `maxPlans` (12) before scoring. The 35-multiset enumeration cap fell in
the same order. At a bank of 12 or more, Hard's whole purchase menu was `fire_1 ×1..4`. Water, Plant,
Metal, Shadow and Lightning were never evaluated except at small banks. It also modeled its opponent as
buying only fire. The 2026-09-20 repair handoff flagged this (root cause 4). The R1b knob could not
fix it. The 2026-09-23 LLM-vs-Hard pilot showed the result: 669 of Hard's 700 purchases across 13 games
were `fire_1`.

**The fix** (`gen/purchase.ts`, `gen/generate.ts buildCombos`, `config.ts`):

- All 209 multisets (up to 4 bodies over six classes) are enumerated, each class ranks its own squares,
  and each multiset gets up to 3 greedy square assignments. Every plan is scored before the menu is
  cut to 32.
- Each affordable class's largest single-class buy is pinned. `buildCombos` keeps it unpruned, so
  the evaluator, not the mining-only ordering score, decides between classes. The best mixed plans and
  promotions fill the rest.
- Place-plan budgets are ×1.5 on every profile (desktop 24/12).
- The R1b knob is retired and no longer read. The lab place-plan arms were rebased to keep their ratios.

**Identity.** `hard@desktop`'s resolved-configuration hash moves
(`e8d36cc0…` → `5de7ae20…`; the old value is kept in `tests/lab/ablate.test.ts` as
`DESKTOP_WALL3000_HASH_FIRE_MENU`). Everything recorded before this change, including the LLM-vs-Hard
pilot, ran the fire-only menu.

**Verified.** `tsc` (src and lab/hard-ai), `tests/ai` (1,219 tests), `tests/lab/ablate.test.ts`. The
cold-calibration fixture was re-swept because depth 1 costs more once more classes are on the menu. See
`tests/ai/hard/calibrate-cold.test.ts`.

**Not run, on purpose** (owner instruction): no games, ladder rows, perft/fuzz/determinism gates or
strength measurement. Content DAG: `hard-ai` verified (types and tests); `wasm-tactics` unaffected
(no purchase logic in `assembly/`); `ai-strength` pending. Depth-1 search work on the calibration
fixture rose by about half (11.9k → 17.5k units). Budget-bound play will search somewhat shallower
per turn.

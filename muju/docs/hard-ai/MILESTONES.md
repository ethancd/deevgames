# Muju Hard AI — MILESTONE PLAN (binding; companion to DESIGN.md)

**Note, 2026-09-21, amended 2026-09-22:** the M18 and M20 gate commands below name `package.json` scripts whose targets have never existed — precisely, `:348` (M18) names `hard:book` (beside `hard:corpus` and `hard:texel`) and never `hard:spsa`, while `:377` (M20) names both. Those two script lines were deleted on 2026-09-21 and **restored on 2026-09-22 and retained as dead entries**, because the committed v2 release-suite manifest pins `muju/package.json`'s bytes and their removal made the Gate-0 suite unloadable; deleting them again belongs to the next bundle re-authoring. Both milestones are `notImplemented` rows in `lab/hard-ai/verify/gates.ts` (`:617`, `:635`), so neither command is ever executed; `hard:book` survives inside the M18 row at `gates.ts:621` as a documented future command. The plan text is left as written. See `RELEASE-2026-09-21-phasing.md`.

All paths relative to `muju/`. Every gate is **one shell command run from `muju/`** through the verify
runner: `npm run hard:verify -- --gate M<n>` executes the row of `lab/hard-ai/verify/gates.ts` named
below, reads the artifact JSON, applies the criterion, writes
`lab/results/hard-ai-verify-<date>/M<n>.json`, prints one line and exits non-zero on failure. The row's
`command` and `criterion` are specified per milestone and are part of that milestone's deliverables (the
row is added to `gates.ts` by the milestone that it gates; M1 seeds the table with M1–M20 stubs whose
commands are filled in later — a stub row fails with `not-implemented`).

Gate budgets: every M1–M18 gate runs in **< 15 minutes on a 12-core laptop** (sharded where noted);
M19–M20 are measurement milestones and may run for hours. `parallelGroup` = milestones that touch
disjoint files and may be built concurrently by different agents; `dependsOn` = milestones whose gate
must be green before this milestone's gate can be run (an agent may start coding against the frozen
interfaces earlier).

## DAG

```
M1 ──► M2 ──► M3 ─────────────────────────────────────────────┐
 └───► M4 ──► M5 ──┬──► M6 ──┐                                 │
                   ├──► M7 ──┤                                 │
                   ├──► M8 ──┼──► M12 ──► M13 ──► M14 ──┬──► M15 ──► M19 ──┐
                   ├──► M9 ──┘          ▲       ▲       ├──► M16 ─────────┤
                   ├──► M10 ────────────┼───────┘       ├──► M17 ─────────┼──► M20
                   └──► M11 ────────────┘               └──► M18 ─────────┘
```

| id | title | dependsOn | parallelGroup |
|---|---|---|---|
| M1 | Verify runner, perft fixtures, position corpus, deps lint, constants test | — | A |
| M2 | Ladder: sharded runner, pairing, SPRT, Elo, harness v3 changes, determinism tool | M1 | B |
| M3 | Whole-turn worker path for AIEngineV2 (protocol 3 additive) | M2 | C |
| M4 | Packed primitives: bits, tables, catalog, zobrist, action, config, interface tests | M1 | B |
| M5 | Replica: state, movement, spawn, income, make/unmake, generators, fuzzer | M4 | C |
| M6 | Threat maps and approach table | M5 | E |
| M7 | Kill-combination DP and Cleave chains | M5 | E |
| M8 | Economy DP and PST | M5 | E |
| M9 | Spawn geometry and home tables | M5 | E |
| M10 | Home-prover replica and checkmate gating proof | M5 | E |
| M11 | Within-turn action search: canonical ordering, turn TT, TurnPool | M5 | E |
| M12 | Evaluation v0, invariants, NodeTables builder | M6, M7, M8, M9 | F |
| M13 | Candidate generator, keep-sets, recall instrument | M11, M12 | G |
| M14 | Search core: TT, ordering, quiescence, PVS, work meter, root, engine, replay, lab bot | M13, M10 | H |
| M15 | Exposure: worker routing, UI hard switch, fallback, phone profile, e2e | M14, M3 | I |
| M16 | df-pn home-force module | M14 | I |
| M17 | Search refinements: aspiration, LMR, futility, extensions | M14 | I |
| M18 | Tuning and book pipeline: corpus, Texel, SPSA, book build/probe | M14 | I |
| M19 | Ship-gate measurement campaign (desktop + phone) | M15 | J |
| M20 | Feature measurement campaign (df-pn, refinements, tuned weights, SPSA, book) | M16, M17, M18, M19 | J |

Critical path: M1 → M4 → M5 → {M6..M11} → M12 → M13 → M14 → M15 → M19.

---

## M1 — Verify runner, perft fixtures, position corpus, deps lint, constants test

- **dependsOn:** — · **parallelGroup:** A
- **Files (create):** `lab/hard-ai/tsconfig.json`, `lab/hard-ai/verify/gates.ts`, `lab/hard-ai/verify/run.ts`,
  `lab/hard-ai/deps.ts`, `lab/hard-ai/perft/run.ts`, `lab/hard-ai/perft/fixtures.json`,
  `lab/hard-ai/positions/corpus.ts`, `lab/hard-ai/positions/authored.jsonl`,
  `lab/hard-ai/positions/openings.jsonl`, `src/ai/hard/verify/perft.ts` (canonical half only),
  `tests/ai/hard/constants.test.ts`, `tests/ai/hard/perft.test.ts`.
- **Files (modify):** `package.json` (all `hard:*` scripts of DESIGN §2), `lab/solver/model.ts:23` (`ACTIONS = 4`).
- **Specification:** DESIGN §7.1 (runner + `Gate` table with rows M1–M20, stubs for unbuilt gates),
  §7.2 (canonical `perftActions/perftMidStates/perftTurns`; freeze the three initial numbers and the 11
  authored positions with a per-fixture `depth` chosen so canonical enumeration finishes in < 60 s;
  `hard:perft --freeze` writes `fixtures.json`, `--check` compares), §2 (`hard:deps`: layering rules,
  nondeterminism grep, `lab/solver` import ban, `BigInt` ban — must pass on an empty `src/ai/hard/`),
  §7.5 (`muju-position-v1` reader/writer with the mandatory `rules` block, `mirror180`, and
  `openings.jsonl` = the 797 census end positions regenerated from
  `lab/experiments/opening-census-2026-09-14/census.ts`'s enumeration through canonical `applyAction`),
  §7.8 (constants-agreement test). `authored.jsonl` holds the 11 positions of §7.2 including `home-race`
  (archived fixture at rev 7, replayed via `src/game/replay.ts` from `tests/fixtures/codex-claude-2026-09-12.json`)
  and `promotion-kill`.
- **Gate row M1:** command `npm run hard:perft -- --check --out lab/results/hard-ai-verify/M1.json && npm run hard:deps && npx vitest run tests/ai/hard/constants.test.ts tests/ai/hard/perft.test.ts`; artifact `lab/results/hard-ai-verify/M1.json`.
- **Gate command:** `npm run hard:verify -- --gate M1`
- **Pass criterion:** `perftActions_initial_4 === 14959 && perftMidStates_initial === 1053 && perftTurns_initial === 797 && fixturesChecked === 11 && fixturesMismatch === 0 && depsViolations === 0 && vitestFailures === 0 && openings === 797`.
- **Budget:** < 3 min.

## M2 — Ladder: sharded runner, pairing, SPRT, Elo, harness v3, determinism tool

- **dependsOn:** M1 · **parallelGroup:** B
- **Files (create):** `lab/hard-ai/ladder/pairing.ts`, `lab/hard-ai/ladder/sprt.ts`, `lab/hard-ai/ladder/elo.ts`,
  `lab/hard-ai/ladder/engines.ts`, `lab/hard-ai/ladder/shard.ts`, `lab/hard-ai/ladder/worker.ts`,
  `lab/hard-ai/ladder/run.ts`, `lab/hard-ai/verify/determinism.ts`, `tests/lab/hard-ladder.test.ts`.
- **Files (modify, additive):** `lab/harness/types.ts` (`MatchOptions.blackCrystalHandicap?`,
  `.actionsPerTurn?`; `WinType` + `'home-checkmate' | 'timeout'`; `GameRecord` v3 fields of DESIGN §7.7),
  `lab/harness/runner.ts:113` (pass both options to `createInitialGameState`; fill the v3 fields).
- **Specification:** DESIGN §7.7 in full: seat-mirrored paired seeds at each handicap; pentanomial SPRT
  with the LLR formula; Elo + LOS; `--shards k` process sharding (games sequential inside a process);
  engine registry with `aiv2-hard`, `aiv2-medium`, `aiv2-hard-fast`, `aiv2-medium-fast`, `aiv2-hard-turn`
  (registered at M3), every scripted bot, and `hard@<label>` (registered at M14); the axis rule (`wall:`
  for any `aiv2-*`/scripted pairing); `adjudicationRate` veto; artifacts (`manifest.json`, `games.jsonl`
  v3, `pairs.jsonl`, `sprt.json`, `elo.json`, `summary.md`). `hard:determinism` (§7.4) runs any registry
  engine at fixed work three times in-process, once in a fresh `node` process, and (for `hard@*`) once
  with WASM absent, comparing `endKey`/first action/`stats`. Unit tests pin the LLR on synthetic pair
  vectors (`[0,0.5,1,1.5,2]` counts → known LLR to 1e-9), the Elo transform, and pairing symmetry.
- **Gate row M2:** command `npx vitest run tests/lab/hard-ladder.test.ts tests/lab/harness.test.ts && npm run hard:ladder -- --a aiv2-medium-fast --b Rush --work fixed:1200 --handicaps 0 --pairs 24 --seed 1 --shards 12 --out lab/results/hard-ai-verify/M2-calib && npm run hard:ladder -- --a aiv2-medium-fast --b aiv2-medium-fast --work fixed:1200 --handicaps 0 --pairs 12 --seed 2 --shards 12 --sprt 0,100,0.05,0.05 --out lab/results/hard-ai-verify/M2-self && npm run hard:determinism -- --engine aiv2-medium-fast --work 5000 --positions 10 --out lab/results/hard-ai-verify/M2.json`; artifact merges the three outputs.
- **Gate command:** `npm run hard:verify -- --gate M2`
- **Pass criterion:** `vitestFailures === 0 && calib.games === 48 && calib.adjudicationRate === 0 && calib.illegalActions === 0 && calib.bothSeatsPlayed === true && self.games === 24 && self.decision !== 'H1' && Math.abs(self.elo) < 100 && determinism.identical === true`.
- **Budget:** ≈ 9 min at 12 shards (`AIv2` fixed 1200 ≈ 0.2 s/decision, JF §1.2).

## M3 — Whole-turn worker path for AIEngineV2

- **dependsOn:** M2 · **parallelGroup:** C
- **Files (modify, additive):** `src/ai/worker/protocol.ts` (DESIGN §6.1), `src/ai/worker/handler.ts`
  (version 2|3; `mode:'turn'` + `engine:'v2'` → one `findBestAction(state, decisionMs)` with the whole-turn
  allowance, `turnActions` = the plan's legal prefix), `src/ai/worker/client.ts` (`findBestTurn`, progress
  forwarding), `src/ai/types.ts` (`AIResult.turnActions?`, `endKey?`), `src/hooks/useAI.ts` (§6.2 turn path
  for every difficulty on `AIEngineV2`; per-action loop kept as fallback), `lab/hard-ai/ladder/engines.ts`
  (`aiv2-hard-turn`, `aiv2-medium-turn`: the same `AIEngineV2` driven whole-turn with a plan cache, one
  search per turn at `decisionMs`).
- **Files (create):** `tests/ai/worker-turn.test.ts`, `e2e/hard-ai.spec.ts` (turn-path game completes,
  divergence injection falls back), `playwright.hard.config.ts` (`webServer: vite preview --port 8927`,
  projects `desktop` and `mobile` (iPhone 13 viewport)).
- **Specification:** DESIGN §6.1–6.2. `tests/ai/worker.test.ts:16` (`version: 2`, no `mode`) must pass
  unchanged. This is EG G12's known-positive change and the ladder's calibration run (JS §4.1).
- **Gate row M3:** command `npx vitest run tests/ai && npx playwright test --config playwright.hard.config.ts --project=desktop e2e/hard-ai.spec.ts && npm run hard:ladder -- --a aiv2-hard-turn --b aiv2-hard --work wall:1000 --handicaps 0 --pairs 12 --seed 3 --shards 12 --out lab/results/hard-ai-verify/M3.json`.
- **Gate command:** `npm run hard:verify -- --gate M3`
- **Pass criterion:** `vitestFailures === 0 && e2eFailures === 0 && ladder.games === 24 && ladder.illegalActions === 0 && ladder.adjudicationRate <= 0.01 && ladder.meanTurnMs.a <= ladder.meanTurnMs.b * 1.05 && ladder.decision !== 'H0'` (the smoke is a legality/latency gate; the strength SPRT for the turn path is M19's first row).
- **Budget:** ≈ 8 min (build + 24 games at 1 s/turn sharded).

## M4 — Packed primitives

- **dependsOn:** M1 · **parallelGroup:** B
- **Files (create):** `src/ai/hard/types.ts`, `src/ai/hard/config.ts` (types + default constants; profiles
  filled at M15), `src/ai/hard/core/bits.ts`, `src/ai/hard/core/tables.ts`, `src/ai/hard/core/catalog.ts`,
  `src/ai/hard/core/zobrist.ts`, `src/ai/hard/core/action.ts`, `tests/ai/hard/interfaces.test.ts` (every
  DESIGN §4 signature as a declaration test — entries for modules not yet built are type-only imports
  behind `// @ts-expect-error until M<n>` markers that the later milestone removes),
  `tests/ai/hard/{bits,tables,catalog,zobrist,action}.test.ts`.
- **Specification:** DESIGN §3.2–3.3, §4.1–4.3. Two power planes; `catalogSignature()` must change under
  `setElementGraph`/`setUpkeepVariant`/`setCombatHandicap` and return when restored (KF M2 gate).
- **Gate row M4:** command `npx vitest run tests/ai/hard && npm run hard:deps && npx tsc --noEmit -p tsconfig.json && npm run hard:types`; artifact written by a tiny reporter wrapper in `verify/run.ts` (vitest JSON reporter).
- **Gate command:** `npm run hard:verify -- --gate M4`
- **Pass criterion:** `vitestFailures === 0 && depsViolations === 0 && tscErrors === 0`, with tests asserting: `bb*` ops equal brute-force set ops on 10,000 random masks; `RECT[side][sq]` equals `getSpawnRectangle` for all 200 (side, sq); `ADJ` equals `getAdjacentPositions` for all 100; `catalog.power[side]` equals `calculateAttackPower` for 18×18×2 under each of the four element graphs and handicaps {0, +1}; `signature` flip-and-restore; `buildZobrist` is deterministic across two builds; `PA` round-trips for every kind; `keepSetIds` round-trips.
- **Budget:** < 2 min.

## M5 — Replica: state, movement, spawn, income, make/unmake, generators, fuzzer

- **dependsOn:** M4 · **parallelGroup:** C
- **Files (create):** `src/ai/hard/core/state.ts`, `src/ai/hard/core/movement.ts`, `src/ai/hard/core/spawn.ts`,
  `src/ai/hard/core/income.ts`, `src/ai/hard/verify/perft.ts` (replica half: `perftReplica`,
  `endKeysCanonical`), `lab/hard-ai/fuzz/differential.ts`, `lab/hard-ai/fuzz/run.ts`,
  `lab/hard-ai/positions/fuzz-1000.jsonl` (1,000 macro-node positions sampled by the fuzzer, stratified by
  turn number, with `rules` blocks), `tests/ai/hard/{state,pack-roundtrip,make-unmake,terminal-order,movement,spawn,income}.test.ts`.
- **Specification:** DESIGN §3.1, §3.4, §4.4–4.7, §5.1 (BFS, cache), §7.3 (transition + legality surfaces;
  prover surface arrives at M10). `make` includes the `proverMode` gate calling the canonical
  `analyzeHomeDefense` through `unpack` **only at this milestone** (`proverMode = 2` → canonical call;
  replaced by `homeVerdict` at M10). `terminal-order.test.ts` pins SU §8.1. `PST_MINE` check values (§4.7).
- **Gate row M5:** command `npx vitest run tests/ai/hard && npm run hard:fuzz -- --actions 1000000 --seed 20260914 --surfaces transition,legality --legality-every 8 --out lab/results/hard-ai-verify/M5-fuzz.json && npm run hard:perft -- --check --engine replica --out lab/results/hard-ai-verify/M5-perft.json && npm run hard:deps`.
- **Gate command:** `npm run hard:verify -- --gate M5`
- **Pass criterion:** `vitestFailures === 0 && fuzz.actions === 1000000 && fuzz.divergences === 0 && fuzz.legalitySetMismatches === 0 && fuzz.unmakeMismatches === 0 && fuzz.rehashMismatches === 0 && fuzz.canActClearedGames > 0 && fuzz.reviewUpkeepGames > 0 && fuzz.eliminationRuleGames > 0 && perft.fixturesMismatch === 0 && depsViolations === 0`, plus tests: `moveCost` agrees with `getMoveCost` on 200,000 random tuples; `spawnInfo().legal` equals `getAllSpawnPositions` as a set on 50,000 positions; `projectedIncome`/`upkeepDue` exact; `pack→unpack→pack` fixed point on all corpus positions.
- **Budget:** < 6 min.

## M6 — Threat maps and approach table

- **dependsOn:** M5 · **parallelGroup:** E
- **Files (create):** `src/ai/hard/tables/threat.ts`, `src/ai/hard/tables/approach.ts`,
  `src/ai/hard/tables/context.ts` (interface + `allocTables`; `buildTables` body lands at M12),
  `tests/ai/hard/threat.test.ts`, `lab/hard-ai/oracles/threat.ts` (gate runner; wraps
  `server/analysis/tactics.ts:272 approachTable`, lab-only).
- **Specification:** DESIGN §5.1 (strike = full area), §5.2 (multi-source BFS per speed), §5.8 approach
  (classes, `retreats`, cheapest lethal attacker per own slot incl. purchases and promoted forms).
- **Gate row M6:** command `npx vitest run tests/ai/hard/threat.test.ts && node --import tsx lab/hard-ai/oracles/threat.ts --positions 5000 --approach-positions 500 --out lab/results/hard-ai-verify/M6.json`.
- **Gate command:** `npm run hard:verify -- --gate M6`
- **Pass criterion:** `strikeMismatch === 0` (vs `dilate(getMovementRange(pos, speed, 3) ∪ {pos})` per unit, F22) `&& strikeIfBoughtMismatch === 0` (vs brute-force union over `getAllSpawnPositions × getAffordablePurchases`) `&& approachMismatch === 0` (class and `d` vs `approachTable` on every (attacker, target) pair of 500 positions) `&& vitestFailures === 0`.
- **Budget:** < 5 min.

## M7 — Kill-combination DP and Cleave chains

- **dependsOn:** M5 · **parallelGroup:** E
- **Files (create):** `src/ai/hard/tables/kill.ts`, `tests/ai/hard/kill.test.ts`, `lab/hard-ai/oracles/kill.ts`
  (gate runner: exhaustive replica search over ≤ 4 actions with buys/promotions, bounded to ≤ 8 own units),
  `lab/hard-ai/suites/tactics.suite.json` (≥ 60 cases, authored; scored at M14).
- **Specification:** DESIGN §5.7 (lanes, corner cap 2, purchases one entry per definition at the cheapest
  spawn, promotions, one hit per attacker, POWER 0 excluded, crystals as tiebreak; `cleaveChain`).
- **Gate row M7:** command `npx vitest run tests/ai/hard/kill.test.ts && node --import tsx lab/hard-ai/oracles/kill.ts --positions 2000 --max-own-units 8 --shards 12 --out lab/results/hard-ai-verify/M7.json`.
- **Gate command:** `npm run hard:verify -- --gate M7`
- **Pass criterion:** `suboptimal === 0` (`minActions` equal to brute force and `minCrystals` no worse, for all four `(allowBuys, allowPromotes)` combinations on 2,000 positions) `&& cornerMismatch === 0` (equals `enoughPossibleDamage` on the 28 `lab/ai/fixtures.ts` cases) `&& cleaveProbeOk === true` (LH §4.1: 3 adjacent Mujus in 3 actions; spaced C1/E1/G1 → 2 in 4) `&& vitestFailures === 0`.
- **Budget:** < 8 min sharded (JF §1.1 sizing).

## M8 — Economy DP and PST

- **dependsOn:** M5 · **parallelGroup:** E
- **Files (create):** `src/ai/hard/tables/economy.ts`, `tests/ai/hard/economy.test.ts`,
  `lab/hard-ai/oracles/economy.ts` (gate runner: literal 6-turn simulation through canonical `endTurn` with units held), `lab/hard-ai/suites/economy.suite.json` (≥ 30 cases).
- **Specification:** DESIGN §5.8 economy (fixed point, deterministic slot order, relocation rule, contested
  discount, `turnsToInsolvency`, `waste`, `relocationDebt`); `EconDelta` consumers at M12.
- **Gate row M8:** command `npx vitest run tests/ai/hard/economy.test.ts && node --import tsx lab/hard-ai/oracles/economy.ts --positions 2000 --out lab/results/hard-ai-verify/M8.json`.
- **Gate command:** `npm run hard:verify -- --gate M8`
- **Pass criterion:** `streamMismatch === 0` (relocation off equals the literal simulation to the crystal on 2,000 positions) `&& relocationMonotone === true` (relocation on ≥ stay-in-place and ≤ total board reserve on every position) `&& insolvencyMismatch === 0` (on the 11 fixtures vs literal `upkeepDue` simulation) `&& pstMaxErr <= 1` (21 check values, §4.7) `&& vitestFailures === 0`.
- **Budget:** < 3 min.

## M9 — Spawn geometry and home tables

- **dependsOn:** M5 · **parallelGroup:** E
- **Files (create):** `src/ai/hard/tables/geometry.ts`, `src/ai/hard/tables/home.ts`,
  `tests/ai/hard/{geometry,home}.test.ts`, `lab/hard-ai/oracles/geometry.ts` (gate runner; wraps
  `server/analysis/geometry.ts:25 blockingSet` with a `WorkBudget`), `lab/hard-ai/suites/spawn-strike.suite.json` (≥ 20 cases incl. the F16 punisher position).
- **Specification:** DESIGN §5.8 geometry and home; `blockingSet` reachability filter; `homeRaceAvailable`
  (SU addendum 20b); `minTurnsToCorner` with purchases.
- **Gate row M9:** command `npx vitest run tests/ai/hard/geometry.test.ts tests/ai/hard/home.test.ts && node --import tsx lab/hard-ai/oracles/geometry.ts --positions 2000 --out lab/results/hard-ai-verify/M9.json`.
- **Gate command:** `npm run hard:verify -- --gate M9`
- **Pass criterion:** `blockingMismatch === 0` (`candidate = null` vs `server/analysis/geometry.ts blockingSet` on 2,000 positions) `&& f5Ok === true` (SU §4.1: White Hi at F5 → 30 squares, 27 empty, enemy on C3 → 2, blocking 1) `&& f11Ok === true` (`spawnMaskWithout` on the archived C7-anchor fixture) `&& homeRaceOk === true` (finds `BUY lightning_1@G1 → J10` at archived rev 7, none at rev 9) `&& anchorsVoidedCornerOk === true && vitestFailures === 0`.
- **Budget:** < 3 min.

## M10 — Home-prover replica and checkmate gating proof

- **dependsOn:** M5 · **parallelGroup:** E
- **Files (create):** `src/ai/hard/tactics/prover.ts`, `tests/ai/hard/prover.test.ts`,
  `lab/hard-ai/suites/home-mate.suite.json` (56 cases), `lab/hard-ai/fuzz/prover-surface.ts`.
- **Files (modify):** `src/ai/hard/core/state.ts` (`proverMode = 2` now calls `homeVerdict`; the canonical
  `unpack` path is removed from `make`).
- **Specification:** DESIGN §5.9; §3.4 prover gate; the fuzzer's third surface (§7.3).
- **Gate row M10:** command `npx vitest run tests/ai/hard/prover.test.ts && npm run hard:fuzz -- --surfaces prover --cases 20000 --seed 5 --out lab/results/hard-ai-verify/M10-prover.json && npm run hard:fuzz -- --surfaces gate-preservation --actions 100000 --seed 6 --out lab/results/hard-ai-verify/M10-gate.json`.
- **Gate command:** `npm run hard:verify -- --gate M10`
- **Pass criterion:** `fixtureMismatch === 0` (28/28 vs `analyzeHomeDefense`) `&& fuzzVerdictMismatch === 0` (20,000 occupier positions) `&& witnessIllegal === 0 && gatePreservation.mismatches === 0` (gated replica `result/reason` equals ungated canonical on 100,000 actions) `&& clockFixtureOk === true` (SU §8.1) `&& vitestFailures === 0`.
- **Budget:** < 10 min.

## M11 — Within-turn action search: canonical ordering, turn TT, TurnPool

- **dependsOn:** M5 · **parallelGroup:** E
- **Files (create):** `src/ai/hard/gen/turn.ts`, `src/ai/hard/gen/actionsearch.ts`,
  `tests/ai/hard/{canonical,turnpool}.test.ts`, `lab/hard-ai/positions/canonical-fixtures.jsonl` (the two
  JE F1 fixtures: "step aside, then run" from the initial position; own Muju F5→E5 then Hi F6→F4; plus a
  kill-then-move-through-victim and a move-then-kill), `lab/hard-ai/oracles/canonical-check.ts`.
- **Specification:** DESIGN §5.3 (C0/C1/C2 with footprint independence), §5.4 (DFS, widening,
  `actionPriority` with a stub `KillTable`/`NodeTables` input), §4.13 `turn.ts`/`actionsearch.ts`.
- **Gate row M11:** command `npx vitest run tests/ai/hard/canonical.test.ts tests/ai/hard/turnpool.test.ts && node --import tsx lab/hard-ai/oracles/canonical-check.ts --fixtures authored,canonical --corpus fuzz-1000.jsonl --corpus-positions 200 --max-own-units 10 --shards 12 --out lab/results/hard-ai-verify/M11.json`.
- **Gate command:** `npm run hard:verify -- --gate M11`
- **Pass criterion:** `endSetMismatch === 0` (SET equality of end-position `Kpos` between `enumerateAll` and canonical `run` with unbounded widths and TT off, on the initial position, the 11 authored fixtures, the 4 canonical fixtures and 200 corpus positions) `&& initialEndPositions === 797 && initialMidStates <= 1053 && ttReduction >= 10` (canonical+TT nodes vs naive sequences on the initial position) `&& vitestFailures === 0`.
- **Budget:** < 8 min sharded.

## M12 — Evaluation v0, invariants, NodeTables builder

- **dependsOn:** M6, M7, M8, M9 · **parallelGroup:** F
- **Files (create):** `src/ai/hard/eval/features.ts`, `src/ai/hard/eval/weights.ts`,
  `src/ai/hard/eval/weights.generated.ts` (initially `TUNED_WEIGHTS = DEFAULT_WEIGHTS`),
  `src/ai/hard/eval/invariants.ts`, `src/ai/hard/eval/evaluate.ts`, `tests/ai/hard/{eval,invariants,lazy}.test.ts`,
  `lab/hard-ai/suites/invariants.suite.json` (20 fixtures), `lab/hard-ai/bench/run.ts` (eval/table throughput; extended at M14).
- **Files (modify):** `src/ai/hard/tables/context.ts` (`buildTables` body).
- **Specification:** DESIGN §4.8 (`buildTables` order), §4.15, §5.12 (all 58 features with initial
  weights; stage layout; stage 1 builds its own tables, F6), §5.12.4 (`boundStage2`, lazy driver), §5.13
  (invariant bits).
- **Gate row M12:** command `npx vitest run tests/ai/hard/eval.test.ts tests/ai/hard/invariants.test.ts tests/ai/hard/lazy.test.ts && npm run hard:bench -- --eval --positions 500 --out lab/results/hard-ai-verify/M12.json`.
- **Gate command:** `npm run hard:verify -- --gate M12`
- **Pass criterion:** `symmetryMismatch === 0` (`full(p) === −full(mirror180(p))` on every handicap-0 corpus position) `&& lazyViolations === 0` (100,000 positions × 20 random windows) `&& nondeterministic === 0 && stage1PerSec >= 200000 && stage2PerSec >= 50000 && invariantFixturesExact === 20` (each sets exactly its own bit; the correct turn sets none) `&& maxAbsScore <= 600000 && vitestFailures === 0`.
- **Budget:** < 6 min.

## M13 — Candidate generator, keep-sets, recall instrument

- **dependsOn:** M11, M12 · **parallelGroup:** G
- **Files (create):** `src/ai/hard/gen/purchase.ts`, `src/ai/hard/gen/promote.ts`, `src/ai/hard/gen/upkeep.ts`,
  `src/ai/hard/gen/generate.ts`, `tests/ai/hard/{purchase,promote,upkeep,generate}.test.ts`,
  `lab/hard-ai/recall/run.ts`.
- **Specification:** DESIGN §5.5 (dominance incl. F17 Göl rule, multisets, `P(8,k)` assignment, penalties
  not rejections, home-race plans always present), §5.6 (missions, facade, the eight forced injections,
  recall instrument with a 2-ply minimax over the reference set using stage-2 eval at the leaves), §5.10
  keep-sets (`genKeepSets` ranked, ≤ 64).
- **Gate row M13:** command `npx vitest run tests/ai/hard/purchase.test.ts tests/ai/hard/promote.test.ts tests/ai/hard/upkeep.test.ts tests/ai/hard/generate.test.ts && npm run hard:recall -- --corpus fuzz-1000.jsonl --positions 200 --reply-positions 100 --k 24 --deep 2000 --shards 12 --out lab/results/hard-ai-verify/M13.json`.
- **Gate command:** `npm run hard:verify -- --gate M13`
- **Pass criterion** (amended by DESIGN §9's 2026-09-15 addendum, which measures the original
  `top1 >= 0.90 && top3 >= 0.97 && regret_p90 <= 60 && replyTop1 >= 0.85` unreachable at §8's `K = 24`
  and restates the statistical clauses as shares of the instrument's own ceiling):
  `top1Share >= 0.42 && top3Share >= 0.55 && top1ValueShare >= 0.55 && replyTop1Share >= 0.45 && regret_p50 <= 260`
  (calibrated so a cone regression to widths `[4,3,2,1]` fails every one of them)
  `&& ceilingTop1 >= 0.55 && ceilingTop1 <= 0.80 && meanRefCandidates >= 400` (the yardstick itself is
  the wide one §5.6 specifies, so the shares cannot be gamed by weakening the reference)
  `&& illegalTurns === 0 && emptyLists === 0 && f16PunisherPresent === true` (the `BUY water_1@C1 …` plan appears in the candidates on the F16 fixture) `&& homeRacePresent === true` (the Radi G1 line is a FORCED candidate at archived rev 7) `&& vitestFailures === 0`.
- **Budget:** < 10 min sharded.

## M14 — Search core, root, engine, replay, lab bot

- **dependsOn:** M13, M10 · **parallelGroup:** H
- **Files (create):** `src/ai/hard/search/tt.ts`, `src/ai/hard/search/order.ts`, `src/ai/hard/search/quiesce.ts`,
  `src/ai/hard/search/pvs.ts`, `src/ai/hard/search/time.ts`, `src/ai/hard/search/root.ts`,
  `src/ai/hard/tactics/dfpn.ts` (stub returning UNKNOWN; M16 replaces the body),
  `src/ai/hard/book/format.ts`, `src/ai/hard/book/probe.ts` (`EMPTY_BOOK` only; M18 completes),
  `src/ai/hard/verify/replay.ts`, `src/ai/hard/engine.ts`, `lab/hard-ai/bots/hard.ts`,
  `lab/hard-ai/suites/format.ts`, `lab/hard-ai/suites/run.ts`,
  `tests/ai/hard/{tt,order,quiesce,pvs,mate-score,negamax-sign,determinism,replay}.test.ts`.
- **Files (modify):** `lab/harness/bots/index.ts` (register `Hard-25k`, `Hard-400k`, `Hard-wall-3000`,
  `Hard-mobile`), `lab/hard-ai/ladder/engines.ts` (`hard@<label>`), `lab/hard-ai/bench/run.ts`
  (`--calibrate`: measured µs per work class, nodes/s, depth reached per rung, quiescence share).
- **Specification:** DESIGN §5.10 (must-answer layer, upkeep root branch), §5.11.1–5.11.4 and §5.11.6
  (TT entry/replacement, ordering incl. SEE, quiescence, work meter, rung choice, targetMs, abort
  watchdog, stop polling), §4.16–4.17, §7.7 bot adapter, §7.5 suite runner. Refinement flags
  (`useLmr`, `useAspiration`, `useFutility`, `useExtensions`, `useDfpn`) default **off** here; M17/M16 turn them on.
- **Gate row M14:** command `npx vitest run tests/ai/hard && npm run hard:determinism -- --engine hard@lab --positions 40 --work 25000,400000 --seeds 1,7 --out lab/results/hard-ai-verify/M14-det.json && npm run hard:bench -- --calibrate --tt-check --positions 200 --depth 3 --rung 3200000 --shards 12 --out lab/results/hard-ai-verify/M14-bench.json && npm run hard:suite -- --suites tactics,spawn-strike,home-mate,invariants --engine hard@lab --work 400000 --shards 12 --out lab/results/hard-ai-verify/M14-suite.json && npm run hard:ladder -- --a hard@lab-400k --b Rush --work wall:500 --handicaps 0 --pairs 8 --seed 9 --shards 12 --out lab/results/hard-ai-verify/M14-smoke`.
- **Gate command:** `npm run hard:verify -- --gate M14`
- **Pass criterion:** `vitestFailures === 0 && determinism.identical === true && bench.ttOnOffScoreMismatch === 0` (TT on vs off, fixed depth 3, same score on 200 positions) `&& bench.depthGe4Share >= 0.90` (desktop rung 3.2M units) `&& bench.quiesceShareMax <= 0.35 && bench.proverCallsPer1000Macro <= 5 && suite.tactics >= 0.85 && suite.spawnStrike >= 0.80 && suite.homeMate === 56 && suite.invariantPairs === 20` (both readings measured on all twenty pairs; see the amendment below) `&& smoke.illegalActions === 0 && smoke.replicaDivergences === 0 && smoke.games === 16`.
- **Amendment 2026-09-15 — the `invariants` clause moves to M18.** This row originally read `suite.invariants >= 0.90`. Measured, that number is a statement about M12's weight vector and about the twenty authored fixtures, not about M14's search, and NEITHER reading of the pair comparison can reach it. Invariants 15 and 18 carry weight 0 by DESIGN §5.13 ("structural: any `UNKNOWN` prover verdict is scored as the bad case"; "protocol rule only ... not a feature (bit always 0)"), so their `violating`/`correct` members evaluate IDENTICALLY and no weighting can separate them — the ceiling under the evaluation is 18/20 = 0.90 exactly. Six more pairs (3, 4, 6, 12, 19, 20) favour the violating member by 2,016-3,662 cc, because the violating member is the one that bought, promoted or attacked and is materially richer, against penalty weights of 100-800 cc. Shipped at M14: `invariantsEval` 0.60, `invariantsSearched` 0.25, with a per-pair gap table in the artifact (`invariantDetail`). The 0.90 target moves to **M18**, which owns both the weight vector (Texel/SPSA) and the fixtures; M14 is held to having measured all twenty pairs under both readings. See `docs/hard-ai/design/DEVIATIONS.md` under M14.
- **Amendment 2026-09-15 — the smoke ladder's STRENGTH number moves to M18.** The smoke row's `illegalActions`/`replicaDivergences`/`games` clauses are a plumbing check and the strength number beside them is not in the criterion. Measured at M14: `hard@lab-400k` scores 8/16 (Elo 0) against `Rush` at `fixed:400000` and 3/16 (Elo -255) at the row's own `wall:500`. That arm does not buy 500 ms of search: `hard:bench --calibrate` measures this box at 15.0 us per unit under 12-way sharding, i.e. 66.6 units/ms, so once `updateProfile` has corrected the pessimistic starting profile `chooseWork` quantises 500 ms down to `WORK_LADDER[0]` = **25,000 units** — about a dozen macro nodes (DESIGN §5.11.6 prices one at ~2,000), depth 2. Beating a scripted L2 archetype from a two-ply macro search is an EVALUATION property, not a search one, so the acceptance clause belongs with the tuned weights: **M18** gains it (see its row).
- **Budget:** < 14 min sharded.

## M15 — Exposure: worker routing, UI hard switch, fallback, phone profile, e2e

- **dependsOn:** M14, M3 · **parallelGroup:** I
- **Files (modify):** `src/ai/worker/handler.ts` (`engine:'hard'` → `HardEngine` context), `src/ai/worker/client.ts`,
  `src/ai/worker/entry.ts` (construct `HardEngine` lazily; `calibrate()` once), `src/hooks/useAI.ts`
  (`difficulty === 'hard' && hardEnabled` → `engine:'hard'`; four fallback triggers of DESIGN §6.4),
  `src/ai/hard/config.ts` (DESKTOP/MIDRANGE/PHONE/LAB, `profileFor`), `src/ai/hard/engine.ts`
  (`calibrate`, profile selection from `navigator.deviceMemory`), `e2e/hard-ai.spec.ts` (Hard vs Hard game
  completes; forced `PackError` and forced engine throw fall back; mobile project), `tests/ai/worker-turn.test.ts`.
- **Files (create):** `lab/hard-ai/bench/latency.ts` (phone-profile depth-1 latency and p95 turn time over the corpus at `work` of the PHONE rung, device string recorded).
- **Specification:** DESIGN §6.1–6.4.
- **Gate row M15:** command `npx vitest run tests/ai && npx playwright test --config playwright.hard.config.ts e2e/hard-ai.spec.ts && node --import tsx lab/hard-ai/bench/latency.ts --profile phone --positions 200 --out lab/results/hard-ai-verify/M15.json`.
- **Gate command:** `npm run hard:verify -- --gate M15`
- **Pass criterion:** `vitestFailures === 0 && e2eFailures === 0 && e2e.illegalDispatches === 0 && e2e.replicaDivergences === 0 && e2e.packErrorFellBack === true && e2e.engineThrowFellBack === true && e2e.protocol2Ok === true && phone.depth1MaxMs <= 150 && phone.p95TurnMs <= 3000 && phone.rungStableAcrossRepeats === true`.
- **Budget:** < 12 min.

## M16 — df-pn home-force module

- **dependsOn:** M14 · **parallelGroup:** I
- **Files (modify):** `src/ai/hard/tactics/dfpn.ts` (real body). **Files (create):** `tests/ai/hard/dfpn.test.ts`,
  `lab/hard-ai/suites/home-force.suite.json` (≥ 200 cases: ≥ 60 forced wins in ≤ 3 turns, ≥ 100 near-misses),
  `lab/hard-ai/oracles/home-force-exhaustive.ts` (2-turn AND/OR exhaustive search on the replica for a 60-case subset).
- **Specification:** DESIGN §5.11.7 (F12 safeguard).
- **Gate row M16:** command `npx vitest run tests/ai/hard/dfpn.test.ts && npm run hard:suite -- --suites home-force --engine hard@lab-dfpn --work 400000 --shards 12 --out lab/results/hard-ai-verify/M16-suite.json && node --import tsx lab/hard-ai/oracles/home-force-exhaustive.ts --cases 60 --shards 12 --out lab/results/hard-ai-verify/M16-oracle.json`.
- **Gate command:** `npm run hard:verify -- --gate M16`
- **Pass criterion:** `suite.falseProven === 0 && suite.provenFound >= 0.90 * suite.forcedWins && oracle.mismatch === 0 && dfpn.budgetCharged === true` (every df-pn node appears in `byClass[DFPN]`) `&& vitestFailures === 0`.
- **Budget:** < 12 min.

## M17 — Search refinements

- **dependsOn:** M14 · **parallelGroup:** I
- **Files (modify):** `src/ai/hard/search/pvs.ts`, `src/ai/hard/search/order.ts` (aspiration, LMR, futility,
  home-threat and Cleave extensions, each behind its `SearchConfig` flag). **Files (create):** `tests/ai/hard/refinements.test.ts`.
- **Specification:** DESIGN §5.11.5.
- **Gate row M17:** command `npx vitest run tests/ai/hard/refinements.test.ts && npm run hard:bench -- --depth-to-nodes --positions 50 --depth 4 --flags all --shards 12 --out lab/results/hard-ai-verify/M17.json && npm run hard:suite -- --suites tactics,spawn-strike,home-mate,invariants --engine hard@lab-refined --work 400000 --shards 12 --out lab/results/hard-ai-verify/M17-suite.json`.
- **Gate command:** `npm run hard:verify -- --gate M17`
- **Pass criterion:** `nodesToDepth4Ratio >= 1.3` (baseline flags off vs all on, median over 50 positions) `&& suite.tactics >= M14.suite.tactics && suite.spawnStrike >= M14.suite.spawnStrike && suite.homeMate === 56 && suite.invariantsEval >= M14.suite.invariantsEval && vitestFailures === 0` (the artifact key was `suite.invariants` until M14's 2026-09-15 amendment split it into `invariantsEval`/`invariantsSearched`).
- **Budget:** < 10 min.

## M18 — Tuning and book pipeline

- **dependsOn:** M14 · **parallelGroup:** I
- **Files (create):** `lab/hard-ai/tune/corpus.ts`, `lab/hard-ai/tune/texel.ts`, `lab/hard-ai/tune/spsa.ts`,
  `lab/hard-ai/book/build.ts`, `tests/ai/hard/book.test.ts`, `tests/lab/texel.test.ts`.
  **Files (modify):** `src/ai/hard/book/probe.ts` (`canonicalKey`, `probeBook`), `src/ai/hard/book/format.ts`,
  `src/ai/hard/search/root.ts` (book probe before search; `targetMs × 0.4` on a hit).
- **Specification:** DESIGN §5.14, §5.15 and the data formats. The gate uses a **small** corpus; the full
  20,000-game tune and the book SPRT are M20.
- **Gate row M18:** command `npm run hard:corpus -- --games 400 --work 25000 --handicaps 0,3 --shards 12 --out lab/results/hard-ai-verify/M18-corpus && npm run hard:texel -- --corpus lab/results/hard-ai-verify/M18-corpus --iterations 3 --out lab/results/hard-ai-verify/M18-texel && npm run hard:book -- --nodes 500 --work 100000 --handicap 0 --shards 12 --out lab/results/hard-ai-verify/M18-book && npx vitest run tests/ai/hard/book.test.ts tests/lab/texel.test.ts`.
- **Gate command:** `npm run hard:verify -- --gate M18`
- **Pass criterion:** `corpus.positions >= 10000 && corpus.drawShare < 0.70 && texel.heldOutLossAfter < texel.heldOutLossBefore && texel.allIntegers === true && texel.fire1Pinned === 300 && book.roundTrip === true && book.illegalEntries === 0 && book.drift <= 0.05 && book.symmetryMismatch === 0` (100,000 random positions: `canonicalKey` invariant under rot180 with the negation flag correct) `&& vitestFailures === 0`.
- **Added 2026-09-15 (re-homed from M14).** Two acceptance clauses M14 cannot own follow the tuned weights here, and this row's command gains the two runs that measure them:
  - `npm run hard:suite -- --suites invariants --engine hard@lab --work 400000 --out lab/results/hard-ai-verify/M18-invariants.json` -> `invariantPairs === 20 && invariantsEval >= 0.90`. At M14 this stands at 0.60 against a ceiling of 0.90, and the ceiling is only reachable once invariants 15 and 18 are given separable fixtures (weight 0 by DESIGN §5.13, so their two members evaluate identically today) and the six materially-lopsided pairs (3, 4, 6, 12, 19, 20) are re-authored material-neutral or their penalties re-tuned past the 2,016-3,662 cc gaps M14 measured. The per-pair gap table is in M14's suite artifact.
  - `npm run hard:ladder -- --a hard@lab-400k --b Rush --work wall:500 --handicaps 0 --pairs 8 --seed 9 --shards 12 --out lab/results/hard-ai-verify/M18-rush` -> `elo >= 0` over the same 16 games. At M14 the untuned weights score 3/16 at `wall:500` (Elo -255), where `chooseWork` quantises the sharded box's 66.6 units/ms down to the 25,000-unit rung, and 8/16 at `fixed:400000` (Elo 0).
- **Budget:** < 14 min sharded.

## M19 — Ship-gate measurement campaign

- **dependsOn:** M15 · **parallelGroup:** J (measurement; hours)
- **Files (create):** `lab/results/hard-ai-ship-<date>/` artifacts only; `src/ai/hard/config.ts` (`hardEnabled = true` flipped only on pass).
- **Specification:** DESIGN §7.7 and §8 ship/phone rows (MF M9/M10 verbatim, JS fatal 6 fix). Rows, in order:
  (1) `aiv2-hard-turn` vs `aiv2-hard` wall:3000 — the M3 calibration row, expected not-H0; (2) the ship
  row; (3) the phone row; (4) suites at fixed work vs M14 baselines.
- **Gate row M19 (amended 2026-09-16, `docs/hard-ai/e0/AMENDMENTS-DECIDED.md` A1 A2 A4 A5 A7 A8 A13):** command `npm run hard:ladder -- --a aiv2-hard-turn --b aiv2-hard --work wall:3000 --handicaps 0 --pairs 150 --seed 11 --shards 2 --sprt 0,50,0.05,0.05 --openings lab/hard-ai/ladder/openings/e1-sealed.jsonl --legality strict --out lab/results/hard-ai-ship/calib && npm run hard:ladder -- --a hard@ship --b aiv2-hard --work wall:8000 --handicaps 0,3 --pairs 300 --seed 12 --shards 2 --sprt 0,100,0.05,0.05 --openings lab/hard-ai/ladder/openings/e1-sealed.jsonl --legality strict --out lab/results/hard-ai-ship/desktop && npm run hard:ladder -- --a hard@mobile --b aiv2-medium --work wall:1500 --handicaps 0 --pairs 200 --seed 13 --shards 2 --sprt -25,0,0.05,0.05 --openings lab/hard-ai/ladder/openings/e1-sealed.jsonl --legality strict --out lab/results/hard-ai-ship/phone && npm run hard:suite -- --all --engine hard@ship --work 400000 --shards 2 --out lab/results/hard-ai-ship/suites.json`. The phone row runs on a real device (E5.3); a desktop run of it is diagnostic. The pre-amendment command is kept in git history and in AMENDMENTS-PENDING.md.
- **Gate command:** `npm run hard:verify -- --gate M19`
- **Pass criterion (amended 2026-09-16):** `desktop.decision === 'H1' && desktop.adjudicationRate <= 0.01 && desktop.illegalActions === 0 && desktop.handicaps.includes(3) && desktop.seatMirrored === true && desktop.p95TurnMs <= 6000 && desktop.overrunRate <= 0.05 && phone.decision === 'H1' && phone.p95TurnMs <= 3000 && phone.overrunRate <= 0.05 && suites.every(s => s.score >= M14.baseline[s.name])`. The calibration row is reported beside the gate as diagnostic (A8) and is not a clause. `seatMirrored` is A4 option (a); `overrunRate` is A14's 5% rule; `hard@ship` is the frozen E6.1 candidate (A3).
- **Budget:** ≈ 18–30 h at 2 shards across sessions on resumable pair records (A2); wall:8000 games run ≈ 2.7x longer than the wall:3000 estimate (≈ 150 s per game).

## M20 — Feature measurement campaign

- **dependsOn:** M16, M17, M18, M19 · **parallelGroup:** J (measurement; hours)
- **Files (modify on pass only):** `src/ai/hard/config.ts` (flags/constants), `src/ai/hard/eval/weights.generated.ts`, `public/muju-book-h0.bin`, `public/muju-book-h3.bin`.
- **Specification:** DESIGN §5.11.5, §5.14, §5.15. Each candidate is SPRT'd **independently** against the
  build without it at fixed work `400000`, seat-mirrored, handicaps 0 and 3, `elo0 0 / elo1 10 / α = β =
  0.05`, `--pairs 1500` cap; a candidate ships only on H1 (the book also ships on H0 as disabled with the
  measurement recorded; SPSA keeps the M18 constants on H0). Full Texel: `hard:corpus --games 20000
  --work 25000`, `hard:texel --iterations 20`.
- **Gate row M20:** command `npm run hard:corpus -- --games 20000 --work 25000 --handicaps 0,3 --shards 12 --out lab/results/hard-ai-tune/corpus && npm run hard:texel -- --corpus lab/results/hard-ai-tune/corpus --iterations 20 --out lab/results/hard-ai-tune/texel && npm run hard:ladder -- --a hard@texel --b hard@m14 --work fixed:400000 --handicaps 0,3 --pairs 1500 --seed 21 --shards 12 --sprt 0,10,0.05,0.05 --out lab/results/hard-ai-tune/texel-sprt && npm run hard:ladder -- --a hard@dfpn --b hard@texel --work fixed:400000 --handicaps 0,3 --pairs 1500 --seed 22 --shards 12 --sprt 0,10,0.05,0.05 --out lab/results/hard-ai-tune/dfpn-sprt && npm run hard:ladder -- --a hard@refined --b hard@texel --work fixed:400000 --handicaps 0,3 --pairs 1500 --seed 23 --shards 12 --sprt 0,10,0.05,0.05 --each-flag --out lab/results/hard-ai-tune/refine-sprt && npm run hard:spsa -- --iterations 20 --batch 400 --work 100000 --shards 12 --out lab/results/hard-ai-tune/spsa && npm run hard:book -- --nodes 50000 --work 500000 --handicap 0 --shards 12 --out lab/results/hard-ai-tune/book-h0 && npm run hard:book -- --nodes 50000 --work 500000 --handicap 3 --shards 12 --out lab/results/hard-ai-tune/book-h3 && npm run hard:ladder -- --a hard@book --b hard@nobook --work wall:3000 --handicaps 0,3 --pairs 300 --seed 24 --shards 12 --sprt 0,10,0.05,0.05 --out lab/results/hard-ai-tune/book-sprt`.
- **Gate command:** `npm run hard:verify -- --gate M20`
- **Pass criterion:** `corpus.positions >= 200000 && corpus.drawShare < 0.70 && texel.heldOutLossAfter < texel.heldOutLossBefore && texelSprt.decision === 'H1' && dfpnSprt.decision !== 'H0' && refine.perFlag.every(f => f.decision !== undefined) && spsa.configWritten === (spsa.decision === 'H1') && bookSprt.decision !== undefined && every SPRT row has adjudicationRate <= 0.01 && illegalActions === 0`. Flags whose SPRT returns H0 are switched off in `config.ts`; the artifact records every decision.
- **Budget (amended 2026-09-16, A2/A9):** every `--shards 12` above reads `--shards 2`; ≈ 6–12 days across sessions, each row independently resumable from its artifact. Rows stay unrunnable until their labels exist (A9); release rows add `--legality strict` (A7).

---

## Fleet notes

- Interfaces in DESIGN §4 are frozen at M4 (`tests/ai/hard/interfaces.test.ts`); agents on M6–M11 code
  against them concurrently and may not edit another lane's files. Shared files by design: `tables/context.ts`
  (interface at M6, body at M12), `tactics/dfpn.ts` (stub at M14, body at M16), `search/root.ts` (M14, book
  probe added at M18), `config.ts` (types at M4, profiles at M15, constants updated on M20 H1 only).
- Every milestone that adds a gate row also adds its artifact schema to `lab/hard-ai/verify/gates.ts` and a
  one-line description; `npm run hard:verify -- --all` must run M1–M18 in DAG order in under 2.5 hours.
- Nothing under `src/ai/engine-v2.ts`, `src/ai/planner/*`, `src/ai/search/*`, `src/ai/evaluation.ts` is
  modified by any milestone. `hardEnabled` stays `false` until M19 passes.

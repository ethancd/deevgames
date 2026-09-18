# Muju Hard AI — BINDING DESIGN (v1, 2026-09-14)

Worktree `/Users/ashkie/src/deevgames-muju-hardai` (branch `claude/muju-hard-ai`, v2.8 snapshot). All
paths are relative to `muju/` unless absolute. This document is the contract a fleet of parallel coding
agents implements against. Every exported interface below is normative: a change requires a dated
addendum at the end of this file **before** the code is merged, and `tests/ai/hard/interfaces.test.ts`
(M4) reproduces the interfaces as declaration tests so drift fails `tsc`.

Sources: `STRATEGIC_UNDERSTANDING.md` (SU, with its three addenda), `ENGINE_GAPS.md` (EG),
`understand/engine-techniques.md` (ET), `understand/current-ai.md` (CA), `understand/rules-engine.md`
(RE), `understand/lab-harness.md` (LH), `understand/strategy-docs.md` (SD), `understand/game-records.md`
(GR); the three candidate designs `design/search-first.md` (SF), `design/knowledge-first.md` (KF),
`design/measurement-first.md` (MF); the three reviews `design/judge-strength.md` (JS),
`design/judge-engineering.md` (JE), `design/feasibility.md` (JF); and the code cited by `path:line`.

---

## 0. Rulings

### 0.1 Spine and grafts

**Spine: search-first's engine** (packed core, packed 32-bit actions, pools, ID-PVS over macro-turns,
quiescence over tactical turns, SEE-analogue ordering, spawn-denial injection, `WorkMeter` +
quantised `WORK_LADDER`, `proverMode`, `ProofCache`, df-pn, `hard:deps` layering lint). Reason: all
three judges score SF highest on strength potential (JS 8, JE 9, JF 9) and it is the only design that
reconciles "2–6 s wall clock" with "deterministic under fixed work" (SF §4.13; JE §2.1; JF §3.1 item 9).

**Verification spine: measurement-first's instrument**, verbatim where the judges asked for it
(JS §6, JE §5, JF §3.3): `lab/hard-ai/verify/gates.ts` + `npm run hard:verify -- --gate M<n>` with
per-gate JSON artifacts and non-zero exit; seat-mirrored paired-seed pentanomial SPRT; wall-clock for
cross-engine ladders and fixed work for intra-engine; `adjudicationRate ≤ 0.01` veto; `GameRecord v3`;
`home-checkmate` as a fifth rule terminal; three-surface differential fuzzer; three-way determinism
check + nondeterminism grep; R13 constant-agreement test; suites scored by end-position `Kpos`;
packed home-prover replica with the gate-preservation fuzz; must-answer home race with purchases;
`elementCoverage` and the three-way bank split; the whole-turn worker path measured first on the old
engine (M3) as the known-sign calibration of the ladder.

**Knowledge substrate: knowledge-first's tables layer** (JS §6, JE §5): `NodeTables` frozen as a
two-level contract so four table modules are built in parallel against independent oracles;
`approachTable` with `retreats` and the `StrandPunish` feature (SU addendum 20a); `blockingSetSize` with
the reachability filter; `spawnMaskWithout/With` what-if primitives; `EconDelta = economyDP.stream −
pstSum` so stages never double-count; `Rent` as its own feature and a no-rent `PST_MINE` (the only
accounting that reproduces the check values, JF §2.1); `cornerNeighboursHeld` separated from `plug`;
the twenty SU §7 invariants as Texel-weighted **penalty** features with a twenty-fixture negative suite;
`homeRaceAvailable`; the book format and probe; the calibrate profile table; the retry discipline
restated as "the generator can never return an empty list".

### 0.2 Fatal flaws and their fixes (each is binding)

| # | Flaw (source) | Fix in this design | Where |
|---|---|---|---|
| F1 | SF's `SAFE_INDEP` ignores vacated corridor squares and prunes reachable states (JE F1, verified on the initial position) | Independence is decided on **footprints**: a MOVE's footprint is `{from,to} ∪ Ball(occupancy-at-application, from, speed×cost)`; an ATTACK's is `{attackerSq, targetSq}`. Two actions are independent iff footprints are disjoint and slots differ. Gate: SET-equality of end-position `Kpos` against naive enumeration on the initial position, 11 authored fixtures and 200 corpus positions; canonical mid-state count on the initial position ≤ 1,053 with end positions exactly 797 | §5.3 |
| F2 | SF drops `canActThisTurn` yet gates on `lab/ai/fixtures.ts:29` (JE F2) | `F_CAN_ACT` is bit 0 of `uflags`; `pack` carries it; legality/kill tables honour it; the fuzzer synthesises states with it cleared | §3.1 |
| F3 | Cross-engine SPRT at "equal fixed work" compares beam candidates with weighted nodes (JS fatal 6, JE F3, JF §1.2) | Every cross-engine gate is wall-clock (`wall:<ms>` per turn); fixed work only between versions of the new engine; first cross-engine bound `elo1 = 100` | §7.7, M19 |
| F4 | MF M2's 800 games of `AIv2-hard-fast` at `fixedWork 200000` ≈ 50 CPU-days (JE F4, JF §1.2) | Calibration ladders use `AIv2-medium-fast` at `fixedWork 1200` (0.195 s/decision measured, JF §1.2), 24 mirrored pairs, sharded across processes | M2 |
| F5 | Packed state omits `reviewUpkeep`, `victoryRule`, `inactivityRule` (JE F5) | `PackedState` carries `victoryHome`, `drawRuleOn`, `reviewUpkeep[2]`; the fuzzer randomises all three per game | §3.1 |
| F6 | SF's stage-1 evaluator needs a `NodeContext` nothing builds for leaf positions (JE F6) | The evaluator builds **its own** level-1 tables inside stage 1 from a per-ply `Scratch` (KF); the macro node's `NodeTables` are for the generator and ordering only. Honest throughput gates: stage-1 ≥ 200k/s, stage-2 ≥ 50k/s on the reference box | §5.12, M12 |
| F7 | KF hard filters 8/17 (and `SpawnZero`, `WastedEndPlace`) delete legal, sometimes best, turns (JS fatal 1–2, JE F7) | **No hard filter except legality.** All twenty invariants are penalty features evaluated on the post-turn position. SU #18 is restated as the protocol rule (emit `END_PLACE_PHASE` only when legal). The generator always contains the mine-only baseline, so it can never return an empty list | §5.13 |
| F8 | KF's `resolveCheckmateGate(PackedState, GameState)` has no implementable body (JE F8) | Packed prover replica `tactics/prover.ts homeVerdict` gated against `analyzeHomeDefense` on the 28 fixtures + 20,000 fuzz occupier positions; gate-preservation fuzz (100,000 actions, gated vs ungated identical result) | §5.9, M10 |
| F9 | Rent double-counted (SF, MF) (JE F9, JF §2.1) | `PST_MINE` has no rent; `Rent` is a separate feature (`RENT_PV = 422` cc per crystal/turn); material priors are `cost × 100` with no rent term; `EconDelta = stream − pstSum` | §5.12 |
| F10 | `Kpos` excludes damage (KF/MF) or is slot-keyed (SF) (JE F10, JF §2.3) | Zobrist keyed **by square**; `Kpos` includes damage (zero at every ordinary macro node, non-zero only while `upkeepPending`, JF §0) | §3.3 |
| F11 | No process-level ladder sharding; lab knobs are module globals (JE F11) | `lab/hard-ai/ladder/shard.ts` runs games in N child processes from M2; every ladder/SPRT/corpus command accepts `--shards N` | §7.7 |
| F12 | df-pn "re-proved by the canonical prover" is only possible for mate-in-1 (JE F12) | The authored 0-false-positive suite (≥ 200 positions, 60 exhaustively verified) is the safeguard; a PROVEN line is re-proved by the canonical engine only when it is a mate-in-1 (replay through `applyAction` returns `home-checkmate`); longer proofs are re-run from every subsequent root | §5.11, M16 |
| F13 | SF's must-answer layer cannot find the purchase-based home race verified in SU addendum 1 (JS fatal 5) | `homeRaceAvailable` (KF/MF) is the first must-answer check: for every affordable tier-1 × legal spawn square, `moveCost(spawn, enemyCorner, spd) ≤ actions`; the line is injected FORCED and, if the canonical replay returns `home-checkmate`, returned immediately. A purchase that reaches the enemy corner this turn is always a place-plan | §5.10 |
| F14 | No gate measures the project goal (JS fatal 6) | M19 is MF's ship gate verbatim (Hard vs UI `AIv2-hard` at `wall:3000`, handicaps 0 and 3, seat-mirrored pairs, pentanomial SPRT `elo0 0 / elo1 100`, `adjudicationRate ≤ 0.01`, `illegalActions === 0`, suites ≥ baseline) plus the phone gate | M19 |
| F15 | Staged-evaluation gates unsatisfiable at fixed margins (JS §5.1) | Per-position dynamic margin `bound2(p)` computed from stage-1 quantities; gate asserts zero window violations on 100,000 positions × 20 windows | §5.12.4 |
| F16 | MF's purchase generator rejects the only punisher when the buy fills the last spawn square (JS fatal 4) | Zero-spawn and poor-miner-square are penalties on the **post-turn** position, never rejections inside the Place phase | §5.5 |
| F17 | Göl pruned as a purchase (JS §2.2) | `shadow_1` is kept whenever an enemy fire/lightning unit lies within BFS 7 and beyond 4 of any candidate square, or the square is a 0-reserve cell, or a blocking/denial mission exists, or it is the sole lethal answer in the kill table | §5.5 |
| F18 | SF's work-budget arithmetic does not close (JF §3.1 item 2) | `WORK_COST` recalibrated (unit ≈ 1 µs on the reference box), `WORK_LADDER = 25k × 2^k, k = 0..7`, honest depth targets (desktop rung: depth ≥ 4 on ≥ 90 % of corpus positions; phone: depth ≥ 2) measured at M14/M15, not asserted | §5.11.6 |
| F19 | MF protocol `version: 3` literal breaks `tests/ai/worker.test.ts:16` (JE §2.3, JF §3.3) | `Identity.version: 2 \| 3`, `mode?` optional, `AIResult.turnActions?` additive | §6.1 |
| F20 | MF `MAX_SLOTS = 100` without slot reuse; `TurnLine.actions ≤ 12` (JF §3.3) | `MAX_SLOTS = 128`, dead slots reused on BUY (lowest dead index); `MAX_TURN_ACTIONS = 24` | §3.1 |
| F21 | Mate scores spaced 1 cc (MF) (JE §2.3) | `MATE_PLY_CC = 1000` | §5.11.1 |
| F22 | KF's M4 oracle `getAttackFrontier` returns a perimeter, not the area (JF §3.2) | Strike oracle = `dilate(getMovementRange(pos, speed, 3, board))` as a set | M6 |
| F23 | Brute-force differential gates unsized or canonical (JF §1.1) | Every brute-force gate names the replica and its bound: kill DP vs exhaustive replica search on 2,000 positions with ≤ 8 own units and ≤ 4 actions | M7 |
| F24 | `isTacticalTurn` clause "voids/restores an anchor" explodes quiescence (JS §2.2) | Tactical = kill, home-corner entry/exit, or summon-and-strike; anchor voiding is an ordering bonus only; R5 cap `byClass[QUIESCE] ≤ 0.35 × limit` gated | §5.11.4 |
| F25 | Opponent replies capped at the same K hide refutations (JS §5.5) | Recall is measured on opponent-reply positions too; the reference generator includes every `strikeIfBought` witness and every denial move; `K_INTERIOR = 16` with forced injections never counted against K | §5.6 |

### 0.3 Where the judges disagreed

- **Base design.** JS and JF prefer SF as the engine and MF as the instrument; JE ranks MF first on the
  whole brief. Ruling: SF engine + MF instrument + KF tables (all three judges' graft lists agree on
  this decomposition; JS §8 states it in one paragraph).
- **Depth.** KF caps at 3; SF/MF search to exhaustion. Ruling: search to exhaustion of the work rung
  (JS fatal 3: NK:13's pre-positioning is depth 5; a 3-turn invasion is invisible at depth 3).
- **Hard filters.** KF uses four; MF uses two rejections in the purchase generator; SF uses penalties.
  Ruling: penalties only (F7, F16); JS demonstrated a concrete loss for each filter.
- **`canActThisTurn`.** SF drops it; MF/KF keep it. Ruling: keep (F2).
- **Damage in `Kpos`.** SF yes (slot-keyed), KF/MF no. Ruling: yes, square-keyed (F10).
- **Quiescence income.** MF freezes economy features; SF applies income with stand-pat. Ruling: SF
  (JS §4.2 shows MF's variant is internally inconsistent).
- **Prover at the root.** All three gate it. Ruling: MF's gate-preservation proof is mandatory (M10).
- **Evaluation throughput claims.** MF 1M/s, SF 400k/s stage-1, KF 200k/60k. Ruling: KF's numbers,
  gated (F6).
- **Ship-gate opponent.** KF `AIv2-hard-fast`, SF `ai-v2-hard` at fixed work, MF UI `AIv2-hard` at
  wall clock. Ruling: MF (F3, F14).

---

## 1. Thesis and architecture

Strength comes from verified lookahead over whole turns on top of an evaluation that computes the
twelve quantities the corpus says decide games (SU §6.4, EG §1). The macro-turn cannot be enumerated
(ET §1.4: 14,959 sequences on turn 1, > 4 M by turn 3) so the engine is a **candidate generator with
measured recall** feeding **iterative-deepening PVS over macro-turns**, on a **packed replica** of the
canonical rules that is differential-tested against `src/game` continuously and whose every dispatched
action is revalidated by `isLegalAction` (`src/game/legality.ts:16`) exactly as the WASM host already
does (`src/ai/wasm/kernel.ts:78`).

```
UI  src/hooks/useAI.ts
   difficulty==='hard' && hardEnabled  ->  ONE request per TURN (mode:'turn', engine:'hard')
   difficulty!=='hard'                 ->  ONE request per TURN (mode:'turn', engine:'v2')  [M3]
   dispatch the returned AIAction[] one at a time, isLegalAction before each, await the React commit
   (useAI.ts:66-78); any rejection -> legacy per-action loop for the rest of the turn
        |  worker protocol 3 (additive over 2): mode, work, engine, hard config; progress messages
Worker  src/ai/worker/entry.ts (serialised) -> handler.ts -> HardEngine.searchTurn
   0 pack        GameState -> PackedState (core/state.ts); PackError -> AIEngineV2 fallback
   1 work        chooseWork(profile, targetMs) picks a WORK_LADDER rung; no clock is read afterwards
   2 must-answer home race w/ purchases | elimination-in-1 | home rescue | home mate-in-1  (search/root.ts)
   3 ID-PVS      for d = 1.. while work remains: aspiration, macro TT (Kpos), generateTurns(K),
                 order (TT|forced|kill/action|SEE|home|denial|cleave|killer|counter|history|quiet),
                 LMR rank>6, home-threat extension, df-pn gate, quiescence over tactical turns,
                 staged integer evaluation with per-position lazy margins
   4 verify      decode -> replay through canonical applyAction with isLegalAction; truncate at
                 the first divergence; compare re-packed Kpos (verify/replay.ts)
   shared tables: bitboards, RECT, ADJ, POWER planes, KILLS_IN_ONE, BFS cache by (occHash, origin),
                  PST_MINE (no rent), strike + strikeIfBought, kill tables, approach table, economy DP
```

The macro node is **the state `startTurn` returns** (SF §2.2): every unit of the side to move has
`damageTaken = 0` and cleared flags unless `upkeepPending` (`src/game/turn.ts:30-33`, `board.ts:267-294`).
A pending keep-set is the first decision of the turn (§5.10). The draw check has already fired
(`turn.ts:96`), so a macro node is never a drawn position that looks playable.

---

## 2. Module layout

New production code lives under `src/ai/hard/`; tooling under `lab/hard-ai/`; tests under
`tests/ai/hard/`. Nothing under `src/game/` changes. Outside `src/ai/hard/` only these files change,
all additively: `src/ai/worker/{protocol,handler,client}.ts`, `src/ai/types.ts` (`AIResult.turnActions?`,
`endKey?`), `src/hooks/useAI.ts`, `lab/harness/types.ts`, `lab/harness/runner.ts` (three lines),
`lab/harness/bots/index.ts` (registration), `lab/solver/model.ts:23` (`ACTIONS = 4`), `package.json`
(scripts), `e2e/hard-ai.spec.ts` (new).

```
src/ai/hard/
  types.ts                 shared vocabulary (Side, Square, DefId, Slot, Centi, Key, Result, Reason)
  config.ts                HardConfig, DESKTOP/MIDRANGE/PHONE/LAB profiles, all tunable constants
  core/
    bits.ts                100-square bitboards (4 x Uint32), Scratch pool
    tables.ts              ADJ, RECT, MANHATTAN, CORNER, CORNER_NEIGHBOURS, CORRIDOR, rot180
    catalog.ts             baked 18-unit catalogue, POWER planes per side, KILLS_IN_ONE, signature
    zobrist.ts             square-keyed two-tier Zobrist tables and recompute
    action.ts              packed 32-bit action (PA) encode/decode, KeepSetTable
    state.ts               PackedState, Replica (pack/unpack/isLegal/make/unmake/gen*/rehash/check)
    movement.ts            bitboard BFS, DistanceCache, moveCost, reach
    spawn.ts               spawnInfo, isLegalSpawn, spawnMaskWithout/With, blockingSet
    income.ts              projectedIncome, upkeepDue, PST_MINE (no rent), rent primitives
  tables/
    context.ts             NodeTables (two levels), Scratch, buildTables
    threat.ts              strikeArea, strikeIfBoughtArea, nearestOwner, exposure
    approach.ts            classifyApproach, approachTable (retreats)
    kill.ts                minActionsToKill, killTable, cleaveChain (purchases, promotions)
    economy.ts             economyDP (fixed point), relocation, turnsToInsolvency
    geometry.ts            spawnGeometry (area, reserve, depth, fragility, blocking, infiltration)
    home.ts                homeSafety, minTurnsToCorner, homeRaceAvailable
  gen/
    turn.ts                Turn, TurnPool, TurnFlag, turnSignature, decodeTurn
    actionsearch.ts        within-turn DFS: canonical ordering + turn TT + widening
    purchase.ts            dominance filter, multisets, square assignment, place plans
    promote.ts             mission promotions
    upkeep.ts              keep-set candidates (genKeepSets)
    generate.ts            TurnGenerator facade, forced injections, reference generator
  tactics/
    prover.ts              packed home-defence prover replica (homeVerdict), needsProof, damageBound
    dfpn.ts                forceHome (df-pn over threat-relevant turns)
  eval/
    features.ts            Feature enum, extract(), per-feature bounds
    weights.ts             Weights, DEFAULT_WEIGHTS, load/serialize/hash
    weights.generated.ts   TUNED_WEIGHTS (written by lab/hard-ai/tune/texel.ts)
    invariants.ts          the twenty SU §7 invariants as bit-flag features
    evaluate.ts            Evaluator: stage0/stage1/stage2, lazy driver, terminalScore
  search/
    tt.ts                  TranspositionTable (macro), ProofCache
    order.ts               OrderTables, scoreTurns, onCutoff, SEE analogue
    quiesce.ts             quiesce, isTacticalTurn
    pvs.ts                 pvs, iterativeDeepening
    time.ts                WorkMeter, WORK_COST, WORK_LADDER, chooseWork, updateProfile, targetMs
    root.ts                must-answer layer, searchRoot
  book/
    format.ts              MUJUBK02 parse/pack
    probe.ts               canonicalKey, probeBook
  verify/
    replay.ts              verifyTurn (canonical replay, Kpos check)
    perft.ts               perftActions / perftTurns / perftMidStates (canonical) and perftReplica
  engine.ts                HardEngine (searchTurn, findBestAction shim, profile, calibrate)

lab/hard-ai/
  tsconfig.json            extends ../../tsconfig.json; types node; include ["**/*.ts","../../src/**/*.ts","../harness/**/*.ts"]
  deps.ts                  layering + nondeterminism lint            npm run hard:deps
  verify/gates.ts          {id, dependsOn, command, artifact, criterion} table
  verify/run.ts            npm run hard:verify -- --gate M<n> | --all
  verify/determinism.ts    in-process x3, fresh process, WASM-absent  npm run hard:determinism
  perft/run.ts             freeze/check perft fixtures                 npm run hard:perft
  fuzz/differential.ts     three-surface fuzzer
  fuzz/run.ts                                                          npm run hard:fuzz
  positions/corpus.ts      muju-position-v1 reader/writer, mirror180
  positions/authored.jsonl 11 authored perft/regression positions
  positions/openings.jsonl the 797 census end positions
  positions/midgame.jsonl  self-play sample (M14+), stratified by turn
  suites/format.ts         muju-suite-v1
  suites/{tactics,spawn-strike,home-mate,home-force,economy,invariants}.suite.json
  suites/run.ts                                                        npm run hard:suite
  ladder/pairing.ts        seat-mirrored paired seeds
  ladder/sprt.ts           pentanomial SPRT
  ladder/elo.ts            Elo + LOS
  ladder/engines.ts        engine registry (name -> factory + configHash)
  ladder/shard.ts          process-level sharding
  ladder/run.ts                                                        npm run hard:ladder
  recall/run.ts            generator recall + regret                   npm run hard:recall
  bench/run.ts             throughput + work calibration               npm run hard:bench
  bots/hard.ts             EngineBot adapter (whole-turn plan cache)
  oracles/{threat,kill,economy,geometry,canonical-check,home-force-exhaustive}.ts   differential gate runners (M6–M11, M16)
  tune/corpus.ts           self-play corpus with quietness filter      npm run hard:corpus
  tune/texel.ts            logistic fit                                 npm run hard:texel
  tune/spsa.ts             SPSA over search/generator constants        npm run hard:spsa
  book/build.ts            best-first book builder                     npm run hard:book
tests/ai/hard/*.test.ts    unit + declaration tests (listed per milestone)
```

**Layering (enforced by `lab/hard-ai/deps.ts`, M1):** `core` imports only `src/game/*` (at construction)
and `types.ts`; `tables` imports `core`; `gen` and `tactics` import `core`, `tables`; `eval` imports
`core`, `tables` (never `gen`/`search`); `search` imports `core`, `tables`, `gen`, `tactics`, `eval`;
`book` imports `core`, `gen`; `verify` imports `core`, `gen`, `src/game/*`, `src/ai/simulate.ts`;
`engine.ts` imports everything. Nothing under `src/ai/hard/` imports `src/ai/engine-v2.ts`,
`src/ai/planner/*`, `src/ai/search/*`, `src/ai/evaluation.ts`, or `lab/solver/**` (stale `ACTIONS = 6`,
LH §3.3). The lint also forbids `Date.now`, `performance.now`, `Math.random`, `crypto.` under
`src/ai/hard/**` except `search/time.ts` (rung choice and the abort watchdog) and `engine.ts`
(`calibrate()`), and forbids `BigInt` everywhere under `src/ai/hard/**`.

**npm scripts (added to `package.json`):**

```json
"hard:types":        "tsc -p lab/hard-ai/tsconfig.json --noEmit",
"hard:test":         "vitest run tests/ai/hard",
"hard:deps":         "node --import tsx lab/hard-ai/deps.ts",
"hard:verify":       "node --import tsx lab/hard-ai/verify/run.ts",
"hard:determinism":  "node --import tsx lab/hard-ai/verify/determinism.ts",
"hard:perft":        "node --import tsx lab/hard-ai/perft/run.ts",
"hard:fuzz":         "node --import tsx lab/hard-ai/fuzz/run.ts",
"hard:suite":        "node --import tsx lab/hard-ai/suites/run.ts",
"hard:ladder":       "node --import tsx lab/hard-ai/ladder/run.ts",
"hard:recall":       "node --import tsx lab/hard-ai/recall/run.ts",
"hard:bench":        "node --import tsx lab/hard-ai/bench/run.ts",
"hard:corpus":       "node --import tsx lab/hard-ai/tune/corpus.ts",
"hard:texel":        "node --import tsx lab/hard-ai/tune/texel.ts",
"hard:spsa":         "node --import tsx lab/hard-ai/tune/spsa.ts",
"hard:book":         "node --import tsx lab/hard-ai/book/build.ts"
```

`npm test` runs `pretest = npm run ai:wasm` (`package.json`), so any gate that shells out to vitest
rebuilds the WASM kernel. Root `tsconfig.json` (`include: ["src"]`, strict, `noUnusedLocals`) covers
`src/ai/hard/**`; `vitest.config.ts` covers `tests/ai/hard/**`; `lab/hard-ai/tsconfig.json` typechecks
the lab tree (JF §0: `npm run build`'s `tsc` does not cover `lab/**`). `export const enum` compiles under
`isolatedModules` (JF §0) but is not inlined across files by esbuild; use plain `const` objects with
`as const` for enums that cross files (all enums below are written that way).

---

## 3. Core representation

### 3.1 `PackedState` — exact layout

```ts
// src/ai/hard/types.ts
export type Side = 0 | 1;                       // 0 = white, 1 = black (board.ts:175-177)
export type Square = number;                    // 0..99, sq = y*10 + x (movement.ts:232)
export type DefId = number;                     // 0..17, index into UNIT_DEFINITIONS order (units.ts:8-222)
export type Slot = number;                      // 0..MAX_SLOTS-1
export type Centi = number;                     // integer centi-crystals; 1 crystal = 100
export interface Key { lo: number; hi: number } // two uint32 lanes; never BigInt
export const CC = 100;
export const WIN_CC = 1_000_000;
export const MATE_PLY_CC = 1_000;
export const DRAW_CC = 0;
export const Result = { ONGOING: 0, WHITE_WIN: 1, BLACK_WIN: 2, DRAW: 3 } as const;
export type Result = (typeof Result)[keyof typeof Result];
export const Reason = { NONE: 0, ELIMINATION: 1, UPKEEP_ELIMINATION: 2, HOME_OCCUPATION: 3,
  HOME_CHECKMATE: 4, INACTIVITY: 5, RESIGNATION: 6 } as const;   // src/game/types.ts:116 order
export type Reason = (typeof Reason)[keyof typeof Reason];
```

```ts
// src/ai/hard/core/state.ts
export const MAX_SLOTS = 128;          // 100 squares bound live units; 7-bit slot ids
export const NO_SLOT = 255;            // pieceAt sentinel
export const DEAD = 255;               // sq sentinel
export const MAX_TURN_ACTIONS = 24;    // 1 keep-set + <=4 buys + <=8 promos + END_PLACE + <=4 actions + END_ACTION = 19, with headroom
export const F_CAN_ACT = 1, F_LAST_KILLED = 2, F_PLACED = 4, F_PROMOTED = 8;   // uflags bits

export interface PackedState {
  // units, struct-of-arrays (ET §2.2), slot-indexed; dead slots are reused on BUY (lowest dead index)
  sq: Uint8Array;            // [MAX_SLOTS] 0..99 or DEAD
  defId: Uint8Array;         // [MAX_SLOTS] 0..17
  owner: Uint8Array;         // [MAX_SLOTS] 0 | 1
  damage: Uint8Array;        // [MAX_SLOTS] 0..4  (max DEF 5 = metal_3; RE §1.7b)
  atkCount: Uint8Array;      // [MAX_SLOTS] 0..3  (combat.ts:8-17)
  uflags: Uint8Array;        // [MAX_SLOTS] F_CAN_ACT | F_LAST_KILLED | F_PLACED | F_PROMOTED
  slotCount: number;         // high-water mark of used slots
  pieceAt: Uint8Array;       // [100] slot or NO_SLOT
  // occupancy bitboards, always consistent with sq/pieceAt
  occ: Uint32Array;          // [4]  all units
  occBy: Uint32Array;        // [8]  lanes 0..3 white, 4..7 black
  occTier: Uint32Array;      // [12] lanes 0..3 tier1, 4..7 tier2, 8..11 tier3 (both sides)
  // board
  reserve: Uint8Array;       // [100] 0..16 (resourceMap.ts:5)
  initialReserve: Uint8Array;// [100] for the conservation invariant (lab/harness/invariants.ts:55-59)
  // players
  bank: Int32Array;          // [2]
  gained: Int32Array;        // [2]
  // turn
  side: Side;
  phase: 0 | 1;              // 0 = place, 1 = action
  actions: number;           // 0..4
  turnNumber: number;
  upkeepPending: 0 | 1;
  clock: number;             // inactivityPlies 0..10 (inactivity.ts:3)
  progress: 0 | 1;           // progressThisTurn
  // rules (F5)
  handicap: number;          // blackCrystalHandicap
  victoryHome: 0 | 1;        // victoryRule !== 'elimination' (turn.ts:23, homeCheckmate.ts:173)
  drawRuleOn: 0 | 1;         // inactivityRule !== 'off' (inactivity.ts:8)
  reviewUpkeep: Uint8Array;  // [2] state.reviewUpkeep?.[player] (turn.ts:32)
  // terminal
  result: Result; reason: Reason;
  // hashing (incremental)
  kposLo: number; kposHi: number; kturnLo: number; kturnHi: number; occHash: number;
  catalogSignature: number;
  // incremental sums (stage 0)
  materialCc: Int32Array;    // [2] Σ material prior per side (updated on BUY/PROMOTE/kill/release)
  pstSumCc: Int32Array;      // [2] Σ PST_MINE[def][reserve[sq]] per side (updated on MOVE/BUY/kill/income)
  // search flags
  proverMode: 0 | 1 | 2;     // 0 off, 1 bound, 2 full (§5.9)
  // cold data: never read inside the search
  originIds: string[];       // slot -> canonical unit id for units present at pack time
}
```

`attackedThisTurn` is not stored: RE §1.7a proves it redundant with `atkCount` + `F_LAST_KILLED` in every
reachable state; the fuzzer's legal-action-set surface (§7.3) is the guard. `hasMoved`/`hasAttacked`
are not stored (never read by a rule, RE §1.5).

`pack` walks `state.board.units` in array order and assigns slots `0..n-1` (matching
`homeCheckmate.ts:87` and `assembly/tactics.ts`). It throws `PackError` when: a `definitionId` is not
in the 18-entry catalogue, `units.length > MAX_SLOTS`, any reserve ∉ `0..16`, `actionsPerTurn !== 4`
(`rules.ts:11-13`), or `phase === 'setup'`. `unpack` re-derives ids for units bought during the search
with the canonical scheme `unit-<player>-<turnNumber>-<n>` (`simulate.ts:14-20`) and carries
`originIds` for the rest.

### 3.2 Packed action (`PA`)

```ts
// src/ai/hard/core/action.ts
export type PA = number;               // 32-bit: kind | a<<3 | b<<10 | c<<17
export const AKind = { END_PLACE: 0, MOVE: 1, ATTACK: 2, BUY: 3, PROMOTE: 4, END_ACTION: 5, PAY_UPKEEP: 6, RESIGN: 7 } as const;
export type AKind = (typeof AKind)[keyof typeof AKind];
export function paMake(kind: AKind, a?: number, b?: number, c?: number): PA;
export function paKind(a: PA): AKind;
export function paA(a: PA): number;    // MOVE/ATTACK/PROMOTE: slot; BUY: defId; PAY_UPKEEP: keep-set index
export function paB(a: PA): number;    // MOVE: to; ATTACK: target square; BUY: square
export function paC(a: PA): number;    // MOVE: cost (1..4) as a cache; 0 otherwise
export function toAIAction(p: PackedState, a: PA, keep: KeepSetTable): AIAction;
export function fromAIAction(p: PackedState, a: AIAction, keep: KeepSetTable): PA;   // throws on unknown id
/** Node-local keep-set list for PAY_UPKEEP; index carried in paA. */
export interface KeepSetTable { masks: Uint32Array /* 64 * 4 words, slot bitmask */; count: number }
export function keepSetIds(p: PackedState, keep: KeepSetTable, index: number): string[];
```

### 3.3 Zobrist scheme (square-keyed, two-tier)

```ts
// src/ai/hard/core/zobrist.ts
export const ZOBRIST_SEED = 0x4d554a55;                 // "MUJU"; seededRandom (src/ai/runtime.ts:3-6)
export interface ZobristTables {
  piece: Uint32Array;     // [2 owners * 18 defs * 100 squares * 2 lanes]
  reserve: Uint32Array;   // [100 * 17 * 2]
  damage: Uint32Array;    // [100 * 5 * 2]   keyed BY SQUARE, damage 0..4 (value 0 hashes to nothing)
  atkCount: Uint32Array;  // [100 * 4 * 2]
  uflags: Uint32Array;    // [100 * 16 * 2]
  side: Uint32Array;      // [2]
  phase: Uint32Array;     // [2]      xored when phase === place
  actions: Uint32Array;   // [5 * 2]
  clock: Uint32Array;     // [11 * 2]
  bankLo: Uint32Array;    // [2 * 64 * 2]  bank & 63
  bankHi: Uint32Array;    // [2 * 16 * 2]  min(15, bank >>> 6)
  upkeep: Uint32Array;    // [2]      upkeepPending
  rules: Uint32Array;     // [8 * 2]  victoryHome, drawRuleOn, reviewUpkeep[0], reviewUpkeep[1]
  handicap: Uint32Array;  // [21 * 2]
}
export function buildZobrist(seed?: number): ZobristTables;
export const Z: ZobristTables;                           // built once at module load with ZOBRIST_SEED
export function recomputeKpos(p: PackedState): Key;      // from scratch; debug assertion target
export function recomputeKturn(p: PackedState): Key;
export function recomputeOccHash(p: PackedState): number;
```

`Kpos` (macro TT, book, suites) = piece ⊕ reserve ⊕ damage ⊕ side ⊕ clock ⊕ bank ⊕ upkeepPending ⊕
rules ⊕ handicap. `Kturn` (within-turn TT) = `Kpos` ⊕ phase ⊕ actions ⊕ atkCount ⊕ uflags.
`occHash` = XOR over occupied squares of `piece[0][0][sq]` (owner/def-independent), used by the BFS
cache. Everything is keyed by square, never by slot (JF §2.3), so buy-order permutations transpose.
Reserves must be in `Kpos` (they deplete monotonically, `mining.ts:25-28`); the clock must be in `Kpos`
(SU §8.1); damage must be in `Kpos` because an `upkeepPending` node carries the previous turn's damage
(`turn.ts:30-33`) and is otherwise zero (JF §0).

### 3.4 make / unmake

Make/unmake inside a turn, snapshot at the boundary (ET §2.4). `Undo` is one `Int32Array(8192)` per
search with a stack pointer; nothing allocates.

| Kind | Mutations | Undo words |
|---|---|---|
| `MOVE` | `sq[u]`, `pieceAt`, `occ*`, `occHash`, `actions -= cost`, `pstSumCc`, keys | `[KIND, slot, fromSq, cost]` |
| `ATTACK` | `atkCount[u]`, `uflags[u]&F_LAST_KILLED`, then `damage[v] += power` or kill (`sq[v]=DEAD`, `pieceAt`, `occ*`, `materialCc`, `pstSumCc`), `clock=0`, `progress=1` on a kill, `actions -= 1`, mid-turn elimination result (`simulate.ts:104-113`) | `[KIND, u, v, oldDamageV, oldFlagsU, oldCountU, oldClock, oldProgress, oldSqV, oldResult]` |
| `BUY` | slot (lowest dead or `slotCount++`), `bank -= cost`, `occ*`, `materialCc`, `pstSumCc`, `finishPlacement` auto-advance (`simulate.ts:118-120`) | `[KIND, slot, cost, phaseBefore, actionsBefore]` |
| `PROMOTE` | `defId[u]`, `uflags|=F_PROMOTED`, `bank -= 4\|8`, `materialCc`, `pstSumCc`, `occTier`, auto-advance | `[KIND, slot, oldDef, cost, phaseBefore, actionsBefore]` |
| `END_PLACE` | `phase=1`, `actions=4` | `[KIND]` |
| `PAY_UPKEEP` | release tier≥2 slots not kept, `bank -= paid`, `upkeepPending=0`, heal + flag reset (`completeUpkeep` → `finishTurnStart`, `turn.ts:53-64`), place auto-skip, upkeep-elimination result | `[KIND, paid, phaseBefore, nReleased, (slot, sq, def)*, nFlagRestores, (slot, damage, atkCount, uflags)*]` |
| `END_ACTION` | income (≤ one cell per unit, `mining.ts:18-34`), `bank`, `gained`, `pstSumCc`, `clock`, `progress`, draw check, `side`, `turnNumber`, home-occupation, elimination, upkeep (auto-pay or pending), heal + flag reset for the incoming side, place auto-skip (`turn.ts:92-104`, `:19-34`) | `[KIND, ...header(12), nTakes, (sq, amount)*, nFlagRestores, (slot, damage, atkCount, uflags)*]` |

`make` calls the checkmate prover only when `proverMode !== 0`, `victoryHome`, the mover occupies the enemy
corner and the opponent does not occupy the mover's (the short-circuit at `homeCheckmate.ts:173-176`);
`proverMode = 2` runs the packed replica of the full prover (§5.9), `1` runs only the admissible damage
bound (`homeCheckmate.ts:27-49`), which can only under-claim mates. `proverMode = 0` is legal only when
no corner is occupied; a debug assertion enforces it. The gate that this preserves the canonical result
is M10 (c).

**Debug assertions (mandatory in the M5 fuzz):** every 64th node `recomputeKpos/Kturn/OccHash` equal the
incremental values; `check(p)`: `Σ reserve + gained[0] + gained[1] === Σ initialReserve`;
`damage[u] < def[defId[u]]` for living units; `atkCount[u] ≤ tier`; `atkCount > 0 ⇒ F_LAST_KILLED` on
the previous hit; `pieceAt[sq[u]] === u` and vice versa; `0 ≤ actions ≤ 4`; `occ*` consistent.

---

## 4. Interfaces (normative)

Every signature below is reproduced in `tests/ai/hard/interfaces.test.ts` as a declaration test
(`const _: typeof X = ...` shape checks) so an agent cannot change one silently. All functions are
allocation-free in the hot path: outputs are written into caller-supplied buffers.

### 4.1 `core/bits.ts`

```ts
export type BB = Uint32Array;                          // always length 4; bits 100..127 always 0
export function bbNew(): BB;
export function bbZero(d: BB): BB;
export function bbCopy(d: BB, a: BB): BB;
export function bbSet(d: BB, sq: Square): BB;
export function bbClear(d: BB, sq: Square): BB;
export function bbHas(a: BB, sq: Square): boolean;
export function bbOr(d: BB, a: BB, b: BB): BB;
export function bbAnd(d: BB, a: BB, b: BB): BB;
export function bbAndNot(d: BB, a: BB, b: BB): BB;     // d = a & ~b
export function bbXor(d: BB, a: BB, b: BB): BB;
export function bbEquals(a: BB, b: BB): boolean;
export function bbIsEmpty(a: BB): boolean;
export function bbIntersects(a: BB, b: BB): boolean;
export function bbCount(a: BB): number;                // popcount
export function bbFirst(a: BB): number;                // lowest set square or -1
export function bbNext(a: BB, after: number): number;  // next set square > after, or -1 (ascending iteration)
export function bbDilate(d: BB, a: BB): BB;            // a | N | S | E | W with file-wrap masking
export function bbRing(d: BB, a: BB): BB;              // dilate(a) & ~a
export function bbReserveSum(a: BB, reserve: Uint8Array): number;
export class Scratch {                                 // per-ply pool of stable, zeroed buffers
  constructor(maxPly: number, bbPerPly: number, i8PerPly: number);
  bb(ply: number, i: number): BB;
  i8(ply: number, i: number): Int8Array;               // length 100
  i32(ply: number, i: number): Int32Array;             // length 256
}
```

### 4.2 `core/tables.ts`

```ts
export const BOARD = 100;
export const WHITE: Side = 0, BLACK: Side = 1;
export const CORNER: readonly [Square, Square];                 // [0, 99] (board.ts:175-177)
export const CORNER_NEIGHBOURS: readonly [readonly [Square, Square], readonly [Square, Square]]; // [[1,10],[89,98]] (homeCheckmate.ts:29-30)
export const ADJ: readonly BB[];                               // [100]
export const ADJ_LIST: Int8Array;                              // [100*4], -1 padded, order up,down,left,right (board.ts:313-324)
export const ADJ_COUNT: Uint8Array;                            // 2 corner, 3 edge, 4 interior
export const RECT: readonly (readonly BB[])[];                 // RECT[side][anchorSq] (spawning.ts:8-29)
export const RECT_AREA: readonly Uint8Array[];                 // popcount of RECT[side][sq]
export const MANHATTAN: Uint8Array;                            // [100*100]
export const CORRIDOR: BB;                                     // the 18 zero-ore squares D1–F3, E8–G10
export const SQ_X: Uint8Array; export const SQ_Y: Uint8Array;
export function sq(x: number, y: number): Square;
export function rot180(s: Square): Square;                     // 99 - s (exact map symmetry, ET §6.2)
export function dist2Corner(side: Side, s: Square): number;    // Manhattan distance to CORNER[side]
```

### 4.3 `core/catalog.ts`

```ts
export const NDEF = 18;
export interface Catalog {
  atk: Int8Array; def: Int8Array; spd: Int8Array; mine: Int8Array; tier: Int8Array; cost: Int8Array;
  upkeep: Int8Array;        // per defId, from upkeepForTier (upkeep.ts:12) — honours setUpkeepVariant
  element: Int8Array;       // 0 fire,1 lightning,2 water,3 shadow,4 plant,5 metal
  nextDef: Int8Array;       // -1 at tier 3 (units.ts:262-273)
  promoCost: Int8Array;     // 4 or 8, 0 at tier 3 (promotion.ts:9-23)
  tier1: Int8Array;         // the six purchasable defIds ascending by cost then id: [fire_1, lightning_1, water_1, shadow_1, plant_1, metal_1]
  power: Int8Array;         // [2 * NDEF * NDEF] plane per ATTACKING side: calculateAttackPower incl. combatHandicap[side] (combat.ts:80-91)
  killsInOne: Uint8Array;   // [2 * NDEF * NDEF] power >= def[d]
  hitsToKill: Uint8Array;   // [2 * NDEF * NDEF] ceil(def/power), 255 when power === 0 (RE §1.7b)
  signature: number;        // hash of every table + element graph + both handicaps + upkeep variant (RE §7.5)
}
export function buildCatalog(): Catalog;      // rebuilt from src/game via calculateAttackPower with owner set per side
export function catalogSignature(): number;   // cheap: reads getElementGraph(), the handicap record, the upkeep schedule
export function activeCatalog(): Catalog;     // memoised on catalogSignature()
export const DEF_INDEX: ReadonlyMap<string, DefId>; export const DEF_ID: readonly string[];
```

Two power planes are mandatory (JF §2.2): `combatHandicap` is per attacker owner (`combat.ts:62-66`).

### 4.4 `core/state.ts`

```ts
export class PackError extends Error {}
export interface Undo { w: Int32Array; top: number }
export function newUndo(): Undo;
export function allocState(): PackedState;
export function copyState(dst: PackedState, src: PackedState): void;   // ~1.5 KB of .set()
export class Replica {
  constructor(cat?: Catalog);
  readonly cat: Catalog;
  pack(state: GameState, out?: PackedState): PackedState;              // throws PackError
  unpack(p: PackedState): GameState;                                   // tests/tooling; ids per simulate.ts:14-20
  isLegal(p: PackedState, a: PA, keep?: KeepSetTable): boolean;        // byte-equivalent to legality.ts:16-47
  make(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void;     // a must be legal; debug-asserts
  unmake(p: PackedState, u: Undo): void;
  genActions(p: PackedState, out: Int32Array): number;                 // action phase: ATTACK*, MOVE* (multi-action costs), END_ACTION; ascending slot then square
  genPlace(p: PackedState, out: Int32Array): number;                   // place phase: BUY* (defId asc, square asc), PROMOTE*, END_PLACE
  genKeepSets(p: PackedState, out: KeepSetTable): number;              // §5.10; exact ≤ 12 rent units, ranked, capped at 64
  rehash(p: PackedState): void;                                        // recompute all keys and incremental sums
  check(p: PackedState): void;                                         // ET §8.6 invariants; throws
  digest(p: PackedState): string;                                      // 24-field digest for the fuzzer
}
```

`genActions` emits every legal MOVE including multi-action ones (`legality.ts:43-44` accepts them) so the
replica's legal-action set equals the canonical set expanded to multi-action moves; the fuzzer's legality
surface compares against `generateAllActions` (`moves.ts:72`, one-action moves) **plus** every
multi-action destination from `getMovementRange` (`movement.ts:184`), as a sorted multiset.

### 4.5 `core/movement.ts`

```ts
export interface DistanceCache {
  get(p: PackedState, origin: Square): Int8Array;   // [100] BFS distance over ~occ, -1 unreachable, 0 at origin
  multi(p: PackedState, sources: BB, out: Int8Array): void;  // multi-source BFS (not cached)
  invalidate(): void; readonly hits: number; readonly misses: number;
}
export function createDistanceCache(bits?: number): DistanceCache;   // direct-mapped 2^14, keyed (occHash, origin)
export function moveCost(dist: Int8Array, to: Square, speed: number): number;   // ceil(d/speed) or -1 when d <= 0 (movement.ts:226-234)
export function reachMask(dist: Int8Array, speed: number, actions: number, out: BB): BB;   // {q : 0 < d(q) <= speed*actions}
export function bfsFrom(occ: BB, origin: Square, out: Int8Array): void;           // ring expansion, ≤ 99 iterations
```

### 4.6 `core/spawn.ts`

```ts
export interface SpawnInfo { legal: BB; area: number; anchors: BB; depth: number; reserveSum: number }
export function spawnInfo(p: PackedState, side: Side, out: SpawnInfo): SpawnInfo;   // ≡ getAllSpawnPositions (spawning.ts:98-118)
export function isLegalSpawn(p: PackedState, side: Side, s: Square): boolean;      // ≡ isValidSpawnPosition (spawning.ts:123-153)
export function spawnMaskWithout(p: PackedState, side: Side, slot: Slot, out: BB): BB;   // what if this anchor dies
export function spawnMaskWith(p: PackedState, side: Side, extra: Square, out: BB): BB;   // what if I buy here
export function anchorsVoidedBy(p: PackedState, victimSide: Side, s: Square): number;     // enemy anchors an intruder on s voids; corner = all
export function blockingSet(p: PackedState, side: Side, candidate: BB | null, cap: number, out: BB): number;
```

`blockingSet`: minimum number of squares from `candidate` (or all squares when `null`) whose occupation by
one enemy unit each voids every unblocked anchor; exact min set cover over ≤ 8 anchors (mirrors
`server/analysis/geometry.ts:25-50`), returns `cap + 1` when larger than `cap`. With `candidate` = the
squares the enemy can occupy this turn (existing reach ∪ purchase reach) this is KF's reachability filter.

### 4.7 `core/income.ts`

```ts
export const GAMMA_Q16: Int32Array;              // round(0.9^t * 65536), t = 0..12
export const PST_MINE: Int32Array;               // [NDEF * 17] cc, NO rent: Σ_{t=1..12} 0.9^t · take_t
export const RENT_PV = 422;                      // cc per 1 crystal/turn of rent over H=6 at γ=0.9
export function projectedIncome(p: PackedState, side: Side): number;      // ≡ mining.ts:12-15
export function upkeepDue(p: PackedState, side: Side): number;            // ≡ upkeep.ts:14-16
export function pstMine(def: DefId, reserve: number): Centi;
export function rentCc(p: PackedState, side: Side): Centi;                // Σ upkeep[def] * RENT_PV
```

`PST_MINE` check values (JF §2.1 reproduces): reserve 16 → fire_1 646, water_1 1025, plant_1 1159,
plant_2 1285, plant_3 1368, metal_3 1238; reserve 8 → 513/619/659/693/720/684; reserve 4 → 310/342/351/360/360/360; lightning 0.

### 4.8 `tables/context.ts` (frozen two-level contract; KF)

```ts
export interface NodeTables {
  keyLo: number; keyHi: number; level: 1 | 2; side: Side;   // side = mover at this node
  // level 1 (~1-2 µs)
  dist: DistanceCache;
  strike: [BB, BB];              // squares each side can attack this turn: ∪ dilate(reach(u, 3)) (ET §7.2)
  strikeIfBought: [BB, BB];      // same for units not yet bought (§5.2)
  exposure: [BB, BB];            // strike[other] | strikeIfBought[other]
  spawn: [SpawnInfo, SpawnInfo];
  cornerDist: [Int8Array, Int8Array];  // multi-source BFS from CORNER[side]: distance of every square to that corner
  home: [HomeSafety, HomeSafety];
  geom: [SpawnGeometry, SpawnGeometry];
  // level 2 (~6-15 µs)
  killActions: Int8Array;        // [MAX_SLOTS] min actions for the OWNER's ENEMY to kill this slot next turn (buys+promos), 127 = never
  killCrystals: Int16Array;      // [MAX_SLOTS] crystals of the cheapest such plan
  killNeedsBuy: Uint8Array;      // [MAX_SLOTS]
  killNow: [KillTable, KillTable];   // what each side can kill THIS turn from this position (mover: actions left; other: 4)
  approach: Uint8Array;          // [MAX_SLOTS] ApproachClass of the cheapest enemy attacker of this slot
  retreats: Uint8Array;          // [MAX_SLOTS] retreat squares of that attacker outside our strike
  chain: Int16Array;             // [MAX_SLOTS] Cleave-chain value (cc) exposed by this enemy tier-2+ unit
  econ: [EconResult, EconResult];
}
export function allocTables(): NodeTables;
export function buildTables(p: PackedState, sc: Scratch, ply: number, level: 1 | 2, out: NodeTables): NodeTables;
```

`buildTables` calls, in order: `threat.ts` (strike, strikeIfBought, exposure), `spawn.ts` (spawn),
`home.ts` (cornerDist, home), `geometry.ts` (geom); at level 2 `kill.ts` (killActions/killCrystals/
killNeedsBuy/killNow), `approach.ts`, `kill.ts cleaveChain`, `economy.ts`. Each table module is built by a
separate agent against this interface and gated against an independent oracle (M6–M9).

### 4.9 `tables/threat.ts`

```ts
export function strikeArea(p: PackedState, side: Side, t: NodeTables, actions: number, out: BB): BB;
export function strikeIfBoughtArea(p: PackedState, side: Side, t: NodeTables, out: BB): BB;
export function nearestOwner(p: PackedState, side: Side, t: NodeTables, outSlot: Uint8Array, outCost: Uint8Array): void;
export function exposedValueCc(p: PackedState, side: Side, t: NodeTables, material: Int32Array): Centi;  // Σ material of side's units inside exposure[side]
```

### 4.10 `tables/approach.ts`

```ts
export const Approach = { NONE: 0, STRAND: 1, RETREAT: 2 } as const;
export type Approach = (typeof Approach)[keyof typeof Approach];
export interface ApproachResult { cls: Approach; d: number; retreats: number; attackerSlot: number; buy: 0 | 1 }
export function classifyApproach(p: PackedState, t: NodeTables, attackerSq: Square, speed: number, targetSlot: Slot, sc: Scratch, ply: number): ApproachResult;
export function approachTable(p: PackedState, t: NodeTables, defender: Side, sc: Scratch, ply: number, outClass: Uint8Array, outRetreats: Uint8Array): void;
```

### 4.11 `tables/kill.ts`

```ts
export interface KillOpts { actionBudget: number; crystalBudget: number; allowBuys: boolean; allowPromotes: boolean; maxLanes: number }
export interface KillPlan { actions: number; crystals: number; attackers: Int8Array /* slots or -(defId+1) for a buy */; spawnAt: Int8Array; lanes: Int8Array; needsPromo: 0 | 1 }
export interface KillEntry { minActions: number /* 255 = impossible */; minCrystals: number; needsBuy: 0 | 1; needsPromo: 0 | 1; valueCc: Centi /* cost*100 prior */ }
export interface KillTable { entry: KillEntry[] /* [MAX_SLOTS] */; killableNow: BB; bestValuePerAction: number; count: number }
export function minActionsToKill(p: PackedState, t: NodeTables, attacker: Side, target: Slot, o: KillOpts, sc: Scratch, ply: number, out: KillPlan): boolean;
export function killTable(p: PackedState, t: NodeTables, attacker: Side, o: KillOpts, sc: Scratch, ply: number, out: KillTable): KillTable;
export function cleaveChain(p: PackedState, t: NodeTables, enemySlot: Slot, sc: Scratch, ply: number): Centi;
```

`valueCc` is the catalogue cost prior (`cost × 100`), not an eval weight — `gen` and `tables` never import
`eval` (JE §2.1 layering complaint).

### 4.12 `tables/economy.ts`, `tables/geometry.ts`, `tables/home.ts`

```ts
// economy.ts
export const ECON_HORIZON = 6; export const ACTION_VALUE_CC = 60; export const RELOCATION_MAX_ACTIONS = 8;
export interface EconResult { stream: Centi; income: Int16Array /* [H] */; upkeep: Int16Array /* [H] */; turnsToInsolvency: number; relocationDebt: Centi; waste: number }
export function economyDP(p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number, out: EconResult): EconResult;
export function economyStayInPlace(p: PackedState, side: Side, out: EconResult): EconResult;   // relocation off; oracle target

// geometry.ts
export interface SpawnGeometry { area: number; reserveSum: number; anchorDepth: number; fragility: number /*0..3*/; blocking: number /*0..3, 3 = >2*/; infiltrationAnchors: number; convertible: Centi; zeroCliff: 0 | 1; cornerNeighboursHeld: number }
export function spawnGeometry(p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number, out: SpawnGeometry): SpawnGeometry;

// home.ts
export interface HomeSafety { actionsToCorner: number; turnsToCorner: number; buyThreat: 0 | 1; rescuers: number; plug: 0 | 1; occupied: 0 | 1 }
export function homeSafety(p: PackedState, t: NodeTables, side: Side, out: HomeSafety): HomeSafety;   // side = defender
export function minTurnsToCorner(p: PackedState, t: NodeTables, attacker: Side): number;             // purchases included
export function homeRaceAvailable(p: PackedState, t: NodeTables, side: Side, out: Int32Array): number;  // PA lines: BUY d@q, END_PLACE, MOVE →corner; count of lines written (SU addendum 20b)
```

### 4.13 `gen/turn.ts`, `gen/actionsearch.ts`, `gen/purchase.ts`, `gen/promote.ts`, `gen/upkeep.ts`, `gen/generate.ts`

```ts
// turn.ts
export const TurnFlag = { KILL: 1, CLEAVE_CHAIN: 2, HOME_ENTRY: 4, HOME_RESCUE: 8, SPAWN_DENY: 16, PURCHASE: 32, PROMOTION: 64,
  RETREAT: 128, QUIET: 256, FORCED: 512, BOOK: 1024, HOME_RACE: 2048, SUMMON_STRIKE: 4096 } as const;
export interface Turn {
  actions: Int32Array;   // packed PA, capacity MAX_TURN_ACTIONS; owned by the pool
  count: number;
  endLo: number; endHi: number;   // Kpos after the boundary
  sig: number;           // 32-bit abstract signature (killers/counter-moves)
  flags: number;
  gainCc: Centi;         // ordering score
  place: number;         // place-plan index or -1
  hangCc: Centi;         // SEE analogue: value the opponent can remove after this turn (buys included)
}
export class TurnPool { constructor(capacity: number); reset(): void; alloc(): Turn; readonly used: number }
export function turnSignature(p: PackedState, t: Turn): number;
export function decodeTurn(p: PackedState, t: Turn, keep: KeepSetTable): AIAction[];

// actionsearch.ts
export interface ActionSearchConfig { widths: Int32Array /* [6,4,3,2] */; keep: number /* 4 */; ttBits: number /* 18 */ }
export type WithinTurnScorer = (p: PackedState, sc: Scratch, ply: number) => Centi;   // mover-relative, post-boundary
export class TurnTT { constructor(bits: number); probe(lo: number, hi: number, actions: number): boolean; store(lo: number, hi: number, actions: number): void; bump(): void }
export class ActionSearch {
  constructor(rep: Replica, cfg: ActionSearchConfig, pool: TurnPool, sc: Scratch);
  /** p must be in the action phase with the place-plan prefix already applied. */
  run(p: PackedState, t: NodeTables, prefix: Int32Array, prefixLen: number, placeIndex: number, score: WithinTurnScorer, meter: WorkMeter, ply: number, out: Turn[]): number;
  /** Naive enumeration for the M11 gate: no canonical ordering, no widening, no TT. */
  enumerateAll(p: PackedState, prefix: Int32Array, prefixLen: number, onEnd: (endLo: number, endHi: number) => void): number;
}
export function isIndependent(p: PackedState, dist: DistanceCache, prev: PA, prevBallLo: BB, cur: PA): boolean;   // §5.3

// purchase.ts
export interface PlacePlan { actions: Int32Array; count: number; spend: number; scoreCc: Centi; flags: number; spawnAfter: number }
export interface PurchaseWeights { mineCc: number; safeCc: number; blockCc: number; strikeCc: number; anchorCc: number; zeroSpawnCc: number; liquidityCc: number; homeRaceCc: number }
export interface PurchaseConfig { maxBodies: number; maxMultisets: number; maxPlans: number; squares: number /* 8 */; keepPerMultiset: number /* 3 */; weights: PurchaseWeights }
export function candidateDefs(p: PackedState, t: NodeTables, side: Side, out: Uint8Array): number;   // dominance filter, §5.5
export function purchaseMultisets(defs: Uint8Array, n: number, bank: number, maxBodies: number, out: Int32Array): number;
export function planPurchases(p: PackedState, t: NodeTables, cfg: PurchaseConfig, sc: Scratch, ply: number, out: PlacePlan[]): number;

// promote.ts
export const Mission = { KILL: 0, SURVIVE: 1, INCOME: 2, REACH: 3, ANCHOR: 4 } as const;
export interface PromoCandidate { slot: Slot; mission: number; cost: number; scoreCc: Centi }
export function planPromotions(p: PackedState, t: NodeTables, max: number, out: PromoCandidate[]): number;

// upkeep.ts
export function genKeepSets(p: PackedState, t: NodeTables, out: KeepSetTable): number;   // ranked, ≤ 64

// generate.ts
export interface GenConfig { K: number; maxPlacePlans: number; action: ActionSearchConfig; purchase: PurchaseConfig; maxPromotions: number; reference: boolean }
export interface GenStats { placePlans: number; rawLines: number; dedupedTo: number; nodes: number; injected: number }
export class TurnGenerator {
  constructor(rep: Replica, cfg: GenConfig, pool: TurnPool, sc: Scratch);
  generate(p: PackedState, t: NodeTables, score: WithinTurnScorer, meter: WorkMeter, ply: number, keep: KeepSetTable, out: Turn[], stats: GenStats): number;
  /** Reference generator for the recall instrument: K 2000, widths [40,16,8,4], 200 place plans, all strikeIfBought witnesses and denial moves. */
  generateReference(p: PackedState, t: NodeTables, score: WithinTurnScorer, ply: number, keep: KeepSetTable, out: Turn[]): number;
}
```

### 4.14 `tactics/prover.ts`, `tactics/dfpn.ts`

```ts
// prover.ts
export const HomeVerdict = { RESCUE: 0, MATE: 1, UNKNOWN: 2 } as const;
export const PROOF_NODES = 20000;                                  // homeCheckmate.ts:22
export function needsProof(p: PackedState): boolean;               // mover occupies enemy corner, opponent does not occupy mover's, victoryHome, !upkeepPending
export function damageBound(p: PackedState, invader: Side, sc: Scratch, ply: number): boolean;   // enoughPossibleDamage (homeCheckmate.ts:27-49), preparing = true
export function homeVerdict(p: PackedState, invader: Side, maxNodes: number, sc: Scratch, ply: number, meter?: WorkMeter): number;  // ≡ analyzeHomeDefense (homeCheckmate.ts:57)
export function homeWitness(p: PackedState, invader: Side, maxNodes: number, out: Int32Array): number;   // PA line for the defender's rescue, or 0

// dfpn.ts
export interface DfpnConfig { maxTurns: number /* 3 */; nodeBudget: number; epsilonQ2: number /* 5 = 1.25 */; ttBits: number /* 17 */ }
export const Proof = { UNKNOWN: 0, PROVEN: 1, DISPROVEN: 2 } as const;
export interface DfpnResult { proof: number; turn: Turn | null; nodes: number; depth: number }
export function forceHome(s: SearchContext, p: PackedState, side: Side, cfg: DfpnConfig, out: DfpnResult): DfpnResult;
```

### 4.15 `eval/*`

```ts
// features.ts
export const FEATURE_COUNT = 58;
export const F = {
  // stage 0 (incremental, no tables)
  Material: 0, Rent: 1, BankLiquid: 2, BankExcess: 3, HomeInvaded: 4,
  // stage 1 (level-1 tables)
  PstMine: 5, BankConvertible: 6, SpawnArea: 7, SpawnReserve: 8, SpawnZero: 9, AnchorDepth: 10, Infiltration: 11,
  CornerSeal: 12, HomeThreat: 13, HomeCountdown: 14, HomePlug: 15, HomeRescuers: 16, Exposure: 17, DrawPressure: 18,
  ActionsLeft: 19, Corridor: 20, TierClimb: 21, ElementCoverage: 22,
  // stage 2 (level-2 tables)
  EconDelta: 23, DepletionWaste: 24, RunwayCliff: 25, Insolvency: 26, RelocationDebt: 27, Hanging: 28, HangingBuy: 29,
  ApproachRetreat: 30, ApproachStrand: 31, StrandPunish: 32, KillAvailable: 33, CleaveExposure: 34, AnchorFragility: 35,
  BlockingDeficit: 36, CornerInfiltration: 37,
  // stage 2: the twenty SU §7 invariants, one feature each (value = 1 when violated for the side, else 0)
  Inv1SpawnZero: 38, Inv2CornerSeal: 39, Inv3RetreatSquare: 40, Inv4StrandUnpunished: 41, Inv5PoorMinerSquare: 42,
  Inv6FragileAnchor: 43, Inv7PromoteNoRunway: 44, Inv8NoPreAdjacency: 45, Inv9ChipAcrossTurn: 46, Inv10HomeReachable: 47,
  Inv11HomeBare: 48, Inv12CleaveLine: 49, Inv13Turtle: 50, Inv14LiquidityFloor: 51, Inv15UnknownAsSafe: 52,
  Inv16ClockDiscipline: 53, Inv17SelfBlock: 54, Inv18WastedEndPlace: 55, Inv19SoftMinerExposed: 56, Inv20StrandNoRetreat: 57,
} as const;
export const FEATURE_NAMES: readonly string[];
export const STAGE_OF: Uint8Array;                     // [FEATURE_COUNT] 0 | 1 | 2
export function extract(p: PackedState, t: NodeTables | null, side: Side, stage: 0 | 1 | 2, sc: Scratch, ply: number, out: Int32Array): void;  // symmetric difference f(side) - f(other); stage <= 1 needs level-1 tables, 2 needs level-2
export function boundStage2(p: PackedState, t: NodeTables, w: Weights): Centi;   // per-position upper bound on |Σ stage-2 terms| (§5.12.4)

// weights.ts
export interface Weights { w: Int32Array /* [FEATURE_COUNT] cc */; material: Int32Array /* [NDEF] cc */; version: number; label: string }
export const DEFAULT_WEIGHTS: Weights;
export function loadWeights(json: unknown): Weights; export function serializeWeights(w: Weights): string; export function weightsHash(w: Weights): string;

// invariants.ts
export function invariantBits(p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number): number;   // 20-bit mask, bit i = SU §7 invariant i+1 violated for `side` on this (post-turn) position

// evaluate.ts
export class Evaluator {
  constructor(rep: Replica, w?: Weights);
  setWeights(w: Weights): void;
  stage0(p: PackedState, root: Side): Centi;                                          // incremental sums only
  stage1(p: PackedState, root: Side, sc: Scratch, ply: number): Centi;                // builds level-1 tables into its own scratch
  stage2(p: PackedState, root: Side, sc: Scratch, ply: number): Centi;                // builds level-2 tables
  evaluate(p: PackedState, root: Side, alpha: Centi, beta: Centi, sc: Scratch, ply: number, meter: WorkMeter): Centi;   // lazy driver
  full(p: PackedState, root: Side, sc: Scratch, ply: number, outFeatures?: Int32Array): Centi;   // all stages, for gates/Texel
}
export function terminalScore(p: PackedState, root: Side, ply: number): Centi | null;   // ±(WIN_CC - ply*MATE_PLY_CC), DRAW_CC, null if ongoing
```

### 4.16 `search/*`

```ts
// tt.ts
export const Bound = { EXACT: 0, LOWER: 1, UPPER: 2 } as const;
export interface TTEntry { keyHi: number; scoreCc: Centi; depth: number; bound: number; bestEndLo: number; age: number }
export class TranspositionTable {
  constructor(bits: number);                       // 2^bits entries, 4-entry buckets, 16 bytes each
  probe(lo: number, hi: number, out: TTEntry): boolean;
  store(lo: number, hi: number, scoreCc: Centi, depth: number, bound: number, bestEndLo: number, ply: number): void;
  newSearch(): void; clear(): void; readonly hits: number; readonly probes: number;
}
export class ProofCache { constructor(bits: number); get(lo: number, hi: number): number /* 0 unknown, 1 mate, 2 rescue, 3 disproven-force */; put(lo: number, hi: number, v: number): void }
export function scoreToTT(score: Centi, ply: number): Centi; export function scoreFromTT(score: Centi, ply: number): Centi;

// order.ts
export interface OrderTables { killers: Int32Array /* 2 per ply */; counter: Int32Array /* 2^14 */; histMove: Int32Array /* 6 kinds*100 */; histBuy: Int32Array /* 18*100 */ }
export function newOrderTables(maxPly: number): OrderTables;
export function scoreTurns(p: PackedState, t: NodeTables, turns: Turn[], n: number, tt: TTEntry | null, ord: OrderTables, ply: number, prevSig: number, s: SearchContext): void;   // writes gainCc, hangCc; sorts in place (stable, deterministic)
export function onCutoff(ord: OrderTables, t: Turn, ply: number, prevSig: number, depth: number): void;

// quiesce.ts
export interface QuiesceConfig { maxPly: number /* 4 */; deltaMarginCc: number /* 300 */; maxCandidates: number /* 8 */ }
export function quiesce(s: SearchContext, p: PackedState, alpha: Centi, beta: Centi, ply: number, qply: number): Centi;
export function isTacticalTurn(p: PackedState, t: Turn): boolean;   // KILL | HOME_ENTRY | HOME_RESCUE | HOME_RACE | SUMMON_STRIKE

// pvs.ts
export interface SearchConfig {
  maxDepth: number /* 12 */; aspirationCc: number /* 200 */; lmrRank1: number /* 6 */; lmrRank2: number /* 12 */;
  futilityMarginCc: number /* 200 */; useLmr: boolean; useAspiration: boolean; useFutility: boolean; useExtensions: boolean;
  quiesce: QuiesceConfig; gen: GenConfig; genInterior: GenConfig; ttBits: number; dfpn: DfpnConfig; useDfpn: boolean;
}
export interface HardSearchStats { nodes: number; qnodes: number; turnNodes: number; evals: number; ttHits: number; ttProbes: number; depth: number; seldepth: number; byClass: Int32Array; proverCalls: number; dfpnCalls: number; catalogRebuilds: number; replicaDivergences: number; work: number; elapsedMs: number; stopReason: 'complete' | 'work' | 'abort' }
export interface SearchContext {
  rep: Replica; cat: Catalog; gen: TurnGenerator; tt: TranspositionTable; proof: ProofCache; ord: OrderTables; eval: Evaluator;
  meter: WorkMeter; cfg: SearchConfig; root: Side; sc: Scratch; tables: NodeTables[] /* per ply */; keep: KeepSetTable[] /* per ply */;
  undo: Undo; pool: TurnPool; stats: HardSearchStats; stop: () => boolean;
}
export interface SearchResult { best: Turn | null; scoreCc: Centi; depth: number; pv: Turn[]; stats: HardSearchStats }
export function pvs(s: SearchContext, p: PackedState, depth: number, alpha: Centi, beta: Centi, ply: number, prevSig: number): Centi;
export function iterativeDeepening(s: SearchContext, p: PackedState, onDepth?: (r: SearchResult) => void): SearchResult;

// time.ts
export const WorkClass = { MACRO: 0, QUIESCE: 1, TURN: 2, GEN: 3, KILLTABLE: 4, DFPN: 5, EVAL1: 6, EVAL2: 7, PROVER: 8 } as const;
export const WORK_COST: readonly number[];        // [4, 4, 1, 4, 8, 2, 2, 12, 40]  (≈ µs on the reference box; M14 bench --calibrate reports the measured ratio)
export const WORK_LADDER: readonly number[];      // [25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6]
export class WorkMeter { constructor(limit: number); spend(cls: number, n?: number): void; exhausted(): boolean; readonly used: number; readonly limit: number; readonly byClass: Int32Array }
export interface DeviceProfile { unitsPerMs: number; samples: number }
export interface TimeConfig { minMs: number /* 2000 */; maxMs: number /* 6000 */; baseMs: number /* 3000 */; abortFactor: number /* 3 */ }
export function chooseWork(profile: DeviceProfile, targetMs: number): number;              // largest rung ≤ unitsPerMs * targetMs; floor WORK_LADDER[0]
export function updateProfile(profile: DeviceProfile, work: number, elapsedMs: number): DeviceProfile;   // EWMA α = 1/4, only after a COMPLETED search
export function targetMs(p: PackedState, t: NodeTables, cfg: TimeConfig, bookHit: boolean, candidates: number): number;

// root.ts
export interface RootOptions { work: number; config: HardConfig; canonical: GameState; onProgress?: (p: { depth: number; scoreCc: Centi; work: number; firstAction: AIAction | null }) => void }
export interface RootResult { actions: AIAction[]; scoreCc: Centi; depth: number; work: number; stats: HardSearchStats; source: 'search' | 'home-race' | 'mate' | 'rescue' | 'dfpn' | 'book' | 'fallback'; endKey: string; fallback?: 'pack-error' | 'engine-error' | 'divergence' }
export function searchRoot(engine: HardEngine, state: GameState, opts: RootOptions): RootResult;
```

### 4.17 `book/*`, `verify/*`, `engine.ts`, `config.ts`

```ts
// book/format.ts — 'MUJUBK02', header: magic[8] entryCount u32 handicap u8 mapHash u32 weightsVersion u16; 20-byte entries sorted by (keyLo, keyHi)
export interface BookEntry { keyLo: number; keyHi: number; turnLo: number; turnHi: number; flags: number /* bit0 negated, bit1 exact */; score: number; count: number }
export interface Book { lookup(lo: number, hi: number): BookEntry | null; size: number; handicap: number; mapHash: number; weightsVersion: number }
export function parseBook(bytes: ArrayBuffer): Book; export function packBook(entries: BookEntry[], meta: { handicap: number; mapHash: number; weightsVersion: number }): Uint8Array;
export const EMPTY_BOOK: Book;
// book/probe.ts
export function canonicalKey(p: PackedState): { lo: number; hi: number; negated: boolean };   // min(Kpos, Kpos∘rot180) with seat swap
export function probeBook(book: Book, p: PackedState, turns: Turn[], n: number): number;     // index of the matching candidate or -1 (drift falls through)

// verify/replay.ts
export interface ReplayCheck { actions: AIAction[]; verified: boolean; divergedAt: number; reason?: string; endState: GameState }
export function verifyTurn(rep: Replica, state: GameState, p: PackedState, t: Turn, keep: KeepSetTable): ReplayCheck;
// verify/perft.ts (production-side so vitest can import without the lab tsconfig)
export function perftActions(state: GameState, maxActions: number): number;
export function perftTurns(state: GameState): number;
export function perftMidStates(state: GameState): number;
export function perftReplica(rep: Replica, p: PackedState): { sequences: number; midStates: number; endPositions: number; endKeys: Set<string> };
export function endKeysCanonical(state: GameState, rep: Replica): Set<string>;   // canonical enumeration, each end state packed and hashed

// config.ts
export interface HardConfig extends SearchConfig { time: TimeConfig; profile: DeviceProfile; ttBitsMacro: number; ttBitsTurn: number; K: number; kInterior: number; weights: Weights; book: Book | null }
export const DESKTOP: HardConfig; export const MIDRANGE: HardConfig; export const PHONE: HardConfig; export const LAB: HardConfig;
export function profileFor(unitsPerMs: number, deviceMemoryGb: number | undefined): HardConfig;

// engine.ts
export class HardEngine {
  constructor(cfg?: Partial<HardConfig>);
  setSeed(seed: number): void;                    // no-op for the search (no RNG); accepted for the EngineBot contract
  setWeights(w: Weights): void; setBook(b: Book | null): void;
  /** One whole turn. `work` bypasses the device rung entirely (CI, SPRT, lab). */
  searchTurn(state: GameState, opts?: { work?: number; targetMs?: number; onProgress?: RootOptions['onProgress'] }): Promise<RootResult>;
  /** Legacy shim: searches the whole turn, returns its first action as an AIResult. */
  findBestAction(state: GameState, decisionMs?: number): Promise<AIResult>;
  calibrate(): DeviceProfile;                     // 40 ms fixed micro-benchmark; NEVER called when `work` is given
  readonly profile: DeviceProfile; readonly config: HardConfig;
}
```

---

## 5. Algorithms

### 5.1 Bitboard BFS and strike areas

`bfsFrom(occ, origin, out)`: `frontier = {origin}`, `dist[origin] = 0`; repeat `frontier = dilate(frontier)
& ~occ & ~visited` until empty (≤ 99 iterations, typically 6–14), assigning `dist = d` per ring. The
neighbour order does not affect distances; where a path is needed (only `verify/replay.ts`, never search)
the canonical up/down/left/right order (`movement.ts:251`) is reproduced. `moveCost(dist, to, speed) =
ceil(dist[to]/speed)`, `-1` when `dist[to] <= 0` — identical to `getMoveCost` (`movement.ts:226-234`).
`DistanceCache` is direct-mapped, `2^14` entries keyed by `hash(occHash, origin)`, storing the origin and
occHash for verification; occupancy changes 2–6 times per turn so sibling nodes share maps (ET §7.1).

`strike[side]` = ∪ over living units u of side of `dilate(reach(u, spd, 3))` — the full area (not the
perimeter `getAttackFrontier` returns, `movement.ts:200-214`, JF §3.2). Oracle for M6:
`dilate(getMovementRange(pos, speed, 3, board) ∪ {pos})` as a set. Own-occupied squares are kept in the
mask (an attack target square is never own-occupied, so it does not matter for hanging; it matters for
`retreats`, which subtract `strike[defender]`).

### 5.2 `strikeIfBought` (SU §2.5, EG G2)

For side S with bank B and legal spawn mask L: for each distinct speed s among affordable tier-1s
(`getAffordablePurchases`, `building.ts:7`: speeds 1 for Sjor/Muju/Inyan, 2 for Hi/Göl, 3 for Radi),
one multi-source BFS from L over `~occ` gives `minDist[q]`; the strike set for speed s is
`dilate({q : 0 < minDist[q] ≤ 3s})`. Union over speeds: ≤ 3 multi-source BFS per side per node. A fresh
Radi therefore strikes at BFS radius 10, Hi/Göl at 7, Sjor at 4 (SU §2.5). Oracle for M6: brute force over
`getAllSpawnPositions × getAffordablePurchases` of `dilate(getMovementRange(q, spd, 3))`.

### 5.3 Turn canonicalisation (F1 fix) and the within-turn TT

Turns are atomic (no opponent interleaving; `turn.ts:87-89`) and income depends only on final squares
(`mining.ts:19-23`). Three rules:

**C0 — promotions by slot index.** `for (u = first; u < slotCount; u++)` exactly as
`assembly/tactics.ts:143-159` and `homeCheckmate.ts:125-156`.

**C1 — footprint independence.** At node `S1` reached by applying `prev` at `S0`, child `cur` is pruned
iff `isIndependent(prev, cur)` and `key(prev) > key(cur)`, with
`key(a) = (rank << 20) | (slot << 10) | square`, `rank(ATTACK) = 0`, `rank(MOVE) = 1`.

```
footprint(MOVE m at state S)   = {m.from, m.to} ∪ Ball(S, m.from, spd(m.slot) × cost(m))
footprint(ATTACK a at state S) = {attackerSq(a), a.targetSq}
Ball(S, o, r)                  = {q : 0 ≤ dist_S(o, q) ≤ r} over ~occ(S), i.e. every square any path of
                                  cost ≤ cost(m) could have used, on the occupancy the action is applied to
isIndependent(prev, cur) = slot(prev) ≠ slot(cur)
                           ∧ footprint(prev at S0) ∩ footprint(cur at S1) = ∅
```

Why this is sound (the F1 counterexample and its mid-game form both survive): the only way `cur`'s
legality or cost can depend on `prev` is through a square `prev` vacated (`prev.from`, or a lethal
attack's victim square) or filled (`prev.to`) lying on some path of `cur`, or `cur` attacking a unit
`prev` moved or killed; every such square is inside `footprint(cur at S1)` (its BFS ball on the post-prev
occupancy contains every square within its cost radius, and the vacated square is now empty and therefore
inside the ball if reachable) or inside `footprint(prev at S0)` (explicit `from/to/target`), so the
footprints intersect and the pair is not pruned. Conversely if `prev`'s cost or legality depends on
`cur` (the swapped order), the square `cur` vacates lies on `prev`'s alternative path; the alternative
path's square preceding it is within `prev`'s S0 ball and adjacent to `cur.from`, hence within `cur`'s
ball of radius ≥ 1 — intersection again. Attack legality depends only on the attacker's own flags and
target adjacency (`combat.ts:13-41`), both covered by the explicit footprint squares. `enumerateAll`
(naive) versus `run` with widths `[∞,∞,∞,∞]` and no TT must produce identical **sets** of end-position
`Kpos` — the M11 gate — on the initial position (797), the 11 authored fixtures, 200 corpus positions,
and the two JE F1 fixtures ("step aside, then run" from the initial position; own Muju F5→E5 then Hi
F6→F4 through F5). Set equality (not multiset) is the correct statement: a pruned order whose swapped
form reaches the same squares with more actions left reaches a superset of end positions.

**C2 — the within-turn TT.** `TurnTT`: `Int32Array(2^18 * 3)` = `[keyLo, keyHi, payload]`,
`payload = (generation << 8) | (actionsRemaining << 4) | 1`; a hit requires `keyLo`, `keyHi`, `generation`
match and stored `actionsRemaining ≥` current. Cleared by `bump()`. ET §1.4 measured the collapse
14,959 → 1,053 on turn 1; the M11 gate requires the canonical DFS with widths `[∞...]` to visit ≤ 1,053
mid-turn states on the initial position.

### 5.4 Within-turn action search (`gen/actionsearch.ts`)

```
run(p, prefix):                       # p is in the action phase, place plan applied, actions = 4
  heap = MinHeap(cfg.keep)
  dfs(step = 0, prev = NONE)
dfs(step, prev):
  meter.spend(TURN)
  if turnTT.probe(kturn, p.actions): return
  consider(END_ACTION)               # make END_ACTION (income + boundary), score post-boundary, unmake
  if p.actions === 0: return
  n = rep.genActions(p, buf[step])   # attacks first, then moves (ascending slot, square)
  score each with actionPriority(); stable-sort descending; take widths[step]
  for a in slice:
      if prev !== NONE and isIndependent(prev, a) and key(prev) > key(a): continue     # C1
      make(a); dfs(step + 1, a); unmake()
      if meter.exhausted(): return
  turnTT.store(kturn, p.actions)
```

`widths = [6, 4, 3, 2]` (ET §3.5), ≤ 144 leaf lines per place plan before the TT. `consider` records a
`Turn` (prefix + actions + END_ACTION) with `endLo/endHi`, flags, and the within-turn score (stage-1 eval
of the post-boundary position from the mover's perspective).

`actionPriority(a)` (integer, descending):

```
+ 100_000 · [kills a unit standing on MY corner]
+  50_000 · [kills a unit whose killActions against me ≤ 4]          # remove the threat
+   1_000 · victimValueCc / actionCost                                # MVV-LVA analogue (cost/action)
+     600 · [Cleave continuation: attacker atkCount > 0 and tier allows]
+     400 · [move ends on the enemy corner]
+     300 · anchorsVoidedBy(to)                                       # spawn denial
+     200 · [move ends outside exposure[me] having started inside]    # retreat
+     PST_MINE[def][reserve[to]] − PST_MINE[def][reserve[from]]       # income delta
−      80 · actionCost
+ histMove[kind][to] >> 5
```

### 5.5 Purchase enumeration (`gen/purchase.ts`, EG G7)

Prices 3/3/4/4/5/5 (`units.ts`); 7,713 multisets at 40 crystals (ET §3.3). Three stages:

**Dominance (`candidateDefs`)** — drop a definition only when every listed condition holds:

| Drop | In favour of | Conditions (all) |
|---|---|---|
| `lightning_1` | `fire_1` | no enemy unit and no anchor-target square q with `ceil(d(q)/3) < ceil(d(q)/2)` from the nearest legal spawn square; the enemy corner is not within BFS 12 of any legal spawn square; Radi is not the unique lethal answer in `killNow` |
| `metal_1` | `plant_1` | every candidate square has `reserve ≥ 3`; Inyan's ATK 1 completes no `killNow` entry that Muju's ATK 0 cannot |
| `shadow_1` | `water_1` | **F17:** no enemy fire/lightning unit lies at BFS distance in `(4, 7]` of any candidate square; no candidate square is a `CORRIDOR` (0-reserve) cell; `anchorsVoidedBy` is 0 for every candidate square; Göl is not the unique lethal answer in `killNow` |

Never drop the sole lethal answer in `killNow` or the sole definition that can place a blocker inside an
enemy rectangle. `fire_1` is never dropped. Typically 6 → 2–3 classes.

**Multisets.** `maxBodies = min(floor(bank/3), spawn.area, 4)`. Enumerate non-decreasing multisets over
the surviving classes with `Σcost ≤ bank`; ≤ 35 multisets. No liquidity floor is applied here — the
`BankLiquid`/`Inv14LiquidityFloor` features price it (SU §8.4 rules the ratio uncalibrated).

**Square assignment.** For each multiset of k ≤ 4 bodies, take the top `S = 8` squares of `spawn.legal`
by `squareScoreCc`, enumerate all injective assignments (`P(8,k) ≤ 1,680`), keep the best 3:

```
squareScoreCc(def, q) =
    w.mineCc   · PST_MINE[def][reserve[q]]
  + w.safeCc   · (bbHas(exposure[me], q) ? −cost[def] : +cost[def]/2)
  + w.blockCc  · anchorsVoidedBy(enemy, q)                       # corner counts every anchor
  + w.strikeCc · [killNow after placing def at q reaches a target]   # summon-and-strike (SU §2.5)
  − w.anchorCc · (RECT_AREA shrink caused by occupying q)
  + w.homeRaceCc · [moveCost(q, enemyCorner, spd[def]) ≤ 4]      # F13: the race is always a plan
```

**No rejection.** The whole plan's `scoreCc` subtracts `w.zeroSpawnCc` when the plan's own post-place
`spawnAfter === 0 ∧ bank − spend ≥ 3`, but the plan survives; the eval's `SpawnZero`/`Inv1` on the
**post-turn** position decides (F16: `BUY water_1@C1 → Hi C2→D2 → Sjor C1→C2 → ATTACK C3` vacates C1 and
must remain reachable). `Inv5PoorMinerSquare` likewise is a penalty.

**Ordering legality.** Buys are emitted in descending `squareScoreCc`; a buy rejected because its square
is not yet legal is retried after the others; own units never block own rectangles (`spawning.ts:85-92`),
so one retry pass suffices. Place plans = (≤ 12 purchase plans) × (≤ 8 promotion candidates) pruned to
`maxPlacePlans` (16 root, 8 interior) by `scoreCc`, always including the empty plan and every home-race
plan from `homeRaceAvailable`.

### 5.6 Promotions, the generator facade, forced injections, recall

`planPromotions` emits ≤ 8 mission candidates (ET §3.4): KILL (new `power` crosses a `killNow` target's
effective defence this turn), SURVIVE (leaves an enemy one-shot band per `killsInOne`), INCOME (a plant on
a cell with `reserve ≥ 2 × newMine`), REACH (`lightning_2→3`, `metal_2→3`), ANCHOR (the deepest unblocked
anchor with `killActions ≤ 4`). A promotion is never free: `scoreCc` charges the crystals and
`RENT_PV × Δupkeep` (SU addendum 1). Rules: not on the purchase turn, once per unit per turn
(`promotion.ts:44-58`); cost 4/8 (`promotion.ts:9-23`).

```
generate(p, K):
  if p.upkeepPending: keep-set prefix = genKeepSets(p) (§5.10), one place-plan set per keep-set (≤ 4 keep-sets at interior nodes, all ≤ 64 at the root)
  placePlans = planPurchases × planPromotions, pruned to maxPlacePlans, plus the empty plan, plus every homeRaceAvailable plan
  for each place plan: make prefix (buys, promotions, END_PLACE if still in place phase); ActionSearch.run → ≤ keep lines; unmake
  forced injections (FORCED flag, never counted against K, never LMR-reduced, never futility-pruned):
    1 every homeRaceAvailable line (HOME_RACE)
    2 every killNow[me] entry with minActions ≤ actions, realised by its cheapest witness (KILL)
    3 every legal home-corner entry by an existing unit (HOME_ENTRY)
    4 the home rescue witness when an enemy occupies my corner (HOME_RESCUE) — from prover.ts homeWitness
    5 the mine-only turn: [END_PLACE?] END_ACTION (QUIET; the null-move substitute, ET §4.6)
    6 the best pure-defence turn: retreat the highest-value unit inside exposure[me] with killActions ≤ 4 to the nearest square outside it (RETREAT)
    7 the best spawn-denial turn: the move maximising anchorsVoidedBy (corner = all) (SPAWN_DENY)
    8 the best summon-and-strike: BUY d@q + attack with killNow after the buy (SUMMON_STRIKE)
  dedupe by (endLo, endHi); sort by within-turn score; return top K plus all forced
```

**Recall instrument** (`lab/hard-ai/recall/run.ts`): on N positions, cheap generator (production
`GenConfig`) vs reference (`generateReference`); truth = argmax of a depth-2 PVS restricted to the
reference set; report `top1`, `top3`, `regret` (cc gap of the best cheap candidate) at p50/p90/max.
Positions are sampled **both** at engine-to-move roots and at opponent-reply nodes after the engine's own
move (F25). The run also computes the **ceiling** — the `k` highest-within-turn-score candidates of the
deeply-scored union, i.e. the best list any `K = k` generator ranked by §5.4's score could return — and
reports each statistic's share of it. §8's targets are stated on those shares, because the absolute
`top1` is bounded near 0.64 by the shape of the measurement rather than by the generator (§9 addendum
2026-09-15).

### 5.7 Kill-combination DP (`tables/kill.ts`, EG G3/G16/G17)

Generalises `enoughPossibleDamage` (`homeCheckmate.ts:27-49`) from the corner's 2 lanes to ≤ 4 lanes and
from Manhattan to BFS:

```
minActionsToKill(target, attacker side, opts):
  lanes   = ADJ_LIST[sq[target]] ∩ (empty ∪ squares holding an attacker-side unit)
  maxHits = min(opts.maxLanes, |lanes|)         # a corner admits 2 (homeCheckmate.ts:28-31)
  need    = def[target] − damage[target]
  power[h][a] = −INF; power[0][0] = 0; crystals[h][a] = INF; crystals[0][0] = 0
  candidates:
    each own living slot u with F_CAN_ACT, canAttack (atkCount, F_LAST_KILLED), POWER[side][def[u]][def[target]] > 0:
        d = min over lanes l of dist(u, l) via t.dist.get(p, sq[u]); cost = ceil(d/spd) + 1 (0 → 1 when adjacent)
        entry (cost, crystals 0, power)
        if opts.allowPromotes and nextDef ≥ 0 and promoCost ≤ crystalBudget and !F_PLACED and !F_PROMOTED:
            entry (cost, promoCost, POWER[side][nextDef][def[target]])
    if opts.allowBuys: for each affordable tier-1 d: q = argmin over legal spawn squares of dist(q, nearest lane)
        (one entry per definition, cost = ceil(d/spd[d]) + 1, crystals = cost[d]) — mirrors server/analysis/tactics.ts:41-69 damageUpperBound
  DP over candidates (each contributes at most ONE hit: a non-lethal hit closes the chain, combat.ts:13-17):
    new[h][a] = max(power[h][a], power[h−1][a−cost] + pow) with crystals as lexicographic tiebreak
  answer = min (a, crystals) with power[h][a] ≥ need for some h ≤ maxHits; lanes/attackers recovered by backtrace
```

Cost per target O((units + 6) × 4 × 5). `killTable` amortises with one multi-source BFS per side.
`cleaveChain(v)`: for each square q in `reach(v, 3)` count own units adjacent to q that v one-shots
(`killsInOne`); value = Σ of the `tier[v]` most valuable, capped by actions left after the approach.
Oracles (M7): exhaustive replica turn search on 2,000 positions with ≤ 8 own units (JF §1.1 sizing); the
corner case must equal `homeCheckmate.ts:27-49`; the LH §4.1 Cleave probe (Kagari vs three adjacent Mujus
kills 3 in 3 actions, spaced C1/E1/G1 kills 2 in 4).

### 5.8 Approach, economy, geometry, home tables

**Approach** (SU §2.3, addendum 20a): for defender slot v and every enemy attacker a (existing, promoted
form, or purchasable at each spawn square): `d = dist(a, cheapest empty square adjacent to v)`,
`s = spd`, `cls = d ≤ 2s ? RETREAT : d ≤ 3s ? STRAND : NONE`; `retreats = |reach(attackSquare, s, 1) \
strike[defender]|`. Table stores the cheapest lethal attacker per own slot. Oracle (M6):
`server/analysis/tactics.ts:272-291 approachTable` on 500 positions × every (attacker, target) pair
(importable from `lab/**` only; `server/**` is outside the root tsconfig, JF §3.2).

**Economy DP** (KF §4.2, fixed point `GAMMA_Q16`): H = 6; miners in ascending slot order; per turn each
miner takes `min(mine, reserveCopy[assign])`; a dry miner relocates to `argmax PST_MINE[def][reserve[c]]
>> (actionCost/2)`, halved when `c ∈ strike[enemy]`, tie → lowest square, `actionCost ≤ 8`, charged
`busy = ceil(actionCost/4)` turns and `relocationDebt += actionCost × ACTION_VALUE_CC`; `upkeep_t = Σ
upkeep[def]`; `stream += GAMMA_Q16[t+1] × (income_t − upkeep_t) × CC >> 16`; `turnsToInsolvency` = first k
with `bank + Σ_{t≤k}(income_t − upkeep_t) < 0`, else H + 1; `waste = Σ (mine − take)`. Oracle (M8): with
relocation off the stream equals a literal 6-turn simulation through canonical `endTurn` on 2,000
positions; with relocation on it is ≥ stay-in-place and ≤ total board reserve.

**Geometry** (SU §4): `area`, `reserveSum`, `anchorDepth = max over unblocked anchors of (x+y)` for White
(`18−x−y` Black), `convertible = min(bank, 5 × area)`, `zeroCliff = [area == 0 ∧ bank ≥ 3]`,
`blocking = blockingSet(side, candidate = squares the enemy can occupy this turn: reach ∪ purchase reach,
cap 3)`, `fragility = 2·[blocking ≤ 1] + [killActions[deepestAnchor] ≤ 4]`, `infiltrationAnchors = Σ over
own slots inside an enemy rectangle of anchorsVoidedBy` (corner = all), `cornerNeighboursHeld` = own
corner neighbours occupied by own speed-1 miners. Oracle (M9): `legalSpawnMask ≡ getAllSpawnPositions`
on 1,000,000 fuzz positions; `blockingSet` with `candidate = null` ≡ `server/analysis/geometry.ts:25-50`;
the SU §4.1 F5 case (30/27/2, blocking 1); `spawnMaskWithout` on the F11 fixture.

**Home** (ET §5.3, SU §4.4): `actionsToCorner = min over enemy units of ceil(cornerDist/spd) ∪ min over
affordable tier-1 × enemy spawn squares of ceil(cornerDist/spd)`, `turnsToCorner = ceil(·/4)`,
`buyThreat`, `rescuers` (own units adjacent to the corner with `power > 0` against the nearest threat),
`plug`, `occupied`. `homeRaceAvailable` = SU addendum 20b (finds the archived turn-3 `lightning_1@G1 →
J10` win; M9 gate).

### 5.9 Home-prover replica and gating (`tactics/prover.ts`)

`homeVerdict` replicates `analyzeHomeDefense` (`homeCheckmate.ts:57-168`) on the packed state: build the
defender's reply position (heal + reset, `upkeepPending = 0`, action phase, 4 actions); if the damage
bound fails → MATE (method `damage_bound`); else `prepare` over units sorted by Manhattan distance to the
occupier (keep / keep + promote / release if tier > 1), then `act`: attacks (all defender units, sorted by
target distance) then one-action moves while `actions > 1`, transposition set keyed by `Kturn`, node cap
`PROOF_NODES`, `RESCUE | MATE | UNKNOWN` with exhaustion never a win. The PA line is exposed by
`homeWitness` for injection 4.

Gating: `make` calls it only under `needsProof` (§3.4). M10 gates: (a) verdict equals
`analyzeHomeDefense` on all 28 `lab/ai/fixtures.ts` cases and 20,000 fuzz positions with an occupier;
(b) every witness replays legally through canonical `applyAction` and removes the occupier; (c) on
100,000 fuzz actions the gated replica's `result/reason` equals the ungated canonical `applyAction`'s
(**the gate-preservation proof**); (d) the SU §8.1 fixture: at `clock = 9` a proven checkmate returns
`HOME_CHECKMATE` at the action, an unproven occupation returns `INACTIVITY` at the boundary.

### 5.10 The must-answer layer and upkeep keep-sets (`search/root.ts`, `gen/upkeep.ts`)

Order at the root, each a FORCED candidate; a **proven terminal** returns immediately:

1. **Home race with purchases** (F13; SU addendum 20b): for every affordable tier-1 d and legal spawn
   square q, `moveCost(dist(q), enemyCorner, spd[d]) ≤ actions` (4 in the place phase). Each line is
   replayed through canonical `applyAction` (which runs the real prover); a `home-checkmate` result is
   returned with `source: 'home-race'`. Otherwise the line stays a FORCED candidate (occupation that
   survives to my next `startTurn` wins, `turn.ts:23-27`, and the search sees that at depth 2).
2. **Elimination-in-1**: any lethal attack on the last enemy unit.
3. **Home rescue**: enemy on my corner → `homeWitness` (WASM `TacticalSolver` when available, the JS
   `referenceTactics` otherwise, both already re-validated through `isLegalAction`); a proved rescue is
   FORCED first; no rescue → the search continues (the position is lost unless the opponent errs).
4. **Home mate-in-1**: every home-corner entry by an existing unit, replayed canonically.

**Upkeep keep-sets.** When `upkeepPending`, the turn's first action is `PAY_UPKEEP`. `genKeepSets`
reproduces `upkeepActions` (`upkeep.ts:34-55`: exact subsets for ≤ 12 rent-bearing units, four greedy
orderings above) and ranks by: keep every rescuer adjacent to my corner, every unblocked anchor, every
attacker in `killNow[me]`, then by `material − RENT_PV × upkeep`; capped at 64 at the root, 4 at interior
nodes. The keep-set is a **searched root branch** (MF), never a static rank; the affordable home rescue is
preserved as today (`engine-v2.ts:67-75`). `PAY_UPKEEP` carries the keep-set index in `paA`.

### 5.11 Search

#### 5.11.1 Scores and terminals
`WIN_CC = 1,000,000` (material max 170,000 + bank 50,400 cannot reach it); mate = `±(WIN_CC − ply ×
MATE_PLY_CC)` (F21); draw `0`. TT store/probe adjust mate scores by ply (`scoreToTT/FromTT`, unit-tested).
Terminal order in `make` is canonical (§2.2 of SF): checkmate at the action, inactivity at the boundary,
occupation at `startTurn`; `tests/ai/hard/terminal-order.test.ts` pins SU §8.1.

#### 5.11.2 Iterative deepening and PVS
```
iterativeDeepening(p):
  for depth = 1..cfg.maxDepth:
    if meter.used > 0.45 × meter.limit and depth > 1: break        # never start an iteration you cannot finish
    window = depth ≤ 2 or !useAspiration ? (−INF, +INF) : (score ± aspirationCc); widen ×4 on fail, full after 2 fails
    s = pvs(p, depth, lo, hi, 0, 0); record best, pv, onDepth(...)
    if meter.exhausted() or stop(): break
pvs(p, depth, alpha, beta, ply, prevSig):
  meter.spend(MACRO)
  if p.result ≠ ONGOING: return terminalScore(p, root, ply)
  if depth ≤ 0: return quiesce(p, alpha, beta, ply, 0)
  tt = probe(kpos); if tt.depth ≥ depth and bound usable: return scoreFromTT
  t = buildTables(p, sc, ply, 2)                       # meter.spend(KILLTABLE)
  ext = (useExtensions and (minTurnsToCorner(me) ≤ 1 or minTurnsToCorner(them) ≤ 1)) ? 1 : 0   # the "in check" analogue
  if useDfpn and depth ≥ 3 and (minTurnsToCorner(me) ≤ 3 or minTurnsToCorner(them) ≤ 3) and proof.get(kpos) ≠ DISPROVEN:
      r = forceHome(p, me); if PROVEN: store; return WIN_CC − ply×MATE_PLY_CC; if DISPROVEN: proof.put(DISPROVEN)
  n = gen.generate(p, t, scorer, meter, ply, keep[ply], turns, stats)   # meter.spend(GEN) per place plan
  scoreTurns(...)                                       # §5.11.3, includes the SEE demotion
  best = −INF; bestEnd = 0; i = 0
  for each turn:
      if useFutility and depth == 1 and !(flags & (KILL|HOME_ENTRY|HOME_RESCUE|HOME_RACE|FORCED)) and stage1(p) + maxPlausibleGain(t) + futilityMarginCc < alpha: continue
      r = depth − 1 + ext
      if useLmr and i ≥ lmrRank1 and !(flags & (KILL|HOME_ENTRY|HOME_RESCUE|SPAWN_DENY|FORCED|HOME_RACE)): r −= (i ≥ lmrRank2 ? 2 : 1)
      makeTurn(t); s = i == 0 ? −pvs(r, −beta, −alpha) : −pvs(r, −alpha−1, −alpha)
      if i > 0 and alpha < s < beta, or r < depth−1+ext and s > alpha: s = −pvs(depth−1+ext, −beta, −alpha)
      unmakeTurn(t); i++
      if s > best: best = s; bestEnd = t.endLo
      if s > alpha: alpha = s
      if alpha ≥ beta: onCutoff(...); break
      if meter.exhausted(): break
  store(kpos, best, depth, bound, bestEnd, ply); return best
```
Negamax flips sign only across the turn boundary (all four actions belong to one player); the
`tests/ai/hard/negamax-sign.test.ts` fixture pins it (the bug `docs/AI_CORRECTNESS-2026-09-07.md` repaired).
`makeTurn` applies the turn's packed actions with `make`, one undo frame per action; the root clones once so
a cancel always returns a consistent position. `maxPlausibleGain(t)` = value of the most valuable enemy unit
in `killNow[me]` + Δ projected income.

#### 5.11.3 TT and ordering
**TT entry** (16 bytes): `keyHi u32 | scoreCc i32 | bestEndLo u32 | depth u8 | bound u2 | age u6 | pad`.
4-entry buckets; replacement: an entry from an older generation is always replaced, otherwise the
shallowest; `store` never overwrites an EXACT entry of greater depth with a bound. Stores `bestEndLo`,
never an action list (ET §4.3); on a hit the candidate whose `endLo` matches is searched first; if none
matches the hit still supplies its bound. The prover verdict lives in `ProofCache` (2^15), never in the TT.

**Ordering** (`scoreTurns`, highest first):

1. TT turn (`endLo === bestEndLo`) `+2,000,000`.
2. `HOME_RESCUE` `+1,500,000`; `HOME_RACE`/`HOME_ENTRY` `+1,200,000`.
3. Proven kills by value per action: `Σ victimValueCc × 100 / actionsSpentKilling`.
4. **SEE analogue (SF):** `hangCc = exposedValueCc` on the post-turn position computed as Σ material of my
   units u with `killActions[u] ≤ 4` under `killTable(them, {allowBuys: true, allowPromotes: true,
   actionBudget: 4})`; subtract `hangCc` from the ordering score. A turn that hangs more than it takes
   drops below quiet turns. This is the F2/F3/F7/F10 loss class (SU §6.2).
5. `SPAWN_DENY` `+300,000 × anchorsVoided` (corner = all anchors); `SUMMON_STRIKE` `+250,000`.
6. `CLEAVE_CHAIN` `+250,000`.
7. Killers (2 per ply, matched on `sig`) `+200,000`; counter-move `counter[hash(prevSig)]` `+150,000`.
8. History: `histMove[kind][to]`, `histBuy[def][sq]` (butterfly, bounded by aging halving).
9. Quiet turns by `Δ(EconDelta + PstMine) + Δ(SpawnReserve) − Δ(Exposure)` from the within-turn score.

`turnSignature` (SF): bits 0–2 first non-END kind; 3–7 defId of the primary actor; 8–12 defId of the
primary target/purchase (31 = none); 13–15 region of the primary destination (8 board regions); 16–19
popcount of `KILL..PROMOTION` flags.

#### 5.11.4 Quiescence
```
quiesce(p, alpha, beta, ply, qply):
  meter.spend(QUIESCE)
  if p.result ≠ ONGOING: return terminalScore
  standPat = eval.evaluate(p, root, alpha, beta, sc, ply, meter)
  if qply ≥ cfg.quiesce.maxPly: return standPat
  if standPat ≥ beta: return beta
  if standPat > alpha: alpha = standPat
  t = buildTables(p, sc, ply, 2); tactical = generate with K = cfg.quiesce.maxCandidates restricted to isTacticalTurn, ordered by value/action
  for each: if standPat + maxGain(t) + deltaMarginCc < alpha: continue
      makeTurn; s = −quiesce(p, −beta, −alpha, ply+1, qply+1); unmakeTurn
      if s ≥ beta: return beta; if s > alpha: alpha = s
  return alpha
```
`isTacticalTurn` = `KILL | HOME_ENTRY | HOME_RESCUE | HOME_RACE | SUMMON_STRIKE` (F24). Income is real
inside quiescence (stand-pat makes it safe, JS §4.2). The prover runs in `bound` mode (`proverMode = 1`)
inside quiescence and df-pn; `full` at the root and at PV nodes of depth ≥ 1. `maxPly = 4`.
Gate (M14): `byClass[QUIESCE] ≤ 0.35 × meter.limit` on every corpus position.

#### 5.11.5 Extensions and reductions (all behind `SearchConfig` flags, each SPRT-gated separately at M20)
Home-threat extension (+1 when `minTurnsToCorner ≤ 1` either side; cap total extensions at 4 per line);
Cleave-chain extension (+1 when the last turn killed ≥ 2 with one unit); LMR `rank > 6 → −1`, `> 12 →
−2`, never on `KILL|HOME_*|SPAWN_DENY|FORCED`; frontier futility with `futilityMarginCc = 200`; aspiration
δ = 200 cc. Classical null-move is **not built** (ET §4.6: income, upkeep and the clock break the
no-zugzwang assumption); the mine-only injection is the substitute.

#### 5.11.6 Work accounting and deterministic time (F18)
`WORK_COST` (units ≈ µs on the reference box, measured by `hard:bench --calibrate` at M14 and recorded in
the artifact): `MACRO 4, QUIESCE 4, TURN 1, GEN 4 per place plan, KILLTABLE 8, DFPN 2, EVAL1 2, EVAL2 12,
PROVER 40 per full-prover call`. A macro node costs ≈ 16 place plans × (4 + ~100 TURN) + 8 + 24 evals ≈
2,000 units ≈ 2 ms; the desktop rung (3 s at ~1,000 units/ms = 3.2 M units) buys ~1,500 macro nodes,
i.e. **depth 4–5 at K = 24 with good ordering, 5–6 with LMR/TT** (ET §4.0's 5–7 was optimistic by the
generator cost; JF §3.1). Honest gates: desktop rung reaches depth ≥ 4 on ≥ 90 % of corpus positions
(M14), phone rung depth ≥ 2 with depth 1 ≤ 150 ms (M15).

`WORK_LADDER = [25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6]`. `chooseWork(profile, targetMs)` =
the largest rung `≤ profile.unitsPerMs × targetMs`, floored at `WORK_LADDER[0]`. `profile.unitsPerMs`
starts at a pessimistic **200** and is updated by an EWMA (α = 1/4) **only after a completed search**
(`updateProfile`); quantisation means jitter cannot change the rung and therefore cannot change the move.
`targetMs = clamp(baseMs × m / 100, minMs, maxMs)` with `m = 100 · 1.5[home threat ≤ 4 actions either
side] · 1.3[killNow worth ≥ 800 cc either side] · 0.5[one candidate] · 0.4[book hit]` (integer
arithmetic). The only clock reads in the engine are `chooseWork`'s input, `updateProfile`, and an abort
watchdog at `abortFactor × targetMs` that can only truncate iterative deepening (returning the last
completed depth), never alter a completed depth. `searchTurn(state, {work})` bypasses `chooseWork`; every
lab ladder passes `work`, so results are machine-independent. There is no RNG anywhere in the search.
`SearchContext.stop` is polled at every macro node and every 1,024 TURN nodes (mirrors
`assembly/tactics.ts:64`).

#### 5.11.7 df-pn home force (`tactics/dfpn.ts`, ET §4.10)
AND/OR over macro-turns (my turns OR, theirs AND), invoked when `depth ≥ 3` and `minTurnsToCorner ≤ 3`
for either side, restricted to threat-relevant turns: attacker turns that reduce `minTurnsToCorner`
or kill a defender adjacent to the corner; defender turns that increase it, kill the approaching unit,
or plug the corner (occupation is impossible while the plug lives, `movement.ts:251-253`). `(pn, dn)` in an
`Int32Array` of `2^17` entries keyed by `Kpos` (reserves + clock contain GHI); `1 + ε` with `ε = 1/4`
(integer thresholds `× 5 / 4`); init `pn = minTurnsToCorner(attacker)`, `dn = defenders within BFS 4 of
the corner + 4·[plugged]`; budget `min(4000, meter.limit / 16)` charged to `DFPN`; terminal detection uses
`proverMode = 1` (admissible) except a mate-in-1 at the root, which is replayed canonically. PROVEN at the
root → mate score; DISPROVEN → `ProofCache`; UNKNOWN costs nothing (exhaustion never wins). Safeguard:
the `home-force` suite (§7.5) with **zero false PROVEN** on ≥ 200 positions, 60 of them verified by an
exhaustive 2-turn AND/OR search on the replica (F12).

### 5.12 Evaluation

Perspective: always from `root`'s point of view; symmetric differences `f(me) − f(them)`; integer cc.
Material priors are `cost × 100`, `material[fire_1]` pinned at 300 during Texel to fix the scale. Rent is
charged **once**, as `Rent`; `PST_MINE` is rent-free; `EconDelta` subtracts `pstSum` (F9).

#### 5.12.1 Feature table (`w` = initial integer weight in cc per unit of feature; all Texel-tunable)

| # | Feature | Definition (per side; feature = f(me) − f(them)) | Table / DP | Cost | w | Rationale |
|---:|---|---|---|---|---:|---|
| 0 | Material | Σ `material[def]` (18 params) | incremental | 0 | 100 | EG G18; priors = cost; Texel fits |
| 1 | Rent | Σ `upkeep[def]` (crystals/turn) | incremental | 0 | −422 | RENT_PV; archived Black 54 upkeep on 175 gross (SU §1.5) |
| 2 | BankLiquid | `min(bank, 8)` | — | 0 | 90 | 6–8 liquidity floor (SU §1.6.1, P3) |
| 3 | BankExcess | `max(0, bank − 8)` | — | 0 | 25 | SU §8.4: ratio uncalibrated, split so Texel prices it |
| 4 | HomeInvaded | `[enemy on my corner]` | — | 0 | −4000 | must rescue or lose (turn.ts:23-27) |
| 5 | PstMine | Σ `PST_MINE[def][reserve[sq]]` | PST_MINE | 0 (incremental) | 60 | SU addendum 3, no rent |
| 6 | BankConvertible | `min(bank, 5 × area)` | spawn | L1 | 20 | ET §5.6 |
| 7 | SpawnArea | `area` | spawn | L1 | 30 | census: best lines 21–27 squares (LH §4.2) |
| 8 | SpawnReserve | `reserveSum / 4` | spawn | L1 | 8 | SD T2 |
| 9 | SpawnZero | `[area == 0 ∧ bank ≥ 3]` | spawn | L1 | −800 | NK:9; census −8.53 |
| 10 | AnchorDepth | `anchorDepth` | spawn | L1 | 25 | D9 pivot: spawn 12 → 30 (GR §2.3) |
| 11 | Infiltration | `infiltrationAnchors` | geom | L1 | 90 | NK:24 Tanka into B2; CA W7 |
| 12 | CornerSeal | `cornerNeighboursHeld` (own immobile miners on B1/A2) | geom | L1 | −60 | SU §8.15 |
| 13 | HomeThreat | `[actionsToCorner ≤ 4]` incl. purchases | home | L1 | −400 | HOME_VICTORY 399/960; NK:24 |
| 14 | HomeCountdown | `max(0, 4 − turnsToCorner)` | home | L1 | −180 | ET §5.3 |
| 15 | HomePlug | `plug` | home | L1 | 220 | archived +Muju@J10 (SU §4.4) |
| 16 | HomeRescuers | `rescuers` | home | L1 | 90 | LH §4.1 D1-vs-E1 probe |
| 17 | Exposure | Σ `material` of own units inside `exposure[me]` | threat | L1 | −20 | coarse hanging; refined at stage 2 |
| 18 | DrawPressure | `sign(v0 + v1 so far) × clock²` | — | L1 | −8 | −648 cc at clock 9 (SF); 20–62 % of scripted games draw (LH §5.12) |
| 19 | ActionsLeft | `actions` at a mid-turn leaf (0 at macro nodes) | — | L1 | 40 | tempo (ET §5.9) |
| 20 | Corridor | own lightning units on `CORRIDOR` | — | L1 | 0 | Texel decides (CA W16 warns against centre pull) |
| 21 | TierClimb | Σ over elements (max tier − 1) | — | L1 | 0 | EG G5: never reward climbing by default |
| 22 | ElementCoverage | `[own or purchasable unit one-shots the enemy's most common DEF-3/4 body]` | catalog | L1 | 150 | SU §3.4.2 |
| 23 | EconDelta | `econ.stream − pstSum` | economy | L2 | 80 | SU §1.4 cliff 38 → 9; no double count |
| 24 | DepletionWaste | `econ.waste` | economy | L2 | −30 | F4/F12 |
| 25 | RunwayCliff | `[bank + income_1 < upkeepDue]` | economy | L2 | −600 | forced release (upkeep.ts:23-31) |
| 26 | Insolvency | `max(0, 6 − turnsToInsolvency)` | economy | L2 | −150 | archived Black resignation |
| 27 | RelocationDebt | `econ.relocationDebt / 100` | economy | L2 | −60 | GR §6.7 treadmill |
| 28 | Hanging | Σ `material[u]` with `killActions[u] ≤ 4` by existing units | kill | L2 | −50 | F2/F3/F7/F10 |
| 29 | HangingBuy | Σ `material[u]` with `killActions[u] ≤ 4` only via a purchase | kill | L2 | −30 | NK:10 bought Radi |
| 30 | ApproachRetreat | Σ `material[u]·[approach[u] == RETREAT]` | approach | L2 | −25 | SD P6 |
| 31 | ApproachStrand | Σ `material[u]·[approach[u] == STRAND]` | approach | L2 | −10 | SD P6 |
| 32 | StrandPunish | Σ `material[a]` over enemy attackers stranded next to my unit and in `killNow[me]` next turn | approach+kill | L2 | 20 | SU addendum 20a |
| 33 | KillAvailable | Σ `valueCc[target] / minActions` over `killNow[me]` | kill | L2 | 35 | EG G3 |
| 34 | CleaveExposure | Σ `chain[v]` over enemy tier≥2 units | kill | L2 | −40 | archived t14 Hono B9→C8 |
| 35 | AnchorFragility | `geom.fragility` | geom+kill | L2 | −120 | NK:11 |
| 36 | BlockingDeficit | `max(0, 2 − blocking)` | geom | L2 | −150 | SU invariant 6 |
| 37 | CornerInfiltration | `[own unit on the enemy corner or both enemy corner neighbours held by me]` | geom | L2 | 300 | every rectangle contains the corner (spawning.ts:8-29) |
| 38–57 | Inv1..Inv20 | SU §7 invariant i violated for the side on the post-turn position (§5.13) | invariants | L2 | see §5.13 | the four recorded losses |

#### 5.12.2 Stages
- **Stage 0** (~50 ns): features 0–4 from incremental sums.
- **Stage 1** (~1–2 µs): builds level-1 tables into the evaluator's own scratch (F6) and adds 5–22.
- **Stage 2** (~6–15 µs): builds level-2 tables, adds 23–57.
Gates (M12): stage-1 ≥ 200,000/s, stage-2 ≥ 50,000/s on the reference box; mirror symmetry
`evaluate(p) === −evaluate(mirror180(p))` for every corpus position at handicap 0 (the map, corners and
starting units are exact 180° images, ET §6.2); determinism (byte-identical over 1,000 repeats and after a
make/unmake round trip); every score integral and `|score| ≤ 600,000` for non-terminals.

#### 5.12.3 Deliberately absent
Raw mobility, `centerControl`, linear `unitHealth`, unconditional `techTreeProgress` (EG G15/G5). Durability
enters only through `killActions`/`killsInOne` (SU §3.4.1).

#### 5.12.4 Lazy evaluation with per-position margins (F15)
Stages 0 and 1 are always computed (they cost ≤ 2 µs). The only lazy exit is stage 1 → 2:

```
v1 = stage0 + stage1
b  = boundStage2(p, t1, w)
if v1 − b ≥ beta: return v1 − b        # fail-high certain
if v1 + b ≤ alpha: return v1 + b       # fail-low certain
return v1 + stage2
```

`boundStage2` is a certified upper bound on `|Σ stage-2 terms|` computed from stage-1 quantities:

```
E_me   = Σ material of my units inside exposure[me];  E_them likewise
B = |w.EconDelta| · 600 · Σ_{both sides} miners·mineRate  (H·γ-sum bound, cc)
  + |w.DepletionWaste| · Σ mineRate · 6
  + |w.RunwayCliff| + |w.Insolvency| · 6 + |w.RelocationDebt| · 8 · units
  + (|w.Hanging| + |w.HangingBuy| + |w.ApproachRetreat| + |w.ApproachStrand|) · (E_me + E_them) / 100
  + |w.StrandPunish| · (E_me + E_them) / 100
  + |w.KillAvailable| · (E_me + E_them) / 100
  + |w.CleaveExposure| · (E_me + E_them) / 100
  + |w.AnchorFragility| · 3 + |w.BlockingDeficit| · 2 + |w.CornerInfiltration|
  + Σ_i |w.Inv_i|
```

Each stage-2 feature is bounded by construction: every hanging/approach/kill/chain term only counts
units inside the other side's exposure mask (a unit outside `strike ∪ strikeIfBought` cannot be attacked
next turn), the economy terms are bounded by mining rates over the horizon, the rest by their maxima.
Gate (M12): on 100,000 corpus positions × 20 random `(alpha, beta)` windows, the lazy result is on the
same side of the window as `full()` in **every** case (zero violations).

### 5.13 The twenty invariants as penalty features (SU §7; KF §4.10 corrected)

Each is evaluated by `invariantBits` on the position **after** the candidate turn (a macro node). **None
is a filter** (F7). Initial penalties (cc, negative = bad for the side that violates):

| i | Test (for side S) | w |
|---:|---|---:|
| 1 | `geom.area == 0 ∧ bank ≥ 3` | −800 |
| 2 | both corner neighbours held by own speed-1 miners | −300 |
| 3 | some own unit with `material ≥ 400` has `approach == RETREAT` and the attacker has `retreats > 0` | −250 |
| 4 | some own unit has `approach == STRAND` and `killActions(attacker) > 4` for me next turn (buys allowed) | −100 |
| 5 | a miner bought this turn stands on `reserve < 2 × mine` with no ANCHOR/BLOCK/PLUG/HOME_RACE role | −400 |
| 6 | `geom.blocking ≤ 1 ∧ anchorDepth ≥ 6` | −120 |
| 7 | promoted this turn and `econ.turnsToInsolvency ≤ 6` | −600 |
| 8 | the turn attacked without killing while a kill was available per `killNow` at the start of the turn | −150 |
| 9 | the turn left a damaged, unkilled enemy (chip across the boundary is worth 0) | −150 |
| 10 | `home.actionsToCorner ≤ 4 ∧ homeVerdict(bound) ≠ RESCUE` | −400 |
| 11 | own corner and both neighbours empty and the enemy has a Radi or ≥ 3 crystals with an unblocked rectangle within 10 | −250 |
| 12 | some enemy tier-2+ unit has `chain[v] > 0` against two or more own units | −40 per chain unit |
| 13 | ≥ 60 % of own units within Chebyshev 2 of home and own `anchorDepth < 4` and enemy `anchorDepth ≥ 4` | −200 |
| 14 | `bank < 6` after a turn that won no material | −200 |
| 15 | structural: any `UNKNOWN` prover verdict is scored as the bad case (never as safety) | — |
| 16 | `clock ≥ 7`, ahead by ≥ 300 cc, and `killNow[me]` is empty | −200 |
| 17 | a buy this turn raised a later MOVE's cost in the same turn | −60 |
| 18 | protocol rule only: `END_PLACE_PHASE` is emitted only when legal (`simulate.ts:118-120`); not a feature (bit always 0) | 0 |
| 19 | own DEF-1 miner inside `strikeIfBought[them]` on a centre/pocket square while the enemy has ≥ 3 crystals | −150 |
| 20 | a kill this turn left the attacker with `retreats == 0` inside `exposure[me]` | −250 |

Gate (M12): twenty authored fixtures (`suites/invariants.suite.json`, one per invariant, authored from the
SU §6.2 failure table) each set **exactly their own bit** in `invariantBits` for the violating turn and no
bit for the correct turn. The suite's `avoid` lists hold the `Kpos` of every violating turn; the engine
passes by not choosing them (M14+).

### 5.14 Opening book (`book/*`, `lab/hard-ai/book/build.ts`)

**Key.** `canonicalKey(p) = min(Kpos(p), Kpos(rot180(p) with seats swapped))` with a `negated` flag; the
symmetry is exact and unique (map `m[i] === m[99−i]`, corners `(0,0)/(9,9)`, starting units exact images;
ET §6.2) and broken by handicap ≠ 0 and by a loaded map, so the header carries `handicap` and `mapHash`
and the probe refuses a mismatch. **Format** `MUJUBK02`: header `magic[8] entryCount u32 handicap u8
mapHash u32 weightsVersion u16`, 20-byte entries sorted by `(keyLo, keyHi)`: `keyLo u32 keyHi u32 turnLo
u32 turnHi u32 flags u8 score i16 count u8`. **Lookup:** binary search; on a hit the candidate generator's
turn whose end key matches `(turnLo, turnHi)` (negated → rotate) is played; no match (generator drift) →
fall through to search. **Build:** best-first expansion from the 797 census turn-1 end positions
(`lab/experiments/opening-census-2026-09-14`), priority `bestValue / (1 + visits)`, each leaf searched at
20× the game work, minimax backup, 50,000 nodes (≈ 1 MB) per handicap 0 and 3. **Sequencing:** built only
from the Texel-tuned engine (M18 after M20's tune); keyed by `weightsVersion` so a retune invalidates it;
the SPRT gate accepts H1 or H0 — on H0 the book ships disabled with the measurement recorded (SU §8.3: the
best first turn is not settled and must not be booked on an untested index).

### 5.15 Tuning pipeline

**Corpus** (`hard:corpus`): self-play at fixed work (default 25,000) with opening diversity from the 797
census positions and both handicaps, sharded; every macro node on the game path is recorded when
**quiet** (no `killNow` entry ≤ actions for either side, `actionsToCorner > 4` both sides), labelled with
the game result. Format `lab/results/hard-corpus-<date>/positions.jsonl`, schema `muju-texel-v1`:
`{"schema":"muju-texel-v1","id":"g91-p63","result":1|0.5|0,"side":0|1,"turn":12,"features":[58 ints],
"material":[18 counts],"kpos":"hex"}` plus `manifest.json` (engine config hash, weights hash, work, seeds,
draw share, terminal histogram). Gate: draw share < 70 % (KF R6), else regenerate with `DrawPressure`
perturbed.

**Texel** (`hard:texel`): fit `k` first (`σ(k·eval)`), then coordinate descent over the 58 weights and 18
material values with `material[fire_1]` pinned at 300, integer steps, 20 % held out; output
`src/ai/hard/eval/weights.generated.ts` (`TUNED_WEIGHTS`) and `lab/results/hard-texel-<date>/weights.json`
(`muju-weights-v1`: `{version, label, w:[58], material:[18], k, lossBefore, lossAfter, corpus}`). Gate:
held-out log-loss strictly improves; all integers.

**SPSA** (`hard:spsa`): parameters `K, kInterior, widths[0..3], maxPlacePlans, keep, quiesce.maxPly,
quiesce.maxCandidates, aspirationCc, futilityMarginCc, lmrRank1, lmrRank2, purchase weights (8),
ACTION_VALUE_CC, WORK_COST ratios (9)`; ±perturbation with paired mirrored games at fixed work,
`--iterations N --batch M --shards S`; writes `lab/results/hard-spsa-<date>/config.json` and updates
`config.ts` defaults only on an SPRT H1 (M20).

---

## 6. Exposure: worker protocol, UI, phones, fallback, rollout

### 6.1 Worker protocol 3 (additive; F19)

```ts
// src/ai/worker/protocol.ts
export const AI_PROTOCOL = 3;
export interface Identity { version: 2 | 3; gameId: string; requestId: number; revision: number; player: PlayerId }
export interface SearchRequest extends Identity {
  type: 'search'; state: GameState; difficulty: AIDifficulty; seed: number; decisionMs: number; fixedWork?: number;
  mode?: 'action' | 'turn';          // absent ≡ 'action' (protocol-2 behaviour, byte-compatible)
  engine?: 'v2' | 'hard';            // absent ≡ difficulty === 'hard' && hardEnabled ? 'hard' : 'v2'
  work?: number;                     // hard only: overrides the device rung (CI/SPRT/lab always set it)
  hard?: Partial<HardConfig>;        // hard only
}
export interface TurnResult { actions: AIAction[]; scoreCc: number; depth: number; work: number; stats: HardSearchStats; source: RootResult['source']; endKey: string; fallback?: 'pack-error' | 'engine-error' | 'divergence' }
export type SearchResponse = Identity & (
  | { type: 'result'; result: AIResult; warning?: string }                  // AIResult gains turnActions?: AIAction[]; endKey?: string
  | { type: 'turn'; result: TurnResult; warning?: string }
  | { type: 'progress'; depth: number; scoreCc: number; work: number; firstAction: AIAction | null }
  | { type: 'error'; message: string });
export function sameRequest(a: Identity, b: Identity): boolean;   // unchanged; version equality admits 2 or 3
```

`handler.ts:12` becomes `version !== 2 && version !== 3`; `mode: 'turn'` with `engine: 'v2'` calls
`AIEngineV2.findBestAction(state, decisionMs)` once with the whole-turn allowance and returns the plan's
legal prefix as `turnActions` (M3); `engine: 'hard'` routes to a per-`(gameId, player)` `HardEngine` in
the same context map with the same ≥ 2 eviction (`handler.ts:15-20`). `client.findBestTurn` keeps its
promise open across `progress` messages. Kept verbatim: `sameRequest` stale-response dropping
(`client.ts:34-39`), `cancel()` termination (`client.ts:20-23`), the `max(2000, decisionMs + 2000)` watchdog
(`client.ts:43`, computed from `targetMs` for hard), request serialisation (`entry.ts:16-21`), and the JS
fallback with a warning (`entry.ts:11-14`). `tests/ai/worker.test.ts:16`'s `version: 2` request keeps
passing unchanged.

### 6.2 `useAI` turn path

```
executeAITurn(state):
  if (mode === 'turn') {
    result = await client.findBestTurn(state, { engine, targetMs: TURN_BUDGET_MS[difficulty], work: undefined, onProgress })
    for (action of result.actions) {
      if (!isLegalAction(currentState, action)) { fallbackToPerActionLoop(); break }     // useAI.ts:65 pattern
      ... existing dispatch + commit-acknowledgement block (useAI.ts:66-78) ...
    }
    if (turn not over and no fallback) loop (re-request; the engine re-searches from the live state)
  } else { existing per-action loop, unchanged }
```

M3 ships `mode: 'turn'` for **every** difficulty on `AIEngineV2` (EG G12: +30…60, the known-sign
calibration of the ladder); M15 switches `difficulty === 'hard'` to `engine: 'hard'` behind
`hardEnabled` (a config flag, default on after M19 passes). Easy/Medium stay on `AIEngineV2`. The
cosmetic 400 ms `thinkingDelay` (`GameScreen.tsx:220`) stays per dispatched action, outside the budget.

### 6.3 Phone degradation

`HardEngine.calibrate()` runs once per worker construction: 20,000 `make/unmake` pairs + 5,000 `stage1`
calls on a baked position, timed once, **never** when `work` is supplied. `profileFor(unitsPerMs,
navigator.deviceMemory)`:

| profile | trigger | K / kInterior | widths | maxPlacePlans root/interior | quiesce.maxPly | TT macro / turn | budget clamp | book |
|---|---|---|---|---|---|---|---|---|
| DESKTOP | ≥ 600 units/ms | 24 / 16 | 6/4/3/2 | 16 / 8 | 4 | 2^19 / 2^18 | 2000–6000 ms | on |
| MIDRANGE | 250–600 | 16 / 12 | 5/3/2/2 | 12 / 6 | 3 | 2^18 / 2^17 | 1500–4000 ms | on |
| PHONE | < 250 or deviceMemory ≤ 2 GB | 12 / 8 | 4/3/2/1 | 8 / 4 | 2 | 2^15 / 2^16 | 1200–2500 ms | off |
| LAB | fixed work | 24 / 16 | 6/4/3/2 | 16 / 8 | 4 | 2^19 / 2^18 | — | per run |

Iterative deepening guarantees a complete legal turn from depth 1; the rung ladder degrades depth, the
profile degrades memory (R8). M15 gates: depth 1 ≤ 150 ms on the PHONE profile in every corpus position;
p95 turn wall clock ≤ 3,000 ms on PHONE and ≤ 6,000 ms on DESKTOP; device string recorded.

### 6.4 Fallback and rollout

Four layers, all silent except the existing `warning` channel: (1) `PackError` → `AIEngineV2` at the same
budget (`fallback: 'pack-error'`); (2) any throw inside `searchTurn` → same (`'engine-error'`); (3)
`verifyTurn` truncation at the first canonical rejection → the verified prefix, or `phaseEndAction` if
empty (`'divergence'`; `stats.replicaDivergences > 0` fails CI, never crashes); (4) WASM absent → the JS
prover twin, unchanged (`entry.ts:12-13`). In `useAI`, any illegal dispatch, digest mismatch, worker error,
or watchdog drops to the per-action loop for the rest of the turn.

Rollout: nothing under `src/ai/engine-v2.ts`, `planner/*`, `search/*`, `evaluation.ts` is deleted or
changed. `hardEnabled` defaults to **false** until M19 passes, then true. The dead surfaces EG G21 lists are
a separate cleanup.

---

## 7. Verification suite

### 7.1 Gate runner (`lab/hard-ai/verify/*`)

```ts
export interface Gate { id: string; dependsOn: string[]; description: string; command: string; args: string[];
  artifact: string; criterion: (metrics: Record<string, unknown>) => boolean; timeoutMs: number }
export const GATES: Gate[];
```

`run.ts --gate M<n>` executes `command args` with `execFileSync` from `muju/`, reads `artifact` (JSON
written by the command), applies `criterion`, writes `lab/results/hard-ai-verify-<YYYY-MM-DD>/M<n>.json`
`{gate, pass, command, criterion: description, metrics, git, wasmSha256, node, device, elapsedMs, at}`,
prints one line, exits 1 on failure. `--all` runs in DAG order and stops at the first failure. Every gate
command is itself a single npm script invocation or a `&&` chain that the table records verbatim.

### 7.2 Perft (frozen numbers)

`perftActions(initial, 4) = 14,959`, `perftMidStates(initial) = 1,053`, `perftTurns(initial) = 797`
(ET §8.1; JF §0 reproduces in 176 ms). Ten authored positions, frozen from the canonical engine at M1 and
thereafter regression constants: `occupied-corner`, `blocked-rectangle`, `cleave-chain`, `clock-9`,
`upkeep-pending` (`due > bank`), `rich-place` (40 crystals, anchor F5 — the 192-buy node, CA W11),
`promotion-kill` (SU addendum 1, rev 7), `home-race` (SU addendum 1: Radi G1 → J10), `endgame-dry`,
`handicap-3`, plus `place-autoskip`. `perftReplica` must match on every fixture (M5); end-key sets from
canonical enumeration must equal the replica's (M11).

### 7.3 Differential fuzzer (three surfaces)

| surface | A | B | compared |
|---|---|---|---|
| transition | canonical `applyAction` (`simulate.ts:25`) | `Replica.make` | 24-field digest, `Kpos`, `Kturn`, `occHash`, incremental sums after every action; `unmake(make(a))` identity |
| legality | `generateAllActions` + `getMovementRange` expansion | `Replica.genActions/genPlace/genKeepSets` | the legal-action set as a sorted multiset of canonical `AIAction` JSON |
| prover | `analyzeHomeDefense` / WASM kernel | `homeVerdict` | verdict; every witness replayed canonically (M10) |

Seeded random games (`seededRandom`, `src/ai/runtime.ts:3`), 500 plies each; each game randomises
`victoryRule`, `inactivityRule`, `reviewUpkeep` per player, `blackCrystalHandicap ∈ {0, 3}`, and with
probability 0.1 clears `canActThisTurn` on a random unit (F2); the harness invariants
(`lab/harness/invariants.ts:21-75`) run after every action. Every divergence is written as a
self-contained reproducer `lab/results/hard-ai-fuzz-<date>/divergence-<n>.json` (seed, ply, action prefix,
both states). Normal run 10^6 actions (M5 gate), nightly 10^7.

### 7.4 Determinism (`hard:determinism`)

For 40 corpus positions × work {25k, 400k} × seed {1, 7}: three in-process runs, one fresh `node`
process, one WASM-absent run must return identical `endKey`, `scoreCc`, `depth`, `stats.work`,
`stats.nodes`. Static: `grep -RnE 'Date\.now|performance\.now|Math\.random|crypto\.|BigInt' src/ai/hard/`
returns nothing outside `search/time.ts` and `engine.ts` (`hard:deps` runs it).

### 7.5 Suites (`muju-suite-v1`)

`{"schema":"muju-suite-v1","name","version","cases":[{id, position:"<file>#<id>", best:[Kpos hex...],
avoid:[...], budget:{work}, points, tags, rationale, authoredFrom}]}`. A case passes when the chosen turn's
end `Kpos ∈ best` and `∉ avoid` (end positions, never sequences: 14,959 sequences for 797 positions).
Every stored position carries the mandatory `rules` block (`elementGraph`, `upkeep`, `inactivityRule`,
`victoryRule`, `handicap`, `combatHandicap`) because the knobs are process-global (RE §7.5).

| suite | size | source |
|---|---|---|
| tactics | ≥ 60 | kill table over self-play positions, kills ≥ 800 cc, hand-checked |
| spawn-strike | ≥ 20 | NK:10 bought Radi; archived t3 `BUY fire_1@I6 → I2 → ATK H2 → I4`; NK:13 per-turn fresh-Hi raid; the D9 pivot (four Mujus in one Place phase); the F16 punisher position |
| home-mate | 56 | `lab/ai/fixtures.ts` 28 × {rescue, mate} framings |
| home-force | ≥ 200 | forced home wins in ≤ 3 turns and near-misses; 60 exhaustively verified |
| economy | ≥ 30 | `PST_MINE` gaps > 400 cc: relocation, Muju-onto-4, promote-vs-bank |
| invariants | 20 | one per SU §7 invariant, `avoid` = every violating turn |

### 7.6 Recall
§5.6; artifact `{top1, top3, regret_p50, regret_p90, regret_max, positions, replyPositions}` plus the
ceiling and the shares of it the production generator attains — `{ceilingTop1, ceilingTop3,
ceilingTop1Value, ceilingReplyTop1, ceilingRegret_p50, ceilingRegret_p90, top1Share, top3Share,
top1ValueShare, replyTop1Share}` (§9 addendum 2026-09-15).

### 7.7 Ladder, pairing, SPRT, Elo, sharding (`lab/hard-ai/ladder/*`)

```
npm run hard:ladder -- --a <engine> --b <engine> --work fixed:<units>|wall:<ms> --handicaps 0,3 --pairs <n> --seed <s> --shards <k> --sprt elo0,elo1,alpha,beta --out <dir>
```
Engines are registry names (`ladder/engines.ts`): `hard@<label>` (any `HardConfig`/weights file, fixed or
wall), `aiv2-hard`, `aiv2-medium`, `aiv2-hard-fast`, `aiv2-medium-fast`, `aiv2-hard-turn` (M3's whole-turn
path), and every scripted bot from `lab/harness/bots/index.ts`. **Pairing:** seed s is played twice
(A-white/B-black, B-white/A-black) at each handicap; pair score ∈ {0, 0.5, 1, 1.5, 2}. **Sharding:**
`shard.ts` spawns k child processes (`node --import tsx lab/hard-ai/ladder/worker.ts`) each owning a
contiguous slice of pair indices; games inside a process run sequentially because `setUpkeepVariant`,
`setElementGraph`, `setCombatHandicap` are module globals (`runner.ts:93-105`). **SPRT** (pentanomial):
`t0 = score(elo0), t1 = score(elo1)`, `μ̂ = mean(pairScore/2)`, `σ̂² = var(pairScore/2)` (floor 1e-9),
`LLR = N (t1 − t0)(2μ̂ − t0 − t1) / (2σ̂²)`, bounds `±log((1−β)/α)`; decision H1/H0/continue up to
`--pairs`. **Elo:** `−400 log10(1/μ̂ − 1)` with 95 % interval and LOS. **Artifacts:** `manifest.json`
(engines, config hashes, weights hashes, work mode, seeds, handicaps, rules, git, wasm sha, node,
device), `games.jsonl` (`GameRecord v3`), `pairs.jsonl`, `sprt.json`, `elo.json`, `summary.md`.
**Veto:** `adjudicationRate > 0.01` voids the run (SU addendum 2: the material+bank scorer would hand
Black 232/235 tied games). **Axis rule:** `wall:` for any pairing involving `aiv2-*` or a scripted bot;
`fixed:` only between `hard@*` entries. `illegalActions > 0` fails every gate (`legality: 'strict'`).

**Harness changes (additive):** `MatchOptions.blackCrystalHandicap?`, `.actionsPerTurn?` threaded into
`createInitialGameState` at `runner.ts:113`; `WinType` gains `'home-checkmate'` and `'timeout'`;
`GameRecord.schema: 'muju-lab-game-v3'` with `fixedWork?`, `decisionMs?`, `engineConfigHash`,
`weightsHash?`, `adjudicated: boolean`, `handicap`, `adjudicationFormula: 'material+bank'`;
`lab/solver/model.ts:23` → `ACTIONS = 4`; `lab/harness/bots/index.ts` registers `Hard-25k`, `Hard-400k`,
`Hard-wall-3000`, `Hard-mobile`.

**Bot adapter** (`lab/hard-ai/bots/hard.ts`): `createHardBot({work: {mode:'fixed', units} | {mode:'wall',
ms}, profile?, weights?, name?}): EngineBot`; caches the whole-turn action list keyed
`${turnNumber}:${currentPlayer}:${phase}`, hands out one action per call after `isLegalAction`, returns
`null` on divergence (the runner substitutes `phaseEndAction`, `runner.ts:231`); fresh engine per game.

### 7.8 Constants-agreement test (R13)
`tests/ai/hard/constants.test.ts`: `ACTIONS === 4` (`rules.ts:9`), `INITIAL_MAP_RESOURCES === 504`,
`MAX_RESOURCE_RESERVE === 16`, `UPKEEP_BY_TIER` = `{1:0,2:1,3:2}` for tiers 1–3, `INACTIVITY_LIMIT === 10`,
`INACTIVITY_WARNING === 7`, tier-1 prices `[3,3,4,4,5,5]` in catalogue order, `PROOF_NODES === 20000`,
`CORNER === [0, 99]`, `CORNER_NEIGHBOURS`, `catalog.power` equals `calculateAttackPower` on all 18×18×2
pairs, `PST_MINE` check values (§4.7), `MAX_BLACK_CRYSTAL_HANDICAP === 20`, `lab/solver/model.ts ACTIONS === 4`.

---

## 8. Constants

| Constant | Value | Rationale |
|---|---|---|
| `CC` | 100 | integer scores (ET §8.5) |
| `WIN_CC` / `MATE_PLY_CC` / `DRAW_CC` | 1,000,000 / 1,000 / 0 | §5.11.1 |
| `MAX_SLOTS` / `MAX_TURN_ACTIONS` | 128 / 24 | §3.1 |
| `K` / `kInterior` | 24 / 16 (desktop) | ET §4.0 |
| `widths` / `keep` | [6,4,3,2] / 4 | ET §3.5 |
| `maxPlacePlans` root / interior | 16 / 8 | §5.5 |
| `MAX_BODIES` / `S` squares / keep per multiset | 4 / 8 / 3 | ET §3.3 |
| Turn TT / macro TT (desktop) | 2^18 × 3 words / 2^19 × 16 B | §5.3, §5.11.3 |
| `ProofCache` | 2^15 | §5.11.3 |
| `aspirationCc` / `futilityMarginCc` | 200 / 200 | ET §4.2, §4.12 |
| LMR ranks | > 6 → −1, > 12 → −2 | ET §4.7 |
| `quiesce.maxPly` / `deltaMarginCc` / `maxCandidates` | 4 / 300 / 8 | §5.11.4 |
| `ECON_HORIZON` / γ | 6 / 0.9 (`GAMMA_Q16`) | ET §5.5 |
| `RENT_PV` | 422 | SU addendum 3 |
| `ACTION_VALUE_CC` / `RELOCATION_MAX_ACTIONS` | 60 / 8 | KF §4.2 |
| Liquidity floor / conversion ceiling | 6–8 (features 2–3) / 5 × area | SU §1.6 |
| `DrawPressure` w | −8 per clock² | 648 cc at clock 9 |
| `WORK_COST` | MACRO 4, QUIESCE 4, TURN 1, GEN 4, KILLTABLE 8, DFPN 2, EVAL1 2, EVAL2 12, PROVER 40 | ≈ µs; calibrated at M14 |
| `WORK_LADDER` | 25k × 2^k, k = 0..7 | §5.11.6 |
| initial `unitsPerMs` / EWMA α | 200 / 1/4 | pessimistic first turn |
| `targetMs` | clamp(3000 × m/100, 2000, 6000) | ET §9.4 |
| `abortFactor` | 3 | watchdog only truncates ID |
| `PROOF_NODES` | 20,000 | `homeCheckmate.ts:22` |
| df-pn `maxTurns` / ε / budget / TT | 3 / 1/4 / min(4000, limit/16) / 2^17 | §5.11.7 |
| Zobrist seed | 0x4d554a55 | identical on every client |
| Recall targets | top1Share ≥ 0.42, top1ValueShare ≥ 0.55, regret_p50 ≤ 260 cc | §9 addendum 2026-09-15 (ET §3.5's top1 ≥ 0.90 / regret_p90 ≤ 60 measured unreachable) |
| Ship gate | wall:3000, handicaps 0+3, elo0 0 / elo1 100, α = β = 0.05, adjudication ≤ 0.01 | MF M9 |
| Phone gate | vs `aiv2-medium` wall:1500, elo1 0; depth-1 ≤ 150 ms; p95 ≤ 3000 ms | MF M10 |

## 9. Addenda

(any interface change is recorded here, dated, before merge)

### 2026-09-15 — the recall targets are measured against a CEILING, not against 1.0 (M13)

**What changes.** §8's `Recall targets` row and MILESTONES.md M13's pass criterion. The instrument of
§5.6 is unchanged; it gains four reported quantities and the gate moves onto them.

**Why.** ET §3.5 proposed "measure how often the expensive generator's best-by-deep-search turn is
inside the cheap generator's K. Target ≥ 90 %", and §8 copied the number. Built exactly as §5.6
specifies — cheap `GenConfig` (`K = 24`) against `generateReference` (`K = 2000`, widths `[40,16,8,4]`,
200 place plans), truth = the argmax of a depth-2 minimax over the reference set — that target is not
reachable by ANY generator of the specified shape, and the instrument can now prove it rather than
assert it.

`lab/hard-ai/recall/run.ts` computes, per position, the **ceiling list**: the `k` highest-scoring
candidates of the deeply-scored union, ranked by §5.4's own within-turn score and chosen with hindsight
over the reference's whole output. No `K = k` generator ranked by that score can do better. On
`fuzz-1000.jsonl` (200 roots + 82 reply nodes) the ceiling measures

| | ceiling | ET §3.5's target |
|---|---:|---:|
| `top1` | 0.640 | 0.90 |
| `top3` | 0.805 | 0.97 |
| `top1Value` | 0.665 | — |
| `replyTop1` | 0.707 | 0.85 |
| `regret_p90` | 638 cc | 60 |

The deficit is information, not engineering: the truth is an argmax over ~96 candidates re-ordered by
the opponent's best reply, and a static within-turn score cannot see that reply — which is precisely
what the SEARCH above the generator exists for (§5.11). Raising `k` in the ceiling list walks the bound
up as pure arithmetic (`k = 24 → 0.575`, `k = 48 → 0.750`, `k = 96 → 1.000` on a 120-root slice), which
is the signature of a sample-size bound rather than of a reachable goal.

**The new targets** are therefore stated as SHARES of that ceiling, which is what actually measures the
within-turn cone, plus the hard clauses that were always reachable and stay verbatim. They are
calibrated against deliberately degraded cones at the same `K = 24` (200 roots + ~83 reply nodes):

| widths | `top1Share` | `top3Share` | `top1ValueShare` | `replyTop1Share` | `regret_p50` |
|---|---:|---:|---:|---:|---:|
| `[6,4,3,2]` (§8, shipped) | 0.461 | 0.621 | 0.602 | 0.517 | 188 |
| `[4,3,2,1]` | 0.372 | 0.491 | 0.515 | 0.424 | 354 |
| `[2,2,1,1]` | 0.287 | 0.356 | 0.433 | 0.373 | 656 |

Every threshold below sits between the shipped row and the first degraded row, so a cone regression as
small as `[6,4,3,2] → [4,3,2,1]` turns the gate red. `ceilingTop1` is bracketed and
`meanRefCandidates` floored so the shares cannot be gamed from the other side: a reference generator
that collapsed toward the cheap list would drive every ceiling to 1.0 and every share with it.

**What did NOT change.** §8's `widths`/`keep`/`K`/`maxPlacePlans` and §5.4's cone. Four levers were
measured against the same corpus before this addendum was written, and only the cone width moves recall
at all: ply-0 width 6 → 24 buys `top1` 0.258 → 0.317 for 4x the within-turn nodes, and `[24,8,6,4]`
buys 0.442 for 32x; `maxPlacePlans` 16 → 64 buys 0.009, `keep` 4 → 12 buys 0.009, and per-actor beam
diversity at ply 0 buys nothing (0.267 / 0.283, with `top3` slightly worse). ET §3.5 budgets the cone
at "144 leaf action-lines per place-plan … ~0.2–0.5 ms per place-plan"; spending 4-32x that per SEARCH
NODE to buy 6-18 points of a statistic whose own ceiling is 0.64 would make the search strictly worse.
The cone's cost is a deliberate budget, and `top1Share` is now the number that holds it honest.

### 2026-09-17 — `infiltrationAnchors` counts DISTINCT voided enemy anchors (E3 B3, A-E3-1; pending ratification)

- §5.12.1 above defines `infiltrationAnchors = Σ over own slots inside an enemy
  rectangle of anchorsVoidedBy` (multiplicity: one anchor voided by three own
  bodies counts three). M9 (DEVIATIONS 2026-09-15) shipped a pair count that is
  identically zero as a side difference (E3.1 lane 1: 0 of 2,151 positions).
- Adopted for the `eval-correct-v1` arm (`HardConfig.evalFix.infiltrationPerAnchor`):
  the number of distinct enemy anchors that at least one own body voids.
  Reason: the feature's job (SU §4) is to say how much of the enemy's spawn
  geometry is denied; an anchor denied by three bodies is denied once, so
  multiplicity rewards stacking bodies on one anchor over spreading them, and
  the pair count cannot see it at all.
- Status: a REDEFINITION, not a fix; applied under Ethan's delegation at the
  E3 close (18:02:43Z), awaiting ratification; the shipped evaluator and
  `hard@desktop`'s hash are unchanged. If not ratified, B3 leaves the arm and
  DESIGN's sum is implemented instead.
- Status update (19:34:37Z): RATIFIED under Ethan's delegation (A-E3-6,
  `docs/hard-ai/e3/AMENDMENTS-E3.md`). The distinct-anchor count is the
  specification; the shipped evaluator still implements M9's pair count until
  an arm carrying B3 is retained under M20/E6.

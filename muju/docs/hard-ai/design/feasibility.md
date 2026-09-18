# Code-feasibility review of the three Hard-AI designs

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai` (branch `claude/muju-hard-ai`,
v2.8 snapshot). Paths relative to `muju/`.

Scope: for each design, does the API it says it will call exist with that signature; are the numbers it
cites reproducible; would the proposed layout collide with the existing tsconfig / vitest / Vite worker /
AssemblyScript build; can `lab/harness` host the new engine as a bot; and can a verifier agent actually
run each milestone gate.

Measurement scripts written for this review (read-only, no repo state changed):

| script | what it measures |
|---|---|
| `docs/hard-ai/design/feasibility/perft.ts` | perft of the initial position; canonical throughput at 6 units |
| `docs/hard-ai/design/feasibility/throughput.ts` | canonical throughput on a live 16-unit mid-game position |
| `docs/hard-ai/design/feasibility/gate-cost.ts` | cost of one exhaustive 4-action enumeration; `AIEngineV2` cost per decision at three `fixedWork` levels |
| `docs/hard-ai/design/feasibility/model-checks.ts` | map totals/symmetry, `PST_mine` tables, T1 price set |

Environment: Node v24.11.1, Apple M2 Max, macOS. `engine-techniques.md` Appendix B documents its
measurements as throwaway scripts that were not committed, so these were written from scratch.

---

## 0. Baseline: what is verified true, for all three designs

**Perft reproduces exactly.** `perftActions(initial, 4) = 14,959`, `distinctMid = 1,053`,
`perftTurns(initial, 1) = 797`, computed through canonical `generateAllActions` / `applyAction` in
**176 ms**. All three designs freeze these three numbers at M1; all three are correct, and the gate is
cheap enough to run per-commit.

**The "~50× replica" premise holds.** On a live 16-unit turn-4 position:

| primitive | measured | cited (ET §1.4) |
|---|---:|---:|
| `evaluatePosition` | **62.5 µs** | 71.9 µs |
| six `getAllSpawnPositions` | **42.2 µs** (68 % of eval) | ~42 µs (58 %) |
| static evaluations in 3 s | **48,002** | ~42,000 |
| `applyAction` (MOVE) | **6.77 µs** | 0.58 µs |
| `generateAllActions` | **36.7 µs** | 5.2 µs (193,909/s) |

The headline numbers every design builds on (eval cost, the spawn-rectangle share, ~42k evals per 3 s)
are confirmed. The three *transition/generation* throughputs ET quotes are 2–12× optimistic against a
live mid-game position; this matters only for measurement-first, which adopts them verbatim as bench
baselines (§3.3 item 8).

**Map and catalogue facts the evaluations depend on.** Total 504; `m[i] === m[99−i]` true;
transpose-symmetry false; `MAX_RESOURCE_RESERVE = 16`; the three starting units are exact 180° images of
each other. So the `eval(σ(p)) === −eval(p)` symmetry gate (all three) and the 180°-canonical book key
(knowledge-first, measurement-first) are **sound**. Max DEF is 5 (`metal_3`), so `damage ∈ 0..4`.
Tier-1 prices are `3,3,4,4,5,5`, cheapest 3.

**A macro node has zero damage on both sides.** Traced through `turn.ts:92-104 endTurn` →
`turn.ts:19-34 startTurn` → `turn.ts:53-64 completeUpkeep/finishTurnStart` → `board.ts:267-294
resetUnitActions`: damage is inflicted only during the opponent's turn and healed at the victim's own
turn start, so at any non-`upkeepPending` macro node **every** unit on **both** sides has
`damageTaken = 0`. The exception is real and load-bearing: `startTurn` returns `pending` at
`turn.ts:30-32` *before* `resetUnitActions`, so an `upkeepPending` macro node still carries the previous
turn's damage. See §3.2 item 3.

**APIs cited by the designs that exist with the stated shape** (spot-checked by grep, line numbers
corrected where they drifted):

`isLegalAction` `legality.ts:16` · `applyAction`/`transitionWithoutCheckmate` `simulate.ts:25,38` ·
`TacticalSolver = (state, targetId, maxNodes, budget) => TacticalResult` `wasm/kernel.ts:15` ·
`referenceTactics` `tactics/home.ts:21` · `analyzeHomeDefense` / `resolveHomeCheckmate`
`homeCheckmate.ts:57,171` · `enoughPossibleDamage` DP `homeCheckmate.ts:27-49` ·
`getSpawnRectangle` / `getAllSpawnPositions` `spawning.ts:8,98` · `getMoveCost` / `getMovementRange` /
`getAttackFrontier` `movement.ts:226,184,200` · `calculateAttackPower` `combat.ts:80` ·
`canBeEliminated` `combat.ts:216` · `upkeepActions` `upkeep.ts:34` · `UPKEEP_BY_TIER` `upkeep.ts:5` ·
`getAffordablePurchases` `building.ts:7` · `canActInPlacePhase` `turn.ts:141` ·
`projectedIncome` `mining.ts:12` · `INACTIVITY_LIMIT` `inactivity.ts:3` ·
`createInitialGameState(layout, actionsPerTurn, blackCrystalHandicap)` `board.ts:203` ·
`server/analysis/{geometry.ts:25 blockingSet, tactics.ts:103 singleThreats, :272 approachTable,
economy.ts:16 economyForecast}`.

Citation drift found (none load-bearing): `setElementGraph` is `elements.ts:47` not `:45`;
`getActionsPerTurn` is `rules.ts:16` not `:9-13`; `turn.ts:87-89` is `hasActionsRemaining`, not the
atomic-turn rule that search-first and measurement-first cite it for; `GameScreen.executeAITurn` is at
`:259/:274` not `:249-250/:263-265`.

**The lab harness can host the new engine.** `EngineBot` (`lab/harness/types.ts:36-42`) is
`nextAction(state, player): Promise<AIAction | null>` — one action per call. The whole-turn plan-cache
adapter all three propose works, and `lab/harness/bots/engine.ts:67` already keys a turn by
`` `${turnNumber}:${currentPlayer}` ``. `runner.ts:218-231` applies the emission, counts illegal ones
(`stats[player].illegalActions++`), and substitutes `phaseEndAction` on `null` — so returning `null`
on divergence behaves exactly as all three designs assume. Registration is one line in
`lab/harness/bots/index.ts:16-39`.

One correction: measurement-first says `tests/lab/harness.test.ts:125-131` "asserts `botNames()`, so
that test is updated in the same commit". It uses `expect(names).toContain(required)` over a fixed
list, so **adding bots does not break it**. Harmless over-caution.

`MatchOptions` genuinely lacks `blackCrystalHandicap`/`actionsPerTurn`, and `createInitialGameState`
already accepts both — a three-line fix at `runner.ts:113`. `WinType` genuinely lacks `'home-checkmate'`
and `'timeout'` while `runner.ts:154` assigns `state.victoryReason` straight into it, so the type is
already lying at runtime. `lab/solver/model.ts:23 ACTIONS = 6` confirmed stale.

**No layout collisions.** `src/ai/hard/`, `lab/hard-ai/` and `tests/ai/hard/` do not exist.
Root `tsconfig.json` `include: ["src"]` covers `src/ai/hard/**`; `vitest.config.ts`
`include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}']` covers `tests/ai/hard/**`;
`asconfig.json` names only `assembly/tactics.ts` and is untouched by all three (only measurement-first
M16 proposes an ABI-7 extension); Vite's worker entry
(`new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' })`, `worker/client.ts:12`) simply
pulls the new module graph into the worker chunk. `lab/results/*/games.jsonl` is already gitignored, which
is where all three write ladder output.

Two probes worth recording:

- A `lab/hard-ai/tsconfig.json` shaped as `{extends: "../tsconfig.json", types:["node"], include:
  ["../../src/**/*.ts", ...]}` **typechecks clean** (probed with a throwaway config). `lab/ai/tsconfig.json`
  excludes `src/ai/worker/entry.ts`; that exclusion is not required for the hard tree.
- `export const enum` compiles under the repo's `isolatedModules: true` (probed, `tsc` exit 0). Caveat
  for the perf argument: esbuild transpiles per file, so cross-file `const enum` members become ordinary
  enum property reads in the Vite bundle — correct at runtime, not inlined.

**Baseline is green**: `npx tsc --noEmit` passes in 1.8 s; `npx vitest run tests/ai tests/lab tests/game`
is 40 files / 629 tests / 10.1 s. Gates phrased as "`npm test` green" are meaningful today.

Note `tsc` covers **only `src`** — `npm run build` typechecks neither `tests/**` nor `lab/**`. search-first
R14's reliance on "`tsc --noEmit` over `src` is part of every milestone gate" catches interface drift in
production code only; a `hard:types` script over the lab tsconfig is required as well (search-first and
measurement-first list one; knowledge-first defines `lab/hard-ai/tsconfig.json` but no script that runs it).

---

## 1. The two measurements that decide most of the gate questions

### 1.1 Exhaustive 4-action enumeration costs 28 seconds per position

On the live 16-unit turn-5 position produced by `gate-cost.ts`:

```
{"probe":"bruteForceTurn","nodes":1579472,"sequences":1579472,"capped":false,
 "ms":28396,"nodesPerSec":55622}
```

1.58 M complete action sequences, **28.4 s** canonically (55.6 k nodes/s). This prices every
"differential-test the kill table against brute force" gate:

| gate | as written | cost |
|---|---|---|
| search-first M5 | "matches a brute-force enumeration **over the replica** on 2,000 random positions" | ≈ 19 min at a 50× replica. **Feasible, and it is the only one that names the engine.** |
| measurement-first M6 (a) | "equals brute force on 5,000 randomly generated target positions (exhaustive ≤ 4-action search)" | ≈ 47 min on the replica (M6 depends on M4, so the replica exists); **39 h** if run canonically. Engine unspecified. |
| knowledge-first M5 (a) | "exact optimum on 10,000 seeded targets, for all four `(allowBuys, allowPromotes)` combinations" | 40,000 exhaustive searches. ≈ **6 h** on the replica even at ≤ 8 own units; ~2 weeks canonically. Engine unspecified. |

### 1.2 `AIEngineV2` at `fixedWork 200000` costs 26 seconds per decision

```
{"probe":"aiv2Decision","fixedWork":1200,  "ms":195,  "iterations":0,"candidates":1200}
{"probe":"aiv2Decision","fixedWork":20000, "ms":2795, "iterations":0,"candidates":20000}
{"probe":"aiv2Decision","fixedWork":200000,"ms":26171,"iterations":4,"candidates":200000}
```

(Also reconfirms EG §0: MCTS completes **0** iterations at 1,200 and 20,000, 4 at 200,000.)
`engine-v2.ts:58` makes `fixedWork` override the wall clock entirely, so the `-fast` presets' 120 ms MCTS
cap does not bound this. A game is roughly 25–50 rounds × 2 seats × ~5 decisions ≈ 250–500 decisions.

| gate | control-arm cost |
|---|---|
| measurement-first **M2** — 400 pairs (800 games) of `AIv2-hard-fast` at `fixedWork 200000` | 1.8–3.6 h **per game** → ~2,000–2,900 CPU-hours. **Unrunnable.** |
| measurement-first M9/M11/M12/M13/M14 ladders at `fixed:200000` | same, wherever an `AIv2` arm appears |
| knowledge-first M10 (b) `--work 200000` vs `AIv2-hard-fast` | same |
| knowledge-first **M1** — 40 games of `AIv2-medium-fast` vs `Rush` at `fixedWork 1200` | ~50 s/game → **33 min**. The only ladder gate in any of the three cheap enough to run per-commit. |
| search-first M8 `--work 32000` vs `ai-v2-hard` | ~4.5 s/decision → ~20 min/game; bounded if the claimed +200–350 resolves the SPRT in 20–40 pairs (13–27 h), unbounded if it does not |
| measurement-first M9 (c) `wall:3000` | ~150 s/game → 300 s/pair → ~17 h for 200 pairs. Expensive but bounded, and it is the honest comparison |

**The unresolved parameter none of the three defines: is a ladder's `--work` / `fixedWork` per-engine or
shared?** `AIEngineV2`'s work unit is beam candidates (`engine-v2.ts:128` caps
`maxCandidates = fixedWork/3`); the new engine's would be search nodes. They are not comparable, so
"equal fixed work vs AIv2" is either meaningless or unrunnable. measurement-first is the only design
that states its ship gate in wall clock and thereby sidesteps this.

---

## 2. Cross-cutting defects present in more than one design

### 2.1 Rent is double-counted (search-first, measurement-first)

`PST_mine` comes in two flavours: **no-rent** (ET §5.4, `Σ_{t=1..12} 0.9^t·take`) and **rent-charged**
(SU addendum 3, `H = 6`, rent from the unit's next own turn). Reproduced in `model-checks.ts` on a
16-cell:

```
fire_1  noRent 6.46   water_1 noRent 10.25  plant_1 noRent 11.59
plant_2 noRent 12.85  plant_3 noRent 13.68  metal_3 noRent 12.38
```

- **knowledge-first** §4.1 lists `plant_1 1159, plant_2 1285, plant_3 1368, water_1 1025, metal_3 1238,
  fire_1 646` and says explicitly "no rent — rent is a separate feature, §4.8". Every value **reproduces
  exactly**. Correct, and it also states the non-double-count rule for the economy DP
  (`EconDelta = econ.stream − pstSum`).
- **search-first** §4.14 charges rent inside stage-0 `material` ("additionally charged the present value
  of its rent") *and* sources stage-1 `pstMine` from the rent-charged table ("Muju 11.59 vs Hi 4.22
  (SU Addendum, γ = 0.9, H = 6, **rent charged**)"). Rent is subtracted twice.
- **measurement-first** `tables/pst.ts` defines `value = Σ take_t − Σ_{t=2..H} 0.9^t·upkeep(tier)` and
  quotes the rent-charged anchors, while feature 1 `material` is "`Σ cost − present value of rent`".
  Rent is subtracted twice.

### 2.2 A single `POWER[18*18]` plane is wrong under the lab's per-player handicap
(knowledge-first, measurement-first)

`calculateAttackPower` (`combat.ts:80-91`) adds `combatHandicap[attacker.owner]`, set per player by
`setCombatHandicap` (`combat.ts:64`) from `MatchOptions.handicap` at `runner.ts:97-98`. A node's kill
table needs both sides' powers simultaneously, so one plane cannot be right when the handicaps differ.
search-first is the only design that provides `powerW`/`powerB` and folds the choice into the catalogue
signature. This only bites the lab's instrument-sensitivity experiments, but those are exactly the runs
that would silently produce wrong numbers.

### 2.3 Zobrist key composition

- **measurement-first** keys **by square, not by slot**, "so two states that differ only in slot numbering
  transpose", and puts reserves and the clock in `Kpos` while excluding turn-local flags. This is right.
- **search-first** keys `damage`, `atkCount` and `unitFlags` **by slot** (`core/zobrist.ts`: `damage:
  Uint32Array; // 128 * 5 * 2 (slot, damageTaken 0..4)`) and puts `damage` inside `Kpos`. Two lines
  reaching the same position with different buy orders get different slot numbering, hence different
  `Kpos` — macro-TT misses, and a book key that is not canonical. (Given §0's finding that macro-node
  damage is always zero, the `damage` term is also dead weight except on `upkeepPending` nodes.)
- **knowledge-first** omits `damageTaken` from `Kpos` entirely. Correct at every ordinary macro node —
  but **wrong at an `upkeepPending` node**, where `turn.ts:30-32` returns before `resetUnitActions`, so
  two upkeep-pending positions differing only in damage collide.

---

## 3. Per-design findings

### 3.1 search-first

**Blocking**

1. **M3's gate depends on a module delivered at M7.** M3 (`core/{movement,spawn,income}.ts`, depends on
   M2) is gated by `npm run hard:bench -- --check` requiring "≥ 400,000 **stage-1 evals**/s". `stage1`
   lives in `eval/eval.ts`, an **M7** deliverable, and M7 depends on M3 + M5. A parallel agent handed M3
   cannot pass its own gate. Fix: move the eval-throughput clause to M7 and gate M3 on replica
   actions/s + `spawnInfo`/s only.
2. **The work model contradicts its own calibration by 5×–100×.** `WORK_COST` charges an interior macro
   node `MACRO 4 + KILLTABLE 6 + GEN 8 = 18` units **before** any within-turn `TURN` charges, while
   §4.13 asserts "~20,000 interior macro-nodes in 3 s ⇒ ≈ 25 units/ms ⇒ 64k–128k is the desktop rung".
   25 units/ms × 3,000 ms = 75,000 units ⇒ **4,167** macro nodes, not 20,000; 20,000 macro nodes needs
   ≥ 360,000 units, above the top rung (`WORK_LADDER` max 256,000). Charging the generator's within-turn
   nodes as specified (widths `[6,4,3,2]` ⇒ ≤ 144 leaf lines × ≤ 16 place-plans ≈ 1,400–2,300 nodes per
   macro node at 1 unit each) puts a single depth-3 root above 29 M units — 114× the top rung. As
   written, `WORK_LADDER` funds roughly depth 3, not the advertised 5–7 macro-plies. The constants are
   tunable (M13), but the design's central budget argument does not currently close.

**Non-blocking, concrete**

3. Rent double-counted (§2.1); `Kpos` slot-keyed (§2.3).
4. `strike(slot, actions)` is claimed to match "`getAttackFrontier`'s `moveActions = 3` default
   (`movement.ts:200-214`)". It does not: `getAttackFrontier` returns only the **outer edge** of the area
   (its final `filter` keeps board-border squares or squares with a neighbour outside the area) and drops
   friendly-occupied squares. Prose only here — search-first's gates never test against it.
5. `Replica.make` takes `proverMode` "on `PackedState.searchFlags`", but `searchFlags` is not a declared
   field of `PackedState`. `SpawnInfo` mixes a method (`fragility(p, side, anchorSlot)`) into a record
   that `spawnInfo(p, side, out)` is supposed to fill. For a design whose §3 interfaces are declared
   *normative* for 24 parallel agents, these are the exact seams that drift.
6. `MAX_TURN_ACTIONS = 24` is sound (≤ 4 buys + ≤ 8 promotions + `END_PLACE` + 4 actions + `END_ACTION`
   = 18); it is the only design that sizes the turn buffer correctly and the only one that states dead
   slots are **reused on BUY** (relevant: cheapest T1 is 3 crystals, so a 57-crystal bank could in
   principle create 19 units in one place phase).

**Strong**

7. M5 is the only brute-force gate in any design that names the engine (replica) and sizes it to run in
   under an hour (§1.1).
8. `lab/hard-ai/deps.ts` — layering check + a lint banning `Date.now|performance.now|Math.random|crypto.`
   under `src/ai/hard/**` + a ban on importing `lab/solver/**` (the stale `ACTIONS = 6`) — is the most
   mechanically enforceable anti-drift device proposed by anyone, and it is checkable in seconds.
9. The quantised `WORK_LADDER` (choose the rung from the clock once, then never read a clock) is the
   cleanest reconciliation of "2–6 s in a browser" with "deterministic under fixed work". The mechanism
   is right even though the constants (item 2) are not.
10. M4's gate — "the **set** of end positions from canonical enumeration equals the set from naive
    enumeration (identity of the `Kpos` multiset, not just cardinality)" — is the correct statement of
    the canonical-ordering soundness proof, and my perft probe shows it is cheap on the initial position.

### 3.2 knowledge-first

**Blocking**

1. **M4 gate (a) fails on a correct implementation.** "`strikeMask` equals a brute-force
   `getAttackFrontier`-derived area (`movement.ts:200-214`) as a set" — `getAttackFrontier` returns the
   **perimeter** of the strike area, not the area, and removes friendly-occupied squares. The right
   oracle is `dilate(getMovementRange(pos, speed, 3))`, which the very next clause of the same gate
   already uses for `strikeIfBoughtArea`. One-line fix, but a verifier agent running it verbatim reports
   a hard fail.
2. **M5 gate (a) is the most expensive gate in any of the three** and does not name the engine: 10,000
   targets × 4 `(allowBuys, allowPromotes)` combinations against an exhaustive turn search. Measured cost
   of one such search: 28.4 s canonical (§1.1). Even restricted to ≤ 8 own units and run on the replica
   this is hours; run canonically it is weeks.
3. **M10 (b) runs the SPRT at `--work 200000` against `AIv2-hard-fast`** — 26.2 s per AIv2 decision,
   measured (§1.2).

**Non-blocking, concrete**

4. `Kpos` omits `damageTaken`, which is wrong on `upkeepPending` nodes (§2.3).
5. Single `POWER` plane under per-player handicap (§2.2).
6. `blockingSetSize` is to be differential-tested against `server/analysis/geometry.ts:25-50 blockingSet`;
   the real signature is `blockingSet(s: GameState, player: PlayerId, budget: WorkBudget)` — a
   `WorkBudget` must be constructed, and `server/**` is outside root `tsconfig` `include: ["src"]`, so
   the oracle is importable from tests/lab only, never from `src/ai/hard/**`. The design's intent is
   right; the gate needs the plumbing spelled out.
7. `lab/hard-ai/tsconfig.json` is listed but no `hard:types` script runs it, and `npm run build`'s `tsc`
   does not cover `lab/**`. Interface drift in the lab tree would go unchecked.
8. The load-bearing unmeasured number is the generator: §2's timing table assumes ~**1.2 ms per node**
   for `generateTurns` (≈ 10 place-plans × 144 leaf lines ⇒ ~1,440 within-turn nodes ⇒ **0.83 µs per
   within-turn node** including make/unmake, scoring and a TT probe). That is aggressive but not absurd
   for a typed-array JS kernel — and **no gate measures it before M10**. M8's bench gates stage-1/stage-2
   eval throughput and never `generateTurns`/s. measurement-first's bench does gate it.
9. Its own `--work 200000` and the charging scheme in §4.0 ("within-turn nodes 1") are mutually
   inconsistent for the same reason as search-first item 2: 200,000 units buys ~139 generator calls,
   i.e. depth 2 at K = 12, not the advertised depth 3 at K = 24.

**Strong**

10. The **only** design that states and enforces the no-double-count rule for the economy
    (`EconDelta = econ.stream − pstSum`), and the only one whose `PST_mine` check values I could
    reproduce to the centi-crystal (§2.1).
11. The **only** design with an explicit hard-filter discipline — "if the filtered list is empty, retry
    with filters off and tag the result; a hard filter must never make the engine return no move" — with
    a gate for it (M9 c, `emptyLists == 0`, "including on adversarial positions where every candidate
    violates a filter"). Given that three SU invariants become generation filters, this is exactly the
    failure mode that needed a gate.
12. M2's catalogue-signature gate ("flip `setElementGraph`/`setUpkeepVariant`/`setCombatHandicap`, assert
    the signature changes and returns") targets the real process-global trap (`elements.ts:47`,
    `upkeep.ts:9`, `combat.ts:64`, set/reset per game at `runner.ts:95-105`) and is trivially checkable.
13. M1's ladder gate is the only affordable one in any design (§1.2).
14. Post-M3 parallelism is the cleanest of the three: M4/M5/M6/M7 are four table modules with no shared
    files behind a `NodeTables` interface frozen at M3.

### 3.3 measurement-first

**Blocking**

1. **M2's gate is unrunnable**: 400 pairs (800 games) of `AIv2-hard-fast` at `fixedWork 200000` ⇒
   ~2,000–2,900 CPU-hours at the measured 26.2 s/decision (§1.2). M2 is the second milestone and M3 and
   M9 both depend on it, so the whole DAG stalls on it. Fix: `fixedWork 1200`–`5000`, or run the self-match
   at `wall:` with a small decisionMs.
2. **The protocol change breaks the test its own gate requires green.** §6.2 declares
   `Identity { version: 3 }` as a literal and makes `mode` a **required** field.
   `tests/ai/worker.test.ts:16` constructs `{version:2, type:'search', …}` with no `mode`; M3's gate is
   "(a) `npm test` green", and that test is not listed as a deliverable. search-first and knowledge-first
   both widen to `version: 2 | 3` with `mode?:` optional, which is back-compatible.

**Non-blocking, concrete**

3. Rent double-counted (§2.1); single `POWER` plane (§2.2).
4. **`MAX_SLOTS = 100` with no slot reuse stated.** 100 squares bounds *live* units, not lifetime
   creations; `slotCount` grows on every BUY. The archived game had 43 purchases plus 6 starting units,
   and lab games run to 120 rounds. Either reuse dead slots (as search-first does) or raise the ceiling.
5. `TurnLine.actions // packed, length <= 12` under-provisions: ≤ 4 buys + ≤ 8 mission promotions +
   `END_PLACE` + 4 actions + `END_ACTION` = 18.
6. §4.10's bench baselines are ET's, and three of the four are optimistic against a live 16-unit
   position (§0): `applyAction` measures **148 k/s** not 1,716,741/s; `generateAllActions` **27 k/s** not
   193,909/s; `getAllSpawnPositions` **71 k/s** not 144,145/s; only `evaluatePosition` (16 k/s vs
   13,904/s) matches. Because the gate is "ratios to beat", this makes it *softer* than intended, not
   harder — but the recorded baseline is wrong and should be re-measured at M1.
7. Its harness claim about `tests/lab/harness.test.ts` is wrong-but-harmless (§0).
8. M9's ship gate demands SPRT `H1` at `elo1 = 100` at equal wall clock — the right bar, but note the
   run cost: ~17 h for 200 pairs at `wall:3000` (§1.2). Budget it as an overnight job, not a command.

**Strong**

9. **`npm run hard:verify -- --gate M<n>`** with `gates.ts` as a
   `{id, dependsOn, command, artifact, criterion(metrics) => boolean}` table, a JSON artifact per gate and
   exit 1 on failure, is the only literal satisfaction of the brief's "an objective, mechanical acceptance
   gate a verifier agent can run with a single command". The other two leave the verifier composing shell.
10. **M6b (c)** — "the gated prover (run only when `needsCheckmateProof`) produces the identical game
    result as ungated on 100,000 fuzz actions" — is the single most valuable correctness gate proposed by
    anyone. `applyAction` calls `resolveHomeCheckmate` after **every** transition (`simulate.ts:28-33`)
    at up to `PROOF_NODES = 20000` (`homeCheckmate.ts:22`); every design gates that prover for speed, and
    only this one proves the gate preserves the canonical result rather than asserting it.
11. Square-keyed Zobrist with the stated rationale (§2.3).
12. Mandatory `rules` block on every stored position (`elementGraph`, `upkeep`, `inactivityRule`,
    handicaps) — the right response to the process-global knobs, and the only design that puts it in the
    **file format** rather than in a runtime assertion.
13. `adjudicationRate ≤ 0.01` as a hard veto on every ladder row, with the `home-checkmate`-is-a-rule-
    terminal fix. Both are directly supported by the corpus evidence.
14. Its suite scoring compares **end-position Zobrist keys, never action sequences** — correct, and
    directly justified by the 14,959-sequences-for-797-positions measurement.

---

## 4. Summary table

| | search-first | knowledge-first | measurement-first |
|---|---|---|---|
| perft numbers reproduce | yes | yes | yes |
| cited APIs exist | yes (minor line drift) | yes (minor line drift) | yes (minor line drift) |
| layout / tsconfig / vitest / Vite / asc collisions | none | none | none |
| lab bot adapter feasible | yes | yes | yes |
| brute-force gate affordable | **yes** (replica, 2,000 pos) | no (10,000 × 4, engine unspecified) | marginal (5,000, engine unspecified) |
| ladder control-arm gate affordable | marginal | M1 yes / M10 no | **M2 unrunnable**, M9 ~17 h |
| gate depends on a later milestone | **yes (M3 → M7)** | no | no |
| rent double-counted | yes | **no** | yes |
| Zobrist key sound | slot-keyed `Kpos` | omits damage on upkeep nodes | **yes** |
| work-budget arithmetic self-consistent | **no (5×–100×)** | no (~3×) | n/a (wall-clock ship gate) |
| verifier single-command contract | composed shell | composed shell | **`hard:verify --gate`** |

---

## 5. Files produced by this review

- `docs/hard-ai/design/feasibility.md` (this file)
- `docs/hard-ai/design/feasibility/perft.ts`
- `docs/hard-ai/design/feasibility/throughput.ts`
- `docs/hard-ai/design/feasibility/gate-cost.ts`
- `docs/hard-ai/design/feasibility/model-checks.ts`

All four scripts are read-only and run with `node --import tsx` from `muju/`.

# The Muju lab: harness, bots, static solver, and what the recent experiments established

Scope: `muju/lab/**` as it stands in worktree `/Users/ashkie/src/deevgames-muju-hardai`
(HEAD `44c41c4`, "Snapshot uncommitted muju working tree (v2.8) as base for Hard AI work",
2026-09-14). Every claim is tagged:

- **[code]** — read directly out of the source in this worktree.
- **[data]** — read out of a committed result file in `muju/lab/results/**`.
- **[doc]** — asserted in a markdown report; not independently re-derived here.
- **[inference]** — my reading, not stated anywhere.

Current rules context, needed to read anything below: **four** shared actions per turn
(`src/game/rules.ts:10` `DEFAULT_ACTIONS_PER_TURN = 4`; `src/game/rules.ts:12-14`
`isActionsPerTurn` accepts *only* 4), 18-unit v2.8 catalogue (`src/game/units.ts:3`
"All 18 unit definitions — v2.8: Plant Mining 3/5/8"), and the 504-crystal "Unequal
routes" map (`src/game/resourceMap.ts:6-17`; `MAX_RESOURCE_RESERVE = 16` at
`src/game/resourceMap.ts:5`). All **[code]**.

---

## 1. Running a headless game between two bots

### 1.1 Exact commands

From `muju/` (the repo symlinks `node_modules` to the main checkout):

```sh
# ad-hoc pairing
npx tsx lab/harness/cli.ts --white Rush --black AntiRush --games 20 --seed 7
# or, equivalently, the runtime the rest of the lab uses:
node --import tsx lab/harness/cli.ts --white Rush --black AntiRush --games 20 --seed 7

# a config-driven experiment
npx tsx lab/harness/cli.ts --config lab/experiments/e6-degenerate-probes.json

# throughput bench (games/s per ladder tier)
npx tsx lab/harness/bench.ts --games 10
```

CLI flags parsed at `lab/harness/cli.ts:44-54` and consumed at `lab/harness/cli.ts:140-171`:
`--config`, `--white`, `--black`, `--games` (default 10), `--seed` (default 1),
`--mirror true`, `--name`, `--max-turns`, `--legality`, `--replay-sample` (default 0.01),
`--out`. The usage banner is at `lab/harness/cli.ts:5-13`. All **[code]**.

npm scripts that touch the lab (`muju/package.json`) **[code]**:

| script | command |
|---|---|
| `balance:static` | `node --import tsx lab/solver/run.ts` |
| `balance:check` | `node --import tsx lab/solver/run.ts current --check` |
| `balance:types` | `tsc -p lab/solver/tsconfig.json --noEmit` |
| `balance:maps` | `node --import tsx lab/maps/run.ts && node --import tsx lab/maps/render.ts` |
| `balance:maps:types` / `balance:maps:page` | map-study typecheck / Playwright page check |
| `ai:tactics` | `node --import tsx lab/ai/run.ts tactics` |
| `ai:league` | `node --import tsx lab/ai/run.ts league` |

There is **no** npm script for `lab/harness/cli.ts` or `bench.ts`; they are invoked by
hand or from experiment scripts. **[code]**

### 1.2 The Bot interface (`lab/harness/types.ts`)

Two shapes, discriminated on `kind` (`lab/harness/types.ts:44`):

```ts
// lab/harness/types.ts:23-28
interface ScriptedBot {
  kind: 'scripted'; name: string;
  chooseAction(ctx: BotContext): AIAction | null;   // null == pass
  onGameStart?(player: PlayerId, seed: number): void;
}
// lab/harness/types.ts:36-42
interface EngineBot {
  kind: 'engine'; name: string;
  onGameStart(player: PlayerId, seed: number): void;
  nextAction(state: GameState, player: PlayerId): Promise<AIAction | null>;  // one action, re-planned
}
```

`BotContext` (`lab/harness/types.ts:12-17`) hands a scripted bot three things: a `BotView`
(`:6-10` — full `GameState` plus `player`/`opponent`/`phase`/`actionsRemaining`/
`turnNumber`/`board`/`me`/`enemy`), a **pre-filtered legal action list**, and a seeded
`Rng`. The header comment at `lab/harness/types.ts:5` says the view is "The full,
perfect-information game" — there is no hidden-information layer any more
(`lab/docs/SPEC_AUDIT.md` retires D1/D3/D7 for exactly this reason). All **[code]**.

The asymmetry matters for a Hard-AI project: **a scripted bot is handed the legal set;
an engine bot is not.** An engine bot gets the raw `GameState` and must generate its own
actions, and the runner audits them. **[code]**

### 1.3 The runner loop (`lab/harness/runner.ts`)

`playGame(args)` at `lab/harness/runner.ts:90-106` is a thin wrapper that sets four
*module-global* engine knobs and resets them in `finally` (so games must run sequentially):

- `setUpkeepVariant(options.upkeep ?? 'shipped')` — `'shipped' | 'steep' | 'off'`
  (`src/game/upkeep.ts:9`)
- `setElementGraph(options.elementGraph)` — `'double-thick' | 'dual-triangle' |
  'rush-edge-only' | 'none'` (`src/game/elements.ts:43-51`)
- `setCombatHandicap('white'|'black', n)` — global ±ATK instrument knob
  (`src/game/combat.ts:64`)

`playGameInner` (`lab/harness/runner.ts:108-371`):

1. `createInitialGameState(options.resourceLayout)` (`:113`), then overrides
   `victoryRule` and `inactivityRule` from options (`:114-115`).
2. Per-seat RNGs: `mulberry32(deriveSeed(seed, 0))` for white,
   `deriveSeed(seed, 1)` for black (`:116-119`).
3. `bots.white.onGameStart('white', deriveSeed(seed,0))` and the black equivalent (`:131-132`).
4. Main loop `gameLoop:` at `:149`. Order per iteration:
   - terminal checks — engine-declared `state.phase === 'victory'` (`:151-156`), then
     `checkVictory(state.board)` for elimination/draw (`:157-167`);
   - **caps → adjudication** (`:170-182`): if `turnNumber > maxTurns` or `ply >= maxPlies`,
     score `onBoardMaterial + resources` per side; higher wins with `winType:'adjudication'`,
     tie → `'draw'`. A ply-cap hit also pushes an anomaly string;
   - material-curve sample at the start of each white turn (`:185-196`);
   - **action selection** (`:202-228`):
     - upkeep pending + scripted bot → `defaultUpkeepAction(state, /AntiRush|Guard/.test(bot.name))`
       (`:204-205`) — note the name-regex hack that makes AntiRush/Guard bots keep
       home-side units first;
     - scripted → `legalActions(state, player)`; if the bot returns something outside that
       set the runner **throws** (`:211-215`) — scripted bots cannot cheat by construction;
     - engine → `await bot.nextAction(state, player)`; if `!isLegalNow(...)` it increments
       `stats[player].illegalActions`, appends an anomaly, and under
       `legality:'strict'` drops the action, under `'as-shipped'` applies it anyway
       (`:218-228`);
   - `if (!action) action = phaseEndAction(state)` (`:231`) — passing ends the phase;
   - `applyAction` (`:237`), `applied = afterAction !== before` (identity comparison, since
     the simulator is immutable and returns the same reference on a rejected action);
   - **no-op guard** (`:243-257`): three consecutive non-applied actions force
     `END_PLACE_PHASE`/`END_ACTION_PHASE`, so a broken engine cannot spin forever;
   - telemetry: income curve + `round90Exhaustion` (`:259-270`), purchases (`:271`),
     promotions (`:272`), `placedAndAttackedKills` (`:273`), `args.onAction(...)` hook
     (`:274`), inactivity ply max and upkeep releases with home-distance (`:276-281`),
     `peakTier2Plus` / `firstTier3Round` / `zeroStockpileTurns` (`:282-287`), kill
     attribution and first blood (`:289-298`), tier usage and element purchases (`:299-317`);
   - optional replay snapshot (`:319-321`);
   - optional `checkInvariants` — an `InvariantViolation` aborts the game with
     `winType:'invariant-violation'` and no winner (`:323-335`).

All **[code]**.

### 1.4 Invariants checked (`lab/harness/invariants.ts:21-75`)

Run after **every** applied action when `checkInvariants` is true (the default,
`lab/harness/types.ts:77`):

- every unit inside `0..BOARD_SIZE`, no two units on one square, `damageTaken >= 0` (`:24-37`);
- initial capacities are 100 integers in `0..MAX_RESOURCE_RESERVE` (`:40-41`);
- every cell reserve is an integer in `0..capacity` (`:46-53`);
- **crystal conservation**: `white.resourcesGained + black.resourcesGained + remaining
  === total initial` (`:55-60`);
- no negative bank; `resources <= resourcesGained + blackCrystalHandicap` (`:62-71`);
- `0 <= actionsRemaining <= getActionsPerTurn(state)` (`:73-75`).

These are explicitly "the same invariants the property tests assert, minus the expensive
ones" (`lab/harness/invariants.ts:15-20`). Note what is **not** checked: no legality
replay of the action that produced the state, no turn-order check, no zobrist/transition
validation. **[code]**

### 1.5 RNG seeding

`mulberry32` (`lab/harness/rng.ts:9-18`) — the same generator the engine property tests
use, per the file header (`:1-5`). `deriveSeed(seed, stream)` is a splitmix-ish scramble
(`lab/harness/rng.ts:43-48`) used for (a) the two per-seat streams, (b) per-game seeds in
the CLI (`lab/harness/cli.ts:92` `deriveSeed(config.seed, gameIndex)`), and (c) the
replay-sampling stream (`cli.ts:72` `deriveSeed(config.seed, 999)`).
`pickBest` (`rng.ts:26-40`) collects all max-scoring items and breaks the tie with the
seeded rng — this is why scripted pairings vary across seeds but are exactly reproducible
per seed. Determinism is pinned by `tests/lab/harness.test.ts:39-48`
("is deterministic per seed for scripted pairings", compares winner/winType/turns/plies/
kills/materialCurve). All **[code]**.

Caveat for engine bots: `AIEngineV2` is *seeded* (`engine.setSeed(seed)`,
`lab/harness/bots/engine.ts:58`) but its search is **wall-clock budgeted**
(`findBestAction(state, allowance)`), so engine games are not bit-reproducible across
machines — stated explicitly in `lab/results/depth-economy-2026-09-09/REPORT.md`
("Search is seeded but wall-clock-budgeted, so exact decision sequences may change on
another run or machine") **[doc]**.

### 1.6 How results are written

`runExperiment` (`lab/harness/cli.ts:64-138`):

- output dir `config.out ?? lab/results/<name>`, plus a `replays/` subdir (`:67-69`);
- `engineHash()` = `git rev-parse HEAD` (`cli.ts:56-62`), stamped on every row;
- `runId = <name>-<Date.now().toString(36)>` (`:66`);
- mirrored pairings are expanded by swapping seats with the **same seed sequence**
  (`:79-85`);
- one `GameRecord` JSON per line appended to `games.jsonl` (`:114`);
- a replay is written when the game is anomalous (invariant violation, any anomaly
  string, or any illegal action) **or** it wins the 1 % sample lottery (`:116-124`);
  filename `replays/{anomaly|sample}-<white>-vs-<black>-<seed>.json`;
- `summary.csv` from `summarize()` + `summaryToCsv()` (`:133-135`), then `printSummary`;
- progress line every 25 games with a games/s rate (`:126-129`).

`lab/results/.gitignore` ignores `*/games.jsonl` and `*/replays/sample-*.json` — "summaries
are the committed canon", anomaly replays are kept. **[code]**

`GameRecord` (`lab/harness/types.ts:127-153`) is `schema: 'muju-lab-game-v2'` and carries,
among others: `engineHash`, `runId`, `seed`, `durationMs`, the full resolved `options`,
`winner`, `winType`, `turns`, `plies`, `firstBlood`, per-player `PlayerGameStats`
(`:92-114`: upkeep paid/released, zero-stockpile turns, peak T2+, first T3 round,
resources gained/spent, final material, units placed/promoted/lost/killed, tier usage,
element purchases, **`illegalActions`**, plies), `incomeCurve`, `round90Exhaustion`,
`purchases`, `promotionEvents`, `placedAndAttackedKills`, `materialCurve`,
`invariantViolation`, `anomalies`. Replays are `schema:'muju-lab-replay-v2'` with a
per-ply snapshot of units, all 100 cell reserves, and both banks
(`lab/harness/types.ts:156-180`) — the single-file viewer `lab/tools/replay-viewer.html`
(32 KB, no dependencies) renders them by drag-and-drop. All **[code]**.

`summarize()` (`lab/harness/summary.ts:44-119`) groups by *unordered* bot pair plus a
"variant" string built only from `elementGraph` and `handicap` (`:32-42`), so two runs
that differ only in `upkeep`, `victoryRule`, `inactivityRule`, `maxTurns` or
`resourceLayout` **collapse into one row**. Win rates get Wilson 95 % intervals
(`lab/harness/stats.ts:2-14`), seat splits are reported separately, and
`illegalActionsTotal` / `invariantViolations` are surfaced in `printSummary`
(`summary.ts:172-184`). **[code]**

### 1.7 Timing per game

Measured `durationMs` from committed result streams **[data]**:

| corpus | n | mean ms | median ms | max ms |
|---|---:|---:|---:|---:|
| `four-actions-2026-09-12/paired-6.jsonl.gz` (scripted, 6 actions) | 280 | 52 | 24 | 279 |
| `four-actions-2026-09-12/paired-4.jsonl.gz` (scripted, 4 actions) | 280 | 92 | 39 | 329 |
| `alternate-map-2026-09-12/main.jsonl` (scripted, 4 maps) | 1280 | 114 | 13 | 24288 |
| `alternate-map-2026-09-12/ai.jsonl` (AIv2 medium, **fast** preset) | 16 | 20034 | 20978 | 30551 |

So: scripted ≈ **10–100 games/s** single-process; engine at the lab "fast" preset ≈
**0.05 games/s (≈20 s/game)**. That matches `lab/docs/EXPERIMENTS.md:26-31` ("Scripted
bots: ~100–180 games/s … `AIv2-*-fast`: ~0.05–0.1 games/s … `AIv2-*` UI-speed presets:
minutes per game") **[doc]**. Mean plies per scripted game is ~307 in the four-actions
corpus (max 880) **[data]**.

The power table in `lab/docs/EXPERIMENTS.md:18-24` **[doc]**: 5 pt effect needs ~780
games/cell, 7.5 pt ~350, 10 pt ~195, 15 pt ~85, 25 pt ~30. Combined with the engine
throughput above, **an engine-vs-engine cell that can resolve 10 points costs ~195 games
≈ 65 CPU-minutes at the fast preset, and 5 points costs ~4.3 CPU-hours** (my arithmetic
from those two sources) **[inference]**.

### 1.8 Plugging a NEW engine in as a bot

Minimum viable path **[inference, from code]**:

1. Implement `EngineBot` (`lab/harness/types.ts:36-42`): `kind:'engine'`, a stable
   `name`, `onGameStart(player, seed)` to (re)construct and seed per game, and
   `nextAction(state, player): Promise<AIAction|null>` returning exactly **one** action.
   `null` means "end the phase" — the runner substitutes `phaseEndAction(state)`
   (`runner.ts:231`).
2. Register it in `lab/harness/bots/index.ts:16-39` (`FACTORIES`), which is what
   `createBot(name)` and every experiment config resolve against (`:41-47`). The registry
   comment at `:13-14` documents the intended ladder and probe names; `botNames()` is
   asserted by `tests/lab/harness.test.ts:125-131`.
3. Run it: `npx tsx lab/harness/cli.ts --white MyEngine --black AIv2-hard-fast --games 40
   --seed 1 --mirror true --legality strict`.

Three things to get right, all learned from `lab/harness/bots/engine.ts`:

- **Fresh instance per game.** `cli.ts:95-99` constructs bots per game precisely because
  "engine instances own search and debug state".
- **Budget per action, not per turn.** The shipped engine bot detects a new turn by
  `` `${turnNumber}:${currentPlayer}` `` (`engine.ts:67-75`), resets `remainingCPU` to
  `TURN_BUDGET_MS[difficulty]` (`src/ai/engine-v2.ts:39` — easy 1800, medium 4000,
  hard 8000 ms), and then spends a *fraction* per dispatch:
  `homeInvader(state,player) ? 1 : phase==='action' ? 1/max(1, actionsRemaining/2) : 0.25`,
  floored at 80 ms (`engine.ts:85-86`). This is the mechanism that reserves thinking time
  to finish tactical captures.
- **Legality.** Under `legality:'as-shipped'` (the default, `types.ts:76`) illegal
  emissions are *applied* and only counted; under `'strict'` they are dropped. A new
  engine should be measured with `'strict'` first and its `illegalActions` count treated
  as a correctness gate. Historical D14 rates: 0.3/game (medium) up to 3.5/game vs
  Tier1Spam (`lab/docs/EXPERIMENTS.md`, "Engine cells" section) **[doc]**.

Two harness limitations a new engine will hit immediately **[code, inference]**:

- `MatchOptions` has **no** `blackCrystalHandicap` and no `actionsPerTurn`;
  `runner.ts:113` calls `createInitialGameState(options.resourceLayout)` only, so both
  extra arguments of `createInitialGameState` (`src/game/board.ts:203`) stay at their
  defaults. Handicap experiments (§4.3) therefore bypass the harness entirely.
- `WinType` (`lab/harness/types.ts:82-90`) is missing `'home-checkmate'` and `'timeout'`,
  which `VictoryReason` (`src/game/types.ts:116`) does contain and which
  `runner.ts:154` assigns straight through. `home-checkmate` shows up in committed data
  (e.g. 19 of 320 games on the current map in
  `lab/results/alternate-map-2026-09-12/summary.json`) **[data]**, and the
  `alternate-map` README flags exactly this as a live type mismatch at `runner.ts:154`
  **[doc]**.

### 1.9 `lab/ai/run.ts` — "tactics" and "league" modes

`npm run ai:tactics` / `npm run ai:league` → `node --import tsx lab/ai/run.ts <mode> [out]`.
Output dir defaults to `lab/results/ai-wasm-<mode>-<timestamp>` and the script **refuses
to overwrite** an existing directory (`lab/ai/run.ts:17-18`). It writes a `metadata.json`
(`:24-28`) pinning: git HEAD, a SHA-256 over every file under `src/` and `assembly/`,
a hash of the working diff, a hash of `src/game/units.ts` (catalogue), the wasm SHA-256 /
byte size / gzip size, cold-instantiate ms, node version, device string, and `seed:20260907`.
**[code]**

**tactics mode** (`lab/ai/run.ts:29-48`): for each fixture in `tacticalFixtures()`
(`lab/ai/fixtures.ts:13-33` — 14 authored rescue puzzles × a 180°-rotated black mirror =
**28 fixtures**), it (a) runs the WASM solver directly and asserts the proof status matches
`expected` ('proved'/'disproved'), then (b) for each of easy/medium/hard drives up to 16
`AIEngineV2` decisions, requiring every emitted action to be legal, and records whether
the target was actually cleared. This is a **correctness/tactical-competence** harness,
not a strength ladder — the file header says so at `lab/ai/run.ts:1`. **[code]**

**league mode** (`lab/ai/run.ts:49-66`): an "explicit screening override; never label these
results as the UI ladder" (`:50`). Env-tunable: `AI_OPPONENTS` (default
`Rush,Expand,Balanced,Turtle,Tier1Spam,MiningDenial,AntiRush,Random`), `AI_ROUNDS`
(default 20 → passed as `maxTurns`), `AI_WORK` (default 1200 → `fixedWork`), `AI_DIFFICULTY`
(default `medium`). For each opponent × each seat it plays **one** game at the single seed
`20260907` with `legality:'strict'`, `mctsIterations:30`, `fixedWork:AI_WORK`. It writes
`games.json` incrementally and a `summary.json` counting `naturalGames`
(elimination/home-occupation/resignation), `caps`, `candidateWins`, and total
`illegalActions`, with the note "Fixed-work screening, one seed block, both seats. Caps are
not victories; not a measured difficulty ladder." **[code]**

The committed league output is tiny: `lab/results/ai-wasm-2026-09-07/final-screen/summary.json`
= 16 games, 12 natural, 4 caps, 12 candidate wins, 0 illegal actions **[data]**.

### 1.10 `lab/ai/compare-production.ts` — engine vs engine

`node --import tsx lab/ai/compare-production.ts <old-muju-root> <output-dir>`
(`lab/ai/compare-production.ts:2-3`). It dynamically imports `AIEngineV2` from an
**independently archived production tree** (`:15`), instantiates the candidate with the
WASM tactical solver and the old one without (`:21`), and runs both over the
`expected==='proved'` tactical fixtures only (`:18`). Each version gets a 4000 ms
turn allowance, at most 16 decisions, a 50 ms late-result tolerance, and is marked
`illegal` if it emits an action `isLegalAction` rejects (`:22-27`). It writes
`fixtures.json`, `outcomes.json` and a `method.json` whose note says the old engine's RNG
was not seedable and that "This is not a representative league or throughput comparison"
(`:30`). **[code]**

**It is puzzle-solving, not match play.** There is currently *no* script anywhere in
`lab/` that plays engine A against engine B over a set of games. **[code, inference]**

Committed result, `lab/results/ai-wasm-2026-09-07/final-production-puzzles/outcomes.json`
**[data]**:

| version | fixtures | cleared | mean ms |
|---|---:|---:|---:|
| `production-e70a057` | 18 | **12** | 2098 |
| `candidate` (v2 + WASM solver) | 18 | **18** | **1** |

Supporting `final-tactics/tactics.json`: 90 rows (30 fixtures × 3 difficulties),
**54/54 required rescues cleared** across easy/medium/hard (18 each), max solver nodes
4393, max solver time 3.21 ms. `final-tactics/metadata.json`: wasm 7,645 bytes
(3,490 gzipped), cold instantiate 1.99 ms, Apple M2 Max, node v24.11.1. **[data]**

---

## 2. Existing bots and measured strength ordering

Registry: `lab/harness/bots/index.ts:16-39` **[code]**.

| name | file | one-line policy |
|---|---|---|
| `Random` | `bots/random.ts:8-16` | uniform over the legal set (L0 floor) |
| `Greedy` | `bots/greedy.ts:20-36` | one-ply scored max; kill 1000+10·cost, chip 100+10·power, promote 400+20·tier, buy 300+10·cost, advance 20+10·progress |
| `Rush` | `bots/archetypes.ts:51-87` | buy **only** `fire_1` (500), never promote (−1), flood toward the nearest enemy / enemy corner |
| `Expand` | `bots/archetypes.ts:91-136` | plant miners only, attack only for free kills, relocate dry miners to the closest rich cell |
| `Balanced` | `bots/archetypes.ts:147-196` | water/shadow/plant mix, ~1:1 fighter:miner, fighters advance only with ≥3 fighters |
| `Turtle` | `bots/probes.ts:47-88` | never leaves a 6-radius of home; metal/plant/water only; promotes (tall, not wide) |
| `Tier1Spam` | `bots/probes.ts:93-124` | any T1, cheapest first; never promotes; always advances |
| `MiningDenial` | `bots/probes.ts:133-179` | lightning runners + one `plant_1`; drive deep, squat rich cells, block spawn rectangles |
| `AntiRush` | `bots/probes.ts:188-260` | wall near home, focus-fire, counter-build `water_1`/`metal_1`/`water_2` when `rushPressure > 1` |
| `Mono-<element>` ×6 | `bots/mono.ts:18-38` | Greedy with purchases/promotions restricted to one element (ruling J-006 keeps the symmetric starting trio) |
| `AIv2-{easy,medium,hard}-fast` | `bots/engine.ts:45-92` | real `AIEngineV2`, `mctsTimeLimit:120`, `mctsIterations:60` (`engine.ts:39-43`) |
| `AIv2-{easy,medium,hard}` | same | UI presets untouched; "orders of magnitude slower" (`index.ts:35`) |

A shared `withPassiveEconomy` wrapper (`bots/bot-utils.ts:96-109`) is applied by Greedy,
the archetypes and the probes: a MOVE is rescored by `Δ(end-of-turn take) × 45`, and a
positive-scored BUY by `min(mining, reserve) × 15 − manhattan(pos, target) × 3`, where
`target` is own corner for miners (`mining ≥ 2`) and the enemy corner otherwise. This is
why even "Rush" places fire near the enemy and "Expand" hugs home. **[code]**

Extra policy families exist **outside** the registry, in `lab/experiments/`:
`RouteTech` / `RouteBasic` / `HomeTech` (`experiments/map-d-policies.ts:11-49`),
`InvestT1..T4` / `HomeT1..T4` (`experiments/map-d-investment-policies.ts:8-23`,
reserve cash for one lead Plant's next promotion), and the home-aware wrappers
`Aware: / Invade: / Guard: / Siege:<tier>` (`experiments/home-policies.ts:41-82`).
`Siege:N` promotes a metal line up to tier N and marches it at the enemy corner;
`Guard:` pins a water unit on its own home square; every wrapper first runs
`clearHomePlan` (`home-policies.ts:17-40`), a 48-wide/8-deep bounded beam (≤1600
expansions) searching for a same-turn removal of a home invader. These are what the
recent experiments actually use. **[code]**

### Measured ordering

The registry's **claimed** ladder (`bots/index.ts:13-14`) is
`Random (L0) < Greedy (L1) < Rush/Expand/Balanced (L2) < AIv2-* (L3)` **[code]**.

The only wide measurement is the June Phase-3 campaign, **27,400 scripted + 160 engine
games, zero invariant violations**, reported in `lab/docs/EXPERIMENTS.md` **[doc]**:

- G1: Greedy 100 % vs Random (200 g); Balanced 99.0 %, Rush 99.0 % vs Random.
- G2: `AIv2-medium-fast` **100 %** vs Random (40 g, CI ≥ 91.2 %).
- G3: `AIv2-medium-fast` **80.0 %** [65.2–89.5] vs Greedy (40 g);
  `AIv2-hard-fast` **83.3 %** [66.4–92.7] vs Greedy (30 g).
- `AIv2-hard-fast` 93.3 % [78.7–98.2] vs Rush (30 g, mean 6 turns);
  100 % [83.9–100] vs Tier1Spam (20 g).
- Rush 6.0 % vs Greedy; Rush 14.2 % [12.0–16.8] vs AntiRush (800 g); Rush 44.0 % vs
  Turtle; Rush **97.2 %** vs Expand; Rush 43.6 % vs Balanced.
- Mono-line ranking: **metal ≳ water ≫ shadow > fire ≫ plant > lightning**
  (6×6 matrix, 200 g/ordered cell).
- No first-player advantage: white 48.2–52.8 % across Greedy/Rush/Balanced/AntiRush
  mirrors (400 g each, 200 for AntiRush); first blood does not predict winning
  (51.5 % n=400, 50.0 % n=396).

**Caveat that matters a lot:** those numbers are from **June 2026**, against a
**six-action, different-catalogue, different-map** game. Since then the rules changed to
four actions (`087f2e7`, 2026-09-12), prices doubled (`5a03880`, 2026-09-10), the
catalogue moved to v2.8 (2026-09-13), and the map changed at least three times
(480 → 496 → 504). **None of the ladder numbers above have been re-measured on current
rules.** The `EXPERIMENTS.md` header itself says "current v2.1 removes the well and queue.
Reproduce old experiments at their recorded commits." **[inference from code+doc]**

The one modern engine-strength datapoint is the alternate-map supplement
(`docs/ALTERNATE_MAP_REPORT-2026-09-12.md`, 16 games at the *fast* preset) **[doc/data]**:

| opponent | map | AI W/L/D |
|---|---|---:|
| `Aware:Balanced` | current | 3/0/1 |
| `Aware:Balanced` | alternate | 3/0/1 |
| `Aware:Rush` | current | **0/2/2** |
| `Aware:Rush` | alternate | **0/4/0** |

i.e. under four actions and current prices, the production search at 120 ms/60 iterations
**lost every game to a scripted Rush**. Two seeds, both colors — a robustness check, not a
rate. **[data]**

---

## 3. The static value solver (`lab/solver`)

### 3.1 What it models

`lab/solver/model.ts` header (`:1`): "Deterministic local optimization, not a game-playing
bot or a universal power rating." Components **[code]**:

- `validateCatalogue` (`:9-21`) — requires complete unique element × tier ladders,
  integer stats, `mining ≤ 8`.
- `passiveCurve(unit, reserve, turns=6)` (`:28-36`) — repeated `reserveTake(mining, left)`
  on one finite cell; `turnsToEmpty = ceil(reserve/mining)` (`:37-39`).
  Reserve presets `RESERVES = { ordinary: 4, shelf: 8, rich: 16 }` (`:26`).
- `power(a,d) = max(0, a.attack + getAttackModifier(a.element, d.element))` (`:41-43`).
- `strikeActions(unit, d) = ceil((d-1)/speed) + 1` (`:46-49`); `canKill` (`:50-52`).
- `killFrontier(target, attackers, distance, actionBudget=ACTIONS, maxBodies=4)`
  (`:60-85`) — exact cost/actions/bodies Pareto frontier for a coordinated kill, "up to
  four independent approach lanes with the same shortest-path distance … Ignores mutual
  blocking, casualties en route and tech."
- `accessTimeline(catalogue, target, income, horizon=12)` (`:91-112`) — an individually
  financed promotion climb with stipulated external turn-end income; free starting
  F1/W1/P1, rent paid before purchases, a line that cannot pay rent is released and
  restarts at tier 1.
- `staticDominators` (`:114-122`) — strict same-tier dominance with identical elemental
  relationships.
- `solveRoles` (`:131-171`) — a very large declared mission grid (strike × 18 distances ×
  action budgets 1–6 × mining quota 0–8 × 19 guards; plus finite-cell collection tasks on
  reserves 4/8/16 over 1–4 turns × every amount × guards; plus anchor-occupation tasks at
  distances 1–18 × 1–3 moves × guards), counting for each unit how often it is *feasible*,
  *cheapest*, and *sole cheapest*, retaining ≤3 witnesses.
- `metrics` (`:174-187`) and `marginalValues` (`:203-224`) — the ±1-stat reporting grid
  (18 targets × 18 distances × budgets 1/2/3 = **972 cells**), plus an ATK×SPD
  super-additivity probe.

`lab/solver/run.ts:8-9` refuses any `variant` other than `current` ("Historical well
studies run at their pinned commit; see baseline-v1.9.json"). It writes
`lab/results/current-static/current.{json,md}` (overridable with `MUJU_BALANCE_OUT`)
and exits 1 under `--check` if profiles are not all distinct, anything is same-tier
dominated, or any unit lacks a sole-cheapest witness (`run.ts:79`). **[code]**

### 3.2 Current outputs for the v2.8 catalogue

`lab/results/current-static/current.md`, catalogue SHA-256
`a140fd0f0dffae7f7b2800f15b9a933b8e73f574bfbb193706855de3a3a21c0c`, model SHA-256
`a5090b226e70bff60850ae2c09860b893380e7c83188c4f43a00487e62dc876b`;
`current.json` checks: `distinctStatProfiles: 18`, `sameTierDominated: []`,
`noMissionWitness: []`, `noSoleCheapestWitness: []`, `elapsedSeconds: 0.124`. **[data]**

The catalogue as the solver sees it (ATK/DEF/SPD/MINE, cost) **[data]**:

| unit | stats | cost | cheapest / sole-cheapest missions |
|---|---|---:|---:|
| Hi `fire_1` | 2/1/2/1 | 3 | 2760 / 1992 |
| Hono `fire_2` | 3/1/2/1 | 7 | 936 / 936 |
| Kagari `fire_3` | 4/2/3/1 | 15 | 6774 / 6414 |
| Radi `lightning_1` | 1/1/3/0 | 3 | 1092 / 324 |
| Umeme `lightning_2` | 2/1/4/0 | 7 | 696 / 696 |
| Kimubunga `lightning_3` | 3/1/5/0 | 15 | 1092 / 732 |
| Sjor `water_1` | 2/2/1/2 | 4 | 2874 / 2058 |
| Straumr `water_2` | 2/3/1/2 | 8 | 2766 / 2766 |
| Aegirinn `water_3` | 3/4/2/3 | 16 | 10752 / 9927 |
| Göl `shadow_1` | 2/2/2/0 | 4 | 1404 / 588 |
| Gölge `shadow_2` | 3/2/2/1 | 8 | 810 / 810 |
| Karanlık `shadow_3` | 4/2/3/2 | 16 | 4464 / 3639 |
| Muju `plant_1` | 0/3/1/3 | 5 | 736 / 208 |
| Sachita `plant_2` | 1/3/1/5 | 9 | 3549 / 2457 |
| Sachakuna `plant_3` | 2/4/1/8 | 17 | 14887 / 12577 |
| Inyan `metal_1` | 1/3/1/2 | 5 | 3048 / 2520 |
| Mazask `metal_2` | 2/4/1/3 | 9 | 6408 / 5316 |
| Tanka `metal_3` | 2/5/2/4 | 17 | 6064 / 3754 |

Selected marginal values, from the same file **[data]**:

- ATK+1 buys the most new one-hit-kill cells on `lightning_2` (90/972), `fire_1` (54/972),
  `lightning_1` (48/972), `metal_3` (45/972); least on `water_1`/`water_2` (6/972).
- SPD+1 saves the most mean strike actions on the Speed-1 units — `water_1`, `water_2`,
  `plant_1`, `plant_2`, `plant_3`, `metal_1`, `metal_2`: **4.00 actions** each.
- MINE+1 over six passive turns is worth 0 to the Plant line (already saturating) but
  4/6/6 crystals (ordinary/shelf/rich) to `lightning_*` and `shadow_1`.
- DEF+1 raises the cheapest four-body/six-action kill bill at distance 1 most for
  `water_3` (8→11) and `water_2` (7→8); `metal_2`/`metal_3`/`plant_3` do not move (6→6).
- ATK×SPD is super-additive for `fire_1`, `lightning_2`, `plant_2`, `metal_1`
  (+18 cells beyond additive each).
- Conditional crystal value of ATK+1 (cheapest same-type squad, ≤4 bodies/6 actions,
  distances 1/4/7): highest mean savings `plant_1` 5.83 (only 6 jointly feasible cases),
  `plant_2` 4.80, `metal_3` 4.16, `water_3` 3.13, `lightning_2` 3.02.

Focused kill frontiers against **Tanka (`metal_3`, DEF 5)**, from `current.json` **[data]**:

- distance 1: `{lightning_1 + fire_1}` = 6 crystals, 2 actions, 2 bodies; or `fire_3`
  alone = 15 crystals, 1 action.
- distance 4: same pair for 6 crystals / 5 actions; `lightning_2+lightning_1` 10/4;
  `fire_3` 15/2.
- distance 7: `lightning_2+lightning_1` 10 crystals / 6 actions; `fire_3` 15/3.

This is the solver's version of the `BALANCE-2026-09-11.md` design claim that "Kagari is
the only catalogue unit that can kill a full-health Tanka in one attack. Hi plus Radi can
now kill Tanka with combined attacks" **[doc]** — and the solver agrees **[data]**.

`accessTimeline` earliest-financed-turn table (income 3 / 6 / 9 crystals per turn)
**[data]**: T1 lines arrive turn 1–3, T2 turn 2–4, T3 turn 3–8. The
"capabilities by turn" frontier says that at income 6, a single financed exemplar reaches
max 4/5/5/8 stats by own turn 4 and can kill **18/18** target types from distance 7 in
3 actions; at income 3 that takes until turn 8.

### 3.3 Are the unit values usable as evaluation priors?

**Partly, with two hard caveats.** My assessment **[inference]**:

Usable now:
- `power()` / `canKill()` / `strikeActions()` are literally the game rules
  (`getAttackModifier` from `src/game/elements.ts`, `ceil((d-1)/speed)+1`). They are
  perfectly good as a *threat-generation* prior and are already effectively what
  `server/analysis/tactics.ts:singleThreats` computes (used as ground truth by both
  2026-09-14 censuses).
- `killFrontier` gives a *coordination cost* in (crystals, actions, bodies) for removing a
  given defender — exactly the shape an evaluation term for "how expensive is this enemy
  piece to answer" wants. The table above (Tanka = 6 crystals/2 actions at contact,
  10 crystals/6 actions at range 7) is directly usable.
- `passiveCurve` / `turnsToEmpty` are the exact mining rule and are the right prior for a
  "how long will this square keep paying" term. Note the production evaluator currently
  uses the *nominal* Mining stat rather than actual available yield — the depth-economy
  study had to patch that and called it out as a disclosed adapter
  (`lab/results/depth-economy-2026-09-09/REPORT.md`) **[doc]**.

Not usable as a scalar unit value:
1. **`ACTIONS = 6` is stale.** `lab/solver/model.ts:23` still defines the shared action
   budget as 6 and `killFrontier` defaults to it (`:61`), while the game has been four
   actions since `087f2e7` (2026-09-12) and `isActionsPerTurn` rejects anything else
   (`src/game/rules.ts:12-14`). Every six-action frontier in `current.md` therefore
   overstates what a real turn can assemble. (`metrics()` at `model.ts:176` uses budgets
   1/2/3, so the 972-cell grid is unaffected; the `killFrontier`/`squadMarginal` columns
   are.) **[code]**
2. **The witness counts are not ratings.** `run.ts:47` and the README say so explicitly:
   "Witness counts reflect this deliberately broad mission grid, not importance or
   expected frequency." `plant_3` scores 14,887 cheapest missions mostly because the
   grid contains a mining quota axis up to 8 that only it satisfies. Using
   cheapest-mission counts as a piece-value prior would rate Sachakuna above Kagari.

Practical recommendation **[inference]**: take the *rule-exact* pieces (power, strike
actions, kill frontier, passive curve, access timeline) as priors; **re-run the frontier
layer with `ACTIONS = 4`** before using any of its cost/action numbers; ignore the
mission-witness counts entirely for evaluation.

---

## 4. Recent experiments (2026-09-07 → 2026-09-14)

### 4.1 `four-actions` (2026-09-12) — should the turn be 4 actions instead of 6?

**Question.** Would four shared actions per turn make the game more positional without
breaking kill combinations or home defence? **[doc]**

**Method** (`lab/experiments/four-actions/README.md`, `prepare.py`, `run.ts`, `probes.ts`)
**[code/doc]**: `prepare.py` snapshots `src/`, `lab/harness/` and the three policy files,
hashes every file into `source-manifest.json` + `source.tar.gz`, extracts into an ignored
`.sandbox/`, and applies **one** substitution recorded in `engine-patch.json`:
`export const MAX_ACTIONS_PER_TURN = 6;` → `Number(process.env.MUJU_ACTIONS ?? 6)` with a
4-or-6 guard. `run.ts` plays 8 fixed cells × 20 seeds × both colors (mirrors once) =
**280 games per variant, 560 total**, `legality:'strict'`, `checkInvariants:true`,
`maxTurns:120`, `maxPlies:8000`, seed base 9122026, with an `onAction` hook that throws on
any rejected action or budget-reset error. A 32-game pilot is excluded.
`verify-baseline.ts` independently reproduced 8 six-action games with production modules
(`baseline-verification.json`: `{"verified": 8}`). `probes.ts` adds exact tactical
enumerations. Source snapshot: `gitHead ac94d19`, node v24.11.1.

**Headline numbers** (`lab/results/four-actions-2026-09-12/summary.json`) **[data]**:

| measure | 6 actions | 4 actions |
|---|---:|---:|
| games | 280 | 280 |
| mean end round | 22.36 | **27.09** |
| median end round | 21 | 22 |
| median first-kill round | **1** | **2** |
| inactivity draws | 57 (20.36 %) | 66 (23.57 %) |
| eliminations | 94 | 82 |
| upkeep-eliminations | 92 | 98 |
| home occupations | 37 | 34 |
| white wins | 113 | 133 |
| caps / invalid | 0 / 0 | 0 / 0 |

Paired per-seed change in end round: mean **+4.725**, median +4; 175 games longer,
92 shorter, 13 equal. **[data]**

Per-cell (a-wins/b-wins out of 40 unless noted) **[data]**:

| cell | 6 actions | 4 actions |
|---|---|---|
| `Aware:Rush` vs `Aware:Expand` | 40/0, median 6 rounds | 40/0, median **13** rounds |
| `Aware:Rush` vs `Aware:AntiRush` | 4/0, 90 % inactivity | 9/0, 77.5 % inactivity |
| `Aware:Balanced` vs `Aware:Turtle` | 21/14, 12.5 % draws | 16/11, 32.5 % draws |
| `Invade:MiningDenial` vs `Guard:AntiRush` | 30/0 | 26/0 |
| `Siege:3` vs `Guard:AntiRush` | **24/14** | **12/23** |
| `Siege:3` vs `Aware:Rush` | 8/32 | **14/26** |
| `Aware:Rush` mirror (20 g) | white 7 | white **18** |
| `Aware:Balanced` mirror (20 g) | 11/8 | 8/11 |

**Exact tactical probes** (`probes-6.json` / `probes-4.json`) **[data]**:

- *Home-clear counterexample.* Black Tanka on A1, white Hi on E1, Radi on A4, no crystals.
  Minimum action cost = **5** (2 Hi moves + 1 Radi move + 2 attacks; Hi does 3 damage,
  Radi 2, Tanka DEF 5). Solver status: **proved at 6 actions (2894 nodes), disproved at
  4 (2573 nodes)** — at four actions, `END_ACTION_PHASE` immediately yields
  `winner:'black', victoryReason:'home-occupation'`. Moving Hi one square closer (D1)
  restores the defence: **proved at 4** with the 4-action line MOVE B1 / ATTACK A1 /
  MOVE A2 / ATTACK A1.
- *Cleave.* One Kagari vs three stationary Muju. Clustered (adjacent): 3 kills in 3
  actions under **both** budgets. Spaced (C1/E1/G1): 3 kills needing **6** actions at
  six-action rules; at four actions max kills drops to **2** (4 actions). Exhaustive BFS,
  478 / 147 nodes.
- *Unopposed opening.* Hi's shortest attack approach to the enemy Muju is **15 squares**
  and costs **9 total action points**; first kill lands on own turn **2** at six actions,
  own turn **3** at four.
- Stationary opening income is **6** crystals under both budgets.

**Strategic conclusion** (`docs/FOUR_ACTIONS_REPORT-2026-09-12.md`) **[doc]**: "a slower
rush, with the same outcome against undefended expansion." Hi/Hono's move-and-attack
reach falls from **11 to 7** squares, Sjor's from **6 to 4**. Long combinations cannot be
split across turns (damage still fully heals at the target's own turn start), so durable
pieces get harder to remove and one-hit counters (Kagari vs Tanka) get more valuable.
Home defence must be positioned *earlier*. The unchanged ten-quiet-player-turn clock now
allows only 20 action points instead of 30 before a draw. The report's own warning: the
Tanka-siege policy fell 24/40 → 12/40 against the home guard while improving 8/40 → 14/40
against rush, so "the matchup results do not establish a universal defensive advantage."
Four actions was **shipped** two commits later (`087f2e7`, "Make four actions standard and
reset the draw clock only on kills") **[code — git log]**.

### 4.2 `opening-census-2026-09-14` — exhaustive first-turn census

**Question.** What is the complete space of legal White first turns under four actions,
and which openings survive Black's best reply? **[inference from code]**

**Method** (`lab/experiments/opening-census-2026-09-14/census.ts`, `analyze.mjs`,
`verify.ts`) **[code]**:

- `census.ts` BFS-enumerates all reachable 3-unit configurations of the starting
  Hi (B1, speed 2), Sjor (B2, speed 1), Muju (A2, speed 1) within 4 move actions, with
  occupancy blocking. Every node's successor set is cross-checked against production
  `getValidMoves` (`census.ts:37-46`) and every canonical witness is replayed through
  `executeMove` + `endTurn`, asserting the settled income equals
  `Σ min(mining_i, map[square_i])` and that the turn passes to black (`:53-60`).
  Source files are SHA-256 pinned (`:61-62`), `rules:'v2.8'`, `handicap:0`, `actions:4`.
- `analyze.mjs` builds per-state features (spawn rectangle, bank, next/second-turn income,
  zone labels, genus/species taxonomy, capture liability), then scores the full
  White × Black cross product with a **hand-weighted static index**
  (`analyze.mjs:89-91`):
  `score = Δeconomy + Δspace + 0.75·(White capture liability) − 0.35·(Black capture liability)`,
  where `economy = bank + 0.6·next + 0.3·second` and
  `space = 0.1·|spawn| + 0.03·Σ spawn reserves`. Two re-weighted variants
  (economy-emphasis, space-emphasis) test sign robustness. Grades:
  `≤−6 B major, ≤−3.5 B clear, ≤−1.5 B slight, |·|<1.5 Close, <3.5 W slight, <6 W clear, else W major`.
- The first-round cross product is **audited exhaustively**: for every White state, Black
  is re-enumerated from scratch with White's squares blocked, and the cardinality and
  membership must match (`analyze.mjs:44-50`).
- `verify.ts` replays 293 sampled joint positions through production `isLegalAction` /
  `applyAction` / `endTurn`, asserting bank, `inactivityPlies===2`, crystal conservation
  to **504**, spawn counts, and — critically — cross-checking the analyzer's capture mask
  against exhaustive `singleThreats(...)` from `server/analysis/tactics.ts` with an
  infinite work budget.

**Headline numbers** (`census.json`, `analysis.json`, `verification.json`) **[data]**:

- **797** distinct White first turns; layer sizes by minimum action count
  `[1, 8, 45, 188, 555]` (i.e. 1 hold, 8 one-action, 45 two, 188 three, 555 four);
  3,120 edges, 3,120 destinations verified against production movement.
- **635,203** legal joint (W1, B1) positions after removing 6 collisions;
  `blackReplyCounts` ∈ {796, 797}; the exhaustive re-enumeration audit walked
  **2,486,625** transitions and matched every time.
- Taxonomy: 8 "orders" (which of the three starters moved), 35 genera, 205 species;
  64 joint orders, 1,225 joint genera, 51,016 joint species.
- Grade distribution over all 635,203: Close **335,125**, W slight 137,655,
  B slight 89,314, W clear 47,910, B clear 15,305, W major 9,556, B major 338.
  Mean index **+0.553**. Sign-robust across all three weightings in **415,453** (65.4 %).
- Threat symmetry: White has a single-piece capture in 174,914 positions, Black in
  174,914, mutual in 136,426 — exactly symmetric, as 180° rotation requires.
- `verification.json`: **293 joint positions**, 586 masks, **6,878** distinct threat lines,
  all matching.

**Best first turns** (my ranking over `analysis.json.bestByW`, which is
`min over Black replies` = the minimax value of each White opening) **[data + inference]**:

| rank | White opening (witness text) | order | minimax index | Black's best reply | spawn squares |
|---|---|---|---:|---:|---:|
| 1 | Hi C2; Hi C4; Hi C6; **Hi E6** | Hi sortie | **+3.66** | B792 (mirror) | 27 |
| 2 | Hi C2; Hi C4; Hi D5; Hi F5 | Hi sortie | +3.56 | B796 | 27 |
| 3 | Hi C2; Hi C4; Hi C6; Hi D7 | Hi sortie | +3.53 | B792 | 25 |
| 4 | Hi C2; Hi C4; Hi C6; Hi C8 | Hi sortie | +3.35 | B792 | 21 |
| 5 | Hi C2; Hi C4; Hi E4; Hi G4 | Hi sortie | +3.07 | B792 | 25 |
| 6 | Hi C2; Hi D3; Hi F3; Hi H3 | Hi sortie | +2.65 | B792 | 21 |
| 7 | Hi C2; Hi E2; Hi G2; Hi I2 | Hi sortie | +1.95 | B792 | 15 |
| … | … | | | | |
| 796 | Hi A1; Muju A3; Sjor A2 | all three | **−8.53** | | **0** |
| 797 | Muju A3; Hi A2; Sjor B1; Sjor A1 | all three | **−8.53** | | **0** |

Distribution of the minimax value across the 797 openings: mean −3.250, median −3.160,
min −8.53, max +3.66. **[data]**

Reading it **[inference, grounded in the numbers]**:

- **The top 11 openings are all pure "Hi sortie": all four actions spent marching Hi out,
  Sjor and Muju left on their starting squares.** (Rank 12, `Hi C2; Hi C4; Hi D5; Muju A3`
  at +0.74, is the first to move a second piece.) The bank is 6 crystals
  in all of them — moving the two miners cannot increase first-turn income, so the miners'
  only job on turn 1 is to *not* block the spawn rectangle.
- The dominant term is spawn space: the best openings leave 21–27 empty spawn squares,
  the worst leave **0–1**. Sealing the corner is the single worst thing you can do —
  which is exactly the correction already recorded in the project napkin
  (`docs/hard-ai/understand/napkin-snapshot.md`, 2026-09-12: "Built a compact corner
  formation … couldn't buy for 4 of 10 turns") **[doc]**.
- Joint-order means confirm it: with White playing "Hi sortie" the mean index is
  **+2.06 to +3.37** against every Black order; with White "Hold" against Black
  "Hi sortie" it is **−2.45**. **[data]**
- Black's most *universal* replies are Sjor walks, not Hi sorties: B157
  (`Sjor B3; Sjor B4; Sjor B5; Sjor C5`) is within 1.0 of Black's best reply in
  **525 / 797** White states (and in all 525 it leaves no White capture), B151 in 522,
  B158 in 458. The replies with the **lowest max regret** are the mirrored Hi sorties
  (B791 5.77, B792 5.79). **[data]**
- `continuations.json` extends 38 selected (W1,B1) pairs by two engine plies
  (`AIEngineV2('easy')`, `fixedWork:8000`, `beamWidth:10`, `mctsIterations:80`,
  `tacticalDepth:1`, `tacticalNodes:1500`, seed 14092026, ≤3 calls/turn). The engine's
  W2 from the *hold* opening W1 is always `PROMOTE plant_1 → A3; Hi B2→C3→D4`, and Black
  answers with a `lightning_1`/`plant_1` purchase and a counter-advance; static
  evaluations after B2 range from −42.2 (W1 hold vs B792) to +15.9. **[data]**

**Limits.** The index is an authored heuristic, not a game-theoretic value: it prices
three turns of income, spawn geometry, and single-piece capture liability, and nothing
else. It is *verified* (every replay, spawn count, conservation check and capture mask was
cross-checked against production code) but it is **not** validated against outcomes.
The correct summary is "*under this static index*, marching Hi out of the corner while
keeping the spawn rectangle open dominates; burying the corner is catastrophic."
**[inference]**

### 4.3 `handicap-census-2026-09-14` — how many crystals should Black get?

**Question.** White moves first. How large a starting-crystal handicap makes the first
round even? **[inference from code]**

**Method** (`lab/experiments/handicap-census-2026-09-14/census.ts`, `prepare.mjs`,
`score.cpp`, `summarize.mjs`, `verify.ts`, `straumr-bound.mjs`) **[code]**:

- Reuses the 797 White states verbatim and **re-hashes every baseline rule file** to
  refuse a changed baseline (`census.ts:12-13`).
- Enumerates Black's first turn under **8 spending families** (`census.ts:17-26`):
  `0 Save` (0 crystals), `1 Buy Hi` (3), `2 Buy Radi` (3), `3 Buy Sjor` (4),
  `4 Buy Gol` (4), `5 Promote Hono` (4), `6 Promote Straumr` (4), `7 Promote Sachita` (4).
  Pattern counts: 797 / 1070 / 1811 / 786 / 1157 / 797 / 797 / 797.
- Position counts: **3,678** Black patterns available at handicap 3 and **8,012** at
  handicap 4; joint legal positions **2,931,337** (h=3) and **6,385,505** (h=4);
  29 / 59 collisions; 265 genera, 1,341 species.
- Validation: 28,712 production successor edges matched, **8,012 settlements** replayed
  through production (`census.ts:76-78` asserts bank = `max(3,minHandicap) − cost + income`
  and `inactivityPlies === 2`), and — the heavy one — **22,883,316 fresh-search edges**:
  for every White state × every family, Black is re-enumerated from scratch with White's
  squares blocked, and the result must be exactly the non-overlapping subset
  (`census.ts:86-92`).
- Scoring is compiled C++ (`score.cpp`) over all three handicaps 0/3/4 at once, with the
  same index as the opening census plus a material term and the handicap subtracted from
  Black's economy (`score.cpp:60-62`). It emits `states-h{0,3,4}.bin` (15/70/153 MB of
  24-byte records) and `best-by-family.csv`.
- `verify.ts` replays 341 sampled joint states, checks bank/income/upkeep/spawn geometry,
  conservation to **504 + handicap**, and cross-checks all 682 capture masks against
  exhaustive `singleThreats` (2,999 lines), plus asserts `noB1Attacks:true`.

**Headline numbers** (`score-summary.json`, `analysis.json`) **[data]**:

| handicap | joint states | mean index | best-grade counts over the 797 White maximin lines | **White maximin** | median over White choices |
|---:|---:|---:|---|---:|---:|
| 0 | 635,203 | **+0.553** | B major 47, B clear 269, B slight 381, Close 93, W slight 4, W clear 3 | **+3.66** | −3.16 |
| 3 | 2,931,337 | **−3.273** | B major 715, B clear 72, B slight 5, **Close 5** | **−0.90** | −8.02 |
| 4 | 6,385,505 | **−3.941** | B major 790, B clear 7 | **−3.80** | −10.62 |

Average marginal effect over all 797 White openings: handicap 3 shifts the best line by
**−4.745** index points, handicap 4 by **−7.460**; the **fourth crystal alone is worth
exactly +1.000 on average** (`extraCrystal` mean, `summarize.mjs:9`), while the *new
options* the fourth crystal unlocks (Sjor/Göl/promotions) are worth a further
**−1.715** on average (range −0.51 to −2.42). **[data]**

**What Black should buy** (`selectedBest` = for how many of the 797 White openings that
family contains Black's globally best reply) **[data]**:

| family | h=3 selected / tied / near-best | h=4 selected / tied / near-best |
|---|---:|---:|
| Save | 0 / 0 / 0 | 0 / 0 / 0 |
| **Buy Hi** (3) | **583** / 583 / 737 | 0 / 0 / 0 |
| **Buy Radi** (3) | 214 / 214 / 482 | 0 / 0 / 68 |
| **Buy Sjor** (4) | — | **797** / 797 / 797 |
| Buy Gol (4) | — | 0 / 0 / 14 |
| Promote Hono (4) | — | 0 / 0 / 0 |
| Promote Straumr (4) | — | 0 / 0 / 2 |
| Promote Sachita (4) | — | 0 / 0 / 0 |

So: **at 3 crystals Black buys a second Hi (73 %) or a Radi (27 %); at 4 crystals Black
universally buys Sjor**, and never promotes. Per-family mean indices at h=4 rank
Buy Sjor best for Black (mean −6.92) and Promote Hono worst (−1.95). **[data]**

**The Straumr bound** (`straumr-proof.json`, from `straumr-bound.mjs`) **[data]**: a
Black `water_2` promoted on B1 under handicap 4 occupies one of **24** distinct squares.
Over all 797 × 24 = **19,128** White-state × target pairs, a deliberately *relaxed*
knapsack (every original White attacker or its promotion, plus up to two T1 purchases,
unobstructed Manhattan approaches, both purchases allowed to use the same ideal spawn
square, each attacker hitting once) reaches at most **2 damage** — against Straumr's
**DEF 3**. Distribution: 17,475 pairs at 0 damage, 14 at 1, 1,639 at 2. Claim as written
in the file: "No legal White W2 can capture a Black Straumr promoted on B1 under handicap 4.
This does not prove a win or immunity on later turns."

**Strategic conclusion** **[inference, from the numbers above]**: on this static index,
**3 crystals is the right Black handicap and 4 overshoots.** At handicap 0 White's best
opening is "W clear" (+3.66) and only 7 of 797 White choices grade better than Close for
White. At 3, White's best available line is **−0.90 — inside the "Close" band** — and only
5 of 797 grade Close at all (the rest are worse for White, because most White openings are
bad). At 4, White's best is −3.80 ("B clear"). This is a *first-round* statement about a
hand-weighted index, not a win-rate; but the sign flip between 3 and 4 is large relative
to the 1.5-point "Close" band. The engine cross-check exists
(`continuations.json`, 83 pairs, `AIEngineV2('easy')` with `fixedWork:25000`,
`beamWidth:16`, `outputPlans:12`, `tacticalDepth:2`, `mctsIterations:180`,
`tacticalNodes:5000`, seed 14092026) but has not been reduced to a headline **[data]**.

Note the plumbing: `createInitialGameState(undefined, undefined, handicap)`
(`verify.ts:18`) and `MAX_BLACK_CRYSTAL_HANDICAP = 20` (`src/game/rules.ts:3`) — the
handicap is a **production** feature (`tests/game/crystal-handicap.test.ts`), not a lab-only
knob. **[code]**

### 4.4 `alternate-map` (2026-09-12) — map redistribution

**Question.** Does moving side-shelf crystals into the centre and the home corners improve
the game? **[doc]**

**Method** **[doc/code]**: 2,736 games — 1,280 main (four map variants: `current`,
`alternate`, `homeExpansionOnly`, `centerOnly`; 9 policy cells × 20 seeds × both colors),
960 initial route-opening games, 480 exploratory deeper-anchor games, 16 production-search
games at the lab fast preset (120 ms / 60 iterations). Paired by policy, seed and color
across maps. Plus exact unopposed economic witnesses (beam widths 64 and 256, every
witness replayed through production rules) and geometry probes.

**Headline numbers** (`lab/results/alternate-map-2026-09-12/summary.json`, main screen,
320 games/map) **[data]**:

| map | W/L/D | white/black wins | median rounds | centre income/game | centre unit-turns | centre kills | total income |
|---|---|---|---:|---:|---:|---:|---:|
| current | 93/31/196 | 80/44 | 12 | **17.28** | 56.20 | 3.81 | 275.2 |
| alternate | 95/35/190 | 83/47 | 13 | **31.47** | 56.74 | 4.15 | 277.2 |
| homeExpansionOnly | 95/37/188 | 81/51 | 12.5 | 17.58 | 59.23 | 3.84 | 283.0 |
| centerOnly | 106/28/186 | 87/47 | 11 | 28.49 | 53.93 | 4.11 | 251.9 |

**Conclusions** (`docs/ALTERNATE_MAP_REPORT-2026-09-12.md`) **[doc]**:

- H1 (compact opening) **supported with a limit**: within two orthogonal steps of home the
  alternate's certified five-turn gross is **51** vs the current map's **48**; at three or
  six steps both reach the ceiling of 51 (`6+9+12+12+12`). Resource within four steps is
  84 on both; within six it is 128 current vs 116 alternate.
- H2 (the centre pays more) **supported; more central occupation is not**: centre income
  rose 17.3 → 31.5 per game while centre unit-turns barely moved (56.2 → 56.7) and centre
  kills rose 3.81 → 4.15.
- H3 (early centre grab becomes a superior opening) **not supported**: the D5 anchor went
  0 wins / 37 losses / 3 draws against Rush **on both maps**; against Balanced it won 9/40
  (current) and 8/40 (alternate) vs the old B4 shelf opening's 23 and 25. The deeper
  E5/F5 anchors scored **0 wins, 69 losses, 11 draws in 80 alternate-map games vs Rush**.
- H4 (fixes rush or passivity) **not supported**: Rush beat Expand 39/40 → 40/40;
  Rush vs AntiRush 12/0/28 → 13/0/27; Balanced vs Turtle 0/0/40 on both.
- H5 (tall investment improves) **not supported**: `Siege:3` fell 13/40 → 8/40 vs Rush.
- **The alarming one for a Hard-AI project:** Rush mirrors gave
  **White 15/20, Black 0/20, 5 draws — on both maps.** "Rotational symmetry alone is
  insufficient evidence of fair alternating-turn play." This is the empirical
  counterpart of the handicap census's conclusion.

The designer chose the alternate for aesthetic reasons and it shipped as the new-game
default; the map has since been superseded again by the v2.8 504-crystal layout
(`src/game/resourceMap.ts:1-3`). **[doc/code]**

### 4.5 `depth-economy` (2026-09-09) — income trajectories and when stacks run out

**Question.** Should deeper crystal layers be worth more, so Plant T3 has an economic
reason to exist? Variants: **A** (1,1,1,1,1 — shipped), **B** (1,1,1,2,3),
**C** (1,2,3,4,5). **[doc]**

**Method** **[doc]**: pre-registered plan (`lab/experiments/depth-economy/PLAN.md`, written
before any games) with two disclosed amendments. 24 fixed pairings × 20 seeds × both seats
= **960 games/economy**, run twice (an initial screen and a "sustain" screen after a
policy repair that reserves cash for upkeep and the intended promotion) = **5,760 games**.
Plus 288 measured counterfactual continuations, 24 Medium production-AI games + 2
unadapted controls, 432 exact single-turn routes, 144 optimistic multi-turn bounds,
72 replayed three-turn witnesses, 9 tactical removal fixtures, 3 home-defence branches,
and 8 baseline control games that matched production action-for-action.

**Headline numbers** (`lab/results/depth-economy-2026-09-09/REPORT.md` +
`sustain-summary.json`) **[doc/data]**:

| | A | B | C |
|---|---:|---:|---:|
| total finite map value | 308 | 384 | **748** |
| eliminations / home / upkeep-elim / inactivity draws (960 g) | 250/172/13/**525** | 232/184/11/533 | 186/150/28/**596** |
| mean / median rounds | 26.5 / 27.0 | 26.2 / 26.0 | 24.3 / 23.0 |
| mean income per player | 95.6 | 103.4 | **196.9** |
| mean upkeep per player | 19.5 | 20.0 | 25.2 |
| mean purchases+promotions per player | 75.6 | 82.9 | 171.3 |
| **mean final cash per player** | **0.6** | **0.6** | **0.4** |
| first attack / first kill median round | 6 / 6 | 6 / 6 | 6 / 6 |
| T2 / T3 first-arrival median round | 2 / 4 | 2 / **3** | 2 / 4 |
| T1 share of all income | **73.2 %** | 67.1 % | 56.4 % |

Plant T2→T3 payback: "ever covers cost + added rent with fifth layers"
**0.0 % (A) / 56.9 % (B) / 44.9 % (C)**; still covering at lifetime end
0.0 / 17.2 / 38.5 %; mean estimated lifetime net **−15.7 / −8.8 / −2.8**. An immediate
static six-action income advantage ≥6 at the moment of promotion existed in
**0/524 (A), 98/541 (B), 47/722 (C)** promotion events. **[doc]**

Round-5 asset-lead conversion among natural decisions: **59.2 % / 62.4 % / 47.7 %** — no
evidence of the pre-registered +20-point self-reinforcement signal, and trailers reached
parity in 217/717, 223/780, 225/884 eligible games. **[doc]**

**Conclusions** **[doc]**: recommend **human-playtesting B** alongside unchanged A; reject
C. B raised Plant3's wins vs Rush from 18/40 to 27/40 (paired seed-block bootstrap
**+22.5 points, 95 % [+7.5, +37.5]**) but the gain did not reproduce against invasion
(24/40 both) or denial (interval spans zero). C more than doubles income but natural
finishes fall 435 → 364 and inactivity draws rise 54.7 % → 62.1 %: "More money changes
which scripts fail; it does not establish a stronger, healthier investment strategy."
The production Medium AI went 2/8, 2/8, **4/8** on A/B/C, with several A/B losses ending
in the AI's own units being released to upkeep — "Stronger search did not automatically
repair economic planning."

**On "when do the stacks run out"** — nobody has answered this directly. The harness
records `round90Exhaustion` (the turn at which remaining reserves fall to ≤10 % of the
initial total, `lab/harness/runner.ts:261-263`, pinned by
`tests/lab/harness.test.ts:66`) and a full per-turn `incomeCurve` with
`remaining`, `bank`, `zeroReserveUnits` and `tier1Share`
(`lab/harness/types.ts:145`), but **no committed analysis reduces those fields**. What
*is* established **[doc/data]**:

- Cash is essentially always spent: mean final cash per player is **0.4–0.6 crystals** out
  of 96–197 earned, in all three economies. The binding constraint is income, not banked
  crystals.
- T1 units earn the majority of all income (73.2 % under shipped values), so relocation of
  cheap miners, not promotion, is the economic engine.
- Late mining at ≥7 quiet player turns occurred in 6/14/4 games (A/B/C), and **none was a
  fifth-layer-only extraction** — no cheap bottom-layer stalling exploit was found, though
  one bottom-layer take does reset the quiet clock even at nine quiet turns.
- The superseding change actually shipped is different: **v2.8** cut home squares 10 → 8,
  raised expansions 10 → 16, and gave Sachita Mining 5 / Sachakuna Mining 8
  (`docs/EXPANSION_ECONOMY-2026-09-13.md`), with the stated arithmetic "At full
  collection, ongoing income less upkeep is 3/4/6" and "A newly placed Plant promoted on
  the next two own turns collects 3 + 5 + 8 from a 16-square". That is a *design
  intention*, explicitly "not measured balance outcomes" **[doc]** — the depth-economy
  study tested layer *values*, not the Mining stat route that shipped.

### 4.6 `current-static` (regenerated with v2.8)

Covered in §3.2. `npm run balance:check` gates: 18 distinct profiles, zero same-tier
dominance, zero missing sole-cheapest witnesses — all passing in `current.json`. **[data]**

### 4.7 `balance-followup-2026-09-08` and `draw-ten-2026-09-08`

`balance-followup` re-ran the E13 (960 g) and E9 (3,200 g) seed/seat blocks on the v1.7
catalogue (Radi ATK 2→1, Umeme 3→2, Kimubunga MINE 1→0, Tanka MINE 3→4) **[doc]**:

| suite | catalogue | natural wins | inactivity draws | caps |
|---|---|---:|---:|---:|
| E13 (960) | v1.6 | 805 | 155 | 0 |
| E13 (960) | v1.7 | **731** | **229** | 0 |
| E9 (3200) | v1.6 | 2,677 | 523 | 0 |
| E9 (3200) | v1.7 | **2,305** | **895** | 0 |

`summary.json` confirms 0 caps, 0 illegal actions, 0 invariant violations, and a
home-invader census dominated by `lightning_1` (137) and `metal_2` (78) **[data]**.
Interpretation: weakening Lightning's damage raised draws. **[doc]**

`draw-ten` is a retrospective screen of the ten-quiet-turn draw rule
(`historical-screen.json`) **[data]**: with upkeep/draw off, **4 of 700** natural wins
reached ≥10 quiet player turns (max streaks 11, 12, 21, 21); with the shipped rule,
**0 of 805**. Its own caveat: "Retrospective screen of v1.6 bots and catalogue, not a
rerun or human-play balance proof."

The upkeep study behind those (`lab/results/upkeep-draw-2026-09-08/summary.json`)
**[data]** shows what upkeep does to the tier curve: at E13, upkeep `off` gives
median first-T3 round 3, **p95 13, max 33**, peak T2+ median 2 / **max 31**, and 260/960
safety caps; `shipped` gives first-T3 median 4, **p95 12, max 27**, peak T2+ **max 8**,
and **0 caps** with median round 15 (vs 21). At E9 the effect is starker: peak T2+
`max 45` off vs `max 7` shipped. Upkeep is what stops unbounded army growth.

### 4.8 `home-victory-2026-09-07` / `home-guard-2026-09-07`

Paired `elimination` vs `home-or-elimination` victory rules, same seeds/seats.
`home-victory/summary.json`: **1,920 games, 1,533,916 plies, 0 illegal, 0 anomalies,
0 invariant violations** **[data]**.

| rule | games | caps | home wins | median rounds | natural median |
|---|---:|---:|---:|---:|---:|
| elimination | 960 | 438 | 0 | 52 | 25 |
| home-or-elimination | 960 | **280** | **399** | **27** | **17** |

Home-occupation wins are dominated by `lightning_1` (106 of 399), `metal_4` (73) and
`metal_2` (35); 27 landed by round 5, and 75 were scored while behind in board cost.
Per-cell the effect is huge where it bites: `InvestT3` vs `Rush` went from 15 natural
wins / 24 caps to **39 natural wins / 0 caps / 31 home wins**, a paired mean round delta of
**−54.55 [−68.5, −39.45]**. `home-guard/summary.json` (320 games) shows `Siege:4` vs
`Guard:Balanced` moving from 34 wins / 6 caps to 36 wins / **36 home wins** and a
**−29.68 [−36.68, −23.65]** round delta. **[data]**

Conclusion **[inference]**: the home-occupation objective is what converts stalled
positions into results — it removes ~35 % of caps and halves median game length. For a
Hard AI this means **home threat and home defence are first-class evaluation terms**, and
a cheap `lightning_1` is the most common winning invader.

### 4.9 `ai-wasm-2026-09-07`

Covered in §1.9–1.10. Headline: candidate 18/18 rescue puzzles at ~1 ms vs archived
production 12/18 at ~2.1 s; 54/54 required rescues cleared across all three difficulties;
90 tactical rows; wasm 7,645 B / 3,490 B gzipped; verification alongside 621 unit tests in
30 files, 24 Chrome + 5 WebKit browser cases. **[data]**

---

## 5. Gaps — what a Hard-AI project needs and does not have

Ordered by how much they block work. All **[inference]**, each grounded in the code/data
cited.

1. **No engine-vs-engine ladder at a fixed budget.** `lab/ai/run.ts` league mode plays
   *one* game per opponent per seat at a single seed and its own summary refuses to call
   itself a ladder (`lab/ai/run.ts:66`). `compare-production.ts` compares two engines on
   **puzzles only**. `lab/harness/cli.ts` can pit `AIv2-hard-fast` against
   `AIv2-medium-fast` today, but nobody has: there is no committed result directory of
   engine-vs-engine match play anywhere in `lab/results/`. This is the single biggest
   missing instrument — you cannot tell whether a new engine is stronger than the old one.
2. **No Elo / rating estimation at all.** `lab/harness/summary.ts` produces per-pairing
   win rates with Wilson intervals and nothing else: no rating, no pooled model, no
   paired-seed bootstrap (the depth-economy study had to implement its own bootstrap in
   `analyze.py`). Adding a Bradley–Terry/Elo fit over `games.jsonl` is cheap and would let
   the ~20 s/game engine budget buy a *ranking* rather than isolated cells.
3. **No budget-controlled comparison.** `EngineBot` has no notion of "nodes" or "equal
   work". The two knobs in play (`FAST_OVERRIDES` = `mctsTimeLimit:120`,
   `mctsIterations:60` at `bots/engine.ts:39-43`; `fixedWork` in league mode) are used
   inconsistently, and `TURN_BUDGET_MS` is wall-clock. Any strength claim between two
   engines needs a deterministic work unit; `fixedWork` exists in `AIEngineConfig` and
   should become the harness's primary axis.
4. **The whole measured ladder predates the current rules.** Every number in
   `lab/docs/EXPERIMENTS.md` is six-action, pre-price-doubling, pre-v2.8-catalogue,
   pre-504-map. The four calibration gates G1–G4 have **not** been re-run. Before any
   Hard-AI claim, G1–G3 need re-measuring on the current game — this is ~200 scripted
   games for G1 and ~40–80 engine games for G2/G3, i.e. under an hour.
5. **No position test suite beyond 28 hand-authored tactical fixtures.**
   `lab/ai/fixtures.ts:13-33` is 14 puzzles (+ rotations), all of them "remove this
   invader in one turn". There is no suite of *strategic* positions with known best moves,
   no opening book, no endgame set. The two 2026-09-14 censuses are a ready-made source:
   797 White openings and 635,203 verified joint positions with a computed index — a
   Hard AI could be regression-tested against "does it choose a Hi sortie" and "does it
   never seal its own corner."
6. **No perft-style transition validation.** `checkInvariants`
   (`lab/harness/invariants.ts`) validates *states*, not *transitions*: it never re-derives
   the legal move count or compares a state against an independent generator. The census
   scripts do exactly this (`census.ts:37-46` cross-checks `destinations` against
   `getValidMoves`; `analyze.mjs:44-50` re-enumerates Black from scratch and matches
   cardinality **and** membership over 2,486,625 transitions; `handicap .../census.ts:86-92`
   does 22,883,316 edges) — but that machinery lives inside two one-off experiments and is
   not a reusable `perft(depth)` the engine can be checked against. Promoting it into
   `lab/harness/` would be high-value and is mostly copy-work.
7. **The harness cannot express two current rule dimensions.** `MatchOptions`
   (`lab/harness/types.ts:46-70`) has no `blackCrystalHandicap` and no `actionsPerTurn`;
   `runner.ts:113` passes only `resourceLayout` to `createInitialGameState`. That is why
   four-actions had to patch a sandboxed copy of `board.ts` and why the handicap census
   bypasses the runner entirely. Both are one-line additions.
8. **`WinType` is stale.** `lab/harness/types.ts:82-90` omits `'home-checkmate'` and
   `'timeout'`, both of which `src/game/types.ts:116` defines and `runner.ts:154` assigns
   verbatim. Committed data already contains `home-checkmate`
   (19/320 games on the current map, `alternate-map-2026-09-12/summary.json`). The
   `alternate-map` README flags it as a known typecheck break. Anything that switches on
   `winType` is silently incomplete today.
9. **The static solver is on the wrong action budget.** `lab/solver/model.ts:23`
   `ACTIONS = 6`. Every `killFrontier` / `squadMarginal` / "conditional crystal value"
   number in `current-static/current.md` assumes a six-action turn. Fixing the constant and
   regenerating is trivial and is a prerequisite for using the frontier as an evaluation
   prior.
10. **Module-global engine knobs force sequential games.** `setUpkeepVariant`,
    `setElementGraph`, `setCombatHandicap` are process globals set and reset around each
    game (`runner.ts:93-105`). Parallel seed-sharded runners — identified as the ~10×
    throughput mitigation back in `lab/docs/STATUS-2026-06-10.md` and never built — must
    shard across **processes**, not threads, or thread these knobs through state.
11. **Several experiment entrypoints are deliberately dead.** 14 of the 18 scripts in
    `lab/experiments/*.ts` begin with `import './historical-experiment'`, which throws
    ("Historical well/queue experiment: use its recorded commit (v1.9 control: 16ccfd7)",
    `lab/experiments/historical-experiment.ts:4`). That includes every `e8`–`e16` script and
    `home-engine-probes.ts`. Only `home-policies.ts`, `map-d-policies.ts`,
    `map-d-investment-policies.ts` and the four dated subdirectories
    (`four-actions/`, `alternate-map/`, `depth-economy/`, `opening-census-*`,
    `handicap-census-*`) are runnable. Reproducing an old number means checking out an old
    commit.
12. **No draw-avoidance or clock-aware evaluation has been measured.** Inactivity draws are
    **20–24 %** of scripted four-action games (`four-actions/summary.json`), **59 %** of
    the alternate-map main screen (190/320), and **55–62 %** of depth-economy games. Only
    an attack kill resets the clock (`AI_ENGINE_README.md`). A Hard AI that cannot force
    progress will draw the majority of its games against a competent opponent, and nothing
    in the lab currently scores that.
13. **First-player fairness is unresolved and the two most recent instruments disagree
    with the old one.** June E3 found no first-player advantage (48–53 % across 400-game
    mirrors) **[doc]**; the September alternate-map Rush mirrors gave White **15/20,
    Black 0/20** on both maps **[data]**; and the handicap census says a 3-crystal Black
    grant is needed to bring the best first round to −0.90 **[data]**. Any Hard-AI ladder
    must report seat splits and probably run at handicap 3, or it will measure the seat
    rather than the engine.

---

## Files read

Harness: `lab/harness/{types,runner,rng,legal,invariants,stats,summary,cli,bench}.ts`,
`lab/harness/bots/{index,random,greedy,archetypes,probes,mono,engine,bot-utils}.ts`.
AI: `lab/ai/{run,compare-production,fixtures}.ts`.
Solver: `lab/solver/{model,run}.ts`, `lab/solver/README.md`.
Docs: `lab/docs/{EXPERIMENTS,PLAN,SPEC_AUDIT,STATUS-2026-06-10}.md`, `lab/maps/README.md`.
Experiments: `lab/experiments/four-actions/{README.md,prepare.py,run.ts,probes.ts,analyze.py}`,
`lab/experiments/opening-census-2026-09-14/{census.ts,analyze.mjs,verify.ts}`,
`lab/experiments/handicap-census-2026-09-14/{census.ts,prepare.mjs,score.cpp,summarize.mjs,straumr-bound.mjs,verify.ts}`,
`lab/experiments/alternate-map/{README,PLAN,FOLLOWUP}.md`,
`lab/experiments/depth-economy/PLAN.md`,
`lab/experiments/{home-policies,map-d-policies,map-d-investment-policies,historical-experiment,home-engine-probes,e16-upkeep-ai,e16-upkeep-e9,e16-upkeep-e13}.ts`,
`lab/maps/{maps.ts,run.ts}`, `lab/tools/replay-viewer.html` (header).
Results: `current-static/{current.md,current.json}`,
`four-actions-2026-09-12/{summary,probes-4,probes-6,baseline-verification,engine-patch,source-manifest}.json` + both `paired-*.jsonl.gz`,
`opening-census-2026-09-14/{census,analysis,verification,continuations}.json`,
`handicap-census-2026-09-14/{census,analysis,score-summary,straumr-proof,continuation-config,verification}.json`,
`alternate-map-2026-09-12/{summary.json,main.jsonl,ai.jsonl}`,
`depth-economy-2026-09-09/{REPORT.md,sustain-summary.json}`,
`balance-followup-2026-09-08/summary.json`, `draw-ten-2026-09-08/historical-screen.json`,
`upkeep-draw-2026-09-08/summary.json`, `home-victory-2026-09-07/summary.json`,
`home-guard-2026-09-07/summary.json`,
`ai-wasm-2026-09-07/{verification.json,final-screen/summary.json,final-tactics/*,final-production-puzzles/*}`.
Production: `package.json`, `src/game/{rules,units,resourceMap,board,types,elements,combat,upkeep}.ts` (selected),
`src/ai/engine-v2.ts` (selected), `AI_ENGINE_README.md`,
`docs/{FOUR_ACTIONS_REPORT-2026-09-12,ALTERNATE_MAP_REPORT-2026-09-12,EXPANSION_ECONOMY-2026-09-13,BALANCE-2026-09-11,DRAW_TEN-2026-09-08,BALANCE_FOLLOWUP-2026-09-08}.md`,
`tests/lab/harness.test.ts`, `tests/game/lab-knobs.test.ts`.

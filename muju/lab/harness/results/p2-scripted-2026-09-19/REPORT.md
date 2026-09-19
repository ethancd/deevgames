# Scripted reference under `muju-phasing-2` — 2026-09-19

**840 scripted games: 0 illegal actions, 0 invariant failures, 0 anomalies,
0 adjudications.** This is the replacement reference required by preregistration
amendment A4 before any Gate 1 row may be played under the new rules revision.
New purchase/inactivity bands are frozen in `sanity-bands.json` from the
UNCHANGED formula. No engine was run, no strength claim is made, and no
threshold was chosen by looking at a result.

## What changed in the game

Amendment A4 (owner decision, 2026-09-19) moved the inactivity draw limit from
**10 plies to 20** — ten hand-offs per player instead of five. What resets the
clock is unchanged: only an attack that removes a unit. The in-game warning
keeps its three-ply margin (7 -> 17). Nothing else in the rules moved. The rules
revision advanced `muju-phasing-1` -> `muju-phasing-2`, so no evidence crosses
between the two.

## Reference campaign

Run from `muju/`:

```sh
node --import tsx lab/harness/phasing-round-robin.ts
```

Seed 20260955; all 15 scripted bots (9 ladder/probes plus 6 mono-element bots),
105 unordered pairings, h0/h3, two seeds per stratum, both seat orientations on
the same seed: 840 games. Identical to the 2026-09-18 command, bot list, seed,
seed derivation, mirroring, handicaps and match options — the campaign was
re-run, not redesigned. `manifest.json` was written BEFORE the first game and
records the options, the pre-run band formula, the inactivity limit in force,
the source hashes, the base revision and the load. `games.jsonl` retains every
raw game; `SHA256SUMS` pins the evidence. The runner refuses to overwrite a
results folder, so `p1-scripted-2026-09-18` is untouched.

This campaign ran in a worktree several lanes were editing at once, so the
runner re-hashes its sources after the last game and aborts if any file under
`src/game/**` or `lab/harness/**` moved while it played. `totals.json` records
`changedDuringRun: []`: all 840 games were played against one tree.

| Metric | 2026-09-18 (10 plies) | 2026-09-19 (20 plies) |
| --- | ---: | ---: |
| Inactivity draws | 416 / 840 (49.5238%) | **227 / 840 (27.0238%)** |
| Inactivity draws, Wilson 95% | [46.15%, 52.90%] | [24.13%, 30.13%] |
| Draws by any other rule | 0 | 0 |
| Mean completed player turns | 29.98095 | **38.22024** |
| Mean recorded round number | 15.45952 | 19.70595 |
| Mean single decisions | 214.97857 | 264.84405 |
| Maximum recorded round / decisions | 91 / 1078 | 91 / 1119 |
| Mean peak inactivity clock | 7.52024 | 11.12381 |
| Purchases per game, both seats | 38.35952 | **43.09048** |
| Elimination wins | 239 | 326 |
| Upkeep-elimination wins | 98 | 179 |
| Home occupation / home checkmate wins | 48 / 39 | 55 / 53 |
| Illegal actions / invariants / cap adjudications | 0 / 0 / 0 | 0 / 0 / 0 |

Definitions are unchanged from the 2026-09-18 report: a completed player turn is
Act -> mine/upkeep -> Prepare -> handoff and excludes an unfinished terminal
turn; `turns` is the old round-number field; `plies` counts every decision
including both phase ends and manual upkeep; purchase counts are paid
commitments, including commitments later refunded, not successful arrivals.

## The two campaigns are a paired comparison

Because the seed, the seed derivation and the pairing order are identical, game
*i* of this campaign is the same bots, the same seats, the same handicap and the
same seed as game *i* of the 2026-09-18 campaign; that holds for all 840 of 840.
The two runs therefore differ in the draw clock and in nothing else.

- **424 of 840 games are identical** in winner, win type and length. These are
  the games that had already ended before ply 10.
- **189 games that ended in an inactivity draw under 10 plies did not under 20.**
- **0 games went the other way.** No game that resolved under the old clock
  became a draw under the new one.

189 is exactly the fall in the draw count (416 - 227). The rule change removed
draws in this population and added none.

## Per-bot inactivity-draw rate

Each bot plays 112 games (every game in which it holds either seat). Purchases
are that bot's own paid commitments per game.

| Bot | draw rate, 10 plies | draw rate, 20 plies | change | purchases/game, 10 | purchases/game, 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random | 60.71% | 28.57% | -32.14 pp | 7.58 | 9.04 |
| Greedy | 49.11% | 19.64% | -29.46 pp | 5.86 | 6.97 |
| Rush | 13.39% | 5.36% | -8.04 pp | 90.04 | 92.85 |
| Expand | 70.54% | 55.36% | -15.18 pp | 2.98 | 3.62 |
| Balanced | 66.07% | 28.57% | -37.50 pp | 2.97 | 4.70 |
| Turtle | 67.86% | 41.96% | -25.89 pp | 3.01 | 3.93 |
| Tier1Spam | 34.82% | 11.61% | -23.21 pp | 70.93 | 84.09 |
| MiningDenial | 30.36% | 11.61% | -18.75 pp | 45.16 | 49.82 |
| AntiRush | 78.57% | 55.36% | -23.21 pp | 9.04 | 12.46 |
| Mono-fire | 12.50% | 1.79% | -10.71 pp | 8.34 | 8.65 |
| Mono-lightning | 21.43% | 9.82% | -11.61 pp | 14.98 | 15.59 |
| Mono-water | 66.07% | 39.29% | -26.79 pp | 4.87 | 6.07 |
| Mono-shadow | 41.07% | 22.32% | -18.75 pp | 8.42 | 9.31 |
| Mono-plant | 64.29% | 33.04% | -31.25 pp | 6.34 | 7.43 |
| Mono-metal | 66.07% | 41.07% | -25.00 pp | 7.19 | 8.64 |

Every bot's draw rate fell. The largest falls are Balanced (-37.50 pp), Random
(-32.14 pp) and Mono-plant (-31.25 pp); the smallest are Rush (-8.04 pp) and
Mono-fire (-10.71 pp), the two bots that drew least often to begin with. Expand
and AntiRush remain the highest at 55.36%. Per-bot samples are 112 games; these
are descriptive rates, not calibrated strength claims.

## Frozen purchase/draw bands for Gate 1

`sanity-bands.json` is fixed before any V2 row. Each L2 bot/handicap stratum
contains 56 games against the other 14 scripted bots, with mirrored seats. The
formula is byte-for-byte the one written into the runner and the manifest before
the 2026-09-18 campaign; only its inputs were re-measured, which is what A4
requires.

- Baseline purchases per seat per game: half the smallest L2/h mean through
  twice the largest L2/h mean: **[1.6696428571, 188.2857142857]**
  (was [1.3839285714, 186.9285714286]).
- Inactivity draws: **[0, 0.7261348375]** (was [0, 0.8658137861]). The upper
  bound is the largest L2/h Wilson 95% upper endpoint plus 0.05, capped at 1.
  Lower draw rates are welcome; the veto is excessive inactivity.
- Apply separately to each V2-hard vs Rush/Expand/Balanced row and h0/h3
  stratum, counting only V2-hard purchases. This supplies only the behavioural
  part of Gate 1; its strength, historical-margin and legality conditions still
  apply.

The purchase envelope stays wide for the same measured reason as before: Rush
averaged 91.55/94.14 commitments per game at h0/h3 while Expand and Balanced
averaged 3.34-4.93. These bands detect a never-buying baseline; they cannot
establish purchase quality.

The machine was moderately loaded (end load average 7.66/10.86/9.94), lighter
than the 2026-09-18 run's 85.54/73.00/46.48. Scripted outcomes are deterministic
given the seed, so this affects the recorded wall-clock and nothing else.

## Openings

The `p1-dev` / `p1-val` / sealed allocation is UNCHANGED and its pinned hashes
still hold. Every opening ends at Black's first Act root after a single
hand-off, so the largest inactivity clock any opening hands to a run is 1 — six
below the old warning threshold and nineteen below the new limit. That is
measured rather than assumed: `tests/lab/openings-p1.test.ts` replays all 48 dev
and 32 val rows at both handicaps (160 replays) and gets a clock of exactly 1
every time. The sealed book was not opened; the property follows from the
generator's recorded stop rule. See the dated note appended to
[ALLOCATION-P1.md](../../../hard-ai/ladder/openings/ALLOCATION-P1.md).

## Verification

- `npx tsc -p lab/tsconfig.json --noEmit`: passed.
- `npx tsc -p lab/hard-ai/tsconfig.json --noEmit`: passed.
- `MUJU_HEAVY_DIR=/private/tmp/muju-drawclock-heavy npx vitest run tests/lab`:
  **796 passed, 2 failed, 0 skipped (798 total); 39 of 41 test files passed.**
  Both failures are the same authored suite case and are retained in
  `verification.json`; neither was skipped or weakened.

The two failures are `inv16-clock-discipline` in
`lab/hard-ai/suites/invariants.positions.jsonl`, a case authored at
`inactivityPlies: 7` whose expected answer is a terminal inactivity draw. Under
a 20-ply clock the position is still `playing`, so the case's expectation — not
the engine — is what is now wrong. A4 named this exactly: "the M5 v1 suite
measurement and any suite case whose expected answer depends on the clock" are
void and re-authored under `muju-phasing-2`. One case of 225 is affected;
`suites-phasing-runner.test.ts` fails on the same case reaching bundle
authoring. Those files belong to another lane and were left unchanged.

## DAG dispositions for this lane

| Nodes | Disposition and evidence |
| --- | --- |
| transitions | **Changed** — the inactivity limit is a transition rule. 840 invariant-checked games, 0 illegal, 0 invariant failures. |
| ai-strength | **Changed** — the scripted substrate and the frozen bands are re-measured under `muju-phasing-2`. **Blocked**: every Gate 1 row and the M5 v1 suite measurement are void per A4 and are not re-run here. No strength claim. |
| game-validation | **Changed** — regression coverage for the new limit, the new revision and cross-revision pooling. **Blocked**: `inv16-clock-discipline` and the bundle runner, above. |
| balance-analysis | **Changed** — this report is the first measurement of what the rule does to the game. |
| rules-docs, browser-ui, persistence, wasm-tactics, ai-search, hard-ai, server-runtime, mcp-tools, agent-guides | Outside this lane; other lanes own them. |
| static-package, server-package, static-deploy, server-deploy, academy-deploy, release-verification | **Verified unchanged for this lane**: lab-only deliverables, nothing packaged, published or claimed live. |

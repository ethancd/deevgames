# Scripted reference under `muju-phasing-3` (the kill clock) — 2026-09-22

**840 scripted games: 0 illegal actions, 0 invariant failures, 0 anomalies,
0 adjudications, `changedDuringRun: []`.** This is the replacement reference
the p3 retune campaign spec (`docs/changes/2026-09-22-p3-retune-SPEC.md`, Lane P
step 1) requires before amendment A7 can adopt Gate 1 bands at the kill clock.

## What changed in the game

The kill clock (owner decision 2026-09-22, `docs/changes/2026-09-22-kill-clock.md`)
returned the inactivity limit to **ten** plies (the `muju-phasing-1` number; the
twenty of `muju-phasing-2` is now archived), but the tenth kill-free ply is no
longer an automatic draw: the higher **mined total** (every crystal a side's
units took from the board, Black's starting handicap folded in, never reduced by
spending) wins; equal totals draw. `#` (home-checkmate) is withheld once the
invader's next turn start is no longer guaranteed (`c >= 9`). The rules revision
advanced `muju-phasing-2` -> **`muju-phasing-3`**, so no evidence pools across the
two revisions.

**A kill-clock ending is not an `inactivityDraw`.** `GameRecord.inactivityDraw`
keeps meaning `victoryReason === 'inactivity'` (coordinator decision 3 of the
kill-clock record); the tenth kill-free ply now closes with `winType:
'kill-clock'` and a real winner in most games, so `inactivityDraw` is `false` in
every one of these 840 games (`totals.json#inactivityDraws: 0`). The old
"inactivity-draw rate" band therefore reads `0` at every stratum this campaign
freezes (see "Frozen bands" below) — that is not a bug in this run, it is what
the rule now measures, and it is why kill-clock endings and ties are counted
separately in this report instead of folded into the band.

## Reference campaign

Run from `muju/`:

```sh
node --import tsx lab/harness/phasing-round-robin.ts lab/harness/results/p3-scripted-2026-09-22
```

Seed 20260955; all 15 scripted bots (9 ladder/probes plus 6 mono-element bots),
105 unordered pairings, h0/h3, two seeds per stratum, both seat orientations on
the same seed: 840 games. Identical to the 2026-09-19 (`p2-scripted`) command,
bot list, seed, seed derivation, mirroring, handicaps and match options — only
the rule underneath changed. `manifest.json` confirms `rulesVersion
"muju-phasing-3"`, `inactivity {limitPlies: 10, warningPlies: 7, resetBy: "an
attack that removes a unit"}`, 840 games, revision `ef6cdccf`, `dirty: false`.
`totals.json#changedDuringRun` is `[]`: no source under `src/game/**` or
`lab/harness/**` moved while the 840 games played. Wall time ~37 s; start load
[16.43, 11.76, 8.42], end load [15.68, 12.00, 8.65] (1/5/15-minute averages) —
moderately loaded (other p3-retune lanes were active on the same box), recorded
per `docs/changes/2026-09-22-p3-retune-SPEC.md` §0's instruction to record load
with every row.

## Kill-clock endings and ties

| Metric | Count | Rate |
| --- | ---: | ---: |
| Games reaching the ten-ply kill clock (`winType: 'kill-clock'`) | 417 / 840 | 49.6429% |
| ...decided by unequal mined totals (a real winner) | 408 / 417 | 97.8417% |
| ...ties (equal mined totals, `winner: null`) | 9 / 417 | 2.1583% |
| `inactivityDraw: true` (an actual inactivity draw; structurally impossible under the kill clock) | 0 / 840 | 0% |
| Max `maxInactivityPlies` recorded, any game | 10 | — |
| `maxInactivityPlies` for every kill-clock game | exactly 10 | — |

Every kill-clock game ends at exactly ten kill-free plies, never early or late
(`maxInactivityPlies === 10` for all 417); no game exceeds the clock. The 9 ties
break down, by what the same seed/bots/seat pairing did under the 20-ply p2
clock (see "Paired comparison" below), as 5 that were already `inactivity` draws
at p2 and 4 that were `upkeep-elimination` wins at p2 — i.e. four games where a
side that won on the p2 clock's longer runway instead reaches an exact
mined-total tie at the shorter p3 clock.

| Metric | 2026-09-19 (`p2`, 20 plies, pure draw) | 2026-09-22 (`p3`, 10 plies, kill clock) |
| --- | ---: | ---: |
| Decided/drawn at the clock | 227 / 840 (27.0238%), all draws | 417 / 840 (49.6429%), 408 decided + 9 draws |
| Draws by any other rule | 0 | 0 |
| Mean completed player turns | 38.22024 | 29.98333 |
| Mean recorded round number (`turns`) | 19.70595 | 15.45952 |
| Mean single decisions (`plies`) | 264.84405 | 214.98929 |
| Maximum recorded round / decisions | 91 / 1119 | 91 / 1078 |
| Mean peak inactivity clock (`maxInactivityPlies`) | 11.12381 | 7.52262 |
| Purchases per game, both seats | 43.09048 | 38.36071 |
| Elimination wins | 326 | 239 |
| Upkeep-elimination wins | 179 | 98 |
| Home occupation / home checkmate wins | 55 / 53 | 48 / 38 |
| Illegal actions / invariants / cap adjudications | 0 / 0 / 0 | 0 / 0 / 0 |

Definitions are unchanged from the p1/p2 reports: a completed player turn is
Act -> mine/upkeep -> Prepare -> handoff and excludes an unfinished terminal
turn; `turns` is the old round-number field; `plies` counts every decision
including both phase ends and manual upkeep; purchase counts are paid
commitments, including commitments later refunded, not successful arrivals.

## Paired comparison against `p2-scripted-2026-09-19`

Same seed, same seed derivation and the same pairing order, so game *i* of this
campaign is the same bots, same seats, same handicap and same seed as game *i*
of the p2 campaign; that holds for all 840 of 840. The two runs differ only in
the kill clock (limit 20 -> 10, verdict draw -> mined total).

| p2 `winType` -> p3 `winType` | Count |
| --- | ---: |
| elimination -> elimination | 239 |
| inactivity -> kill-clock | 227 |
| upkeep-elimination -> upkeep-elimination | 98 |
| elimination -> kill-clock | 87 |
| upkeep-elimination -> kill-clock | 81 |
| home-occupation -> home-occupation | 48 |
| home-checkmate -> home-checkmate | 38 |
| home-checkmate -> kill-clock | 15 |
| home-occupation -> kill-clock | 7 |

- **423 of 840 games are identical** in winner, win type and completed-turn
  count: every game that had already reached a decisive or home-mate ending at
  or before the point where a 10-ply and a 20-ply clock cannot yet differ.
- **417 games differ**, and every one of them is a game whose p3 outcome is
  `kill-clock` — the shorter clock catches a game that ran on past ply 10 under
  the old 20-ply rule. All 227 of p2's `inactivity` draws became `kill-clock`
  endings here (0 stayed a draw by the old mechanism, since that mechanism no
  longer exists); the remaining 190 kill-clock games are ones that, given ten
  more plies of runway under p2, went on to decide by elimination (87),
  upkeep-elimination (81), home-checkmate (15) or home-occupation (7) instead.
- **0 games went the other way**: no game decisive or drawn under p2 becomes
  something else here before ply 10 — consistent with the two campaigns
  agreeing move-for-move up to the point where the clocks first diverge.

The reach-the-tenth-ply population is a purely structural property of the
bots/seed, independent of what the clock does once reached: the per-bot
kill-clock rates below (p3, 10 plies) are numerically the population of games
that reach ply 10, the same population p1's 10-ply draw-rate table measured
before the 20-ply widening (A4) and the kill clock (this campaign) both
touched the verdict, not the reach.

## Per-bot kill-clock rate

Each bot plays 112 games (every game in which it holds either seat). Purchases
are that bot's own paid commitments per game.

| Bot | kill-clock rate, p3 (10 plies) | inactivity-draw rate, p2 (20 plies) | change | purchases/game, p3 | purchases/game, p2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random | 60.71% | 28.57% | +32.14 pp | 7.58 | 9.04 |
| Greedy | 49.11% | 19.64% | +29.46 pp | 5.86 | 6.97 |
| Rush | 13.39% | 5.36% | +8.04 pp | 90.04 | 92.85 |
| Expand | 70.54% | 55.36% | +15.18 pp | 2.98 | 3.63 |
| Balanced | 66.07% | 28.57% | +37.50 pp | 2.97 | 4.70 |
| Turtle | 67.86% | 41.96% | +25.89 pp | 3.01 | 3.93 |
| Tier1Spam | 34.82% | 11.61% | +23.21 pp | 70.93 | 84.09 |
| MiningDenial | 31.25% | 11.61% | +19.64 pp | 45.17 | 49.82 |
| AntiRush | 78.57% | 55.36% | +23.21 pp | 9.04 | 12.46 |
| Mono-fire | 12.50% | 1.79% | +10.71 pp | 8.34 | 8.65 |
| Mono-lightning | 21.43% | 9.82% | +11.61 pp | 14.98 | 15.59 |
| Mono-water | 66.07% | 39.29% | +26.79 pp | 4.87 | 6.07 |
| Mono-shadow | 41.07% | 22.32% | +18.75 pp | 8.42 | 9.31 |
| Mono-plant | 65.18% | 33.04% | +32.14 pp | 6.34 | 7.43 |
| Mono-metal | 66.07% | 41.07% | +25.00 pp | 7.19 | 8.64 |

Every bot's kill-clock rate is higher than its p2 (20-ply) draw rate, because
the clock now fires at half the ply count. AntiRush and Expand remain the
highest (78.57%, 70.54%); Rush and Mono-fire remain the lowest (13.39%,
12.50%), the two bots that reached the clock least often under either limit.
Per-bot samples are 112 games; these are descriptive rates, not calibrated
strength claims.

## Frozen purchase/kill-clock bands for Gate 1

`sanity-bands.json` is fixed before any V2 row, from the same UNCHANGED formula
p1 and p2 used. Each L2 bot/handicap stratum contains 56 games against the
other 14 scripted bots, with mirrored seats.

- Baseline purchases per seat per game: half the smallest L2/h mean through
  twice the largest L2/h mean: **[1.3839285714285714, 186.92857142857142]**
  (identical to p1's band — Rush, Expand and Balanced's purchase means at
  either handicap did not change enough between the 10-ply p1 reference and
  this 10-ply p3 one to move the envelope; contrast p2's widened
  [1.6696428571, 188.2857142857], now superseded).
- Inactivity draws: **[0, 0.11419614448811528]**. Every L2/h stratum's
  `inactivityDraws` count is 0 (`GameRecord.inactivityDraw` is structurally
  false under the kill clock — see "What changed in the game" — so this band
  measures a quantity that can never again be nonzero under `muju-phasing-3`,
  not "Hard AI never draws"). It is frozen as the formula produces it, per A4's
  precedent of re-measuring inputs without touching the formula; A7 records
  that the quantity itself changed meaning and that kill-clock endings/ties are
  what the campaign now reports instead (see "Kill-clock endings and ties"
  above). The band is retained because Gate 1's behavioural check still reads
  it by name; it will always be satisfied at `0` under this revision, i.e. it
  no longer discriminates on inactivity behaviour, only on non-negative counts.
- Apply separately to each V2-hard vs Rush/Expand/Balanced row and h0/h3
  stratum, counting only V2-hard purchases. This supplies only the behavioural
  part of Gate 1; its strength, historical-margin and legality conditions still
  apply.

## Openings

The `p1-dev` / `p1-val` / sealed allocation is UNCHANGED and its pinned hashes
still hold, exactly as at p1 and p2: every opening ends at Black's first Act
root after a single hand-off (clock 1), far below either the 10-ply or 20-ply
limit. `tests/lab/openings-p1.test.ts` continues to assert this (160 replays,
clock exactly 1). Not regenerated, per the campaign spec's explicit
instruction.

## Verification

- `manifest.json`: `rulesVersion "muju-phasing-3"`, `inactivity {limitPlies:
  10, warningPlies: 7}`, 840 games scheduled and completed, `changedDuringRun:
  []`.
- `totals.json`: `illegalActions: 0`, `invariantFailures: 0`, `adjudications:
  0`, `inactivityDraws: 0` (see above for why this is expected, not a defect).
- `summary.csv`: 210 rows (one per unordered bot pair x handicap variant), each
  4 games with 2/2 seat split, matching the p1/p2 shape exactly.
- Full `tests/lab` gate results are recorded in
  `docs/changes/2026-09-22-p3-retune-laneP.md`.

## DAG dispositions for this lane

| Node | Disposition and evidence |
| --- | --- |
| ai-strength | **Changed** — the scripted substrate and the frozen bands are re-measured under `muju-phasing-3`. This is the reference amendment A7 adopts; no V2/Hard strength claim is made here (that is Gate 2, §4 of the campaign spec). |
| game-validation | See Gates in the lane report. |
| balance-analysis | **Changed** — this report is the first measurement of what the kill clock does to the scripted substrate at the shorter limit. |
| rules-docs, browser-ui, persistence, wasm-tactics, ai-search, hard-ai, server-runtime, mcp-tools, agent-guides | Outside this lane; shipped under the kill-clock campaign already (`docs/changes/2026-09-22-kill-clock.md`). |
| static-package, server-package, static-deploy, server-deploy, academy-deploy, release-verification | **Verified unchanged for this lane**: lab-only deliverable, nothing packaged, published or claimed live. |

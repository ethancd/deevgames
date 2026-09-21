HEADLINE: Fresh first-hand play on this machine (30 Phasing games, all tooling ran cleanly: 0 illegal actions, 0 replica divergences, 0 fallbacks, 0 inactivity draws) says the new Hard engine (src/ai/hard, hard@desktop) is currently WEAKER than the incumbent AIEngineV2 under Phasing: 1W-0D-9L vs aiv2-hard (1 s and 3 s per turn), 1-0-3 vs aiv2-medium, 0-0-4 vs scripted Rush, 4-0-0 vs scripted Balanced. The visible causes are behavioural, not crashes: it searches only depth 1-2 (measured ~50-70 work units/ms, ~100 macro nodes/s, ~800 evals/s on this M1 vs the 200-600 units/ms the config assumes), hoards crystals (bank climbs to 40-85 unspent while it is being eliminated), and walks its guard off the home square into one-move home-checkmates while its own eval reads +6200 cc. Smoke signal only: tiny samples, and every engine-vs-engine row was self-flagged VOID by the ladder's A14 overrun rule because another process was saturating the CPU.

## Remaining work
- (S) Re-run the 5-row sample on an otherwise idle box with --shards 2 so the rows are not VOID under A14; nothing blocks it except CPU contention from other lab runs. Commands are in the report.
- (M) Give `hard:bench --calibrate` a Phasing position corpus (or make it fail loudly on pack-error) — today it reports depthGe4Share=1 on zero searched positions, so there is no honest nodes/sec or depth-per-rung number for Phasing. Blocked on generating/committing Phasing positions.
- (M) Fix the one-move home-loss class before any tuning: the root must refuse a turn that leaves the home square capturable next turn (including the Phasing case where a BUY on the home square is only a pending summon). Both decisive blunders I read are this. Blocked on nothing; needs a suite case from the two replays (hard:exam:from-loss exists).
- (M) Fix hoarding/under-buying: Hard ends games with 40-85 unspent crystals and buys ~4 units/game vs 8-10 for aiv2-hard; diagnose whether purchase generation (place plans under Phasing pending summons) or the eval's bank/material terms cause it. `lab/ai/diagnose-purchases.ts` and hard:eval-audit are the existing entry points.
- (L) Throughput: ~800 evals/s and ~100 macro nodes/s give depth 1 at 1 s and depth 2-3 at 3-10 s; profile with the existing `hard:profile` tool, and fix INITIAL_UNITS_PER_MS (200 vs measured ~60) so first searches stop being deadline-aborted. Even 10x only buys about one more turn of depth, so this ranks below the two behaviour fixes.
- (M) Anti-spam check for the Phasing ruleset itself: scripted Rush (fire_1 spam, cost 3) beat BOTH engines 3-1/4-0 in my sample; confirm at scale with the existing scripted harness before declaring Phasing the only live ruleset.
- (S) Decide the default: until new Hard beats aiv2-hard in a non-void ladder row, the pragmatic 'strong by default' Hard under Phasing is AIEngineV2-hard, which needs its own Gate 1 to pass rather than a port.

## Open questions
- Is the 1-9 result vs aiv2-hard mostly a load artefact? Unlikely to flip sign (single-position throughput at load 3-6 was still only ~60 units/ms and depth 2 at 3 s), but it needs an idle-box rerun to size it.
- Why does the engine hoard: is the purchase generator pruning buys under Phasing (pending summons, placePlansRoot=16), or does the eval value banked crystals above fielded units? I did not open eval/ or gen/purchase.ts.
- Why did the must-answer / home-race layer not veto leaving the home square with an enemy water_3 within one move — is the tier-3 water move range or the pending-summon-does-not-block rule missing from the prover under Phasing?
- Who started the concurrent 8-shard wall:1500 ladder (seed 20260921) and the npm install at 18:21 — another reader in this workflow? Its results would be a larger sample of the same matchup but are equally load-contaminated.
- Is Rush's dominance over both engines under muju-phasing-2 already known and accepted (the scripted reference shows Rush buying ~92 units/game), or is it a balance problem that should block making Phasing the only ruleset?
- What budget does the shipped UI actually give Hard under Phasing (turn paces go up to 51.2M work units in WORK_LADDER)? I measured 1 s and 3 s only.

## Findings
- [verified-in-code-or-results] node_modules was ABSENT in muju/ when I started (18:19); `ls node_modules/.bin` failed. It appeared at 18:21:40, created by some other process (not me: I installed tsx only under the scratchpad and ended up not needing it). After that, stock `node --import tsx ...` / npm scripts work on Node v26.5.1. git status stayed clean; node_modules is ignored. (`ls: node_modules/.bin: No such file or directory` at first check; later `stat`: 'Sep 20 18:21:40 2026 muju/node_modules'; final `git status --short --ignored` prints only `!! muju/node_modules/`)
- [verified-in-code-or-results] The lab harness and ladder are Phasing-only and the new Hard replica is Phasing-only: the runner throws on a non-Phasing initial state and Replica.pack refuses any state whose ruleset is not 'phasing'. (/Users/ethancd/src/deevgames/muju/lab/harness/runner.ts:133-134; /Users/ethancd/src/deevgames/muju/src/ai/hard/core/state.ts:612-616; lab/harness/types.ts:31 HARNESS_RULES_VERSION='muju-phasing-2')
- [verified-in-code-or-results] `hard:bench --calibrate` is currently vacuous: its corpus (lab/hard-ai/positions/*.jsonl, 1,921 positions) contains zero Phasing positions, so every position returns source=fallback/pack-error, is counted as 'proven', and the tool reports depthGe4Share=1 with meanDepth 0, nodesPerSec 0, usPerUnit 0 in ~1 s. There is no working nodes/sec-per-rung bench for Phasing. (scratch bench-calibrate-400k.json: positions 12, provenPositions 12, meanDepth 0, unitsPerMs 0; my scratch bench-check.mts: 15/15 sampled corpus positions -> 'ruleset=undefined source=fallback fallback=pack-error depth=0'; grep count of '"ruleset":"phasing"' is 0 in all six corpus files; lab/hard-ai/bench/run.ts:702-703 counts source!=='search' as proven)
- [verified-in-code-or-results] hard@desktop vs aiv2-hard under Phasing, seat-mirrored, p1-dev openings, handicap 0: wall:1000 -> 0W/0D/6L (5 home-checkmates, 1 elimination, games 9-17 turns); wall:3000 (the shipped desktop budget) -> 1W/0D/3L, and the single win came from opening p1-g5-s17 where White won both seats by elimination in 4 turns (opening-decided). Combined 1-0-9. (scratchpad/probe/ladder-hard-desktop-vs-aiv2-hard-wall1000/summary.md ('A record (W/D/L): 0/0/6'); .../ladder-hard-desktop-vs-aiv2-hard-wall3000/summary.md ('1/0/3'); games.jsonl winner/winType per game)
- [verified-in-code-or-results] Other opponents at wall:1000: vs aiv2-medium 1W/0D/3L (all four games ended home-checkmate); vs scripted Rush 0/0/4 (all elimination; Rush bought 69-129 fire_1, Hard bought 3-9); vs scripted Balanced 4/0/0 (home-occupation/home-checkmate wins); hard@desktop vs hard@midrange mirror 2/0/2. Inactivity draws: 0 of 30 games (max inactivity plies reached 15 of the 20-ply limit). (scratchpad/probe/ladder-hard-desktop-vs-{aiv2-medium,Rush,Balanced}-wall1000/summary.md and games.jsonl; ladder-hard-desktop-vs-hard-midrange-wall1000)
- [verified-in-code-or-results] Reference: the incumbent aiv2-hard ALSO loses to scripted Rush under Phasing on the same two openings (1W/0D/3L at wall:1000; Rush bought 34-171 fire_1 per game at cost 3). Mass tier-1 fire spam currently beats both engines under Phasing. (scratchpad/probe/ladder-aiv2-hard-vs-Rush-wall1000/summary.md; src/game/units.ts:8-18 (fire_1 cost 3))
- [verified-in-code-or-results] Search depth is very shallow at realistic budgets. At wall:1000 vs aiv2-hard: depth 1 in 57 of 60 searches (rung 25k in 51/60). At wall:3000: depth 2 in 24/35, depth 3 in 9/35, depth 0-1 in 2/35. A 'depth' is a whole turn, so depth 1 means the opponent's reply is not searched at all. (PlayerGameStats.hardTiming.turnRows in the two games.jsonl files, summarised by scratch summarize.cjs: depthHist {"1":57,"2":3} and {"0":1,"1":1,"2":24,"3":9})
- [verified-in-code-or-results] Measured throughput on this Apple M1 (8 cores) is ~50-70 work units/ms on a single midgame position at load 3-6 (34-96 median in games under load 10-17), i.e. ~90-110 macro nodes/s, ~8,600 within-turn nodes/s and ~800 evals/s. Depth vs budget on one position (5 v 10 units): 1 s -> depth 0 (abort), 3 s -> depth 2, 10 s -> depth 3, 30 s -> still depth 3. The config assumes INITIAL_UNITS_PER_MS=200 and DESIGN's desktop shape says 600, so the first search of a game is routinely deadline-aborted (firstSearchAborted 6/6 games in the wall:1000 row). (`p6-turn-time.ts --mode one --phases search` outputs: wall 3000 -> work 181212, nodes 241, evals 2358, depth 2, unitsPerMs 66; wall 10000 -> work 700304, nodes 1106, depth 3; wall 30000 -> work 1603431, nodes 2611, depth 3, unitsPerMs 53; src/ai/hard/config.ts:575,587,610; summary.md A16 table)
- [verified-in-code-or-results] Hoarding: the new Hard engine under-buys and sits on its bank. Purchases per game 4.2 (Hard) vs 8.0-10.5 (aiv2-hard); Hard's end-of-game bank 38-60 vs aiv2's 2-39 at wall:1000. Against Rush its bank rose monotonically to 80-85 crystals (about 27 fire_1) while it was eliminated, and after turn 3 it bought nothing. It buys almost exclusively fire_1 and never promoted in the games I read. (incomeCurve.bank per turn in ladder-hard-desktop-vs-Rush-wall1000/games.jsonl: [0,8,13,22,28,37,43,53,62,69,73,75,79,80,81,83,85,...]; purchases arrays in games.jsonl)
- [verified-in-code-or-results] Home-square blunders decide games. Game p1-g5-s85 A-white T9: Hard plays `M fire1 0,0>0,2` off its home square with Black's water_3 at 4,3; Black replies `M water3 4,3>0,0` -> home-checkmate. Game p1-g4-s420 B-white (3 s/turn) T14: Hard plays `BUY fire_1@9,9` (a Phasing pending summon that does not arrive until later) and moves its guard 9,8>9,6; White's water_3 walks 7,6>9,9 -> home-checkmate, with Hard holding bank 47/65 and 2 units vs 18. (scratchpad/probe/ladder-*/replays/p1-g5-s85_0_1-A-white.json and p1-g4-s420_0_1-B-white.json, printed with scratch trace.cjs)
- [verified-in-code-or-results] The existing replay analyst classifies the loss as an evaluation/depth fault, not a generator miss: both the first consequential decision (turn 4) and the largest swing (turn 9) are 'strong-candidate-misjudged' (adviser's turn WAS in the K=24-28 root list, was searched, was not preferred). The production engine's own root score rose to +5800/+6200 cc on turns 8-9 while a 400k-unit adviser scored turn 9 as lost whatever is played (-997,000) and one turn earlier still read +4200 — even 16x the work did not see the home mate one turn ahead. (scratchpad/probe/analyze-p1-g5-s85-A-white.md per-turn table (engine cc 5,800 / 6,200; adviser cc 4,200 then -997,000); tool: lab/hard-ai/analyze/run.ts)
- [verified-in-code-or-results] Turn-time discipline is good and memory is moderate: hard@desktop meanTurnMs 663 (p95 1009, max 1018) at wall:1000 and 1929 (max 3037) at wall:3000; A14 overrun rate 5.0% at wall:1000. RSS grew 92 MB -> 281 MB in an 8-turn wall:3000 probe. aiv2-hard overran its allowance far more under load (30% of turns at wall:1000), which is what voided the rows. (summary.md timing tables; scratchpad/probe/probe-hard-desktop-wall3000.json (lab/hard-ai/bench/probe.ts output: 'rss: 92.3 MB -> 281.1 MB'))
- [verified-in-code-or-results] All search refinements are off in every shipped profile (useLmr, useAspiration, useFutility, useExtensions, useDfpn = false) and book is null, so the measured strength is plain PVS with quiescence at depth 1-3. (/Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:589-615 (makeConfig))
- [verified-in-code-or-results] Every engine-vs-engine row I ran was marked VOID by the ladder's own rule (either arm's overrunRate > 5%), mainly because aiv2 arms overran under a load average of 10-18. A separate 8-shard `hard@desktop vs aiv2-hard --work wall:1500 --seed 20260921` ladder (not mine) was running concurrently and created ~/.local/state/muju-heavy/slot-2.json. My numbers are therefore informal smoke signals and wall-clock throughput is pessimistic. (summary.md '**VOID** timing.b.overrunRate 30.16% (19/63 turns) for arm b = aiv2-hard'; `ps` output showing 8 worker.ts processes at ~100% CPU each; metrics.json loadAvgMean 15.18)
- [doc-claim-only] The production worker contains a Phasing guard: a Phasing state is refused for either engine unless the request carries the personal `?phasingAi=1` preview marker, with the comment that no release gate has passed under Phasing. (/Users/ethancd/src/deevgames/muju/src/ai/worker/handler.ts:~104-108 (comment 'THE PHASING GUARD'); I read the comment only, not the enforcement code)

## Report
# Empirical probe: how the new Hard engine actually plays Phasing on this machine (2026-09-20)

Scope: fresh first-hand runs with existing tooling only, about 12.5 minutes of wall clock. Machine: Apple M1, 8 cores, Node v26.5.1, HEAD a02bbb7, branch master. All artifacts are under `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/probe/` (abbreviated `$P` below). **Every sample here is 4-6 games. That proves nothing statistically; read it as a smoke signal.**

## 1. Environment and tooling state

- `muju/node_modules` did **not exist** when I started (18:19): `ls: node_modules/.bin: No such file or directory`. It appeared at 18:21:40, created by another process (not me — I installed `tsx@4.23.13` only into `$P/deps`, and did not need it afterwards). After that the stock scripts run: everything is `node --import tsx <file>` (package.json `hard:*`, `ai:*`, `balance:*`).
- Cheapest way to make engines play Phasing: `lab/hard-ai/ladder/run.ts` (`npm run hard:ladder`). It is seat-mirrored by construction, takes `--out` anywhere (I pointed it at the scratchpad), replays P1 Phasing openings from `lab/hard-ai/ladder/openings/p1-dev.jsonl`, and records per-search rows (rung, work, elapsed, depth, stopReason, units/ms) in `games.jsonl` under `players.<seat>.hardTiming.turnRows`. The harness is Phasing-only (`lab/harness/runner.ts:133-134`) and so is the replica (`src/ai/hard/core/state.ts:612-616`).
- I set `MUJU_HEAVY_DIR=$P/heavy` so the heavy-queue slot files stayed in the scratchpad.
- **`hard:bench --calibrate` is broken-by-vacuity under Phasing.** Its corpus (`lab/hard-ai/positions/*.jsonl`) has zero Phasing positions; every position returns `source=fallback, fallback=pack-error` and is counted as "proven". Output in 1 s: `positions 12, provenPositions 12, depthGe4Share 1, meanDepth 0, nodesPerSec 0, usPerUnit 0`. I confirmed directly (15/15 sampled positions: `ruleset=undefined ... pack-error`). There is no honest depth-per-rung bench for Phasing right now; I used ladder turn rows and `bench/p6-turn-time.ts` instead.
- Confound: a separate 8-shard ladder (`hard@desktop vs aiv2-hard --work wall:1500 --seed 20260921`, not mine) ran concurrently; load average was 10-18 during most runs. The ladder's own A14 rule therefore marked all my engine-vs-engine rows **VOID** (overrun rate above 5%, mostly the aiv2 arm: 30% of turns at wall:1000). Robustness counters were all clean in every row: illegalActions 0, replicaDivergences 0, fallbacks 0, failures 0, adjudications 0.

## 2. Results (Phasing, muju-phasing-2, handicap 0, seat-mirrored, p1-dev openings)

| A vs B | work | games | A W/D/L | how games ended | game turns |
| --- | --- | --- | --- | --- | --- |
| hard@desktop vs aiv2-hard | wall:1000 | 6 | 0/0/6 | 5 home-checkmate, 1 elimination | 9-17 |
| hard@desktop vs aiv2-hard | wall:3000 | 4 | 1/0/3 | 3 elimination, 1 home-checkmate | 4-16 |
| hard@desktop vs aiv2-medium | wall:1000 | 4 | 1/0/3 | 4 home-checkmate | 5-14 |
| hard@desktop vs Rush (scripted) | wall:1000 | 4 | 0/0/4 | 4 elimination | 13-25 |
| hard@desktop vs Balanced (scripted) | wall:1000 | 4 | 4/0/0 | 2 home-occupation, 2 home-checkmate | 17-41 |
| hard@desktop vs hard@midrange | wall:1000 | 4 | 2/0/2 | 3 home-checkmate, 1 elimination | 13-36 |
| aiv2-hard vs Rush (reference) | wall:1000 | 4 | 1/0/3 | 3 elimination, 1 home-checkmate | 10-32 |

- Inactivity draws: **0 of 30 games**. Max inactivity plies reached 15 (limit 20) in the Hard mirror and vs Balanced. The engine does not shuffle into draws in this sample; it loses decisively.
- The one win vs aiv2-hard came from opening `p1-g5-s17`, where White won both seats by elimination in 4 turns — opening-decided, not engine-decided. Same pattern for the win vs aiv2-medium (`p1-g7-s75`).
- Context that matters for question (1): scripted **Rush beats both engines** under Phasing (it buys 34-171 `fire_1` at cost 3 per game). That is a ruleset/AI risk independent of which Hard ships.

Time per turn (hard@desktop): mean 663 ms, p95 1009, max 1018 at wall:1000; mean 1929 ms, max 3037 at wall:3000. The deadline discipline (A11) holds. Memory: RSS 92 -> 281 MB over an 8-turn `hard:probe` at wall:3000.

## 3. Search depth and throughput

- wall:1000 vs aiv2-hard: depth 1 in **57/60** searches (rung 25,000 in 51/60). wall:3000: depth 2 in 24/35, depth 3 in 9/35. A depth is a whole turn, so depth 1 never looks at the opponent's reply.
- Measured throughput: 34-96 units/ms (medians per row, under load); on one midgame position at load 3-6 via `p6-turn-time --mode one --phases search`:

| wall | stop | depth | work | macro nodes | evals | units/ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 s | abort | 0 | 61,206 | 14 | 804 | 61 |
| 3 s | work | 2 | 181,212 | 241 | 2,358 | 66 |
| 10 s | abort | 3 | 700,304 | 1,106 | 9,758 | 70 |
| 30 s | abort | 3 | 1,603,431 | 2,611 | 20,870 | 53 |

  That is roughly 100 macro nodes/s and **~800 evals/s**. The config starts every game at `INITIAL_UNITS_PER_MS = 200` and DESIGN's desktop shape says 600 (`src/ai/hard/config.ts:575,587`), so the first search of each game is routinely deadline-aborted (`firstSearchAborted` 6/6 in the wall:1000 row: `rung 200000 ... abort u/ms 200->27`).
- All refinements are off in every profile (`useLmr/useAspiration/useFutility/useExtensions/useDfpn = false`, `book: null`; config.ts:589-615).

## 4. Qualitative read of two losses

**Game `p1-g5-s85` A-white (Hard = White, 1 s/turn, lost in 9 turns).** Early tactics are fine: Hard kills three lone `fire_1` raiders on T3-T5. Then it stalls: T6 `M plant2 2,1>3,4 | end-act | BUY fire_1@3,3`, T7 `M plant2 3,4>2,7 | end-act | end-prep` (one of four actions used, nothing bought) while its bank goes 25 -> 29 -> 37 -> 45 -> 52 red / 39 -> 73 green. Black meanwhile promotes to water_3/plant_3. Final turn: `T9W M plant2 1,7>1,8 | M fire1 2,7>4,6 | M fire1 0,0>0,2` — it steps its guard off the home square with water_3 at 4,3 — and `T9B M water3 4,3>0,0` is home-checkmate.

**Game `p1-g4-s420` B-white (Hard = Black, 3 s/turn, depth 2-3).** Hard feeds single `fire_1`s into 7,2 one per turn to trade 1-for-1 (`M fire1 8,2>7,2 | ATK ... KILL`, then is recaptured) until it has 2 units vs 18, with bank 47/65 unspent. T14: `M fire1 9,8>9,6 | end-act | BUY fire_1@9,9` — under Phasing that buy is only a pending summon — and White's water_3 walks `7,6>9,9`: home-checkmate.

**vs Rush:** Hard buys on T1-T3 and then never again; bank by turn `[0,8,13,22,...,80,81,83,85]` while Rush grows to 47 units and eliminates it.

Aggregate: Hard buys 4.2 units/game vs aiv2-hard's 8.0-10.5; end-of-game bank 38-60 vs 2-39; purchases are almost all `fire_1`; no promotions seen.

**Existing analyst (`hard:analyze`, adviser at 400k units) on the first game:** first consequential decision and largest swing are both `strong-candidate-misjudged` — the better turn was in the root list and searched, so this is an evaluation/depth fault, not a generator miss. The engine's own root score climbs to +5,800/+6,200 cc on turns 8-9 while the adviser scores turn 9 as lost whatever is played (-997,000), and one turn earlier the adviser itself still read +4,200. Sixteen times the work did not see a home mate one turn out.

## 5. What this implies (from the empirical side only)

1. "Strong by default" today is AIEngineV2-hard, not `src/ai/hard`. At equal wall clock the new engine went 1-9 against it.
2. The cheapest strength is behavioural, not deeper search: (a) a hard veto on turns that leave the home square takeable next turn, including the Phasing pending-summon case; (b) spend the bank. Both failures are visible at depth 3 and at 400k adviser work, so raw speed alone will not fix them.
3. Throughput is an order of magnitude below the design's assumption; 10x would buy about one more turn of depth. Worth profiling (`hard:profile` exists) after the two fixes.
4. Measurement hygiene: the Phasing bench is vacuous, and ladder rows void themselves when anything else runs. On this M1 use `--shards 2` and an idle box.
5. Rush beating both engines under Phasing deserves a look before Phasing becomes the only ruleset.

## 6. Exact commands (run from `/Users/ethancd/src/deevgames/muju`, with `export MUJU_HEAVY_DIR=$P/heavy`)

```
node --import tsx lab/hard-ai/ladder/run.ts --a hard@desktop --b aiv2-hard --work wall:1000 --handicaps 0 --pairs 3 --seed 20260920 --shards 2 --openings lab/hard-ai/ladder/openings/p1-dev.jsonl --openings-ids p1-g6-s2,p1-g5-s85,p1-g6-s310 --out $P/ladder-hard-desktop-vs-aiv2-hard-wall1000      # 1m14s
... --work wall:3000 --pairs 2 --openings-ids p1-g5-s17,p1-g4-s420 --out $P/ladder-hard-desktop-vs-aiv2-hard-wall3000   # 2m24s
... --b aiv2-medium --work wall:1000 --pairs 2 --openings-ids p1-g7-s75,p1-g5-s135      # 43s
... --b Rush | --b Balanced --work wall:1000 --pairs 2 --openings-ids p1-g8-s15,p1-g3-s4  # 28s / 40s
... --a aiv2-hard --b Rush (same openings)                                               # 51s
... --a hard@desktop --b hard@midrange --openings-ids p1-g7-s46,p1-g4-s72                # 1m04s
node --import tsx lab/hard-ai/bench/run.ts --calibrate --positions 12 --depth 3 --rung 400000 --out $P/bench-calibrate-400k.json   # vacuous, 1s
node --import tsx lab/hard-ai/bench/probe.ts --engine hard@desktop --work wall:3000 --turns 8 --opponent Balanced --seed 7 --out $P/probe-hard-desktop-wall3000.json
node --import tsx lab/hard-ai/bench/p6-turn-time.ts --replay <wall3000 replay p1-g4-s420_0_1-A-white.json> --side white --turn-index 8 --engine hard@desktop --mode one --phases search --wall 1000|3000|10000|30000
node --import tsx lab/hard-ai/analyze/run.ts --replay <wall1000 replay p1-g5-s85_0_1-A-white.json> --engine hard@desktop --adviser-work 400000 --production-work 25000 --side white --out $P/analyze-p1-g5-s85-A-white   # 2m59s
```

Scratch helpers I wrote (scratchpad only): `$P/summarize.cjs` (per-game outcome, buys, depth/rung histograms), `$P/trace.cjs` (replay pretty-printer), `$P/bench-check.mts` (corpus pack-error check).

## 7. Tree state at the end

`git status --short` prints nothing. `git status --short --ignored` prints only `!! muju/node_modules/`, which I did not create. No tracked file was touched; no file newer than my first run exists under `muju/` outside `node_modules`. `~/.local/state/muju-heavy/slot-2.json` exists and is not mine (my runs used `MUJU_HEAVY_DIR` in the scratchpad). A background `find` I started to look for tsx ran to completion on its own; an attempt to kill it was denied by the permission system and I did not pursue it.
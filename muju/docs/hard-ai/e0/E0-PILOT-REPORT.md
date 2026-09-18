# E0 plumbing pilot

EPIC-PLAN-2026-09-16 §8 step 4, §5 campaign 1. A bug detector and cost forecast,
not a strength claim. Apple M2 Max x12, darwin/arm64, Node v24.11.1, WASM
`da9b1cdf25e4bcd6`, both E0.5 heavy slots held.

## Pilot 1 (initial opening only)

2026-09-16 at `b6cbce77`, `wall:3000`, 2 pairs, 2 shards, seeds 91601/91603, no
`--openings`. A third run, `aiv2-hard` vs `Rush` at `wall:500` over 8 pairs,
scored 1/16 for A and is kept only in `lab/results/hard-ai-e0/calib-aiv2-rush`.

| Run | pairs | games | W/D/L for A | score | pair scores | wall min |
| --- | --- | --- | --- | --- | --- | --- |
| pilot-h0 | 2/2 | 4/4 | 4/0/0 | 1.000 | 2, 2 | 1.96 |
| pilot-h3 | 2/2 | 4/4 | 2/0/2 | 0.500 | 1, 1 | 2.37 |

Both `complete`, every failure, illegality, divergence, adjudication and
timing-anomaly count zero. The finding was P1, so the scores, Elo and forecast
above describe one game per orientation, not two. Pilot 1 also booked zero
overhead (P3) and its `hard@lab` probe row predates the weights fix. None of it
is carried forward as a measurement.

## Pilot 2 (openings)

2026-09-16 at `77b68d52cf85ac8eafeeb09c9ccab661436a928c`. Both probes below ran
first, then

```
npm run hard:ladder -- --a hard@lab --b aiv2-hard --work wall:3000 \
  --handicaps 0|3 --pairs 2 --seed 91601|91603 --shards 2 \
  --openings lab/hard-ai/ladder/openings/e0-openings.jsonl \
  --out lab/results/hard-ai-e0/pilot2-h0|pilot2-h3
```

No `--sprt`, so `metrics.sprt`, `sprtSequential` and `decision` are `null`.

| Run | pairs | games | W/D/L for A | score (= per-handicap) | pair scores | wall min |
| --- | --- | --- | --- | --- | --- | --- |
| pilot2-h0 | 2/2 | 4/4 | 3/0/1 | 3/4 = 0.750 | 2, 1 | 5.37 |
| pilot2-h3 | 2/2 | 4/4 | 2/0/2 | 2/4 = 0.500 | 1, 1 | 3.19 |

- Both `complete`; zero failures, illegal actions, replica divergences,
  adjudications, timing anomalies, missing and unattributed games;
  `anomalyCounts` empty; seat flags true; neither `voided`.
- Loadavg 1/5/15 before → after: h0 `2.49 2.01 2.74` → `1.64 2.17 2.62`; h3
  `1.59 2.15 2.61` → `2.87 2.53 2.67`; probes `2.72 2.01 2.76` → `2.62 2.02 2.75`.
- Every game ended by a game rule; lengths 9-58 turns.
- Openings `lab/hard-ai/ladder/openings/e0-openings.jsonl`, sha256
  `ea37cb3a1d9f1a05e6ee43d6aebe8dc18a59fba716c061945e4a543b862e0f44`, all 16
  replay-validated at each handicap first. Used by id: `g2-s0` (pair 0, seed
  213810451), `g3-s1` (pair 1, seed 473919198); pair ids `g2-s0:0:0`,
  `g3-s1:0:1`, `g2-s0:3:0`, `g3-s1:3:1`. The other 14 are unused.
- `metrics.distinctGames`, both runs: A-white 2, B-white 2, of 2 pairs,
  `source: "replay"`, `duplicates: false`; `openingsIndependent: true`. P1 is
  resolved for this schedule shape.
- 8 replays at `<run>/replays/<pairId>-<orientation>.json`, `:` → `_`, beside
  each run's manifest, metrics, elo, summary and `.jsonl` files.

### Per-engine turn timing

Allowance `wall:3000`; tolerance `max(10ms,1%)` = 30 ms here, **PROPOSED, not
frozen** (A14). `overAllowance` counts turns past 3000 ms, `overruns` past 3030.

| Run, engine | turns | mean | p95 | max | overAllow. | overruns >30 ms | budgetExh. | reSearch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| h0 hard@lab | 103 | 2020.1 | 3274 | 4584 | 13 | 11 | 0 | 0 |
| h0 aiv2-hard | 102 | 2973.5 | 3005 | 3006 | 100 | 0 | null | null |
| h3 hard@lab | 67 | 2033.4 | 3725 | 4170 | 12 | 11 | 0 | 0 |
| h3 aiv2-hard | 67 | 2933.0 | 3007 | 3009 | 65 | 0 | null | null |

`aiv2-hard` is 1-9 ms past the allowance on 165 of 169 turns, 0 past the
tolerance; `hard@lab` is past it 25 times, past the tolerance 22, worst 1.53x.
Cold versus warm over the eight `hard@lab` seats (`players.<seat>.turnMs`):
first turn 2134-4584 ms, warm mean 1501.4-2319.0 ms, ratio 1.02x-3.05x.
`aiv2-hard` has none: 1.00x-1.07x, first turns 3002-3007 ms.

### Elo and intervals — DESCRIPTIVE ONLY

From `metrics.json`, verbatim. **These support no inference:** four pairs and no
`--sprt`, against a sequential minimum of 10. Independence is no longer the
reason; the sample size is.

| Run | elo | eloLo | eloHi | los |
| --- | --- | --- | --- | --- |
| pilot2-h0 | 190.848501887865 | -67.88940997058792 | 1199.8261952903777 | 0.921350344873795 |
| pilot2-h3 | 0 | -322.99705060707487 | 322.9970506070748 | 0.5000000005 |

`pilot2-h0` is no longer degenerate (`counts [0,0,1,0,1]`), a first effect of the
openings; `pilot2-h3` stays degenerate and regularized (`[0,0,2,0,0]`).

## Probe at HEAD versus the b1f3d4e probe

`npm run hard:probe -- --engine hard@lab|aiv2-hard --work wall:1000 --turns 3
--out lab/results/hard-ai-e0/probe-{hard-lab,aiv2-hard}.json`, opponent `Rush`,
one heavy slot. The b1f3d4e columns are the E0.5 originals, kept as
`probe-*-b1f3d4e.json`; they carry no resolved-configuration field and their
`hard@lab` predates the weights fix, so those two columns do not compare.

| | hard@lab HEAD | hard@lab b1f3d4e | aiv2 HEAD | aiv2 b1f3d4e |
| --- | --- | --- | --- | --- |
| Cold turn | 1152 ms | 1669 ms | 1004 ms | 1002 ms |
| Warm mean | 886 ms | 1125 ms | 1002 ms | 1002 ms |
| Cold / warm | 1.30x | 1.48x | 1.00x | 1.00x |
| RSS before → after | 105→227 MB | 106→239 MB | 91→469 MB | 90→471 MB |
| heapUsed peak | 56.4 MB | 44 MB | 251.6 MB | 241 MB |

HEAD config hashes, which the b1f3d4e artifacts lack: `hard@lab`
`hard:lab:wall:1000#89d5831f5e88a30b`, `aiv2-hard`
`aiv2:hard:full:wall:1000#8e1158939215eef1`; `resolvedConfigHash` is the part
after `#`. Both say `gitDirty: true` (P4). At the proposed tolerance (10 ms
here) `hard@lab` overruns 2 of 3 turns at worst 1.15x budget, against 3 of 3 at
1.67x on b1f3d4e; `aiv2-hard` 0 of 3. EPIC-PLAN §5 L362-366 wants the tolerance
frozen from this probe; it stays PROPOSED, A14's to ratify.

## Forecast: 50 pairs per handicap, 2 workers

`npm run hard:forecast -- --run <each pilot2 dir> --pairs 50 --workers 2`, merged
into `forecast.json`; `2 x pairs x meanGameSeconds / workers + overhead x games /
workers`. Overhead is `measured` in both (P3), still a lower bound.

| Handicap | mean game | p90 game | overhead/game | games | typical | slow |
| --- | --- | --- | --- | --- | --- | --- |
| h0 | 127.9 s | 278.3 s | 16.58 s | 100 | 120.4 min | 245.8 min |
| h3 | 83.2 s | 135.1 s | 6.22 s | 100 | 74.5 min | 117.8 min |
| both | — | — | — | 200 | 3.25 h | 6.06 h |

That is 1.8x pilot 1's typical estimate and 2.7x its slow one: openings make
games longer (h0 mean 127.9 s against 58.5 s) and the h0 tail is one game (P5).

## 6. Decision record

```text
Hashes: git 77b68d52cf85ac8eafeeb09c9ccab661436a928c; A config 4e7afdf76b32fad,
  B config dc7e4607ea81aad, wasm da9b1cdf25e4bcd6, openings ea37cb3a1d9f1a05
  (truncated; full values in each manifest).
Hypothesis and changed parameter(s): none. Pilot 2 changes one harness parameter
  against pilot 1, --openings, to test P1.
Correctness: pass. The zero-counts held over 8 more games; every game ended by a
  game rule; all 8 replays written; both runs complete.
Strength vs shipped Hard: not established. h0 3/4, h3 2/4 over two pairs each;
  h3 still degenerate; no SPRT; four pairs in total.
Strength vs previous candidate: not measured.
Responsiveness: hard@lab max 4584 ms, 1.53x its budget, 22 overruns past the
  proposed 30 ms tolerance of 170 turns, cold turn 1.02x-3.05x warm; aiv2-hard 0
  past tolerance, 165 of 169 turns 1-9 ms past the raw allowance.
Representative loss and where the strong turn disappeared: not analysed (E1.1).
  hard@lab's one h0 loss is g3-s1:0:1 B-white, 9 turns, home-checkmate.
Decision: inconclusive. The harness is sound and the sampling is now independent;
  four pairs are far too few to say anything about strength.
Unresolved criteria or proposed amendments: two, proposed and NOT applied.
  (i) A14, freeze the watchdog-overrun tolerance: max(10ms,1%) is implemented,
  marked proposed everywhere, and the probe above is the engineering probe
  EPIC-PLAN §5 L362-366 names, so a value can now be ratified.
  (ii) E1.2's stratum allocation over the 16 openings: 8/4/4 development,
  validation, sealed acceptance is proposed in the openings README and
  unassigned; freeze it before the first preregistered pair.
Next bounded task: E1.1, eight additional diagnostic pairs per handicap with the
  openings set, unless a new plumbing fault appears.
Links to raw results and replays: lab/results/hard-ai-e0/pilot2-h0, pilot2-h3,
  forecast.json, probe-{hard-lab,aiv2-hard}.json, -b1f3d4e.json predecessors.
```

## 7. Anomalies

**P1. Different pair seeds gave the same game — RESOLVED for this schedule
shape.** Pilot 1's `pilot-h0` pairs `initial:0:0` and `initial:0:1` carried
different seeds and played identical games: 14 turns / 159 plies in both A-white,
9 / 96 in both B-white. Both engines are deterministic given position and budget,
without `--openings` every pair starts from `initial`, and the seed reaches
neither — `hard@`'s `setSeed` is a no-op (`src/ai/hard/engine.ts:215-217`).
Resolution status is read off pilot 2's `metrics.distinctGames` above, not
assumed. `run.ts` now refuses such a run without `--openings` unless
`--allow-initial-only` is passed. Four pairs is no evidence that 50 stay
distinct; duplicates across handicaps are unchecked.

**P2. Overrun counts had no tolerance — RESOLVED, value still proposed.**
`--overrun-tolerance <ms>ms|<pct>%|max(<ms>ms,<pct>%)` splits
`timing.overAllowance` from `timing.overruns`. At the proposed default
`aiv2-hard` goes from 165/169 overruns to 0, `hard@lab` from 25 to 22. No run
may report its overrun count as frozen until A14 is ratified.

**P3. Forecasts booked zero overhead — RESOLVED.** Pilot 1 computed the residual
off `manifest.at`, stamped before the first game, not `manifest.finishedAt`.
Pilot 2 reports `measured`: 16.58 s/game at h0, 6.22 at h3, still a lower bound.

**P4. Two benign quirks.** `gitDirty` is true in every pilot 2 artifact: the runs
write artifacts into the worktree and the `-b1f3d4e.json` copies were made first.
No tracked source file differs from `77b68d52`. Two h3 `hardTiming.maxTurnMs`
values read 0, documented behaviour of a process-wide high-water mark, so the
timing table uses per-game `players.*.turnMs`.

**P5. The h0 p90 and max game are the same game.** `g3-s1:0:1` A-white, 58 turns
/ 623 plies / 278 s, is the longest of four h0 games, so `p90GameSeconds` equals
`maxGameSeconds` and the slow column rests on one observation.

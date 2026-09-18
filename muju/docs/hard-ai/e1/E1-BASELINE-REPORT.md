# E1 baseline — hard@desktop vs shipped Hard, 50 pairs per handicap

EPIC-PLAN §4 E1 ("Baseline campaign after the pilot") and §5 campaign 2. The
first direct, preregistered, pair-independent comparison of the new engine
with the incumbent. This is DIAGNOSIS under the development budget (wall:3000),
not release certification: the release row is wall:8000, sealed openings, SPRT,
frozen candidate (A3, A5, E6.2).

## Preregistration (AMENDMENTS-DECIDED, "Two E1 decisions"), as run

```
npm run hard:ladder -- --a hard@desktop --b aiv2-hard --work wall:3000 \
  --handicaps 0,3 --pairs 100 --seed 91650 --shards 2 \
  --openings lab/hard-ai/ladder/openings/e1-baseline.jsonl --legality strict \
  --out lab/results/hard-ai-e1/baseline
```

- Fixed sample, no SPRT: 50 pairs per handicap, 100 pairs, 200 games. The
  interval is the decision.
- Openings `e1-baseline.jsonl` sha256 `96f2944a18d3…` (ALLOCATION.md): E0 rows
  10–15 plus `e1-dev` rows 0–43, none used by the pilot or E1.1; one opening
  per pair per handicap, so `openingsIndependent: true` and every one of the
  200 games is distinct (`distinctGames` 100/100 per orientation).
- Git `d3fe704a` in the detached campaign worktree `~/src/deevgames-e1-run`,
  the same commit and engine identity as E1.1; `--legality strict` (A7).
- Started 2026-09-16T13:01:25Z, finished 15:50:23Z: 2 h 49 min wall on two
  shards for 19,761 game-seconds. The E0 forecast was 3.25 h typical.

## Result

| | pairs | games | W/D/L for hard@desktop | score | Elo (pair-aware, 95%) | LOS |
| --- | --- | --- | --- | --- | --- | --- |
| all | 100/100 | 200/200 | 152/1/47 | 0.763 | **+202.6 [+144.7, +273.0]** | 100.0% |
| h0 | 50/50 | 100 | 73/0/27 | 0.730 | +172.8 | pentanomial `[6,0,15,0,29]`, score CI [0.633, 0.827] |
| h3 | 50/50 | 100 | 79/1/20 | 0.795 | +235.4 | pentanomial `[4,0,12,1,33]`, score CI [0.708, 0.882] |

- `status: complete`; failures, illegal actions, replica divergences, timing
  anomalies, adjudications, missing and unattributed games all 0. Not voided.
- Both handicaps favour `hard@desktop`; E1.1's h3 deficit (7/9 over eight
  pairs) was sampling noise, as its interval said it could be.
- Ten pairs were lost in both orientations, 29 + 33 won in both.

## How the games ended

| end | hard wins | hard losses |
| --- | --- | --- |
| home-checkmate | 139 | 20 |
| elimination | 8 | 26 |
| home-occupation | 4 | 0 |
| upkeep-elimination | 1 | 1 |
| inactivity draw | 1 | — |

139 of 152 wins are home-checkmates: the whole-turn search and home prover
find forced mates the incumbent does not see. 26 of 47 losses are
eliminations: when the new engine loses, it is mostly ground down on material,
not mated. Losses split 17 as White, 30 as Black. Lengths 3–56 turns, mean
20.6, median 19.

## Timing at the honest allowance

| engine | turns | p95 ms | max ms | overAllowance | overruns (>30 ms) | overrunRate |
| --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 4036 | 3014 | 3275 | 631 | 24 | 0.59% |
| aiv2-hard | 3988 | 3005 | 3072 | 3914 | 4 | 0.10% |

Mean turn 1951 ms vs 2980 ms. As in E1.1 (and A16): the hard seat's first
turn is deadline-cut in 160 of 200 games (mean 2896 ms); 16.7% of all its
turns end at the deadline; the rest finish well under it because the rung is
quantised. The engine won by +200 Elo while using about two-thirds of its
allowance on average. `abortedSearches` is recorded from A16 on; this run
predates it.

## Shipped-allowance check (wall:8000, A5), eight pairs, DESCRIPTIVE

Run right after the baseline from the same commit and worktree, on the four
`e1-dev` openings the baseline did not use (rows 44–47; `--openings-skip 44`):

```
npm run hard:ladder -- --a hard@desktop --b aiv2-hard --work wall:8000 \
  --handicaps 0,3 --pairs 8 --seed 91680 --shards 2 \
  --openings lab/hard-ai/ladder/openings/e1-dev.jsonl --openings-skip 44 \
  --legality strict --out lab/results/hard-ai-e1/diag-wall8000
```

| | pairs | games | W/D/L | Elo (95%) | hard p95 / max ms | aiv2 p95 / max ms | overrunRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| all | 8/8 | 16/16 | 12/0/4 | +190.8 [+53.8, +432.1] | 8009 / 8035 | 8008 / 8013 | 0.00% / 0.00% |
| h0 | 4/4 | 8 | 6/0/2 | | | | |
| h3 | 4/4 | 8 | 6/0/2 | | | | |

Zero failures, illegal actions, divergences, adjudications. Two things this
establishes and one it does not:

- A5's open question is closed: with an explicit target the engine honours
  8,000 ms above the DESKTOP `maxMs` 6,000 clamp (p95 8009 ms), so the release
  row can be funded at the shipped allowance as decided.
- The advantage does not vanish when the incumbent gets the time players
  actually give it: the point estimate at 8 s matches the 3 s baseline, and
  the mean turn (4921 vs 7920 ms) shows the same two-thirds allowance use.
- Eight pairs prove nothing about magnitude: the interval spans +54 to +432.
  The release claim needs E6.2's 300-pair SPRT on sealed openings.

## Decision record

```text
Hashes: git d3fe704a; openings 96f2944a18d3; A/B config hashes in manifest.json.
Hypothesis and changed parameter(s): none. Preregistered baseline, fixed sample.
Correctness: pass. 200/200, zero failures/illegal/divergence/adjudication.
Strength vs shipped Hard at equal 3 s: ESTABLISHED for this development row —
  +203 Elo [145, 273] over 100 independent pairs; both handicaps positive.
  NOT a release claim: wall:8000, sealed openings, SPRT and a frozen candidate
  are E6.2's, and A12 says no pre-E0 number compares.
Strength vs previous candidate: n/a (first comparable row).
Responsiveness: p95 3014 ms, max 3275 ms, overrunRate 0.59%; first-turn
  deadline cut in 160/200 games (cold profile, A16).
Representative loss and where the strong turn disappeared: hard:analyze over
  E1.1's 14 losses (analysis/, analysis-v2/), reported in E1.4.
Decision: the incumbent is beaten at the development budget. E1.4 chooses the
  first improvement hypothesis from the loss classes and the time-allocation
  finding; E1.3 prices coverage variants at equal time.
Unresolved criteria or proposed amendments: none new.
```

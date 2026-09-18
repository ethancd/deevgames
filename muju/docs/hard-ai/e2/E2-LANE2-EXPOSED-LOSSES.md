# E2 lane 2 — the 14 E1.1 losses with root exposure

Source: `lab/results/hard-ai-e2/analysis/e1.1-losses-exposed/` (14 artifacts and
a summary), produced by

```
MUJU_HEAVY_SLOTS=3 npm run hard:analyze -- \
  --reclassify lab/results/hard-ai-e1/e1.1-diag/analysis-v2 --rerun-root \
  --out lab/results/hard-ai-e2/analysis/e1.1-losses-exposed
```

28 production searches at 400,000 units (two flagged turns per game), about two
minutes of one core. No adviser search was re-run; those numbers come from the
E1 artifacts.

Path note: the coordinator's brief named `lab/results/hard-ai-e1/analyze`, which
holds one pilot artifact. The 14 E1.1 losses are
`lab/results/hard-ai-e1/e1.1-diag/analysis-v2`, which is what was used.

## The split

| class | first consequential | largest swing |
| --- | ---: | ---: |
| `strong-candidate-discarded` | 0 | 0 |
| `strong-candidate-misjudged` | 5 | 5 |
| `fixed-work-divergence` | 9 | 6 |
| `exposure-inconsistent` | 0 | 2 |
| `clock-fallback` | 0 | 1 |

`fixed-work-divergence` was added after the first cut of this document, which
reported those nine rows as `exposure-inconsistent`: the fixed-work re-run
scored the adviser's best turn above the played turn and did not reproduce the
played turn, which is a statement about work rather than a contradiction.

`candidateSource` was `completed-depth` on all 14 first-consequential turns. No
`generator-list`, no `partial-iteration`.

## The three findings

**1. Nothing was discarded. The root searched its whole list, every time.**
Published lists run 18 to 30 candidates and `searched` equals the list length
in all 14 games, adviser's best included (ranks 3 to 26). E2.3 root breadth is
therefore not the lever for these losses: widening a list the root already
searches to the end cannot help, and neither can reordering it. With lane 4's
28/28 present in the generator list, the generator and the root beam are both
exonerated at these turns.

**2. Per-candidate scores are fail-low bounds, so the split is ordinal.**
In the five `strong-candidate-misjudged` games every candidate in the list
carries one identical score — the chosen candidate's. A candidate that does not
beat the incumbent returns the incumbent's score, so the exposure says
"searched, not preferred" and cannot say by how much. Those five are the games
where the fixed-work re-run reproduced the played turn.

**3. The nine `fixed-work-divergence` rows are re-run divergence, not a
contradiction.** In each, the fixed 400,000-unit re-run scored the adviser's
best turn ABOVE the played turn and did not play what the seat played
(`engine.reproducedPlayed` is false in all nine). In six of the nine it chose
the adviser's best turn outright. The seat played under `wall:3000` at rungs
200,000-400,000; the re-run is fixed 400,000. So at these turns the engine
finds the better turn when it is given the work, which points at the clock and
the work rung rather than at the search's judgement. This is a hypothesis the
exposure raises, not one it settles: the fixed-work re-run is not the seat's
search. The work sweep below tests it.

## Per-turn view, first consequential turn

`best cc` and `played cc` are `RootCandidate.scoreCc`, from the mover's view at
the root. `chosen #` is the candidate the re-run returned. `cutoffAt` is where
the last iteration's candidate loop broke on `alpha >= beta`; -1 means it did
not.

| game | turn | list n | searched | adviser-best # | searched? | best cc | played cc | chosen # | depth | cutoffAt | candidateSource | class |
| --- | ---: | ---: | ---: | ---: | :-: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `g2-s20_3_15-A-white` | 3 | 28 | 28 | 3 | yes | 1870 | 1870 | 0 | 3 | -1 | completed-depth | strong-candidate-misjudged |
| `g2-s20_3_15-B-white` | 7 | 30 | 30 | 16 | yes | -268 | -2197 | 13 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g2-s5_0_2-A-white` | 4 | 27 | 27 | 24 | yes | 3934 | 1024 | 24 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g4-s10_0_8-A-white` | 3 | 27 | 27 | 3 | yes | 2428 | 880 | 3 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g4-s10_0_8-B-white` | 7 | 27 | 27 | 11 | yes | 959 | 706 | 11 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g4-s10_3_9-A-white` | 2 | 27 | 27 | 11 | yes | 772 | 772 | 8 | 3 | -1 | completed-depth | strong-candidate-misjudged |
| `g4-s2_3_1-B-white` | 2 | 28 | 28 | 26 | yes | -1015 | -3270 | 26 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g4-s6_0_4-A-white` | 4 | 30 | 30 | 16 | yes | 5025 | 4037 | 23 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g4-s6_3_5-A-white` | 4 | 29 | 29 | 23 | yes | 3522 | 2314 | 23 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g4-s6_3_5-B-white` | 1 | 18 | 18 | 15 | yes | -949 | -949 | 0 | 3 | -1 | completed-depth | strong-candidate-misjudged |
| `g5-s11_0_10-B-white` | 1 | 19 | 19 | 6 | yes | -1179 | -2306 | 3 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g5-s11_3_11-B-white` | 2 | 28 | 28 | 20 | yes | -2945 | -2945 | 0 | 2 | -1 | completed-depth | strong-candidate-misjudged |
| `g5-s7_3_7-A-white` | 4 | 29 | 29 | 23 | yes | 3522 | 2314 | 23 | 3 | -1 | completed-depth | exposure-inconsistent |
| `g5-s7_3_7-B-white` | 1 | 18 | 18 | 15 | yes | -949 | -949 | 0 | 3 | -1 | completed-depth | strong-candidate-misjudged |

Read the table with the caveat that `--max-turns` bounded the original E1.1
analyses and that every number in the exposure columns comes from the
fixed-work re-run, not from the game.

## Work sweep: at what work does the engine choose the adviser's turn?

> **Engine-reuse correction (2026-09-17).** The first cut of this sweep built
> ONE production engine and reused it across every work level and every turn in
> ascending order, so the transposition table was warm from earlier rungs when
> the next one ran. That invalidated the flip points as stated, because a
> fixed-work search is supposed to be a function of position and work alone.
> The sweep now builds a fresh engine per (turn, work) search, and the run was
> repeated. **Every number below is from the fresh run.** The old artifact is
> kept at `…/e1.1-losses-work-sweep/`; see §"Fresh, reused and game-warm agree"
> for what changed, which is nothing.


Run after the split, to test one reading of it. Artifacts:
`lab/results/hard-ai-e2/analysis/e1.1-losses-work-sweep/` (`sweep.json`,
`sweep.md`).

```
MUJU_HEAVY_SLOTS=3 npm run hard:analyze:work-sweep -- \
  lab/results/hard-ai-e2/analysis/e1.1-losses-exposed \
  --out lab/results/hard-ai-e2/analysis/e1.1-losses-work-sweep-fresh
```

84 production searches at six rungs (100k, 200k, 283k, 400k, 566k, 800k units)
over the 14 first-consequential turns, plus 6 adviser searches for the rungs
that chose a turn the artifact had not already scored. 424 s of one core.
283k and 566k are the x sqrt(2) midpoints of `WORK_LADDER`'s x2 quantisation.

A turn FLIPS at the lowest rung whose choice is the adviser's own best turn or
one the adviser scores within 300 cc of its best.

### Flip work

| flip work | turns |
| --- | ---: |
| 100k | 0 |
| 200k | 0 |
| 283k | 3 |
| 400k | 6 |
| 566k | 1 |
| 800k | 0 |
| never (up to 800k) | 4 |

- Flipped at or below 400k: **9 of 14**.
- Flipped at 100k or 200k: **0 of 14**.
- Never flipped up to 800k: **4 of 14** — and all four are
  `strong-candidate-misjudged`, the class where the engine searched the
  adviser's turn and did not prefer it. Every `fixed-work-divergence` turn
  flips by 400k.
- **Every one of the 14 reproduces the turn the seat actually played at some
  rung**, always a low one. The seat's choice is what this engine picks with
  little work, which is consistent with the seat having run at a low rung.

### What the seat spent

| measure | value |
| --- | --- |
| seat wall time on these turns | mean 2323 ms, median 2507 ms, range 860-3015 ms |
| allowance | 3000 ms |
| implied work at 100 units/ms | mean 232k, median 251k |
| implied work at 200 units/ms | mean 465k, median 501k |
| flips reachable within implied work at 100 units/ms | **0 of 10** |
| flips reachable within implied work at 200 units/ms | **7 of 10** |

The rate matters more than the allowance and is not recorded: `hardTiming` in
`games.jsonl` carries turns, searches and milliseconds, never the rung
`chooseWork` picked or the units-per-millisecond it picked it from. Both
columns above are conversions, not measurements.

### Verdict on the hypothesis

**Stands in shape, unproven in magnitude.** The decisions do sit in the band the
hypothesis named — nothing flips at 100k or 200k, 9 of 14 flip by 400k, and 3
of those flip at the 283k midpoint the ladder does not currently offer — so a
finer rung between 200k and 400k is exactly where the available wins are, and
the seat's low-work choice is reproduced on all 14 turns.

**But the premise about slack is not what these turns look like.** The seat
spent a mean 2323 of 3000 ms here, not the baseline's 1951, and two turns ran
to the allowance; at 100 units/ms its implied work (median 251k) sits below
every flip point, so finer quantisation alone buys nothing at that rate, while
at 200 units/ms it buys 7 of 10. Whether E2's next candidate is time or
evaluation therefore turns on one number nobody has measured — the seat's
actual units per millisecond under `wall:3000` — and the cheap next step is to
record `chooseWork`'s chosen rung and measured rate per turn, not to run
another arm.

### Per turn

| game | turn | class | flip work | seat ms | implied @100/ms | @200/ms | choice by rung |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `g2-s20_3_15-A-white` | 3 | strong-candidate-misjudged | never | 2782 | 278k | 556k | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |
| `g2-s20_3_15-B-white` | 7 | fixed-work-divergence | 283k | 860 | 86k | 172k | 100k:P 200k:P 283k:~ 400k:o 566k:A 800k:o |
| `g2-s5_0_2-A-white` | 4 | fixed-work-divergence | 400k | 2633 | 263k | 526k | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g4-s10_0_8-A-white` | 3 | fixed-work-divergence | 283k | 2791 | 279k | 558k | 100k:P 200k:P 283k:A 400k:A 566k:A 800k:A |
| `g4-s10_0_8-B-white` | 7 | fixed-work-divergence | 400k | 3015 | 301k | 603k | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g4-s10_3_9-A-white` | 2 | strong-candidate-misjudged | never | 1907 | 190k | 381k | 100k:o 200k:P 283k:P 400k:P 566k:P 800k:P |
| `g4-s2_3_1-B-white` | 2 | fixed-work-divergence | 283k | 2205 | 220k | 441k | 100k:P 200k:P 283k:A 400k:A 566k:A 800k:A |
| `g4-s6_0_4-A-white` | 4 | fixed-work-divergence | 400k | 1411 | 141k | 282k | 100k:P 200k:P 283k:P 400k:~ 566k:~ 800k:~ |
| `g4-s6_3_5-A-white` | 4 | fixed-work-divergence | 400k | 2549 | 254k | 509k | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g4-s6_3_5-B-white` | 1 | strong-candidate-misjudged | never | 2110 | 211k | 422k | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |
| `g5-s11_0_10-B-white` | 1 | fixed-work-divergence | 400k | 3006 | 300k | 601k | 100k:P 200k:P 283k:P 400k:~ 566k:~ 800k:~ |
| `g5-s11_3_11-B-white` | 2 | strong-candidate-misjudged | 566k | 2465 | 246k | 493k | 100k:P 200k:P 283k:P 400k:P 566k:A 800k:A |
| `g5-s7_3_7-A-white` | 4 | fixed-work-divergence | 400k | 2690 | 269k | 538k | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g5-s7_3_7-B-white` | 1 | strong-candidate-misjudged | never | 2099 | 209k | 419k | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |

`A` = the adviser's own best turn, `~` = within 300 cc of it, `P` = the turn the
seat played, `o` = neither.


## Fresh, reused and game-warm agree

Three runs of the same 14 turns, differing only in what the engine's
transposition table held when the measured search started.

| run | engine per measured search | rungs | artifact |
| --- | --- | --- | --- |
| reused (superseded) | one engine for all turns and rungs, ascending | 6 | `…/e1.1-losses-work-sweep/` |
| fresh | a new engine per (turn, work) | 6 | `…/e1.1-losses-work-sweep-fresh/` |
| game-warm | a new engine per (turn, work), first searching the seat's own earlier turns of that game at 200k each | 3 | `…/e1.1-losses-work-sweep-warm/` |

- **Reused vs fresh: 0 disagreements in 84 rung searches.** Every chosen end
  key is identical, so the flip distribution is unchanged.
- **Fresh vs game-warm: 0 disagreements in 42 rung searches** (200k, 283k,
  400k). `game-warm` ran 129 production searches, 6 warming searches per
  measured one on the deepest turns.
- game-warm's histogram reads `283k 3, 400k 6, never 5` only because it swept
  three rungs; the fifth "never" is the turn that flips at 566k in the
  six-rung runs.

The warming work is an assumption: these replays predate lane 1's per-turn
instrument, so the rung the seat used at each earlier turn is not recorded and
200,000 stands in for it.

`tests/lab/analyze-work-sweep.test.ts` now pins the contract directly: two
sweeps of the same turn at the same work from different engine instances agree
with each other and with a single fresh `HardEngine.searchTurn` of the same
reconstructed position.

### The disputed row

Lane 1 reported that on `g4-s10_0_8-A-white` turn 3 the sweep's fixed 283k
search picks `bd1579e6…` while four fresh runs pick `35810826…`. Re-checked
directly against a brand-new `HardEngine` on the reconstructed start state:

| setup | chosen end key | depth | work consumed |
| --- | --- | ---: | ---: |
| fresh engine, `withMatchRules`, 283k | `bd1579e6f2486e15` | 3 | 230,209 |
| fresh engine, `withMatchRules`, 283k (repeat) | `bd1579e6f2486e15` | 3 | 230,209 |
| fresh engine, `withMatchRules`, 283k, `expose: true` | `bd1579e6f2486e15` | 3 | 230,209 |
| fresh engine, `withMatchRules`, 400k | `bd1579e6f2486e15` | 3 | 230,209 |
| fresh engine, no match rules, 283k | `bd1579e6f2486e15` | 3 | 230,209 |

`bd1579e6f2486e15` is the adviser's best key for that turn; the played key is
`4fa3d95989eb433c`. The search terminates at 230,209 units of its 283,000
allowance, which is also why 283k and 400k give the same answer there.
`35810826…` is neither key, so the reproduction is not looking at the same
position or the same configuration; the turn has to be taken from
`reconstruct(replay).bySide[side]` by `turnNumber`, not by seat-turn index, and
the replay's `options` are `elementGraph: double-thick`, `legality:
as-shipped`, `blackCrystalHandicap: 0`.

## Verdict after the correction

**Yes, things still flip at or below 400k on a fresh engine: 9 of 14, exactly
as before** — the engine-reuse confound was real and worth removing, but it
moved no outcome in this data, and game-warm does not move one either. The time
hypothesis therefore stands where it stood: nothing flips at 100k or 200k, the
decisions sit in the 283k-400k band, and whether the seat could reach that band
inside `wall:3000` still depends on the one number nothing records — its actual
units per millisecond.

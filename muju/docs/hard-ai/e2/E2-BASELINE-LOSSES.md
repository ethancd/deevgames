# E2 baseline loss analysis — partial cut, 7 of 47 at 23:50Z

Status: PARTIAL. The analysis is still running in `~/src/deevgames-e1-run`
(heavy slot 0, launched 2026-09-16 ~22:31Z, pid 11430). Every number below
moves until `summary.json` appears. Rerun the cut with:

```
npm run hard:analyze:report -- \
  ~/src/deevgames-e1-run/muju/lab/results/hard-ai-e1/baseline/analysis-e2
```

and replace everything below the horizontal rule with the output, leaving this
header in place. `--out <file>` writes the same markdown to a file, without
this header. The generator is `lab/hard-ai/analyze/loss-report.ts`; it reads the
analysis directory and never writes to it.

## How to read this

- The denominator, 47, is counted from the run's own `games.jsonl` under the
  rule `run.ts#isLossForHardSeat` applies: the `hard@desktop` seat lost 47 of
  the baseline's 200 games. A draw is not a loss.
- The ten double-loss pairs come from `pairs.jsonl` (`scoreA = 0`) and are the
  rows E1-CLOSE-CRITIQUE item 6 asks to see before the 14-game histogram from
  E1 is trusted. They sort first in the pair table.
- `--max-turns 12` bounds the pass. A largest-swing turn after turn 12 was
  never analysed. Do not quote a largest-swing figure from here without that
  sentence.
- The analyser re-runs the production engine at FIXED work while the seat
  played under `wall:3000`, so the deadline table describes the game's turn
  times, not the re-run's.
- Observed pace: the run started 22:31:28Z and wrote its first artifact at
  22:42:24Z, so a game costs about 11 minutes. At that rate 47 games is about
  8.5 h, not the 5-6 h E2-PLAN estimated. Treat the plan's finish time as a
  lower bound and do not schedule the re-pin row against it.

---

# Baseline loss analysis — incremental cut

7 game(s) analysed of 47; 40 pending. Source `/Users/ashkie/src/deevgames-e1-run/muju/lab/results/hard-ai-e1/baseline/analysis-e2`. Cut taken 2026-09-16T23:50:17.308Z.

`summary.json` is not present: the run is still going and every number below moves.

**The run was launched with `--max-turns 12`.** No turn past 12 was analysed, so a largest-swing turn later than that is invisible here and the largest-swing figures are the largest swing WITHIN the first 12 turns, not within the game.

Adviser work 1,600,000 units; swing threshold 300 cc.

## First consequential decision — class

| class | games | share |
| --- | ---: | ---: |
| strong-candidate-misjudged | 5 | 71% |
| unclear | 2 | 29% |

## Largest-swing turn — class (within the first 12 turns)

| class | games | share |
| --- | ---: | ---: |
| strong-candidate-misjudged | 5 | 71% |
| unclear | 2 | 29% |

## First consequential decision — turn number

| turn | games | share |
| ---: | ---: | ---: |
| 2 | 2 | 29% |
| 3 | 1 | 14% |
| 5 | 1 | 14% |
| 8 | 1 | 14% |
| (none) | 2 | 29% |

## Swing at the first consequential turn

min 747 cc, median 1649 cc, max 1953 cc.

| swing cc | games |
| --- | ---: |
| 500–999 | 1 |
| 1000–1999 | 4 |

Swing at the largest-swing turn (first 12 turns only):

| swing cc | games |
| --- | ---: |
| < 300 | 2 |
| 1000–1999 | 3 |
| 2000–4999 | 2 |

## Was the first consequential turn deadline-cut?

| measure | games | of analysed |
| --- | ---: | ---: |
| turn broke its wall allowance (`timing.overran`) | 0 | 0% |
| turn at or past the allowance, tolerance aside | 2 | 29% |
| turn dispatched nothing but phase ends (`timing.emptyPlan`) | 0 | 0% |
| fixed-work re-run did not reproduce the played turn | 4 | 57% |

5 of 7 first-consequential turns carry both a wall time and an allowance. The seat played under `wall:3000`; the analyser re-runs the production engine at FIXED work, so a turn that was deadline-cut in the game was not deadline-cut in the re-run, and a class assigned to such a turn is a statement about the fixed-work engine, not about what the seat had time to do.

## Root exposure at the first consequential turn

No analysed game carries root exposure. Artifacts written before E2 lane 1 have none; `hard:analyze --reclassify <dir> --rerun-root` retrofits them by re-running the production engine at the flagged turns.

## Pairs

0 of 10 double-loss pairs have at least one analysed game.

| pair | double loss | games analysed | first-consequential classes |
| --- | :-: | ---: | --- |
| e1-g2-s680:3:79 |  | 1 | strong-candidate-misjudged@3 (1062 cc) |
| e1-g3-s165:0:66 |  | 1 | strong-candidate-misjudged@2 (747 cc) |
| e1-g3-s375:3:51 |  | 1 | strong-candidate-misjudged@2 (1649 cc) |
| e1-g3-s465:0:74 |  | 1 | unclear@— |
| e1-g3-s625:0:42 |  | 1 | strong-candidate-misjudged@5 (1672 cc) |
| e1-g4-s1030:0:60 |  | 1 | strong-candidate-misjudged@8 (1953 cc) |
| e1-g4-s110:0:44 |  | 1 | unclear@— |

## What each class means

Quoted from the artifacts, which carry the rule they were labelled by.

- **strong-candidate-misjudged**: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here
- **unclear**: none of the above separates, or no turn reached the swing threshold

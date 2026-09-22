# p3 retune, Lane T — PROGRESS

One line per finished ladder row, appended as the sweep runs. Format:
`arm | opponent | stage | W-D-L | score | spend% | promotions/game | mined(hard/opp) | VOID|valid | load`

## Setup

- N (fixed-work probe, `--a hard@env --b Rush`, control weights, 2 pairs / 4 games, seed 20260970, p1-dev):
  - fixed:40000 -> meanTurnMs.a 681.0, load 15.0
  - fixed:60000 -> meanTurnMs.a 1050.3, load 12.0  <- CHOSEN (closest to 1.0 s)
  - fixed:90000 -> meanTurnMs.a 1420.1, load 15.4
  - **N = 60000**
- Control-reproduction check (`--a hard@desktop` vs `--a hard@env` + control.json, both vs Rush, fixed:60000,
  seed 20260970, 1 pair / 2 games, replays on): W/D/L identical (0/0/2 both), per-game `actions` arrays
  byte-identical for both games (opening p1-g6-s2, both seat mirrors), `winner`/`winType`/`completedTurns`
  identical (black/elimination/80 and white/elimination/61). **control.json reproduces hard@desktop exactly.**
  Runs: `results/probe/control-check-desktop/`, `results/probe/control-check-env/`.

## Stage A (screen): 29 arms x 8 pairs vs Rush, fixed:60000, seed 20260970, p1-dev
- control | Rush | A | 6-0-10 | score 0.375 | spend 94% | promo/g 2.00 | mined 123/230 | upkeepElim 0% | illegal 0 | valid | load 7.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/control-Rush]
- p3-s01 | Rush | A | 4-0-12 | score 0.250 | spend 99% | promo/g 5.69 | mined 134/278 | upkeepElim 0% | illegal 0 | valid | load 9.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s01-Rush]
- p3-s02 | Rush | A | 5-0-11 | score 0.313 | spend 97% | promo/g 4.50 | mined 202/263 | upkeepElim 0% | illegal 0 | valid | load 8.6 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s02-Rush]
- p3-s03 | Rush | A | 6-0-10 | score 0.375 | spend 96% | promo/g 5.13 | mined 135/216 | upkeepElim 13% | illegal 0 | valid | load 48.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s03-Rush]
- p3-s04 | Rush | A | 4-0-12 | score 0.250 | spend 100% | promo/g 4.94 | mined 158/277 | upkeepElim 13% | illegal 0 | valid | load 38.5 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s04-Rush]
- p3-s05 | Rush | A | 6-0-10 | score 0.375 | spend 96% | promo/g 3.69 | mined 145/226 | upkeepElim 0% | illegal 0 | valid | load 82.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s05-Rush]
- p3-s06 | Rush | A | 7-0-9 | score 0.438 | spend 97% | promo/g 4.31 | mined 155/227 | upkeepElim 0% | illegal 0 | valid | load 83.4 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s06-Rush]
- p3-s07 | Rush | A | 7-0-9 | score 0.438 | spend 97% | promo/g 4.19 | mined 90/218 | upkeepElim 13% | illegal 0 | valid | load 22.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s07-Rush]
- p3-s08 | Rush | A | 10-0-6 | score 0.625 | spend 91% | promo/g 3.13 | mined 80/184 | upkeepElim 13% | illegal 0 | valid | load 23.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s08-Rush]
- p3-s09 | Rush | A | 7-0-9 | score 0.438 | spend 95% | promo/g 3.81 | mined 101/203 | upkeepElim 6% | illegal 0 | valid | load 32.6 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s09-Rush]
- p3-s10 | Rush | A | 9-0-7 | score 0.563 | spend 98% | promo/g 3.06 | mined 131/173 | upkeepElim 6% | illegal 0 | valid | load 22.6 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s10-Rush]
- p3-s11 | Rush | A | 8-0-8 | score 0.500 | spend 98% | promo/g 4.00 | mined 153/196 | upkeepElim 0% | illegal 0 | valid | load 25.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s11-Rush]
- p3-s12 | Rush | A | 7-0-9 | score 0.438 | spend 97% | promo/g 5.19 | mined 139/224 | upkeepElim 0% | illegal 0 | valid | load 29.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s12-Rush]
- p3-s13 | Rush | A | 9-0-7 | score 0.563 | spend 98% | promo/g 3.94 | mined 157/202 | upkeepElim 0% | illegal 0 | valid | load 67.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s13-Rush]
- p3-s14 | Rush | A | FAILED: Error: row A-p3-s14-Rush exited 1; see /Users/ashkie/src/deevgames-p3-laneT/muju/docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s14-Rush/sweep-run.log | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s14-Rush]

## Concurrency reduced 16:12

Coordinator killed the running sweep/ladder processes (owner needed the machine). Three rows were
in flight and are incomplete on disk: `p3-s14-Rush` (6/8 pairs), `p3-s15-Rush` and `p3-s16-Rush` (0
pairs, just spawned). From here on: ONE row at a time (`--concurrency 1`), `--shards 2`,
`MUJU_HEAVY_SLOTS=2`, until the coordinator says otherwise. The three interrupted rows are finished
with `--resume` before the rest of Stage A continues.

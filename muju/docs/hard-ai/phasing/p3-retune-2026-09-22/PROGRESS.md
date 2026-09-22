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

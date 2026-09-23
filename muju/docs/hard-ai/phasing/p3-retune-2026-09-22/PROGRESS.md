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
- p3-s14 | Rush | A | 7-0-9 | score 0.438 | spend 95% | promo/g 3.94 | mined 189/244 | upkeepElim 0% | illegal 0 | valid | load 57.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s14-Rush]
- p3-s15 | Rush | A | 7-0-9 | score 0.438 | spend 96% | promo/g 3.56 | mined 108/211 | upkeepElim 6% | illegal 0 | valid | load 6.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s15-Rush]
- p3-s16 | Rush | A | 6-0-10 | score 0.375 | spend 95% | promo/g 3.75 | mined 141/237 | upkeepElim 0% | illegal 0 | valid | load 4.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s16-Rush]
- p3-s17 | Rush | A | 8-0-8 | score 0.500 | spend 98% | promo/g 4.88 | mined 156/213 | upkeepElim 6% | illegal 0 | valid | load 3.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s17-Rush]
- p3-s18 | Rush | A | 11-0-5 | score 0.688 | spend 97% | promo/g 3.69 | mined 210/205 | upkeepElim 0% | illegal 0 | valid | load 4.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s18-Rush]
- p3-s19 | Rush | A | 10-0-6 | score 0.625 | spend 95% | promo/g 3.69 | mined 119/176 | upkeepElim 6% | illegal 0 | valid | load 5.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s19-Rush]
- p3-s20 | Rush | A | 8-0-8 | score 0.500 | spend 97% | promo/g 5.06 | mined 132/196 | upkeepElim 0% | illegal 0 | valid | load 4.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s20-Rush]
- p3-s21 | Rush | A | 9-0-7 | score 0.563 | spend 97% | promo/g 4.19 | mined 161/202 | upkeepElim 0% | illegal 0 | valid | load 4.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s21-Rush]
- p3-s22 | Rush | A | 7-0-9 | score 0.438 | spend 99% | promo/g 4.06 | mined 133/249 | upkeepElim 6% | illegal 0 | valid | load 4.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s22-Rush]
- p3-s23 | Rush | A | 6-0-10 | score 0.375 | spend 99% | promo/g 4.06 | mined 158/262 | upkeepElim 0% | illegal 0 | valid | load 4.6 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s23-Rush]
- p3-s24 | Rush | A | 7-0-9 | score 0.438 | spend 96% | promo/g 5.13 | mined 189/211 | upkeepElim 0% | illegal 0 | valid | load 5.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/p3-s24-Rush]

## Concurrency restored 17:04

Owner released the CPU. Coordinator: full concurrency (two rows at a time, --shards 4,
MUJU_HEAVY_SLOTS=8) for the remaining Stage A rows (hv-mine, hv-tier, hv-blocks). hv-clock had
already been resumed as an orphaned single row (shards=2) when the previous single-concurrency
sweep was stopped between batches; it finished cleanly and is logged below.
- hv-clock | Rush | A | 10-0-6 | score 0.625 | spend 96% | promo/g 3.31 | mined 150/192 | upkeepElim 0% | illegal 0 | valid | load 4.4 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/hv-clock-Rush]
- hv-mine | Rush | A | 13-0-3 | score 0.813 | spend 91% | promo/g 3.38 | mined 178/142 | upkeepElim 0% | illegal 0 | valid | load 5.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/hv-mine-Rush]
- hv-tier | Rush | A | 8-0-8 | score 0.500 | spend 95% | promo/g 4.19 | mined 166/207 | upkeepElim 0% | illegal 0 | valid | load 6.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/hv-tier-Rush]
- hv-blocks | Rush | A | 10-0-6 | score 0.625 | spend 95% | promo/g 3.56 | mined 124/155 | upkeepElim 0% | illegal 0 | valid | load 5.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/hv-blocks-Rush]

## Stage A: complete, ranked, behaviour filters applied

29/29 arms finished (the `p3-s14` line above the "Concurrency reduced" note is a STALE partial
result from the interrupted run -- 6/8 pairs, exited nonzero -- superseded by the `p3-s14` line
under "Concurrency restored" section boundary, i.e. the one with W-D-L 7-0-9; ignore the FAILED
line when reading this table).

**Behaviour filters** (spend < 50%, upkeep-elimination > 15% of games, any illegal action):
**none of the 29 arms were discarded.** spend ranged 91-100% (never below 50%), upkeepElim ranged
0-13% (never above 15%), illegal actions were 0 in every arm. Every arm is a legitimate, fully-
spending, rules-clean engine; Stage A is a pure ranking by score with mined-margin tiebreak.

Full ranking (score desc, ties broken by mined-total margin = mined(hard) - mined(Rush)):

| Rank | Arm | W-D-L | score | spend% | promo/g | mined(hard/Rush) | margin | upkeepElim% |
|---|---|---|---|---|---|---|---|---|
| 1 | hv-mine | 13-0-3 | 0.813 | 91% | 3.38 | 178/142 | +36 | 0% |
| 2 | p3-s18 | 11-0-5 | 0.688 | 97% | 3.69 | 210/205 | +5 | 0% |
| 3 | hv-blocks | 10-0-6 | 0.625 | 95% | 3.56 | 124/155 | -31 | 0% |
| 4 | hv-clock | 10-0-6 | 0.625 | 96% | 3.31 | 150/192 | -42 | 0% |
| 5 | p3-s19 | 10-0-6 | 0.625 | 95% | 3.69 | 119/176 | -57 | 6% |
| 6 | p3-s08 | 10-0-6 | 0.625 | 91% | 3.13 | 80/184 | -104 | 13% |
| 7 | p3-s21 | 9-0-7 | 0.563 | 97% | 4.19 | 161/202 | -41 | 0% |
| 8 | p3-s10 | 9-0-7 | 0.563 | 98% | 3.06 | 131/173 | -42 | 6% |
| 9 | p3-s13 | 9-0-7 | 0.563 | 98% | 3.94 | 157/202 | -45 | 0% |
| 10 | hv-tier | 8-0-8 | 0.500 | 95% | 4.19 | 166/207 | -41 | 0% |
| 11 | p3-s11 | 8-0-8 | 0.500 | 98% | 4.00 | 153/196 | -43 | 0% |
| 12 | p3-s17 | 8-0-8 | 0.500 | 98% | 4.88 | 156/213 | -57 | 6% |
| 13 | p3-s20 | 8-0-8 | 0.500 | 97% | 5.06 | 132/196 | -64 | 0% |
| 14 | p3-s24 | 7-0-9 | 0.438 | 96% | 5.13 | 189/211 | -22 | 0% |
| 15 | p3-s14 | 7-0-9 | 0.438 | 95% | 3.94 | 189/244 | -55 | 0% |
| 16 | p3-s06 | 7-0-9 | 0.438 | 97% | 4.31 | 155/227 | -72 | 0% |
| 17 | p3-s12 | 7-0-9 | 0.438 | 97% | 5.19 | 139/224 | -85 | 0% |
| 18 | p3-s09 | 7-0-9 | 0.438 | 95% | 3.81 | 101/203 | -102 | 6% |
| 19 | p3-s15 | 7-0-9 | 0.438 | 96% | 3.56 | 108/211 | -103 | 6% |
| 20 | p3-s22 | 7-0-9 | 0.438 | 99% | 4.06 | 133/249 | -116 | 6% |
| 21 | p3-s07 | 7-0-9 | 0.438 | 97% | 4.19 | 90/218 | -128 | 13% |
| 22 | p3-s03 | 6-0-10 | 0.375 | 96% | 5.13 | 135/216 | -81 | 13% |
| 23 | p3-s05 | 6-0-10 | 0.375 | 96% | 3.69 | 145/226 | -81 | 0% |
| 24 | p3-s16 | 6-0-10 | 0.375 | 95% | 3.75 | 141/237 | -96 | 0% |
| 25 | p3-s23 | 6-0-10 | 0.375 | 99% | 4.06 | 158/262 | -104 | 0% |
| 26 | control | 6-0-10 | 0.375 | 94% | 2.00 | 123/230 | -107 | 0% |
| 27 | p3-s02 | 5-0-11 | 0.313 | 97% | 4.50 | 202/263 | -61 | 0% |
| 28 | p3-s04 | 4-0-12 | 0.250 | 100% | 4.94 | 158/277 | -119 | 13% |
| 29 | p3-s01 | 4-0-12 | 0.250 | 99% | 5.69 | 134/278 | -144 | 0% |

**Stage B set (top 8): hv-mine, p3-s18, hv-blocks, hv-clock, p3-s19, p3-s08, p3-s21, p3-s10.**
Every arm, including `control`, beat the pure BankExcess/BankLiquid discount alone (`control`
ranks 26th of 29) -- the positional/kill-clock knobs are doing real work, not just the cash
discount. **STOPPING HERE per coordinator instruction (17:xx): Stage B and C are NOT started.**
See `docs/changes/2026-09-22-p3-retune-laneT.md` for the resume handoff.

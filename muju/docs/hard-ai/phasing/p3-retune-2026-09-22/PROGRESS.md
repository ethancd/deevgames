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

## Overnight chain (coordinator, 2026-09-23T08:16:25Z, HEAD c301b3d8)

Owner authorised an unattended Stage B -> Stage C run at 8 heavy slots (08:15Z, 01:15 local, 2026-09-23). Concurrency: aiv2 rows one at a time at shards 4 (MUJU_HEAVY_SLOTS=4); fixed rows two at a time at shards 4 (MUJU_HEAVY_SLOTS=8); the two sweeps run side by side and share the slot directory, so at most 8 games are live and at most 4 of them are aiv2 games. VOID aiv2 rows are set aside and re-run alone at shards 2. Selection rules as in lane T report sections 8-9; this script (`scripts/chain-BC.py`) applies them mechanically and records the result below.
- control | Rush | B | 3-0-13 | score 0.188 | spend 98% | promo/g 2.44 | mined 146/283 | upkeepElim 0% | illegal 0 | valid | load 16.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/control-Rush]
- control | Balanced | B | 15-0-1 | score 0.938 | spend 76% | promo/g 2.31 | mined 65/58 | upkeepElim 0% | illegal 0 | valid | load 17.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/control-Balanced]
- control | Expand | B | 16-0-0 | score 1.000 | spend 69% | promo/g 2.56 | mined 89/63 | upkeepElim 6% | illegal 0 | valid | load 22.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/control-Expand]
- hv-mine | Rush | B | 9-0-7 | score 0.563 | spend 93% | promo/g 4.44 | mined 205/219 | upkeepElim 0% | illegal 0 | valid | load 17.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-mine-Rush]
- hv-mine | Balanced | B | 15-1-0 | score 0.969 | spend 74% | promo/g 2.75 | mined 76/59 | upkeepElim 13% | illegal 0 | valid | load 10.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-mine-Balanced]
- hv-mine | Expand | B | 16-0-0 | score 1.000 | spend 69% | promo/g 2.81 | mined 143/66 | upkeepElim 0% | illegal 0 | valid | load 10.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-mine-Expand]
- p3-s18 | Rush | B | 8-0-8 | score 0.500 | spend 95% | promo/g 4.25 | mined 177/200 | upkeepElim 6% | illegal 0 | valid | load 12.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s18-Rush]
- p3-s18 | Balanced | B | 15-0-1 | score 0.938 | spend 78% | promo/g 2.88 | mined 65/60 | upkeepElim 6% | illegal 0 | valid | load 11.4 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s18-Balanced]
- p3-s18 | Expand | B | 16-0-0 | score 1.000 | spend 70% | promo/g 2.63 | mined 90/58 | upkeepElim 0% | illegal 0 | valid | load 10.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s18-Expand]
- hv-blocks | Rush | B | 6-0-10 | score 0.375 | spend 96% | promo/g 4.19 | mined 162/242 | upkeepElim 0% | illegal 0 | valid | load 10.5 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-blocks-Rush]
- hv-blocks | Balanced | B | 15-0-1 | score 0.938 | spend 77% | promo/g 3.19 | mined 72/56 | upkeepElim 0% | illegal 0 | valid | load 9.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-blocks-Balanced]
- hv-blocks | Expand | B | 16-0-0 | score 1.000 | spend 63% | promo/g 2.13 | mined 136/75 | upkeepElim 6% | illegal 0 | valid | load 9.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-blocks-Expand]
- control | aiv2-hard-turn | B | 27-0-5 | score 0.844 | spend 72% | promo/g 2.13 | mined 100/69 | upkeepElim 6% | illegal 0 | valid | load 13.4 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/control-aiv2-hard-turn]
- hv-clock | Rush | B | 7-0-9 | score 0.438 | spend 96% | promo/g 4.13 | mined 148/232 | upkeepElim 0% | illegal 0 | valid | load 8.7 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-clock-Rush]
- hv-clock | Balanced | B | 15-0-1 | score 0.938 | spend 74% | promo/g 2.81 | mined 83/58 | upkeepElim 6% | illegal 0 | valid | load 7.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-clock-Balanced]
- hv-clock | Expand | B | 16-0-0 | score 1.000 | spend 67% | promo/g 2.19 | mined 120/62 | upkeepElim 0% | illegal 0 | valid | load 11.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-clock-Expand]
- p3-s19 | Rush | B | 4-0-12 | score 0.250 | spend 100% | promo/g 5.31 | mined 158/264 | upkeepElim 0% | illegal 0 | valid | load 13.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s19-Rush]
- p3-s19 | Balanced | B | 15-0-1 | score 0.938 | spend 85% | promo/g 3.25 | mined 61/58 | upkeepElim 0% | illegal 0 | valid | load 19.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s19-Balanced]
- p3-s19 | Expand | B | 16-0-0 | score 1.000 | spend 78% | promo/g 2.69 | mined 67/54 | upkeepElim 0% | illegal 0 | valid | load 18.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s19-Expand]
- p3-s08 | Rush | B | 8-0-8 | score 0.500 | spend 96% | promo/g 3.81 | mined 131/212 | upkeepElim 0% | illegal 0 | valid | load 22.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s08-Rush]
- p3-s08 | Balanced | B | 15-0-1 | score 0.938 | spend 77% | promo/g 3.44 | mined 86/72 | upkeepElim 13% | illegal 0 | valid | load 29.4 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s08-Balanced]
- p3-s08 | Expand | B | 16-0-0 | score 1.000 | spend 71% | promo/g 2.13 | mined 87/58 | upkeepElim 0% | illegal 0 | valid | load 14.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s08-Expand]
- p3-s21 | Rush | B | 9-0-7 | score 0.563 | spend 94% | promo/g 3.94 | mined 181/196 | upkeepElim 0% | illegal 0 | valid | load 12.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s21-Rush]
- p3-s21 | Balanced | B | 16-0-0 | score 1.000 | spend 66% | promo/g 2.06 | mined 102/63 | upkeepElim 0% | illegal 0 | valid | load 13.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s21-Balanced]
- p3-s21 | Expand | B | 16-0-0 | score 1.000 | spend 66% | promo/g 2.88 | mined 131/67 | upkeepElim 0% | illegal 0 | valid | load 13.8 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s21-Expand]
- hv-mine | aiv2-hard-turn | B | 24-0-8 | score 0.750 | spend 78% | promo/g 2.94 | mined 98/66 | upkeepElim 6% | illegal 0 | valid | load 14.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-mine-aiv2-hard-turn]
- p3-s10 | Rush | B | 7-0-9 | score 0.438 | spend 98% | promo/g 3.88 | mined 176/248 | upkeepElim 0% | illegal 0 | valid | load 12.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s10-Rush]
- p3-s10 | Balanced | B | 15-0-1 | score 0.938 | spend 77% | promo/g 2.81 | mined 71/59 | upkeepElim 0% | illegal 0 | valid | load 15.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s10-Balanced]
- p3-s10 | Expand | B | 16-0-0 | score 1.000 | spend 66% | promo/g 1.88 | mined 105/57 | upkeepElim 0% | illegal 0 | valid | load 8.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s10-Expand]
- p3-s18 | aiv2-hard-turn | B | 25-0-7 | score 0.781 | spend 76% | promo/g 2.66 | mined 95/73 | upkeepElim 9% | illegal 0 | valid | load 7.8 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s18-aiv2-hard-turn]
- hv-blocks | aiv2-hard-turn | B | 25-0-7 | score 0.781 | spend 75% | promo/g 2.91 | mined 104/71 | upkeepElim 0% | illegal 0 | valid | load 6.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-blocks-aiv2-hard-turn]
- hv-clock | aiv2-hard-turn | B | 22-0-10 | score 0.688 | spend 75% | promo/g 3.13 | mined 110/76 | upkeepElim 3% | illegal 0 | valid | load 5.4 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/hv-clock-aiv2-hard-turn]
- p3-s19 | aiv2-hard-turn | B | 26-0-6 | score 0.813 | spend 81% | promo/g 3.69 | mined 93/77 | upkeepElim 6% | illegal 0 | valid | load 5.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s19-aiv2-hard-turn]
- p3-s08 | aiv2-hard-turn | B | 27-0-5 | score 0.844 | spend 85% | promo/g 3.84 | mined 94/73 | upkeepElim 3% | illegal 0 | valid | load 5.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s08-aiv2-hard-turn]
- p3-s21 | aiv2-hard-turn | B | 23-0-9 | score 0.719 | spend 84% | promo/g 3.72 | mined 81/68 | upkeepElim 0% | illegal 0 | valid | load 5.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s21-aiv2-hard-turn]
- p3-s10 | aiv2-hard-turn | B | 22-0-10 | score 0.688 | spend 77% | promo/g 3.03 | mined 104/79 | upkeepElim 0% | illegal 0 | valid | load 5.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB/p3-s10-aiv2-hard-turn]

### Stage B table (p1-dev, seed 20260971; aiv2 16 pairs wall:6000, others 8 pairs fixed:60000)

| arm | aiv2-hard-turn W-D-L / score | Rush W-D-L / score | Balanced W-D-L / score | Expand W-D-L / score | sum(aiv2+Rush) | mined hard/opp (aiv2) | aiv2 winTypes |
|---|---|---|---|---|---|---|---|
| control | 27-0-5 / 0.844 | 3-0-13 / 0.188 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.031 | 100/69 | elimination 7, home-checkmate 23, upkeep-elimination 2 |
| hv-mine | 24-0-8 / 0.750 | 9-0-7 / 0.562 | 15-1-0 / 0.969 | 16-0-0 / 1.000 | 1.312 | 98/66 | elimination 5, home-checkmate 25, upkeep-elimination 2 |
| p3-s18 | 25-0-7 / 0.781 | 8-0-8 / 0.500 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.281 | 95/73 | elimination 8, home-checkmate 20, kill-clock 1, upkeep-elimination 3 |
| hv-blocks | 25-0-7 / 0.781 | 6-0-10 / 0.375 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.156 | 104/71 | elimination 5, home-checkmate 27 |
| hv-clock | 22-0-10 / 0.688 | 7-0-9 / 0.438 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.125 | 110/76 | elimination 3, home-checkmate 28, upkeep-elimination 1 |
| p3-s19 | 26-0-6 / 0.812 | 4-0-12 / 0.250 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.062 | 92/77 | elimination 6, home-checkmate 24, upkeep-elimination 2 |
| p3-s08 | 27-0-5 / 0.844 | 8-0-8 / 0.500 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.344 | 94/73 | elimination 5, home-checkmate 26, upkeep-elimination 1 |
| p3-s21 | 23-0-9 / 0.719 | 9-0-7 / 0.562 | 16-0-0 / 1.000 | 16-0-0 / 1.000 | 1.281 | 80/68 | elimination 9, home-checkmate 23 |
| p3-s10 | 22-0-10 / 0.688 | 7-0-9 / 0.438 | 15-0-1 / 0.938 | 16-0-0 / 1.000 | 1.125 | 104/79 | elimination 11, home-checkmate 20, kill-clock 1 |

Regression guard (Balanced >= control 0.938 AND Expand >= control 1.000): dropped none. Ranking of survivors by sum(aiv2+Rush), ties by aiv2 score then Stage A order: ['p3-s08', 'hv-mine', 'p3-s18', 'p3-s21', 'hv-blocks', 'hv-clock', 'p3-s10', 'p3-s19']. **Stage C set: ['p3-s08', 'hv-mine', 'p3-s18']** (+ control).
- control | Rush | C | 27-0-37 | score 0.422 | spend 95% | promo/g 1.88 | mined 118/226 | upkeepElim 2% | illegal 0 | valid | load 11.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/control-Rush]
- p3-s08 | Rush | C | 29-1-34 | score 0.461 | spend 98% | promo/g 4.08 | mined 130/223 | upkeepElim 2% | illegal 0 | valid | load 11.0 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/p3-s08-Rush]
- hv-mine | Rush | C | 30-0-34 | score 0.469 | spend 97% | promo/g 3.78 | mined 154/224 | upkeepElim 3% | illegal 0 | valid | load 11.8 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/hv-mine-Rush]
- p3-s18 | Rush | C | 29-0-35 | score 0.453 | spend 98% | promo/g 3.69 | mined 161/219 | upkeepElim 3% | illegal 0 | valid | load 11.1 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/p3-s18-Rush]
- control | aiv2-hard-turn | C | 52-0-12 | score 0.813 | spend 76% | promo/g 2.16 | mined 95/76 | upkeepElim 5% | illegal 0 | valid | load 10.9 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/control-aiv2-hard-turn]
- p3-s08 | aiv2-hard-turn | C | 49-1-14 | score 0.773 | spend 88% | promo/g 4.06 | mined 90/76 | upkeepElim 0% | illegal 0 | valid | load 6.3 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/p3-s08-aiv2-hard-turn]
- hv-mine | aiv2-hard-turn | C | 46-0-18 | score 0.719 | spend 79% | promo/g 3.09 | mined 94/66 | upkeepElim 2% | illegal 0 | valid | load 5.2 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/hv-mine-aiv2-hard-turn]
- p3-s18 | aiv2-hard-turn | C | 44-0-20 | score 0.688 | spend 77% | promo/g 2.84 | mined 88/66 | upkeepElim 3% | illegal 0 | valid | load 5.6 | [docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/p3-s18-aiv2-hard-turn]

### Stage C table (p1-val, seed 20260972; 32 pairs vs aiv2-hard-turn wall:6000, 32 pairs vs Rush fixed:60000)

| arm | aiv2-hard-turn W-D-L / score | Rush W-D-L / score | sum(aiv2+Rush) | mined hard/opp (aiv2) | aiv2 winTypes |
|---|---|---|---|---|---|
| control | 52-0-12 / 0.812 | 27-0-37 / 0.422 | 1.234 | 95/76 | elimination 24, home-checkmate 37, upkeep-elimination 3 |
| p3-s08 | 49-1-14 / 0.773 | 29-1-34 / 0.461 | 1.234 | 90/76 | elimination 19, home-checkmate 43, kill-clock 2 |
| hv-mine | 46-0-18 / 0.719 | 30-0-34 / 0.469 | 1.188 | 94/66 | elimination 10, home-checkmate 53, upkeep-elimination 1 |
| p3-s18 | 44-0-20 / 0.688 | 29-0-35 / 0.453 | 1.141 | 88/66 | elimination 14, home-checkmate 48, upkeep-elimination 2 |

Summed scores: control 1.234, p3-s08 1.234, hv-mine 1.188, p3-s18 1.141. **No candidate beats control on the sum (best p3-s08 1.234 vs control 1.234): ship control, no weight change.**

## Stage D (2026-09-23): Gate 0, suite measure, Gate 2. Gate 1 not run.

The sweep is over; the campaign ships `control` (no weight change), so `src/` is byte-identical to
`origin/master` (`git diff --stat origin/master..HEAD -- muju/src/` empty) and `hard@desktop` in
every row below is the shipped engine. Full record:
`docs/hard-ai/RELEASE-2026-09-23-phasing-3-retune.md`.

**Gate 0** — `scripts/gate0.sh`, log `results/gate0/gate0.log`, HEAD `c489560c`, load 4.56.

| Check | Exit | Reading | Out |
|---|---|---|---|
| `hard:perft --check` (canonical) | 0 | `14959/1053/797`, `standardTriple checked`, `fixturesChecked 7`, `mismatches 0`, `replicaAgreed true` | `results/gate0/perft-canonical.log` |
| `hard:perft --check --engine replica` | 0 | Phasing `14959/1850/797`, `mismatches 0` | `results/gate0/perft-replica.log` |
| `hard:fuzz --actions 20000 --seed 7101` | **1** | `clockFixtureOk false` — a STALE FIXTURE, not an engine defect: every mismatch/divergence counter is 0. The fuzz code was byte-identical to `origin/master`, so master's fuzz gate had been red since the kill clock merged. Repaired at `cdcee23e` (mate case moved to `INACTIVITY_LIMIT - 3`; occupation case asserts `kill-clock` instead of `inactivity`; decided branch added). | `results/gate0/fuzz.log` |
| `hard:determinism --engine hard@desktop --work 50000 --positions 4` | 0 | `{"identical":true,"decisions":4,"mismatches":0}` | `results/gate0/determinism.log` |

Gate 0 is being re-run at the final commit by the validation lane; the release record carries the
placeholder for that output.

**Suite measure** — contract v4 committed alone (`97b62831`), measured at `cdcee23e`.
`valid true`, **`floorPass false`**, earned **126/146**, coverage 79/79, `failures []`, witness
tier `local-only`, ledger **seq 3** (chain `09ad77cf…`).
Per family (earned/floor/offered): tactics 62/57/63 PASS, invariants **10/14/15 BELOW**,
home-mate 28/28/28 PASS, economy **7/20/20 BELOW**, summon-disruption 13/13/14 PASS,
home-fortify 6/6/6 PASS. Out:
`lab/hard-ai/suites/phasing/results/v4-measure-3-2026-09-23/`. Informational under A6; the misses
are named and characterised in the release record.

**Gate 2** — `scripts/gate2.sh`, log `results/gate2/gate2.log`, 12:47:29Z → 13:52:21Z, all four
rows exit 0. `p1-val` all 32 openings (sha `cbd427dfd2ee…`), handicap 0, 32 pairs / 64 games,
`--shards 4`, `MUJU_HEAVY_SLOTS=4`. 0 illegal / 0 divergence / 0 fallback in every row; none VOID.

| Row | A vs B | work | seed | W-D-L | score | Elo [95%] | LOS | load | out |
|---|---|---|---|---|---|---|---|---|---|
| G2-1 | `hard@desktop` vs `aiv2-hard-turn` | wall:6000 | 20260975 | 54-0-10 | 0.844 | +293 [+193, +463] | 100.0% | 7.54 | `results/gate2/G2-1-aiv2-hard-turn` |
| G2-2 | `hard@desktop` vs `Rush` | wall:1500 | 20260976 | 27-0-37 | 0.422 | −55 [−142, +26] | 9.2% | 7.14 | `results/gate2/G2-2-Rush` |
| G2-3 | `hard@desktop` vs `hard@env` (= `weights/control.json`) | fixed:60000 | 20260977 | 32-0-32 | 0.500 | 0.0 [−23, +23] (degenerate) | 50.0% | 5.07 | `results/gate2/G2-3-hard-env-control` |
| G2-4 | `hard@desktop` vs `aiv2-hard` | wall:1500 | 20260978 | 50-0-14 | 0.781 | +221 [+121, +373] | 100.0% | 5.05 | `results/gate2/G2-4-aiv2-hard` |

G2-1 meets its A7 bar (Elo lower bound +193 > 0). G2-3 is an identity row — the campaign ships
control, so both arms carry the same vector — and its "retune effect" bar is zero by construction,
not a failed bar. G2-4 was expected VOID on opponent overrun and was not: `aiv2-hard` came in at
`overrunRate 1.42%`, under the 5% threshold.

**Gate 1: NOT RUN.** A7 keeps A5's per-search calibration in force, and A5 is text only —
`gate1-calibrate.ts` implements A3 §3's per-turn median, `workPerSearch` has zero code hits in
`lab src tests server`. An eligible calibration has also never been run and is a ~12 h idle-box
measurement plus a 7–15 h row. The owner must rule on A5 first. Filed as F-G1 in the release
record.
- 14:04Z coordinator: a second stale phasing-2 remnant in the fuzz gate (the A4 clock-coverage guard wanted an `inactivity:*` terminal) fixed at `eae48fba`; Gate 0 re-run at that commit: perft ×2, fuzz, determinism all exit 0 (`results/gate0/gate0.log`). Validation lane at `6ed2b187`: `npm test` 2972/2972, e2e ai-worker 7/7, `hard:types` + `tsc` clean (`results/validation/`).

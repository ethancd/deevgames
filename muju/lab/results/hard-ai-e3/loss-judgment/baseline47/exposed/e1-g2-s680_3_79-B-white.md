# Replay analysis — e1-g2-s680_3_79-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g2-s680`. The game ended home-checkmate for white after 16 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 185 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `11ac9819` | yes | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `11ac9819` | yes | -27 | -27 | 0 | 1,873 | 3004 |
| 2 | BUY water_1@9,8 MOVE 7,9→6,5 MOVE 8,9→7,9 END_ACTION | `2dd945af` | yes | BUY lightning_1@9,8 END_PLACE MOVE 9,8→4,2 END_ACTION | `c31dab31` | yes | -1,791 | -1,651 | 140 | -645 | 2553 |
| 3 | BUY shadow_1@8,9 END_PLACE MOVE 8,9→5,4 END_ACTION | `af9dad25` | yes | BUY shadow_1@8,9 END_PLACE MOVE 8,9→6,8 ATK 6,8→6,9 MOVE 9,8→9,7 END_ACTION | `afdff4ff` | yes | -1,670 | -608 | 1,062 | -404 | 2764 |
| 4 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→6,8 ATK 6,8→6,9 END_ACTION | `edbac219` | yes | BUY fire_1@8,9 PROMOTE 8,8 END_PLACE MOVE 5,4→2,2 MOVE 8,8→8,7 END_ACTION | `595d0efa` | yes | -1,943 | -2,605 | -662 | -433 | 2268 |
| 5 | BUY fire_1@8,9 END_PLACE ATK 8,9→7,9 MOVE 9,8→9,7 MOVE 8,8→8,7 MOVE 8,7→8,6 END_ACTION | `d4ca7a27` | yes | END_PLACE MOVE 8,8→8,9 ATK 8,9→7,9 MOVE 9,8→9,7 MOVE 8,9→7,9 END_ACTION | `80971aff` | yes | -4,711 | -4,575 | 136 | -2,906 | 2940 |
| 6 | BUY fire_1@8,9 BUY fire_1@9,6 BUY fire_1@8,7 BUY fire_1@9,8 PROMOTE 8,6 ATK 8,9→7,9 MOVE 9,6→7,2 END_ACTION | `37066621` | yes | BUY fire_1@8,9 BUY fire_1@9,6 BUY fire_1@8,7 PROMOTE 8,6 END_PLACE ATK 8,9→7,9 MOVE 9,6→8,1 END_ACTION | `de42e1e0` | yes | -1,057 | -172 | 885 | -314 | 2886 |
| 7 | BUY fire_1@8,8 BUY lightning_1@9,6 MOVE 9,6→3,0 END_ACTION | `a9fbd5f3` | yes | BUY fire_1@8,8 BUY lightning_1@9,6 MOVE 9,6→3,0 END_ACTION | `a9fbd5f3` | yes | -1,089 | -1,089 | 0 | -370 | 2626 |
| 8 | BUY water_1@8,9 ATK 8,9→7,9 MOVE 8,8→5,5 END_ACTION | `d06da83f` | yes | BUY water_1@8,9 ATK 8,9→7,9 MOVE 8,8→5,5 END_ACTION | `d06da83f` | yes | -520 | -520 | 0 | -487 | 3010 |
| 9 | BUY fire_1@8,8 END_PLACE MOVE 8,8→4,6 MOVE 8,6→8,5 END_ACTION | `f205c48d` | yes | BUY fire_1@8,8 END_PLACE MOVE 8,8→4,6 MOVE 8,6→8,5 END_ACTION | `f205c48d` | yes | -1,417 | -1,417 | 0 | -1,687 | 3003 |
| 10 | BUY fire_1@9,5 END_PLACE MOVE 9,5→4,4 ATK 4,4→4,3 END_ACTION | `ba9baab9` | yes | BUY fire_1@9,5 BUY fire_1@8,6 BUY fire_1@8,8 MOVE 8,6→5,5 ATK 5,5→5,6 MOVE 8,9→7,9 END_ACTION | `0e827f4a` | yes | -2,804 | -1,559 | 1,245 | -267 | 3003 |
| 11 | BUY fire_1@9,6 END_PLACE MOVE 8,5→8,2 MOVE 9,6→7,6 END_ACTION | `50f33f6a` | yes | BUY fire_1@9,5 BUY fire_1@8,7 ATK 8,7→7,7 MOVE 8,5→6,5 MOVE 9,7→9,6 END_ACTION | `bcfc12a1` | yes | -1,536 | -3,446 | -1,910 | -986 | 1809 |
| 12 | END_PLACE MOVE 9,8→5,5 END_ACTION | `153a7e23` | yes | PROMOTE 9,7 MOVE 9,8→6,5 MOVE 8,9→7,9 END_ACTION | `759be4b7` | yes | -4,736 | -3,947 | 789 | -1,497 | 2028 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 3 (the seat's turn #3).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key afdff4ff4b7cc891 IS among the 28 candidates at this root; the engine played af9dad25652eb5cd instead, worth -1670 cc to the adviser against -608 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #13) and scored it -404 cc, ABOVE the played candidate #0 at -1763 cc — so this re-run did not play what the seat played (it chose candidate #13 at -404 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 10 (the seat's turn #10).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 0e827f4ad7de3f8b IS among the 33 candidates at this root; the engine played ba9baab92251afd6 instead, worth -2804 cc to the adviser against -1559 cc. root exposure: 33 candidate(s) from a `completed-depth` list, 33 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #7) and scored it -1403 cc, ABOVE the played candidate #0 at -3252 cc — so this re-run did not play what the seat played (it chose candidate #24 at -267 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_656013 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

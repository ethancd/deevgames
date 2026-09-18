# Replay analysis — g2-s20_3_15-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g2-s20`. The game ended home-checkmate for white after 17 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 177 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→9,7 END_ACTION | `ae0cec32` | yes | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→8,8 END_ACTION | `78e9eb40` | yes | -880 | -1,265 | -385 | 83 | 3006 |
| 2 | END_PLACE MOVE 8,9→8,8 ATK 8,8→8,7 END_ACTION | `bbceaa0e` | yes | END_PLACE MOVE 8,9→8,8 ATK 8,8→8,7 END_ACTION | `bbceaa0e` | yes | -1,484 | -1,484 | 0 | -1,120 | 1277 |
| 3 | BUY fire_1@9,8 BUY water_1@8,9 END_PLACE ATK 9,7→8,7 MOVE 7,9→7,7 ATK 7,7→8,7 END_ACTION | `c868c0e5` | yes | BUY fire_1@9,8 END_PLACE ATK 9,7→8,7 MOVE 7,9→7,7 ATK 7,7→8,7 END_ACTION | `f752dd25` | yes | -863 | -927 | -64 | -344 | 1653 |
| 4 | BUY fire_1@8,8 BUY fire_1@8,7 BUY fire_1@7,8 PROMOTE 7,7 MOVE 7,8→5,3 END_ACTION | `02a4063d` | yes | BUY fire_1@8,8 BUY fire_1@8,7 BUY fire_1@7,8 PROMOTE 7,7 MOVE 8,7→5,3 END_ACTION | `1e0e1f01` | yes | -383 | -1,077 | -694 | 1,022 | 886 |
| 5 | BUY water_1@8,8 END_PLACE ATK 7,7→7,8 MOVE 8,7→7,2 END_ACTION | `16e3a7bd` | yes | BUY water_1@8,8 END_PLACE ATK 7,7→7,8 MOVE 8,7→7,2 END_ACTION | `16e3a7bd` | yes | -1,967 | -1,967 | 0 | 592 | 985 |
| 6 | BUY lightning_1@8,7 END_PLACE MOVE 8,7→3,3 ATK 3,3→4,3 END_ACTION | `cb0741ea` | yes | BUY lightning_1@8,7 END_PLACE MOVE 8,7→3,3 ATK 3,3→4,3 END_ACTION | `cb0741ea` | yes | -741 | -741 | 0 | -685 | 1604 |
| 7 | BUY fire_1@7,8 BUY fire_1@8,7 BUY water_1@7,9 MOVE 8,7→5,3 END_ACTION | `86d8f7ed` | yes | BUY fire_1@7,8 BUY fire_1@7,9 BUY fire_1@8,7 END_PLACE MOVE 8,7→5,3 END_ACTION | `59a93cb7` | yes | -3,178 | -883 | 2,295 | 57 | 860 |
| 8 | BUY fire_1@7,8 BUY fire_1@8,7 END_PLACE ATK 7,8→6,8 MOVE 7,7→7,6 MOVE 9,7→9,6 END_ACTION | `a1208902` | yes | BUY fire_1@7,8 BUY water_1@8,7 ATK 7,8→6,8 MOVE 7,7→7,6 MOVE 9,7→9,6 END_ACTION | `774e9357` | yes | -532 | -446 | 86 | 1,161 | 1623 |
| 9 | END_PLACE MOVE 7,8→5,2 END_ACTION | `ba06d8a4` | yes | BUY lightning_1@8,6 END_PLACE MOVE 8,6→6,2 ATK 6,2→6,3 END_ACTION | `f374506b` | yes | 1,124 | -456 | -1,580 | 1,661 | 1720 |
| 10 | BUY lightning_1@8,6 END_PLACE MOVE 8,6→4,2 ATK 4,2→3,2 END_ACTION | `60c6068e` | yes | BUY lightning_1@8,6 END_PLACE MOVE 8,6→6,2 ATK 6,2→6,3 END_ACTION | `9a25e349` | yes | -85 | 518 | 603 | 3,911 | 1125 |
| 11 | BUY lightning_1@8,6 END_PLACE MOVE 8,6→6,2 ATK 6,2→6,3 END_ACTION | `66df9d07` | yes | BUY lightning_1@8,6 END_PLACE MOVE 8,6→4,2 ATK 4,2→4,1 END_ACTION | `02563cb8` | yes | -1,012 | -1,427 | -415 | 2,452 | 1767 |
| 12 | BUY lightning_1@7,7 END_PLACE MOVE 7,7→4,7 ATK 4,7→3,7 END_ACTION | `04afacbf` | yes | BUY fire_1@9,6 BUY fire_1@7,8 END_PLACE MOVE 8,7→8,1 ATK 8,1→7,1 END_ACTION | `4d906056` | yes | -3,808 | -1,907 | 1,901 | 2,264 | 1688 |
| 13 | BUY lightning_1@8,6 END_PLACE MOVE 8,6→5,0 ATK 5,0→5,1 END_ACTION | `6b217b82` | yes | BUY fire_1@7,8 BUY water_1@8,6 MOVE 7,6→7,2 END_ACTION | `8fb5b828` | yes | -4,895 | 1,209 | 6,104 | 2,011 | 941 |
| 14 | BUY fire_1@9,7 MOVE 8,7→8,1 ATK 8,1→7,1 END_ACTION | `e731f126` | yes | BUY lightning_1@8,9 MOVE 8,7→8,1 MOVE 7,6→7,5 END_ACTION | `90c05c10` | yes | -3,096 | -2,772 | 324 | 884 | 921 |
| 15 | MOVE 7,6→7,2 END_ACTION | `bc30f472` | yes | MOVE 7,6→4,6 END_ACTION | `09ee0950` | yes | -995,000 | -995,000 | 0 | -7,445 | 1098 |
| 16 | END_ACTION | `7769cb5d` | yes | MOVE 7,2→8,2 MOVE 8,2→9,2 END_ACTION | `1c9bf447` | yes | -997,000 | -995,000 | 2,000 | -8,702 | 1141 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 7 (the seat's turn #7).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 59a93cb74e9604a4 IS among the 30 candidates at this root; the engine played 86d8f7edf1680293 instead, worth -3178 cc to the adviser against -883 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #16) and scored it -268 cc, ABOVE the played candidate #0 at -2197 cc — so this re-run did not play what the seat played (it chose candidate #13 at 57 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 13 (the seat's turn #13).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 8fb5b828681a273a IS among the 32 candidates at this root; the engine played 6b217b82e3cc7941 instead, worth -4895 cc to the adviser against 1209 cc. root exposure: 32 candidate(s) from a `completed-depth` list, 32 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #28) and scored it 1912 cc, ABOVE the played candidate #0 at -1680 cc — so this re-run did not play what the seat played (it chose candidate #4 at 2011 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_896906 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

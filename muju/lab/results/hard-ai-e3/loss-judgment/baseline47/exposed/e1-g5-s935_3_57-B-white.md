# Replay analysis — e1-g5-s935_3_57-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s935`. The game ended elimination for white after 44 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 494 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,2 END_ACTION | `c536e39f` | yes | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `e44f9f5a` | yes | -376 | -566 | -190 | 557 | 2516 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→6,2 END_ACTION | `631168ce` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→7,5 ATK 7,5→6,5 END_ACTION | `7f2e1bcb` | yes | -2,853 | -2,108 | 745 | -801 | 2504 |
| 3 | BUY fire_1@9,8 BUY water_1@8,9 MOVE 8,8→8,6 ATK 8,6→9,6 MOVE 8,6→7,6 END_ACTION | `a78d5a27` | yes | BUY fire_1@9,8 BUY plant_1@8,9 MOVE 8,8→8,6 ATK 8,6→9,6 MOVE 8,6→8,5 END_ACTION | `cda4a20f` | yes | 1,450 | 1,040 | -410 | 1,557 | 2464 |
| 4 | BUY lightning_1@8,6 END_PLACE MOVE 8,6→4,4 ATK 4,4→3,4 END_ACTION | `18022911` | yes | BUY fire_1@7,9 BUY fire_1@8,6 BUY fire_1@7,7 END_PLACE MOVE 7,6→7,2 END_ACTION | `f3bee8d5` | yes | 1,545 | 1,285 | -260 | 1,539 | 2508 |
| 5 | BUY fire_1@7,9 BUY fire_1@8,6 BUY fire_1@7,7 PROMOTE 7,6 END_PLACE MOVE 7,6→7,2 END_ACTION | `ae99d773` | yes | BUY lightning_1@8,6 END_PLACE MOVE 8,6→4,4 ATK 4,4→3,4 END_ACTION | `a7ce809c` | yes | 2,182 | 922 | -1,260 | 2,319 | 3015 |
| 6 | BUY fire_1@8,2 BUY fire_1@7,7 BUY fire_1@9,2 BUY fire_1@7,3 ATK 7,7→6,7 MOVE 9,7→9,5 MOVE 7,3→5,3 END_ACTION | `45cf5018` | yes | BUY fire_1@8,2 BUY fire_1@7,7 BUY fire_1@9,2 BUY fire_1@7,3 ATK 7,7→6,7 MOVE 9,7→9,5 MOVE 7,3→5,3 END_ACTION | `45cf5018` | yes | 3,699 | 3,699 | 0 | 4,346 | 3000 |
| 7 | END_PLACE MOVE 7,2→6,2 ATK 6,2→5,2 END_ACTION | `a3a05fe8` | yes | BUY fire_1@9,6 BUY fire_1@8,7 PROMOTE 7,2 MOVE 8,9→8,8 MOVE 7,7→1,7 END_ACTION | `6cd61c47` | yes | 1,494 | 2,396 | 902 | 3,380 | 2981 |
| 8 | BUY fire_1@8,4 END_PLACE MOVE 6,2→7,1 MOVE 8,6→6,6 ATK 6,6→6,7 END_ACTION | `06f33495` | yes | BUY fire_1@8,3 END_PLACE MOVE 6,2→7,1 MOVE 8,6→6,6 ATK 6,6→6,7 END_ACTION | `f3806c0c` | yes | 2,824 | 5,124 | 2,300 | 3,973 | 3000 |
| 9 | BUY fire_1@8,1 BUY fire_1@7,2 END_PLACE MOVE 9,2→4,3 ATK 4,3→4,4 END_ACTION | `091ebf93` | yes | BUY fire_1@8,1 BUY fire_1@7,2 END_PLACE MOVE 9,2→4,3 ATK 4,3→4,4 END_ACTION | `091ebf93` | yes | 2,004 | 2,004 | 0 | 4,155 | 2045 |
| 10 | BUY fire_1@7,9 BUY fire_1@9,1 BUY fire_1@9,3 END_PLACE MOVE 9,5→6,5 MOVE 8,9→8,8 END_ACTION | `2c53097f` | yes | BUY fire_1@7,9 BUY fire_1@9,1 BUY fire_1@7,3 BUY fire_1@8,3 END_PLACE ATK 7,9→6,9 MOVE 9,5→9,4 MOVE 9,8→8,7 MOVE 8,9→8,8 END_ACTION | `59cd7ee0` | yes | 4,453 | 6,828 | 2,375 | 7,092 | 3024 |
| 11 | BUY fire_1@8,5 BUY fire_1@9,2 BUY fire_1@8,3 BUY fire_1@9,4 END_PLACE ATK 8,5→7,5 MOVE 8,4→5,4 END_ACTION | `be7ee35d` | yes | END_PLACE MOVE 8,1→3,0 ATK 3,0→2,0 END_ACTION | `dc5a33cd` | yes | 5,693 | 6,093 | 400 | 8,443 | 3050 ⚠ |
| 12 | BUY fire_1@7,4 BUY fire_1@9,6 END_PLACE ATK 7,4→6,4 MOVE 8,8→7,8 MOVE 8,5→4,5 END_ACTION | `a63b277d` | yes | BUY fire_1@7,4 BUY fire_1@9,6 END_PLACE ATK 7,4→6,4 MOVE 8,8→7,8 MOVE 8,5→4,5 END_ACTION | `a63b277d` | yes | 6,688 | 6,688 | 0 | 6,027 | 1344 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 7f2e1bcb48f79433 IS among the 27 candidates at this root; the engine played 631168ce25ed35c6 instead, worth -2853 cc to the adviser against -2108 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #19) and scored it -801 cc, ABOVE the played candidate #0 at -2444 cc — so this re-run did not play what the seat played (it chose candidate #19 at -801 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 10 (the seat's turn #10).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 59cd7ee013beed1f IS among the 34 candidates at this root; the engine played 2c53097f5ae903d5 instead, worth 4453 cc to the adviser against 6828 cc. root exposure: 34 candidate(s) from a `completed-depth` list, 34 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #4) and scored it 6828 cc, ABOVE the played candidate #0 at 4456 cc — so this re-run did not play what the seat played (it chose candidate #12 at 7092 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_717317 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

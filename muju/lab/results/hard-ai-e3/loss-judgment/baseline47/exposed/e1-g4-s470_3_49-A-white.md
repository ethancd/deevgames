# Replay analysis — e1-g4-s470_3_49-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s470`. The game ended elimination for black after 21 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 255 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `b1f3fc66` | yes | END_ACTION | `b1f3fc66` | yes | -2,570 | -2,570 | 0 | -631 | 3000 |
| 2 | END_PLACE MOVE 1,0→1,1 END_ACTION | `fd8136eb` | yes | END_PLACE MOVE 0,1→0,2 MOVE 0,0→1,1 MOVE 1,0→0,0 END_ACTION | `2dc65d1a` | yes | -4,031 | -2,382 | 1,649 | -162 | 2534 |
| 3 | BUY plant_1@1,0 END_PLACE MOVE 1,1→2,1 ATK 2,1→2,0 MOVE 2,1→2,0 MOVE 0,1→1,1 END_ACTION | `afb55434` | yes | BUY water_1@1,0 PROMOTE 1,1 END_PLACE ATK 1,0→2,0 MOVE 0,1→0,2 MOVE 1,1→2,1 END_ACTION | `0e22f457` | yes | -3,957 | -1,543 | 2,414 | -1,166 | 2702 |
| 4 | BUY water_1@0,0 END_PLACE ATK 0,0→0,1 MOVE 1,1→2,1 MOVE 1,0→1,2 END_ACTION | `244ba6c4` | yes | BUY water_1@0,0 END_PLACE ATK 0,0→0,1 MOVE 1,1→2,1 MOVE 1,0→1,2 END_ACTION | `244ba6c4` | yes | -1,501 | -1,501 | 0 | -1,246 | 1788 |
| 5 | BUY fire_1@0,2 BUY fire_1@1,1 BUY fire_1@0,1 END_PLACE ATK 0,2→0,3 MOVE 2,1→2,2 MOVE 1,2→1,3 MOVE 2,2→2,3 END_ACTION | `cf5d8fe7` | yes | BUY fire_1@0,2 BUY fire_1@1,1 BUY fire_1@0,1 END_PLACE ATK 0,2→0,3 MOVE 2,1→2,2 MOVE 1,2→1,3 MOVE 2,2→2,3 END_ACTION | `cf5d8fe7` | yes | -1,531 | -1,531 | 0 | -434 | 2679 |
| 6 | BUY fire_1@1,0 BUY fire_1@0,3 BUY lightning_1@1,2 PROMOTE 1,3 END_PLACE MOVE 1,2→9,6 END_ACTION | `e9cbe3f4` | yes | BUY fire_1@1,0 BUY fire_1@1,2 END_PLACE MOVE 1,2→3,4 MOVE 1,3→1,4 END_ACTION | `2dd02469` | yes | -498 | -1,208 | -710 | 1,029 | 2113 |
| 7 | END_PLACE MOVE 0,3→2,7 MOVE 1,1→2,1 END_ACTION | `0c98c77e` | yes | END_PLACE MOVE 0,3→2,7 MOVE 2,0→3,0 END_ACTION | `41219ff0` | yes | -2,013 | -2,016 | -3 | -589 | 2548 |
| 8 | BUY fire_1@1,1 PROMOTE 2,1 END_PLACE ATK 1,1→1,2 MOVE 2,1→7,2 END_ACTION | `ba6e5b1e` | yes | BUY fire_1@1,1 END_PLACE ATK 1,1→1,2 MOVE 2,1→7,2 END_ACTION | `2357285e` | yes | -9 | -434 | -425 | 292 | 2098 |
| 9 | END_PLACE MOVE 1,1→5,3 ATK 5,3→4,3 END_ACTION | `d25bc746` | yes | END_PLACE MOVE 0,1→4,5 END_ACTION | `10efc8e4` | yes | -1,792 | -1,232 | 560 | -1,444 | 1931 |
| 10 | PROMOTE 0,1 END_PLACE MOVE 0,1→7,2 END_ACTION | `35f07ff1` | yes | END_PLACE MOVE 0,1→2,7 END_ACTION | `2f9af186` | yes | -1,852 | -1,495 | 357 | -57 | 1883 |
| 11 | END_PLACE MOVE 1,0→3,3 ATK 3,3→3,2 END_ACTION | `4047ff04` | yes | PROMOTE 2,0 END_PLACE MOVE 1,0→3,3 ATK 3,3→3,2 END_ACTION | `3dd7e733` | yes | -3,185 | -1,262 | 1,923 | -1,209 | 1354 |
| 12 | END_PLACE MOVE 2,0→2,1 ATK 2,1→2,2 END_ACTION | `b12bee1a` | yes | PROMOTE 2,0 END_PLACE MOVE 2,0→3,2 ATK 3,2→2,2 END_ACTION | `bc55f150` | yes | -2,321 | -1,860 | 461 | -2,343 | 2162 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 2dc65d1a0da0d204 IS among the 19 candidates at this root; the engine played fd8136eb29d2e53c instead, worth -4031 cc to the adviser against -2382 cc. root exposure: 19 candidate(s) from a `completed-depth` list, 19 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #9) and scored it -935 cc, ABOVE the played candidate #0 at -2967 cc — so this re-run did not play what the seat played (it chose candidate #15 at -162 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 3 (the seat's turn #3).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 0e22f45704eae40e IS among the 27 candidates at this root; the engine played afb55434565f527b instead, worth -3957 cc to the adviser against -1543 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #19) and scored it -1166 cc, ABOVE the played candidate #0 at -3236 cc — so this re-run did not play what the seat played (it chose candidate #19 at -1166 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_593970 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

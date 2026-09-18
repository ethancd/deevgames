# Replay analysis — e1-g4-s50_3_69-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s50`. The game ended elimination for black after 25 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 288 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `29ae29fe` | yes | END_ACTION | `29ae29fe` | yes | 361 | 361 | 0 | 361 | 3019 |
| 2 | BUY fire_1@0,0 BUY fire_1@2,0 MOVE 1,2→0,2 MOVE 2,3→6,5 END_ACTION | `83b49aa5` | yes | BUY fire_1@0,0 BUY fire_1@1,0 MOVE 2,3→5,5 ATK 5,5→5,4 END_ACTION | `2f570030` | yes | -2,725 | 1,257 | 3,982 | 640 | 2333 |
| 3 | BUY fire_1@0,1 END_PLACE MOVE 2,0→3,4 ATK 3,4→3,3 END_ACTION | `17e34777` | yes | BUY fire_1@0,1 END_PLACE MOVE 2,0→3,4 ATK 3,4→3,3 END_ACTION | `17e34777` | yes | -737 | -737 | 0 | 1,940 | 1319 |
| 4 | BUY lightning_1@1,0 END_PLACE MOVE 1,0→4,2 ATK 4,2→3,2 MOVE 0,2→0,3 END_ACTION | `e7dba70b` | yes | BUY lightning_1@1,0 END_PLACE MOVE 1,0→4,2 ATK 4,2→3,2 MOVE 0,2→0,3 END_ACTION | `e7dba70b` | yes | -1,570 | -1,570 | 0 | 511 | 2615 |
| 5 | BUY fire_1@0,2 BUY water_1@1,0 END_PLACE MOVE 0,2→5,3 ATK 5,3→4,3 END_ACTION | `8833d1a2` | yes | BUY fire_1@0,2 BUY water_1@1,0 END_PLACE MOVE 0,2→5,3 ATK 5,3→4,3 END_ACTION | `8833d1a2` | yes | -567 | -567 | 0 | -461 | 2928 |
| 6 | BUY lightning_1@0,2 END_PLACE MOVE 0,2→5,3 ATK 5,3→5,4 END_ACTION | `9b228dcf` | yes | BUY lightning_1@0,2 END_PLACE MOVE 0,2→5,3 ATK 5,3→5,4 END_ACTION | `9b228dcf` | yes | -2,151 | -2,151 | 0 | -1,065 | 1651 |
| 7 | BUY fire_1@0,2 PROMOTE 0,3 END_PLACE ATK 0,3→1,3 MOVE 0,3→1,4 MOVE 0,2→2,2 END_ACTION | `ed93bbab` | yes | BUY fire_1@0,2 END_PLACE ATK 0,3→1,3 MOVE 0,3→1,4 MOVE 0,2→2,2 END_ACTION | `99ba1acd` | yes | 191 | -101 | -292 | -749 | 2256 |
| 8 | BUY fire_1@2,0 BUY fire_1@1,2 BUY fire_1@0,2 PROMOTE 2,2 END_PLACE ATK 1,2→1,3 MOVE 1,2→1,7 END_ACTION | `34ef6864` | yes | BUY fire_1@2,0 BUY fire_1@1,2 END_PLACE ATK 1,2→1,3 MOVE 1,2→2,7 END_ACTION | `b0e17c7e` | yes | 629 | -738 | -1,367 | 1,731 | 2385 |
| 9 | BUY fire_1@1,3 BUY fire_1@0,4 BUY fire_1@0,5 PROMOTE 1,7 MOVE 0,2→4,4 MOVE 1,1→2,1 END_ACTION | `df4d41b5` | yes | BUY fire_1@1,3 BUY fire_1@0,5 END_PLACE MOVE 0,2→4,4 MOVE 1,1→2,1 END_ACTION | `5b0df543` | yes | 24 | 1,414 | 1,390 | 3,014 | 3018 |
| 10 | END_PLACE MOVE 0,4→5,5 ATK 5,5→4,5 END_ACTION | `3f02e08a` | yes | END_PLACE MOVE 0,4→4,6 ATK 4,6→4,5 END_ACTION | `978eb0bc` | yes | 1,575 | 2,052 | 477 | 2,612 | 3014 |
| 11 | BUY fire_1@0,4 BUY fire_1@0,2 BUY fire_1@1,2 END_PLACE MOVE 0,4→2,8 ATK 2,8→2,7 END_ACTION | `171109d6` | yes | BUY fire_1@0,4 END_PLACE MOVE 1,3→2,8 ATK 2,8→2,7 END_ACTION | `8be60b5e` | yes | -25 | 1,876 | 1,901 | 3,093 | 2892 |
| 12 | END_PLACE MOVE 0,5→6,7 END_ACTION | `8c2e2fa9` | yes | BUY fire_1@0,4 END_PLACE MOVE 1,3→2,8 ATK 2,8→2,7 END_ACTION | `a9a76592` | yes | 569 | -235 | -804 | 1,573 | 2952 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 2f570030fa3a67a4 IS among the 27 candidates at this root; the engine played 83b49aa570b6ca1d instead, worth -2725 cc to the adviser against 1257 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and scored it 640 cc, ABOVE the played candidate #0 at -1263 cc — so this re-run did not play what the seat played (it chose candidate #1 at 640 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 2f570030fa3a67a4 IS among the 27 candidates at this root; the engine played 83b49aa570b6ca1d instead, worth -2725 cc to the adviser against 1257 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and scored it 640 cc, ABOVE the played candidate #0 at -1263 cc — so this re-run did not play what the seat played (it chose candidate #1 at 640 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_572021 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

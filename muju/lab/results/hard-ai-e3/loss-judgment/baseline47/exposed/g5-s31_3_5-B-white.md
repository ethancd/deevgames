# Replay analysis — g5-s31_3_5-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g5-s31`. The game ended elimination for white after 23 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 249 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `b1da4e0d` | yes | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `b1da4e0d` | yes | -2,450 | -2,450 | 0 | -1,453 | 3012 |
| 2 | BUY lightning_1@9,8 PROMOTE 8,8 MOVE 9,8→1,4 END_ACTION | `be2d1e6e` | yes | BUY lightning_1@9,8 END_PLACE MOVE 9,8→3,6 ATK 3,6→2,6 END_ACTION | `cc085115` | yes | -2,808 | -267 | 2,541 | -970 | 2340 |
| 3 | BUY water_1@8,9 MOVE 8,8→9,8 MOVE 8,9→7,8 ATK 7,8→7,9 END_ACTION | `4acf4e4a` | yes | BUY water_1@8,9 MOVE 8,8→9,8 MOVE 8,9→7,8 ATK 7,8→7,9 END_ACTION | `4acf4e4a` | yes | -2,369 | -2,369 | 0 | -1,374 | 1599 |
| 4 | BUY fire_1@8,9 BUY lightning_1@8,8 ATK 8,8→8,7 MOVE 8,8→5,2 END_ACTION | `f0f50119` | yes | BUY fire_1@8,9 BUY lightning_1@8,8 ATK 8,8→8,7 MOVE 8,8→5,2 END_ACTION | `f0f50119` | yes | -2,045 | -2,045 | 0 | -1,946 | 2755 |
| 5 | BUY lightning_1@8,8 MOVE 8,8→7,6 ATK 7,6→6,6 END_ACTION | `7464cd95` | yes | BUY water_1@7,9 MOVE 7,8→7,7 MOVE 9,8→9,7 MOVE 7,7→7,6 ATK 7,6→6,6 END_ACTION | `8b0002cb` | yes | -620 | -2,010 | -1,390 | -2,051 | 2562 |
| 6 | BUY fire_1@8,8 MOVE 9,8→9,7 MOVE 8,8→4,6 END_ACTION | `32289f81` | yes | BUY lightning_1@8,8 MOVE 9,8→9,7 MOVE 7,8→7,6 ATK 7,6→6,6 END_ACTION | `37257d6a` | yes | -2,952 | -2,867 | 85 | -1,461 | 2533 |
| 7 | BUY lightning_1@8,8 MOVE 7,8→7,9 MOVE 8,8→4,6 ATK 4,6→5,6 END_ACTION | `1281f204` | yes | BUY fire_1@7,9 MOVE 7,8→6,5 END_ACTION | `d98ec982` | yes | -1,967 | -562 | 1,405 | -161 | 2827 |
| 8 | BUY water_1@9,8 MOVE 9,7→8,7 ATK 8,7→8,8 MOVE 9,8→9,7 END_ACTION | `d395394f` | yes | BUY fire_1@9,8 MOVE 9,7→8,6 MOVE 9,8→8,7 ATK 8,7→8,8 END_ACTION | `c2526d70` | yes | -902 | -1,110 | -208 | -1,130 | 1077 |
| 9 | BUY fire_1@9,8 MOVE 9,8→7,2 END_ACTION | `70c6b7f6` | yes | BUY fire_1@8,8 MOVE 8,8→4,4 END_ACTION | `53cf73a2` | yes | -2,996 | -3,266 | -270 | 1,226 | 3006 |
| 10 | BUY fire_1@8,8 BUY lightning_1@8,9 MOVE 8,7→8,6 MOVE 8,8→4,6 END_ACTION | `62684546` | yes | BUY fire_1@8,8 END_PLACE MOVE 8,7→8,6 MOVE 8,8→4,6 END_ACTION | `cc33b74c` | yes | -3,214 | -2,666 | 548 | -583 | 3001 |
| 11 | BUY water_1@9,8 MOVE 8,9→4,5 MOVE 7,9→8,9 END_ACTION | `ddf6ce02` | yes | BUY water_1@9,8 MOVE 8,9→4,5 MOVE 9,7→9,6 END_ACTION | `33cde5f8` | yes | -1,902 | -2,060 | -158 | -506 | 3009 |
| 12 | BUY lightning_1@9,6 MOVE 9,6→4,2 MOVE 8,6→8,5 END_ACTION | `ffd7dce3` | yes | BUY lightning_1@9,6 MOVE 9,6→4,2 MOVE 8,6→8,5 END_ACTION | `ffd7dce3` | yes | -3,373 | -3,373 | 0 | -747 | 1242 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key cc085115e05bf68b IS among the 28 candidates at this root; the engine played be2d1e6e587671cd instead, worth -2808 cc to the adviser against -267 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #26) and scored it -970 cc, ABOVE the played candidate #0 at -3049 cc — so this re-run did not play what the seat played (it chose candidate #26 at -970 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key cc085115e05bf68b IS among the 28 candidates at this root; the engine played be2d1e6e587671cd instead, worth -2808 cc to the adviser against -267 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #26) and scored it -970 cc, ABOVE the played candidate #0 at -3049 cc — so this re-run did not play what the seat played (it chose candidate #26 at -970 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_573913 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

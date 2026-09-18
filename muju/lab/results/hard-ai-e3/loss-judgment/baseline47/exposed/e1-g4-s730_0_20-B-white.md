# Replay analysis — e1-g4-s730_0_20-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s730`. The game ended home-checkmate for white after 25 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 298 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `37d25a42` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `37d25a42` | yes | 1,417 | 1,417 | 0 | 795 | 1760 |
| 2 | BUY lightning_1@9,8 END_PLACE MOVE 9,8→5,4 ATK 5,4→5,5 END_ACTION | `12da2efa` | yes | BUY lightning_1@9,8 END_PLACE MOVE 9,8→4,5 ATK 4,5→5,5 END_ACTION | `2e28c15b` | yes | 2,605 | 3,482 | 877 | 2,953 | 2199 |
| 3 | BUY fire_1@6,4 END_PLACE MOVE 6,4→4,3 ATK 4,3→3,3 END_ACTION | `f90433e4` | yes | BUY fire_1@6,4 END_PLACE MOVE 6,4→4,3 ATK 4,3→3,3 END_ACTION | `f90433e4` | yes | 5,477 | 5,477 | 0 | 6,572 | 2600 |
| 4 | BUY fire_1@5,3 BUY fire_1@4,4 BUY fire_1@7,5 END_PLACE MOVE 9,7→9,8 MOVE 4,3→3,4 MOVE 7,5→7,1 END_ACTION | `c8a52c27` | yes | BUY fire_1@5,3 BUY fire_1@4,4 BUY fire_1@7,5 END_PLACE MOVE 9,7→9,8 MOVE 4,3→3,4 MOVE 7,5→7,1 END_ACTION | `c8a52c27` | yes | 8,402 | 8,402 | 0 | 9,207 | 1597 |
| 5 | BUY fire_1@8,1 BUY fire_1@7,2 BUY fire_1@8,2 PROMOTE 4,4 MOVE 7,9→8,9 MOVE 5,4→2,3 ATK 2,3→2,4 END_ACTION | `1423faa0` | yes | BUY fire_1@8,1 BUY fire_1@7,2 BUY fire_1@8,2 PROMOTE 7,1 MOVE 7,9→8,9 MOVE 5,4→1,4 ATK 1,4→2,4 END_ACTION | `fdf37b20` | yes | 11,429 | 11,265 | -164 | 12,926 | 3002 |
| 6 | BUY fire_1@9,1 BUY fire_1@5,4 BUY lightning_1@9,2 MOVE 5,3→0,0 END_ACTION | `caf2d3c6` | yes | BUY fire_1@9,1 BUY fire_1@5,4 BUY lightning_1@6,3 MOVE 6,3→0,0 MOVE 4,4→4,6 END_ACTION | `4c34424b` | yes | 12,435 | 12,277 | -158 | 17,839 | 1037 |
| 7 | BUY fire_1@7,3 BUY fire_1@4,5 BUY fire_1@5,5 PROMOTE 7,2 MOVE 4,4→0,0 END_ACTION | `67d282e7` | yes | BUY fire_1@8,3 BUY fire_1@4,5 BUY fire_1@5,5 PROMOTE 7,2 MOVE 7,1→0,0 END_ACTION | `78c56627` | yes | 10,479 | 11,680 | 1,201 | 12,435 | 2882 |
| 8 | BUY fire_1@6,5 BUY fire_1@4,6 BUY lightning_1@6,4 MOVE 6,4→0,0 END_ACTION | `3ae328ff` | yes | BUY fire_1@6,5 BUY fire_1@4,6 BUY lightning_1@6,4 MOVE 6,4→0,0 END_ACTION | `3ae328ff` | yes | 14,366 | 14,366 | 0 | 15,339 | 1693 |
| 9 | BUY lightning_1@7,4 END_PLACE MOVE 7,4→0,0 END_ACTION | `28c691a7` | yes | BUY fire_1@8,8 PROMOTE 7,1 END_PLACE MOVE 7,1→0,0 END_ACTION | `73fc97e9` | yes | 10,154 | 8,058 | -2,096 | 15,384 | 2285 |
| 10 | BUY lightning_1@7,4 END_PLACE MOVE 7,4→0,0 END_ACTION | `5ad77561` | yes | BUY lightning_1@7,4 END_PLACE MOVE 7,4→0,0 END_ACTION | `5ad77561` | yes | 9,509 | 9,509 | 0 | 9,643 | 2374 |
| 11 | BUY lightning_1@7,4 END_PLACE MOVE 7,4→0,0 END_ACTION | `7e5e0cd0` | yes | BUY fire_1@7,4 BUY fire_1@7,5 BUY fire_1@8,8 PROMOTE 8,2 END_PLACE MOVE 7,3→0,3 END_ACTION | `167e56ab` | yes | 6,874 | 6,110 | -764 | 9,980 | 1772 |
| 12 | BUY fire_1@7,4 BUY fire_1@7,5 BUY fire_1@8,8 PROMOTE 7,3 END_PLACE MOVE 7,3→0,4 END_ACTION | `13c3fd12` | yes | END_PLACE MOVE 7,2→2,1 ATK 2,1→1,1 END_ACTION | `0a8beaa2` | yes | 5,687 | 11,395 | 5,708 | 9,753 | 2398 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 2e28c15bf78063ce IS among the 26 candidates at this root; the engine played 12da2efaeb98c51c instead, worth 2605 cc to the adviser against 3482 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #6) and scored it 2953 cc, ABOVE the played candidate #4 at 2568 cc — so this re-run did not play what the seat played (it chose candidate #6 at 2953 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 12 (the seat's turn #12).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 0a8beaa2d089358b IS among the 30 candidates at this root; the engine played 13c3fd12e7130cde instead, worth 5687 cc to the adviser against 11395 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #28) and scored it 9753 cc, ABOVE the played candidate #0 at 7206 cc — so this re-run did not play what the seat played (it chose candidate #15 at 9753 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_550473 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

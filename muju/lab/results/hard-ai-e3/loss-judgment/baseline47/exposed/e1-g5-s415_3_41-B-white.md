# Replay analysis — e1-g5-s415_3_41-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s415`. The game ended elimination for white after 27 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 309 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→2,7 END_ACTION | `9798e06a` | yes | BUY fire_1@9,9 MOVE 9,8→9,7 MOVE 9,9→9,8 MOVE 8,9→7,9 MOVE 7,9→9,9 END_ACTION | `08932b60` | yes | -1,405 | -1,145 | 260 | 778 | 3010 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→6,6 ATK 6,6→6,7 END_ACTION | `86aff5b6` | yes | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→6,6 ATK 6,6→6,7 END_ACTION | `86aff5b6` | yes | 379 | 379 | 0 | 800 | 2473 |
| 3 | BUY fire_1@9,8 BUY fire_1@8,9 PROMOTE 8,8 MOVE 8,9→5,4 END_ACTION | `9fa4c187` | yes | BUY fire_1@8,9 BUY lightning_1@9,8 END_PLACE MOVE 8,8→8,7 MOVE 9,8→5,4 END_ACTION | `ec7fc68a` | yes | -958 | -1,430 | -472 | -2,508 | 2355 |
| 4 | BUY water_1@8,9 ATK 9,7→9,6 MOVE 8,8→8,6 ATK 8,6→9,6 END_ACTION | `3913f376` | yes | BUY water_1@8,9 ATK 9,7→9,6 MOVE 8,8→8,6 ATK 8,6→9,6 END_ACTION | `3913f376` | yes | 1,033 | 1,033 | 0 | 1,940 | 1865 |
| 5 | BUY fire_1@8,7 BUY fire_1@9,6 BUY lightning_1@8,8 ATK 8,8→7,8 MOVE 8,6→6,5 END_ACTION | `3896f16a` | yes | BUY lightning_1@9,6 END_PLACE MOVE 9,6→4,2 ATK 4,2→4,3 END_ACTION | `09832774` | yes | 67 | 1,569 | 1,502 | 2,395 | 2604 |
| 6 | END_PLACE MOVE 8,9→7,9 ATK 7,9→7,8 MOVE 9,8→8,9 MOVE 9,7→9,8 END_ACTION | `3338de3b` | yes | BUY water_1@8,8 END_PLACE ATK 8,8→7,8 MOVE 9,6→8,1 END_ACTION | `85764b4c` | yes | 1,532 | 1,538 | 6 | 1,439 | 2132 |
| 7 | BUY fire_1@7,5 BUY fire_1@6,6 END_PLACE MOVE 6,6→4,6 MOVE 6,5→5,5 MOVE 7,5→7,1 END_ACTION | `c522f34a` | yes | BUY fire_1@7,5 BUY fire_1@6,6 END_PLACE MOVE 6,6→4,6 MOVE 6,5→5,5 MOVE 7,5→7,1 END_ACTION | `c522f34a` | yes | 2,156 | 2,156 | 0 | 2,043 | 2759 |
| 8 | BUY fire_1@8,9 BUY fire_1@9,7 END_PLACE ATK 8,9→8,8 MOVE 9,7→8,2 END_ACTION | `84d99c1d` | yes | BUY fire_1@8,9 BUY fire_1@9,7 END_PLACE ATK 8,9→8,8 MOVE 9,7→8,2 END_ACTION | `84d99c1d` | yes | 2,960 | 2,960 | 0 | 2,568 | 2429 |
| 9 | BUY lightning_1@8,3 END_PLACE MOVE 8,3→0,0 END_ACTION | `3cbec366` | yes | BUY fire_1@6,5 END_PLACE MOVE 6,5→1,4 ATK 1,4→0,4 END_ACTION | `396d85d2` | yes | 904 | 1,609 | 705 | 3,002 | 3001 |
| 10 | BUY fire_1@6,5 BUY fire_1@7,5 BUY fire_1@6,6 PROMOTE 5,5 END_PLACE MOVE 5,5→2,2 MOVE 7,9→7,8 END_ACTION | `cfeb16e6` | yes | BUY fire_1@6,5 BUY fire_1@7,5 BUY fire_1@8,5 BUY fire_1@6,6 PROMOTE 5,5 MOVE 5,5→2,2 ATK 2,2→1,2 END_ACTION | `ed2d8b06` | yes | 573 | 1,160 | 587 | 1,508 | 2864 |
| 11 | BUY fire_1@8,5 BUY fire_1@9,5 BUY fire_1@7,6 END_PLACE MOVE 6,5→3,4 MOVE 8,5→8,1 END_ACTION | `7005a83d` | yes | BUY fire_1@8,5 BUY fire_1@9,5 BUY fire_1@7,7 END_PLACE MOVE 7,5→7,1 ATK 7,1→7,2 END_ACTION | `ef0209ad` | yes | -2,932 | 1,452 | 4,384 | 1,620 | 1634 |
| 12 | BUY fire_1@8,2 BUY fire_1@8,3 END_PLACE ATK 8,2→7,2 MOVE 7,6→3,4 END_ACTION | `d5b3d407` | yes | BUY lightning_1@9,1 END_PLACE MOVE 9,1→1,0 ATK 1,0→1,1 END_ACTION | `b1b3c07b` | yes | -39 | 53 | 92 | 1,467 | 3023 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 5 (the seat's turn #5).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 09832774b51c1b3e IS among the 28 candidates at this root; the engine played 3896f16aa1e09620 instead, worth 67 cc to the adviser against 1569 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #26) and scored it 2395 cc, ABOVE the played candidate #0 at 409 cc — so this re-run did not play what the seat played (it chose candidate #26 at 2395 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 11 (the seat's turn #11).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key ef0209ad1b0ccdab IS among the 30 candidates at this root; the engine played 7005a83d0e77dcb8 instead, worth -2932 cc to the adviser against 1452 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #15) and scored it 1620 cc, ABOVE the played candidate #0 at 927 cc — so this re-run did not play what the seat played (it chose candidate #15 at 1620 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_569122 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

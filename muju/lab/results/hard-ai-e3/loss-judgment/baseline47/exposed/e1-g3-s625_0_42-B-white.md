# Replay analysis — e1-g3-s625_0_42-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g3-s625`. The game ended home-checkmate for white after 42 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 445 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `f4f75e22` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `f4f75e22` | yes | 194 | 194 | 0 | 1,641 | 3005 |
| 2 | BUY lightning_1@9,8 END_PLACE MOVE 9,8→6,6 ATK 6,6→5,6 END_ACTION | `67524b8b` | yes | BUY lightning_1@9,8 END_PLACE MOVE 9,8→6,6 ATK 6,6→5,6 END_ACTION | `67524b8b` | yes | 1,556 | 1,556 | 0 | 2,453 | 2245 |
| 3 | BUY fire_1@6,8 END_PLACE ATK 6,8→5,8 END_ACTION | `4dd58bd0` | yes | BUY fire_1@6,8 END_PLACE ATK 6,8→5,8 END_ACTION | `4dd58bd0` | yes | 3,934 | 3,934 | 0 | 3,392 | 1643 |
| 4 | BUY fire_1@8,8 BUY fire_1@8,9 END_PLACE MOVE 9,7→9,8 MOVE 6,8→1,7 END_ACTION | `4baebd93` | yes | BUY fire_1@8,8 BUY fire_1@9,8 BUY fire_1@8,6 MOVE 6,8→1,7 MOVE 6,6→8,5 END_ACTION | `044eacb1` | yes | 3,007 | 3,260 | 253 | 5,930 | 3006 |
| 5 | BUY fire_1@7,6 BUY fire_1@8,6 BUY fire_1@8,7 PROMOTE 6,6 MOVE 6,6→0,1 MOVE 7,6→6,5 END_ACTION | `05f8b743` | yes | BUY fire_1@7,6 BUY fire_1@7,7 END_PLACE MOVE 6,6→1,5 ATK 1,5→1,6 MOVE 7,6→6,5 END_ACTION | `8993f772` | yes | 3,896 | 5,568 | 1,672 | 5,310 | 2725 |
| 6 | BUY fire_1@9,6 BUY plant_1@9,7 MOVE 8,6→5,4 ATK 5,4→5,5 END_ACTION | `50be1dc3` | yes | BUY fire_1@9,6 BUY shadow_1@9,7 MOVE 8,7→5,4 ATK 5,4→5,5 END_ACTION | `cdb9c0a6` | yes | 5,246 | 5,681 | 435 | 6,531 | 2706 |
| 7 | END_PLACE MOVE 7,9→7,8 MOVE 8,7→7,2 END_ACTION | `b5bb20f7` | yes | END_PLACE MOVE 8,7→5,4 ATK 5,4→4,4 END_ACTION | `f16f2745` | yes | 3,167 | 3,802 | 635 | 5,717 | 1391 |
| 8 | BUY fire_1@7,9 END_PLACE MOVE 7,9→6,5 MOVE 9,6→8,5 END_ACTION | `9d6e1ffb` | yes | BUY lightning_1@7,9 END_PLACE MOVE 9,6→7,2 MOVE 7,8→7,7 END_ACTION | `7c04e534` | yes | 3,818 | 3,215 | -603 | 5,181 | 2177 |
| 9 | BUY water_1@7,9 END_PLACE MOVE 8,8→4,4 END_ACTION | `8f410b40` | yes | END_PLACE MOVE 8,8→8,5 ATK 8,5→8,4 END_ACTION | `41b450ef` | yes | 854 | 2,070 | 1,216 | 2,428 | 2436 |
| 10 | BUY fire_1@8,8 END_PLACE ATK 8,8→8,7 MOVE 7,8→7,7 MOVE 9,7→9,5 END_ACTION | `6f02e886` | yes | BUY water_1@8,8 END_PLACE ATK 8,8→8,7 MOVE 7,8→7,6 MOVE 7,6→7,5 END_ACTION | `dcddb629` | yes | 1,486 | 1,470 | -16 | 2,207 | 2565 |
| 11 | BUY fire_1@9,6 BUY fire_1@7,8 END_PLACE MOVE 7,8→4,5 MOVE 7,7→7,6 END_ACTION | `e2366951` | yes | BUY fire_1@9,6 BUY fire_1@8,7 BUY fire_1@7,8 PROMOTE 7,7 END_PLACE MOVE 7,8→4,5 MOVE 7,7→7,6 END_ACTION | `adf25469` | yes | 2,721 | 3,495 | 774 | 3,306 | 2404 |
| 12 | BUY fire_1@7,7 BUY fire_1@8,7 END_PLACE ATK 7,7→6,7 MOVE 9,6→7,2 END_ACTION | `5b15e167` | yes | BUY fire_1@7,7 END_PLACE ATK 7,7→6,7 MOVE 9,6→7,2 END_ACTION | `41bd5f56` | yes | 3,584 | 3,745 | 161 | 4,227 | 2287 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 5 (the seat's turn #5).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 8993f772e87a5a2c IS among the 28 candidates at this root; the engine played 05f8b7434e66b266 instead, worth 3896 cc to the adviser against 5568 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #22) and scored it 5310 cc, ABOVE the played candidate #0 at 4553 cc — so this re-run did not play what the seat played (it chose candidate #11 at 5310 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 5 (the seat's turn #5).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 8993f772e87a5a2c IS among the 28 candidates at this root; the engine played 05f8b7434e66b266 instead, worth 3896 cc to the adviser against 5568 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #22) and scored it 5310 cc, ABOVE the played candidate #0 at 4553 cc — so this re-run did not play what the seat played (it chose candidate #11 at 5310 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_533305 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

# Replay analysis — e1-g5-s955_0_90-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s955`. The game ended home-checkmate for white after 23 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 240 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `00975181` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `00975181` | yes | -2,826 | -2,826 | 0 | -1,584 | 2846 |
| 2 | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→7,7 ATK 7,7→8,7 MOVE 9,7→9,8 MOVE 8,9→8,8 END_ACTION | `40716477` | yes | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→7,4 MOVE 9,9→8,8 ATK 8,8→8,7 END_ACTION | `5da88ef8` | yes | 303 | -469 | -772 | 1,715 | 1719 |
| 3 | END_PLACE MOVE 8,8→7,7 ATK 7,7→6,7 END_ACTION | `bf8d4a59` | yes | END_PLACE MOVE 8,8→7,7 ATK 7,7→6,7 END_ACTION | `bf8d4a59` | yes | -630 | -630 | 0 | 585 | 2497 |
| 4 | BUY fire_1@8,9 BUY fire_1@8,8 BUY fire_1@8,7 PROMOTE 7,7 MOVE 8,7→6,5 ATK 6,5→6,6 MOVE 9,8→9,7 END_ACTION | `4f2bc51a` | yes | BUY fire_1@8,9 BUY fire_1@8,8 BUY fire_1@8,7 PROMOTE 7,7 MOVE 8,7→6,5 ATK 6,5→6,6 MOVE 9,8→9,7 END_ACTION | `4f2bc51a` | yes | 1,882 | 1,882 | 0 | 1,797 | 2976 |
| 5 | BUY fire_1@8,7 BUY fire_1@7,8 END_PLACE MOVE 8,7→5,4 ATK 5,4→5,5 END_ACTION | `9c07e1fa` | yes | BUY fire_1@9,8 BUY fire_1@8,7 BUY fire_1@7,8 MOVE 8,7→5,4 ATK 5,4→5,5 END_ACTION | `b7725f3a` | yes | 457 | 2,171 | 1,714 | 2,539 | 2925 |
| 6 | BUY fire_1@9,8 BUY fire_1@8,7 END_PLACE MOVE 7,8→4,5 ATK 4,5→5,5 END_ACTION | `90e3d1d7` | yes | BUY fire_1@9,8 BUY plant_1@8,7 MOVE 7,8→4,5 ATK 4,5→5,5 END_ACTION | `8f8d6ed3` | yes | 2,943 | 2,533 | -410 | 3,286 | 2427 |
| 7 | BUY lightning_1@7,8 PROMOTE 7,7 MOVE 7,7→5,4 ATK 5,4→5,5 MOVE 9,7→9,6 END_ACTION | `456f3b83` | yes | BUY shadow_1@7,8 END_PLACE MOVE 7,7→5,4 ATK 5,4→5,5 END_ACTION | `87eb1f96` | yes | -1,012 | 1,381 | 2,393 | 2,328 | 2168 |
| 8 | BUY metal_1@9,7 END_PLACE MOVE 8,7→7,2 MOVE 9,6→8,6 END_ACTION | `9f60fe7c` | yes | BUY water_1@9,7 END_PLACE MOVE 8,7→7,2 MOVE 9,6→8,6 END_ACTION | `e130fc20` | yes | -2,257 | -1,856 | 401 | 141 | 2408 |
| 9 | BUY fire_1@8,7 BUY fire_1@9,6 END_PLACE MOVE 9,6→7,2 ATK 7,2→7,3 END_ACTION | `a7c59daf` | yes | BUY fire_1@8,7 BUY fire_1@9,6 END_PLACE MOVE 9,6→7,2 ATK 7,2→7,3 END_ACTION | `a7c59daf` | yes | -672 | -672 | 0 | -1,021 | 2835 |
| 10 | BUY water_1@9,6 END_PLACE ATK 7,2→7,3 MOVE 8,7→2,7 END_ACTION | `c4b60409` | yes | BUY lightning_1@9,6 END_PLACE ATK 7,2→7,3 MOVE 8,6→6,5 END_ACTION | `e8fcf2a6` | yes | 627 | -272 | -899 | 2,495 | 3006 |
| 11 | BUY lightning_1@8,7 END_PLACE MOVE 8,7→5,5 ATK 5,5→4,5 END_ACTION | `32e0bb4e` | yes | BUY lightning_1@8,7 END_PLACE MOVE 8,7→1,3 END_ACTION | `7bb760f9` | yes | -1,111 | 141 | 1,252 | 2,026 | 2290 |
| 12 | BUY fire_1@8,7 BUY shadow_1@8,8 ATK 7,9→7,8 MOVE 8,6→8,5 MOVE 8,7→6,5 END_ACTION | `5a8e3f07` | yes | BUY fire_1@8,7 BUY shadow_1@8,8 ATK 7,9→7,8 MOVE 8,6→8,5 MOVE 8,7→6,5 END_ACTION | `5a8e3f07` | yes | -263 | -263 | 0 | 477 | 2738 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 5 (the seat's turn #5).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key b7725f3a36af61ef IS among the 27 candidates at this root; the engine played 9c07e1fa3d8e038f instead, worth 457 cc to the adviser against 2171 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #2) and scored it 2539 cc, ABOVE the played candidate #0 at 2191 cc — so this re-run did not play what the seat played (it chose candidate #2 at 2539 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 7 (the seat's turn #7).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 87eb1f96cc02bd82 IS among the 27 candidates at this root; the engine played 456f3b83b43665f9 instead, worth -1012 cc to the adviser against 1381 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #7) and scored it 2268 cc, ABOVE the played candidate #0 at -308 cc — so this re-run did not play what the seat played (it chose candidate #8 at 2328 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_523834 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

# Replay analysis — e1-g5-s975_0_46-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s975`. The game ended elimination for white after 34 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 370 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→8,8 MOVE 8,9→9,9 END_ACTION | `2614e16e` | yes | MOVE 9,8→9,7 MOVE 9,7→9,9 END_ACTION | `06224d06` | yes | -1,793 | -1,471 | 322 | -438 | 3021 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 8,8→9,7 MOVE 8,9→7,4 END_ACTION | `5bf75fb2` | yes | BUY lightning_1@8,9 BUY lightning_1@9,8 MOVE 9,8→5,3 ATK 5,3→5,4 END_ACTION | `8410d6a9` | yes | -3,171 | -1,672 | 1,499 | -939 | 2433 |
| 3 | BUY fire_1@8,9 END_PLACE MOVE 8,9→6,5 ATK 6,5→7,5 END_ACTION | `bcb6bd7c` | yes | BUY water_1@8,9 END_PLACE MOVE 9,9→5,5 END_ACTION | `8ca47aaa` | yes | -3,036 | -2,497 | 539 | -2,087 | 1943 |
| 4 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→7,4 ATK 7,4→6,4 END_ACTION | `e648025c` | yes | BUY plant_1@8,9 PROMOTE 7,9 MOVE 7,9→7,7 ATK 7,7→8,7 END_ACTION | `1f676151` | yes | -2,240 | -2,521 | -281 | -1,573 | 1628 |
| 5 | END_PLACE MOVE 9,9→8,8 ATK 8,8→7,8 END_ACTION | `4b089e3f` | yes | PROMOTE 9,9 MOVE 9,9→7,7 ATK 7,7→7,8 END_ACTION | `ae674cff` | yes | -2,705 | -7,452 | -4,747 | -3,130 | 1058 |
| 6 | BUY fire_1@9,8 BUY fire_1@8,9 END_PLACE MOVE 8,8→8,2 MOVE 8,2→7,1 END_ACTION | `9abbd1cf` | yes | BUY fire_1@9,8 BUY fire_1@8,9 BUY lightning_1@9,9 MOVE 8,8→8,2 MOVE 8,2→7,2 END_ACTION | `6ff0bbbc` | yes | -5,544 | -2,605 | 2,939 | -1,348 | 2327 |
| 7 | BUY water_1@9,9 END_PLACE MOVE 9,8→6,5 MOVE 9,9→9,8 END_ACTION | `48025321` | yes | BUY water_1@9,9 END_PLACE MOVE 9,8→6,5 MOVE 6,5→5,5 END_ACTION | `11670f72` | yes | -3,332 | -4,632 | -1,300 | -1,304 | 2326 |
| 8 | BUY water_1@9,9 END_PLACE MOVE 8,9→1,8 END_ACTION | `7eb02f45` | yes | BUY water_1@9,9 END_PLACE MOVE 8,9→1,8 END_ACTION | `7eb02f45` | yes | -3,311 | -3,311 | 0 | -4,579 | 1354 |
| 9 | END_PLACE MOVE 9,8→6,8 ATK 6,8→5,8 END_ACTION | `bb6f21d9` | yes | END_PLACE MOVE 9,8→6,8 ATK 6,8→5,8 END_ACTION | `bb6f21d9` | yes | -4,300 | -4,300 | 0 | -4,395 | 1313 |
| 10 | BUY fire_1@8,8 BUY fire_1@7,8 END_PLACE ATK 8,8→8,7 MOVE 6,8→6,5 END_ACTION | `70bc3e4e` | yes | BUY fire_1@8,8 END_PLACE ATK 8,8→8,7 END_ACTION | `011724eb` | yes | -3,584 | -2,988 | 596 | -1,218 | 1918 |
| 11 | BUY fire_1@8,9 BUY fire_1@7,9 END_PLACE MOVE 7,9→2,8 MOVE 8,8→8,6 END_ACTION | `79eda59e` | yes | BUY fire_1@8,9 BUY fire_1@9,8 END_PLACE MOVE 8,8→4,4 END_ACTION | `737f8304` | yes | -1,501 | -1,917 | -416 | 1,236 | 2898 |
| 12 | BUY lightning_1@5,8 END_PLACE MOVE 5,8→5,3 ATK 5,3→6,3 END_ACTION | `2e0eae5d` | yes | BUY lightning_1@5,8 END_PLACE MOVE 5,8→5,3 ATK 5,3→6,3 END_ACTION | `2e0eae5d` | yes | -1,184 | -1,184 | 0 | 760 | 3005 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 1 (the seat's turn #1).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 06224d06804b9543 IS among the 18 candidates at this root; the engine played 2614e16efa84f176 instead, worth -1793 cc to the adviser against -1471 cc. root exposure: 18 candidate(s) from a `completed-depth` list, 18 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and scored it -438 cc, ABOVE the played candidate #0 at -2255 cc — so this re-run did not play what the seat played (it chose candidate #1 at -438 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 6 (the seat's turn #6).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 6ff0bbbc7a306ff1 IS among the 25 candidates at this root; the engine played 9abbd1cf6ad85ba3 instead, worth -5544 cc to the adviser against -2605 cc. root exposure: 25 candidate(s) from a `completed-depth` list, 25 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #18) and scored it -1348 cc, ABOVE the played candidate #0 at -1829 cc — so this re-run did not play what the seat played (it chose candidate #18 at -1348 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_528210 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

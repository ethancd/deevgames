# Replay analysis — e1-g4-s30_3_81-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s30`. The game ended home-checkmate for white after 28 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 323 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,8 END_ACTION | `0a4c4d6c` | yes | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,8 END_ACTION | `0a4c4d6c` | yes | 617 | 617 | 0 | 866 | 1892 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→7,7 MOVE 7,9→8,8 ATK 8,8→8,7 END_ACTION | `fc96efa0` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→7,7 MOVE 7,9→8,8 ATK 8,8→8,7 END_ACTION | `fc96efa0` | yes | 300 | 300 | 0 | 2,553 | 1298 |
| 3 | BUY fire_1@8,9 BUY fire_1@7,9 BUY fire_1@8,7 MOVE 8,7→6,5 ATK 6,5→6,6 MOVE 9,7→9,6 END_ACTION | `afdebf17` | yes | BUY fire_1@8,9 BUY fire_1@7,9 BUY fire_1@8,7 MOVE 8,7→6,5 ATK 6,5→6,6 MOVE 7,7→7,4 END_ACTION | `60c0433f` | yes | 2,787 | 2,745 | -42 | 2,632 | 2810 |
| 4 | BUY fire_1@8,7 BUY fire_1@7,8 PROMOTE 7,7 MOVE 7,7→0,0 END_ACTION | `2877fad9` | yes | BUY fire_1@8,7 BUY fire_1@7,8 END_PLACE MOVE 7,8→5,4 ATK 5,4→5,5 END_ACTION | `26be63e1` | yes | -705 | 2,971 | 3,676 | 3,691 | 2619 |
| 5 | BUY fire_1@9,7 END_PLACE MOVE 8,7→7,2 MOVE 9,7→7,7 END_ACTION | `8824c4de` | yes | BUY fire_1@9,7 END_PLACE MOVE 8,7→7,2 MOVE 9,7→7,7 END_ACTION | `8824c4de` | yes | 1,557 | 1,557 | 0 | 2,157 | 2301 |
| 6 | BUY lightning_1@8,7 END_PLACE MOVE 8,7→7,2 ATK 7,2→6,2 END_ACTION | `2ea2204e` | yes | BUY fire_1@8,7 BUY fire_1@9,7 END_PLACE MOVE 8,7→7,2 ATK 7,2→6,2 END_ACTION | `09354bcb` | yes | 247 | 406 | 159 | 1,407 | 1786 |
| 7 | BUY fire_1@9,7 END_PLACE MOVE 7,8→6,5 MOVE 7,7→4,6 END_ACTION | `abacafe6` | yes | BUY fire_1@9,7 END_PLACE MOVE 7,8→6,5 MOVE 7,7→4,6 END_ACTION | `abacafe6` | yes | -1,751 | -1,751 | 0 | 1,678 | 2529 |
| 8 | END_PLACE MOVE 9,7→9,6 ATK 9,6→9,5 END_ACTION | `1fdeb4ca` | yes | END_PLACE MOVE 7,9→7,4 ATK 7,4→6,4 END_ACTION | `037bc4ed` | yes | -781 | -2,558 | -1,777 | -569 | 1867 |
| 9 | END_PLACE MOVE 9,8→2,7 END_ACTION | `1721e50f` | yes | BUY lightning_1@9,7 PROMOTE 9,6 END_PLACE MOVE 9,7→4,1 END_ACTION | `29c2138b` | yes | -6,168 | -4,448 | 1,720 | 42 | 2960 |
| 10 | BUY fire_1@8,9 BUY fire_1@9,7 BUY lightning_1@9,8 END_PLACE ATK 8,9→7,9 MOVE 9,6→7,2 END_ACTION | `5f451e63` | yes | BUY fire_1@8,9 BUY fire_1@9,7 BUY lightning_1@9,8 END_PLACE ATK 8,9→7,9 MOVE 9,6→7,2 END_ACTION | `5f451e63` | yes | -2,771 | -2,771 | 0 | -12 | 3001 |
| 11 | BUY water_1@8,9 END_PLACE ATK 8,9→7,9 MOVE 9,7→4,6 END_ACTION | `5cc5beaf` | yes | BUY fire_1@8,9 END_PLACE ATK 8,9→7,9 MOVE 9,7→4,6 END_ACTION | `24bcf2d6` | yes | -3,597 | -1,703 | 1,894 | -41 | 3002 |
| 12 | END_PLACE MOVE 9,8→2,5 END_ACTION | `ce4584f7` | yes | END_PLACE MOVE 9,8→2,5 END_ACTION | `ce4584f7` | yes | -5,749 | -5,749 | 0 | -789 | 3012 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 4 (the seat's turn #4).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 26be63e16f2bc759 IS among the 27 candidates at this root; the engine played 2877fad95868594a instead, worth -705 cc to the adviser against 2971 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #17) and scored it 3368 cc, ABOVE the played candidate #0 at -446 cc — so this re-run did not play what the seat played (it chose candidate #24 at 3691 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 4 (the seat's turn #4).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 26be63e16f2bc759 IS among the 27 candidates at this root; the engine played 2877fad95868594a instead, worth -705 cc to the adviser against 2971 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #17) and scored it 3368 cc, ABOVE the played candidate #0 at -446 cc — so this re-run did not play what the seat played (it chose candidate #24 at 3691 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_548772 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

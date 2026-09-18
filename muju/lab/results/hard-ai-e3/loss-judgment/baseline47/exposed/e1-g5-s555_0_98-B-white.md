# Replay analysis — e1-g5-s555_0_98-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s555`. The game ended home-checkmate for white after 29 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 310 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `ebf0bfca` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `ebf0bfca` | yes | 59 | 59 | 0 | -1,102 | 3020 |
| 2 | BUY fire_1@9,8 BUY fire_1@8,9 ATK 9,8→8,8 MOVE 9,7→8,8 MOVE 9,8→9,6 END_ACTION | `0f2a05c7` | yes | BUY water_1@9,8 MOVE 9,7→8,7 ATK 8,7→8,8 ATK 9,8→8,8 END_ACTION | `e01d7331` | yes | -452 | 456 | 908 | 991 | 1016 |
| 3 | BUY fire_1@9,7 END_PLACE ATK 9,7→8,7 MOVE 9,6→7,2 END_ACTION | `5121c430` | yes | BUY fire_1@9,7 BUY plant_1@9,8 ATK 9,7→8,7 MOVE 9,6→6,5 MOVE 6,5→5,4 END_ACTION | `78fb02b8` | yes | -1,796 | -967 | 829 | 329 | 1945 |
| 4 | BUY fire_1@9,8 PROMOTE 9,7 END_PLACE MOVE 8,8→8,7 MOVE 9,7→5,5 END_ACTION | `0d63529c` | yes | BUY water_1@9,8 END_PLACE MOVE 8,8→7,8 MOVE 9,7→5,5 END_ACTION | `2a845334` | yes | -2,938 | -2,249 | 689 | -517 | 2439 |
| 5 | BUY fire_1@8,8 BUY water_1@9,7 END_PLACE MOVE 8,8→4,6 MOVE 8,7→7,7 END_ACTION | `45b46c6d` | yes | BUY fire_1@9,7 BUY water_1@8,8 END_PLACE MOVE 9,7→4,6 MOVE 8,7→8,6 END_ACTION | `60af654e` | yes | -2,321 | -1,928 | 393 | 473 | 2904 |
| 6 | BUY lightning_1@8,7 END_PLACE MOVE 8,7→6,1 ATK 6,1→5,1 END_ACTION | `f469de0d` | yes | BUY fire_1@7,8 BUY fire_1@8,8 END_PLACE MOVE 7,8→4,3 END_ACTION | `9751a4de` | yes | -3,414 | -2,343 | 1,071 | -1,121 | 2641 |
| 7 | PROMOTE 7,9 END_PLACE MOVE 8,9→5,6 MOVE 9,7→9,6 END_ACTION | `ad065727` | yes | PROMOTE 7,9 END_PLACE MOVE 8,9→5,6 ATK 5,6→5,7 END_ACTION | `71091299` | yes | -2,599 | -1,396 | 1,203 | -1,048 | 3013 |
| 8 | BUY fire_1@9,8 BUY fire_1@8,9 PROMOTE 7,9 END_PLACE ATK 9,8→8,8 MOVE 7,9→2,8 END_ACTION | `3c6a5801` | yes | BUY fire_1@9,8 BUY fire_1@8,9 PROMOTE 7,9 END_PLACE ATK 9,8→8,8 MOVE 7,9→2,8 END_ACTION | `3c6a5801` | yes | -2,542 | -2,542 | 0 | 30 | 3001 |
| 9 | BUY fire_1@2,9 END_PLACE MOVE 2,9→1,5 ATK 1,5→1,4 END_ACTION | `013af034` | yes | BUY fire_1@8,8 BUY fire_1@3,8 BUY fire_1@2,9 END_PLACE ATK 2,8→2,7 ATK 8,8→8,7 MOVE 9,6→9,5 MOVE 3,8→2,7 END_ACTION | `0c640db1` | yes | -1,760 | -113 | 1,647 | 1,803 | 3008 |
| 10 | BUY fire_1@9,8 BUY lightning_1@9,7 END_PLACE ATK 9,8→8,8 MOVE 9,7→4,3 END_ACTION | `fbe30f73` | yes | BUY fire_1@9,8 END_PLACE ATK 9,8→8,8 END_ACTION | `c80e2b36` | yes | -3,597 | -2,354 | 1,243 | -735 | 1018 |
| 11 | BUY fire_1@9,7 BUY water_1@9,8 ATK 9,8→8,8 MOVE 2,8→2,7 MOVE 9,6→9,5 MOVE 9,7→8,6 END_ACTION | `f205e3a0` | yes | BUY fire_1@9,7 BUY water_1@9,8 ATK 9,8→8,8 MOVE 2,8→2,7 MOVE 9,6→9,5 MOVE 9,7→8,6 END_ACTION | `f205e3a0` | yes | -611 | -611 | 0 | 530 | 1505 |
| 12 | BUY fire_1@3,7 BUY fire_1@2,8 MOVE 2,7→3,4 MOVE 3,7→1,7 ATK 1,7→0,7 END_ACTION | `e1134687` | yes | BUY fire_1@3,7 BUY fire_1@2,8 ATK 3,7→3,6 MOVE 3,7→3,4 MOVE 2,8→1,7 END_ACTION | `d2daeea5` | yes | -134 | 326 | 460 | 2,369 | 853 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key e01d73313d10ec50 IS among the 27 candidates at this root; the engine played 0f2a05c79b8e0371 instead, worth -452 cc to the adviser against 456 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and did not prefer it: its score 991 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 9 (the seat's turn #9).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 0c640db123354e09 IS among the 36 candidates at this root; the engine played 013af03495e7191d instead, worth -1760 cc to the adviser against -113 cc. root exposure: 36 candidate(s) from a `completed-depth` list, 36 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #22) and scored it 888 cc, ABOVE the played candidate #0 at -1307 cc — so this re-run did not play what the seat played (it chose candidate #27 at 1803 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_703241 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

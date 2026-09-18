# Replay analysis — e1-g4-s430_0_36-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s430`. The game ended elimination for white after 29 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 309 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `4e7bf223` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `4e7bf223` | yes | 85 | 85 | 0 | -1,050 | 3020 |
| 2 | BUY water_1@9,8 MOVE 9,7→8,7 ATK 8,7→8,8 ATK 9,8→8,8 END_ACTION | `3d963278` | yes | BUY water_1@9,8 MOVE 9,7→8,7 ATK 8,7→8,8 ATK 9,8→8,8 END_ACTION | `3d963278` | yes | 18 | 18 | 0 | 362 | 1969 |
| 3 | BUY water_1@8,9 END_PLACE MOVE 7,9→7,8 ATK 7,8→7,7 MOVE 7,8→7,7 MOVE 9,8→8,8 END_ACTION | `801de599` | yes | BUY water_1@8,9 END_PLACE MOVE 7,9→7,8 ATK 7,8→7,7 MOVE 7,8→7,7 MOVE 9,8→8,8 END_ACTION | `801de599` | yes | 889 | 889 | 0 | 1,872 | 2281 |
| 4 | BUY fire_1@9,8 BUY fire_1@8,7 BUY fire_1@9,7 END_PLACE ATK 8,7→8,6 MOVE 8,7→6,5 MOVE 6,5→5,4 END_ACTION | `ad51e932` | yes | BUY lightning_1@7,8 END_PLACE MOVE 7,8→4,3 ATK 4,3→3,3 END_ACTION | `45d1aaa9` | yes | 1,638 | 922 | -716 | 1,284 | 1613 |
| 5 | BUY fire_1@8,7 END_PLACE MOVE 8,7→6,5 MOVE 7,7→7,8 ATK 7,8→6,8 END_ACTION | `5c19ebbd` | yes | BUY fire_1@7,8 BUY fire_1@7,9 PROMOTE 7,7 END_PLACE ATK 7,8→6,8 MOVE 7,7→7,6 MOVE 7,8→6,5 END_ACTION | `35e4e420` | yes | 1,925 | 2,478 | 553 | 2,252 | 2813 |
| 6 | BUY lightning_1@7,9 END_PLACE MOVE 9,7→6,5 ATK 6,5→6,6 END_ACTION | `03562db8` | yes | END_PLACE MOVE 9,7→6,5 ATK 6,5→6,6 END_ACTION | `67768d14` | yes | 128 | 1,566 | 1,438 | 1,141 | 2520 |
| 7 | END_PLACE MOVE 7,9→6,5 ATK 6,5→5,5 END_ACTION | `bb4d202c` | yes | PROMOTE 7,8 END_PLACE MOVE 7,8→7,6 MOVE 8,8→8,7 END_ACTION | `2c88c22d` | yes | 896 | 1,517 | 621 | 1,615 | 1427 |
| 8 | BUY fire_1@7,9 END_PLACE MOVE 7,9→4,4 END_ACTION | `d0bb954b` | yes | BUY lightning_1@7,9 END_PLACE MOVE 7,9→1,4 END_ACTION | `fdf3dc19` | yes | -770 | 1,032 | 1,802 | 1,764 | 2564 |
| 9 | BUY lightning_1@7,9 END_PLACE MOVE 9,8→4,5 END_ACTION | `b2e86d16` | yes | BUY lightning_1@7,9 END_PLACE MOVE 9,8→4,5 END_ACTION | `b2e86d16` | yes | -1,594 | -1,594 | 0 | -1,865 | 2606 |
| 10 | BUY lightning_1@9,8 PROMOTE 7,9 END_PLACE MOVE 7,9→1,3 ATK 1,3→1,2 END_ACTION | `2fc4c468` | yes | BUY lightning_1@9,8 PROMOTE 7,9 END_PLACE MOVE 7,9→3,1 ATK 3,1→2,1 END_ACTION | `b281253a` | yes | -4,320 | -2,750 | 1,570 | -731 | 2834 |
| 11 | BUY fire_1@7,9 BUY lightning_1@9,8 END_PLACE ATK 9,8→9,7 MOVE 7,8→7,6 MOVE 7,6→7,5 END_ACTION | `1a974db3` | yes | BUY fire_1@7,9 BUY shadow_1@9,8 PROMOTE 7,8 END_PLACE ATK 9,8→9,7 MOVE 7,8→7,6 MOVE 7,6→7,5 END_ACTION | `3f20fad6` | yes | -2,535 | -571 | 1,964 | 500 | 2898 |
| 12 | BUY fire_1@7,6 END_PLACE MOVE 7,6→4,5 ATK 4,5→3,5 END_ACTION | `920d3f15` | yes | BUY fire_1@7,9 BUY fire_1@8,5 BUY fire_1@9,5 BUY fire_1@7,6 PROMOTE 7,5 ATK 7,9→6,9 MOVE 7,5→7,2 END_ACTION | `946dd231` | yes | -2,568 | 1,530 | 4,098 | 2,520 | 2927 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 5 (the seat's turn #5).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 35e4e420e59263c3 IS among the 28 candidates at this root; the engine played 5c19ebbd189ab2fe instead, worth 1925 cc to the adviser against 2478 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #5) and did not prefer it: its score 2252 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 12 (the seat's turn #12).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 946dd2313e3e0438 IS among the 30 candidates at this root; the engine played 920d3f15dc7f4de9 instead, worth -2568 cc to the adviser against 1530 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #16) and scored it 2066 cc, ABOVE the played candidate #3 at 343 cc — so this re-run did not play what the seat played (it chose candidate #13 at 2520 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_533821 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

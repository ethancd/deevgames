# Replay analysis — g3-s45_0_10-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g3-s45`. The game ended elimination for white after 22 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 263 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `41367e19` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `41367e19` | yes | -236 | -236 | 0 | 1,371 | 3002 |
| 2 | BUY fire_1@9,8 BUY fire_1@8,9 ATK 9,8→8,8 MOVE 9,7→8,8 MOVE 9,8→9,6 END_ACTION | `1dfcbf33` | yes | BUY fire_1@9,8 BUY fire_1@8,9 ATK 9,8→8,8 MOVE 9,7→8,8 MOVE 9,8→9,6 END_ACTION | `1dfcbf33` | yes | 359 | 359 | 0 | 1,930 | 1071 |
| 3 | BUY fire_1@9,7 END_PLACE ATK 9,7→8,7 END_ACTION | `3e6fb01b` | yes | BUY fire_1@9,7 BUY plant_1@9,8 ATK 9,7→8,7 MOVE 9,6→6,5 MOVE 6,5→5,4 END_ACTION | `894a015a` | yes | 150 | 628 | 478 | 572 | 1742 |
| 4 | PROMOTE 9,6 END_PLACE MOVE 9,6→5,5 ATK 5,5→5,6 END_ACTION | `bb954ebf` | yes | END_PLACE MOVE 9,6→6,6 ATK 6,6→5,6 END_ACTION | `6db04b68` | yes | 600 | 867 | 267 | 710 | 3014 |
| 5 | END_PLACE MOVE 5,5→0,2 END_ACTION | `17b1f8bd` | yes | BUY fire_1@9,8 BUY fire_1@6,5 BUY fire_1@7,5 BUY fire_1@9,5 END_PLACE MOVE 8,8→8,7 MOVE 7,5→7,1 MOVE 5,5→5,3 END_ACTION | `8b256aa0` | yes | -2,420 | 3,801 | 6,221 | 4,287 | 3024 |
| 6 | BUY water_1@9,8 END_PLACE MOVE 8,8→7,8 MOVE 9,7→5,5 END_ACTION | `298fd506` | yes | BUY water_1@9,8 END_PLACE MOVE 8,8→7,8 MOVE 9,7→5,5 END_ACTION | `298fd506` | yes | 1,112 | 1,112 | 0 | -214 | 2687 |
| 7 | BUY fire_1@8,8 END_PLACE MOVE 8,8→1,7 END_ACTION | `0752beab` | yes | END_PLACE MOVE 8,9→8,1 END_ACTION | `9913549d` | yes | -1,346 | -523 | 823 | 985 | 2341 |
| 8 | BUY fire_1@8,8 END_PLACE MOVE 8,8→7,2 END_ACTION | `2434e516` | yes | BUY lightning_1@8,8 END_PLACE MOVE 8,8→5,2 ATK 5,2→4,2 END_ACTION | `af18fc20` | yes | 1,381 | 873 | -508 | 1,018 | 2571 |
| 9 | BUY fire_1@8,8 END_PLACE MOVE 8,8→8,2 MOVE 7,8→6,8 END_ACTION | `25def922` | yes | BUY lightning_1@8,8 END_PLACE MOVE 8,8→2,7 ATK 2,7→2,8 END_ACTION | `571081bf` | yes | 1,283 | 948 | -335 | 3,668 | 3008 |
| 10 | BUY lightning_1@8,8 END_PLACE MOVE 8,8→8,2 ATK 8,2→7,2 END_ACTION | `4e055905` | yes | BUY fire_1@7,8 BUY fire_1@6,9 END_PLACE MOVE 6,9→1,8 ATK 1,8→2,8 END_ACTION | `2db0c1f9` | yes | 2,028 | 1,602 | -426 | 4,701 | 3006 |
| 11 | BUY lightning_1@7,8 END_PLACE MOVE 7,8→5,2 ATK 5,2→4,2 END_ACTION | `5cead6ea` | yes | BUY fire_1@8,8 BUY fire_1@6,9 END_PLACE MOVE 8,8→8,2 ATK 8,2→7,2 END_ACTION | `7aa7addb` | yes | 905 | 1,316 | 411 | 4,381 | 1076 |
| 12 | PROMOTE 7,9 END_PLACE MOVE 8,9→8,1 END_ACTION | `b0d564ba` | yes | END_PLACE MOVE 8,9→5,6 MOVE 9,8→9,7 END_ACTION | `5d142b92` | yes | 5,280 | 6,526 | 1,246 | 6,768 | 2059 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 894a015ae2725072 IS among the 27 candidates at this root; the engine played 3e6fb01b37ad8739 instead, worth 150 cc to the adviser against 628 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #4) and did not prefer it: its score 572 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 5 (the seat's turn #5).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 8b256aa0274af113 IS among the 30 candidates at this root; the engine played 17b1f8bd6704acc8 instead, worth -2420 cc to the adviser against 3801 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #20) and scored it 4287 cc, ABOVE the played candidate #0 at 2057 cc — so this re-run did not play what the seat played (it chose candidate #20 at 4287 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_644489 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

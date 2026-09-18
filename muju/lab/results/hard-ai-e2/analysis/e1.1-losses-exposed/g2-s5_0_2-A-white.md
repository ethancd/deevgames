# Replay analysis — g2-s5_0_2-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g2-s5`. The game ended upkeep-elimination for black after 28 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 299 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY water_1@0,0 MOVE 3,0→5,5 END_ACTION | `0ea685ce` | yes | BUY water_1@0,0 MOVE 3,0→5,5 END_ACTION | `0ea685ce` | yes | 1,143 | 1,143 | 0 | 1,020 | 3016 |
| 3 | BUY lightning_1@1,0 END_PLACE MOVE 0,1→0,2 MOVE 1,0→1,3 ATK 1,3→0,3 END_ACTION | `78df703a` | yes | BUY lightning_1@1,0 END_PLACE MOVE 0,1→0,2 MOVE 1,0→1,3 ATK 1,3→0,3 END_ACTION | `78df703a` | yes | 1,244 | 1,244 | 0 | 1,484 | 2112 |
| 4 | BUY fire_1@1,0 BUY fire_1@1,2 BUY fire_1@0,3 PROMOTE 1,3 MOVE 0,3→2,7 MOVE 1,3→0,3 END_ACTION | `56420de6` | yes | BUY fire_1@1,0 BUY fire_1@1,2 BUY fire_1@0,1 END_PLACE MOVE 1,2→7,2 MOVE 1,1→2,1 END_ACTION | `518a7d4f` | yes | -1,005 | 1,743 | 2,748 | 3,934 | 2633 |
| 5 | PROMOTE 0,3 MOVE 0,3→9,8 ATK 9,8→9,9 END_ACTION | `75d9d0eb` | yes | PROMOTE 0,3 MOVE 0,3→9,8 MOVE 1,1→2,1 END_ACTION | `c5bb9770` | yes | -1,357 | 1,525 | 2,882 | -342 | 2516 |
| 6 | END_PLACE MOVE 1,1→2,3 ATK 2,3→2,2 END_ACTION | `0f42d046` | yes | BUY fire_1@0,1 END_PLACE MOVE 1,1→2,3 ATK 2,3→2,2 END_ACTION | `b165c869` | yes | 875 | 887 | 12 | 1,878 | 3003 |
| 7 | BUY fire_1@2,0 BUY fire_1@2,1 BUY fire_1@2,2 MOVE 2,2→4,5 ATK 4,5→4,4 END_ACTION | `0c68198a` | yes | BUY fire_1@2,0 BUY fire_1@2,1 BUY fire_1@2,2 MOVE 2,2→4,5 ATK 4,5→4,4 END_ACTION | `0c68198a` | yes | 2,586 | 2,586 | 0 | 2,640 | 2615 |
| 8 | BUY shadow_1@2,2 END_PLACE MOVE 2,2→5,4 ATK 5,4→5,5 END_ACTION | `0a40cfad` | yes | BUY shadow_1@2,2 END_PLACE MOVE 2,2→5,4 ATK 5,4→5,5 END_ACTION | `0a40cfad` | yes | 2,521 | 2,521 | 0 | 3,187 | 3005 |
| 9 | BUY fire_1@3,4 BUY fire_1@4,4 ATK 3,4→3,5 MOVE 2,3→2,2 MOVE 0,2→0,4 END_ACTION | `cf35aa55` | yes | BUY fire_1@3,4 BUY fire_1@4,4 ATK 3,4→3,5 MOVE 2,3→2,2 MOVE 0,2→0,4 END_ACTION | `cf35aa55` | yes | 6,051 | 6,051 | 0 | 6,252 | 3005 |
| 10 | BUY fire_1@3,4 BUY fire_1@5,3 PROMOTE 4,4 ATK 3,4→3,5 MOVE 5,4→8,7 END_ACTION | `77ef158e` | yes | BUY fire_1@3,4 BUY fire_1@5,3 BUY fire_1@4,3 ATK 3,4→3,5 MOVE 2,1→8,1 END_ACTION | `6279e746` | yes | 5,384 | 3,803 | -1,581 | 6,702 | 875 |
| 11 | END_PLACE MOVE 4,4→7,7 ATK 7,7→7,8 END_ACTION | `e54e90d6` | yes | END_PLACE MOVE 4,4→7,7 ATK 7,7→7,8 END_ACTION | `e54e90d6` | yes | 6,243 | 6,243 | 0 | 7,382 | 934 |
| 12 | BUY fire_1@4,3 PROMOTE 2,1 END_PLACE MOVE 4,3→7,5 MOVE 0,4→0,5 END_ACTION | `d1c53e15` | yes | BUY fire_1@4,3 PROMOTE 2,1 END_PLACE MOVE 4,3→7,5 MOVE 0,4→0,5 END_ACTION | `d1c53e15` | yes | 2,362 | 2,362 | 0 | 6,062 | 1410 |
| 13 | PROMOTE 1,0 END_PLACE MOVE 2,1→4,5 ATK 4,5→4,4 END_ACTION | `4462da90` | yes | BUY fire_1@0,3 BUY fire_1@1,2 PROMOTE 2,0 MOVE 0,5→2,7 END_ACTION | `3f8edc21` | yes | 2,677 | 4,358 | 1,681 | 4,726 | 1252 |
| 14 | BUY fire_1@0,1 END_PLACE MOVE 0,5→1,8 END_ACTION | `5c71f94b` | yes | BUY fire_1@0,3 BUY fire_1@1,2 END_PLACE MOVE 0,5→1,8 END_ACTION | `6e3e8618` | yes | 2,546 | -1,064 | -3,610 | 2,921 | 2804 |
| 15 | BUY fire_1@1,6 END_PLACE MOVE 1,6→5,6 ATK 5,6→6,6 END_ACTION | `fcae8db6` | yes | BUY fire_1@2,0 END_PLACE ATK 2,0→3,0 END_ACTION | `3e1fe58f` | yes | -478 | 539 | 1,017 | 3,888 | 1921 |
| 16 | BUY lightning_1@1,5 END_PLACE MOVE 1,5→6,5 ATK 6,5→6,6 END_ACTION | `c62e47c1` | yes | BUY lightning_1@1,5 END_PLACE MOVE 1,5→6,5 ATK 6,5→6,6 END_ACTION | `c62e47c1` | yes | 2,202 | 2,202 | 0 | 3,452 | 1148 |
| 17 | BUY fire_1@1,3 END_PLACE MOVE 1,3→6,3 ATK 6,3→7,3 END_ACTION | `9cf6213e` | yes | BUY fire_1@1,7 BUY fire_1@1,3 BUY fire_1@0,6 MOVE 1,8→2,8 MOVE 1,0→4,3 END_ACTION | `ddd463ac` | yes | 4,383 | 3,701 | -682 | 5,759 | 1251 |
| 18 | BUY fire_1@1,7 BUY fire_1@1,3 PROMOTE 0,0 MOVE 1,8→2,8 MOVE 1,3→5,5 END_ACTION | `f31bd7f0` | yes | BUY fire_1@1,7 BUY fire_1@1,5 PROMOTE 0,0 MOVE 1,8→2,8 MOVE 1,5→5,5 MOVE 0,1→1,2 END_ACTION | `3eba01dc` | yes | 3,228 | 2,353 | -875 | 6,047 | 1218 |
| 19 | PROMOTE 0,1 ATK 2,8→2,7 MOVE 0,1→0,3 MOVE 0,3→1,4 END_ACTION | `78dc7c7e` | yes | END_PLACE ATK 2,8→2,7 MOVE 0,1→0,3 MOVE 0,3→1,4 END_ACTION | `1cb8f83c` | yes | -1,280 | -937 | 343 | -202 | 1322 |
| 20 | PROMOTE 2,8 MOVE 2,8→2,7 MOVE 0,0→1,0 END_ACTION | `52036533` | yes | PROMOTE 2,8 MOVE 2,8→2,7 MOVE 2,7→1,7 MOVE 0,0→1,0 END_ACTION | `e5240551` | yes | -7,082 | -6,518 | 564 | -5,096 | 1682 |
| 21 | BUY fire_1@0,0 ATK 0,0→0,1 MOVE 0,0→2,4 END_ACTION | `f294db81` | yes | END_PLACE MOVE 1,0→1,1 ATK 1,1→0,1 MOVE 1,1→1,0 END_ACTION | `9b17682a` | yes | -10,138 | -7,857 | 2,281 | -6,286 | 1381 |
| 22 | MOVE 1,0→1,1 ATK 1,1→0,1 MOVE 1,1→1,0 END_ACTION | `707e71d0` | yes | MOVE 1,0→1,1 ATK 1,1→0,1 MOVE 1,1→1,2 END_ACTION | `810c43bf` | yes | -13,091 | -9,806 | 3,285 | -9,583 | 1563 |
| 23 | MOVE 1,0→1,1 ATK 1,1→0,1 MOVE 1,1→1,2 END_ACTION | `2d7b6d78` | yes | MOVE 1,0→1,1 ATK 1,1→0,1 MOVE 1,1→1,2 END_ACTION | `2d7b6d78` | yes | -11,982 | -11,982 | 0 | -13,381 | 1071 |
| 24 | MOVE 1,2→1,0 ATK 1,0→0,0 END_ACTION | `bf7e085c` | yes | MOVE 1,2→1,0 ATK 1,0→0,0 END_ACTION | `bf7e085c` | yes | -996,000 | -996,000 | 0 | -995,000 | 1527 |
| 25 | ATK 1,0→0,0 MOVE 1,0→1,3 END_ACTION | `7ca025cd` | yes | ATK 1,0→0,0 MOVE 1,0→1,3 END_ACTION | `7ca025cd` | yes | -995,000 | -995,000 | 0 | -12,574 | 2204 |
| 26 | MOVE 1,3→1,0 ATK 1,0→0,0 END_ACTION | `60e11240` | yes | MOVE 1,3→1,0 ATK 1,0→0,0 END_ACTION | `60e11240` | yes | -997,000 | -997,000 | 0 | -996,000 | 1143 |
| 27 | ATK 1,0→0,0 MOVE 1,0→0,0 END_ACTION | `8c762b84` | yes | ATK 1,0→0,0 MOVE 1,0→0,0 END_ACTION | `8c762b84` | yes | -998,000 | -998,000 | 0 | -997,000 | 549 |
| 28 | UPKEEP(keep 0) | `28fb5b61` | yes | UPKEEP(keep 0) | `28fb5b61` | yes | -999,000 | -999,000 | 0 | -999,000 | 1 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 4 (the seat's turn #3).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 518a7d4f454b00a1 IS among the 27 candidates at this root; the engine played 56420de6104ff562 instead, worth -1005 cc to the adviser against 1743 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #24) and scored it 3934 cc, ABOVE the played candidate #0 at 1024 cc — so this re-run did not play what the seat played (it chose candidate #24 at 3934 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**strong-candidate-misjudged** at turn 22 (the seat's turn #21).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 810c43bf8bcdf5b4 IS among the 18 candidates at this root; the engine played 707e71d051ef9a61 instead, worth -13091 cc to the adviser against -9806 cc. root exposure: 18 candidate(s) from a `completed-depth` list, 18 searched, completed depth 4, cutoff at -1. The root searched the adviser's best turn (candidate #1) and scored it -9674 cc, below the played candidate #3 at -9583 cc

_1059190 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

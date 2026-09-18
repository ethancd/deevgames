# Replay analysis — e1-g5-s315_0_86-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s315`. The game ended elimination for black after 45 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 504 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY water_1@1,0 MOVE 4,0→5,5 ATK 5,5→5,4 END_ACTION | `5822c717` | yes | BUY water_1@0,1 MOVE 4,0→5,5 ATK 5,5→5,4 END_ACTION | `06e2ed5e` | yes | -1,615 | -1,191 | 424 | 2,052 | 2932 |
| 3 | BUY fire_1@2,0 BUY fire_1@1,1 BUY lightning_1@0,1 MOVE 2,1→2,2 MOVE 0,1→5,4 END_ACTION | `c0991d91` | yes | BUY fire_1@2,0 BUY fire_1@1,1 BUY lightning_1@0,1 MOVE 2,1→2,2 MOVE 0,1→5,4 END_ACTION | `c0991d91` | yes | 1,578 | 1,578 | 0 | 1,273 | 1806 |
| 4 | BUY fire_1@0,2 BUY fire_1@1,2 ATK 0,2→0,3 MOVE 1,2→2,7 END_ACTION | `d59120ef` | yes | BUY fire_1@0,2 BUY fire_1@1,2 ATK 0,2→0,3 MOVE 1,2→2,7 END_ACTION | `d59120ef` | yes | 3,234 | 3,234 | 0 | 3,409 | 1654 |
| 5 | BUY fire_1@2,5 BUY fire_1@1,7 BUY fire_1@0,1 MOVE 2,5→5,4 ATK 5,4→4,4 MOVE 2,2→2,3 END_ACTION | `ed2998df` | yes | BUY fire_1@1,7 BUY fire_1@0,1 BUY lightning_1@2,4 MOVE 2,2→1,2 MOVE 2,4→5,4 ATK 5,4→4,4 END_ACTION | `a096f9d1` | yes | 4,709 | 5,546 | 837 | 5,478 | 3005 |
| 6 | BUY lightning_1@2,4 END_PLACE MOVE 2,4→5,4 ATK 5,4→5,5 END_ACTION | `21f689ee` | yes | BUY lightning_1@2,4 END_PLACE MOVE 2,4→5,4 ATK 5,4→5,5 END_ACTION | `21f689ee` | yes | 4,714 | 4,714 | 0 | 4,664 | 2863 |
| 7 | BUY fire_1@1,2 BUY fire_1@0,3 BUY fire_1@1,3 BUY fire_1@1,4 PROMOTE 2,7 MOVE 1,4→6,5 MOVE 2,3→3,3 END_ACTION | `a0250133` | yes | BUY fire_1@1,2 BUY fire_1@0,3 BUY fire_1@1,3 BUY fire_1@1,4 PROMOTE 2,7 MOVE 1,4→6,5 MOVE 2,3→3,3 END_ACTION | `a0250133` | yes | 6,282 | 6,282 | 0 | 6,676 | 3004 |
| 8 | BUY fire_1@0,4 BUY fire_1@1,4 BUY fire_1@1,5 END_PLACE MOVE 1,4→6,5 ATK 6,5→5,5 END_ACTION | `326c79a8` | yes | BUY fire_1@0,4 BUY fire_1@1,4 BUY fire_1@0,5 END_PLACE MOVE 3,3→3,4 MOVE 0,5→2,7 ATK 2,7→3,7 END_ACTION | `5bd3c3d6` | yes | 3,907 | 5,957 | 2,050 | 8,120 | 3010 |
| 9 | BUY fire_1@1,4 BUY fire_1@0,5 PROMOTE 1,5 END_PLACE MOVE 1,5→2,8 ATK 2,8→2,7 MOVE 3,3→4,3 END_ACTION | `bb1c6b4a` | yes | BUY fire_1@1,4 BUY fire_1@0,5 BUY fire_1@2,1 END_PLACE MOVE 1,5→2,8 ATK 2,8→2,7 MOVE 3,3→3,4 END_ACTION | `aec8c207` | yes | 5,289 | 6,194 | 905 | 7,952 | 2302 |
| 10 | BUY fire_1@3,0 BUY fire_1@2,1 END_PLACE MOVE 0,5→2,8 ATK 2,8→2,7 END_ACTION | `1652cde8` | yes | BUY fire_1@3,0 BUY fire_1@2,1 PROMOTE 4,3 END_PLACE MOVE 0,5→2,8 ATK 2,8→2,7 END_ACTION | `b0a8eb5c` | yes | 5,591 | 5,138 | -453 | 7,564 | 3000 |
| 11 | END_PLACE MOVE 0,4→2,8 ATK 2,8→2,7 END_ACTION | `b3a7c561` | yes | END_PLACE MOVE 1,4→2,8 ATK 2,8→2,7 END_ACTION | `3343e42c` | yes | 4,520 | 4,715 | 195 | 5,663 | 3021 |
| 12 | BUY fire_1@3,1 PROMOTE 1,4 END_PLACE MOVE 1,4→2,8 ATK 2,8→2,7 END_ACTION | `89bf4652` | yes | BUY fire_1@0,4 BUY fire_1@4,1 PROMOTE 1,4 END_PLACE MOVE 0,4→2,8 ATK 2,8→2,7 END_ACTION | `95089486` | yes | 3,576 | 4,161 | 585 | 5,095 | 3004 |
| 13 | END_PLACE MOVE 4,3→4,4 MOVE 3,1→7,1 MOVE 1,3→1,5 END_ACTION | `4e9ef768` | yes | BUY fire_1@4,0 PROMOTE 3,1 END_PLACE MOVE 4,3→4,4 MOVE 1,3→1,7 MOVE 4,0→6,0 END_ACTION | `7dedf0aa` | yes | 1,471 | 2,705 | 1,234 | 3,694 | 3005 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #1).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 06e2ed5ebb3f00d1 IS among the 27 candidates at this root; the engine played 5822c717e9a5a3ab instead, worth -1615 cc to the adviser against -1191 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #2) and did not prefer it: its score 2052 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 8 (the seat's turn #7).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 5bd3c3d64c7fdbbe IS among the 28 candidates at this root; the engine played 326c79a8cf091823 instead, worth 3907 cc to the adviser against 5957 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #9) and scored it 8120 cc, ABOVE the played candidate #0 at 5664 cc — so this re-run did not play what the seat played (it chose candidate #9 at 8120 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_643489 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

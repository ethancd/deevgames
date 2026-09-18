# Replay analysis — e1-g4-s250_3_17-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s250`. The game ended elimination for white after 31 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 357 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,2 END_ACTION | `caf3fbf5` | yes | BUY fire_1@9,9 MOVE 8,9→7,2 END_ACTION | `caf3fbf5` | yes | 121 | 121 | 0 | 1,372 | 3001 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→4,4 END_ACTION | `21c6e86b` | yes | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→5,3 END_ACTION | `aba6b667` | yes | -647 | -754 | -107 | 1,268 | 2434 |
| 3 | BUY fire_1@9,8 BUY water_1@8,9 MOVE 8,8→8,6 ATK 8,6→9,6 MOVE 8,6→7,6 END_ACTION | `890b8106` | yes | BUY fire_1@9,8 BUY water_1@8,9 MOVE 8,8→8,6 ATK 8,6→9,6 MOVE 8,6→8,5 END_ACTION | `7127fc63` | yes | 863 | 1,240 | 377 | 1,466 | 1178 |
| 4 | BUY fire_1@7,9 BUY fire_1@9,6 END_PLACE MOVE 9,6→5,4 ATK 5,4→5,5 END_ACTION | `219b96e8` | yes | BUY fire_1@7,9 BUY fire_1@9,6 PROMOTE 7,6 MOVE 7,6→6,5 ATK 6,5→5,5 MOVE 6,5→5,5 END_ACTION | `06c47e52` | yes | 1,282 | 2,397 | 1,115 | 3,220 | 2999 |
| 5 | BUY fire_1@8,6 BUY fire_1@9,6 BUY fire_1@7,7 BUY fire_1@7,8 PROMOTE 7,6 MOVE 7,6→5,5 ATK 5,5→6,5 END_ACTION | `49a0204b` | yes | BUY fire_1@8,6 BUY fire_1@9,6 BUY fire_1@7,7 BUY fire_1@7,8 PROMOTE 7,6 MOVE 7,6→5,5 ATK 5,5→6,5 END_ACTION | `49a0204b` | yes | 4,958 | 4,958 | 0 | 4,544 | 2581 |
| 6 | BUY fire_1@8,7 BUY fire_1@8,8 BUY fire_1@7,5 MOVE 7,5→5,3 ATK 5,3→6,3 MOVE 5,5→4,5 END_ACTION | `36621411` | yes | BUY fire_1@8,7 BUY fire_1@8,8 BUY fire_1@7,5 MOVE 7,5→5,3 ATK 5,3→6,3 MOVE 5,5→4,5 END_ACTION | `36621411` | yes | 5,166 | 5,166 | 0 | 4,796 | 2484 |
| 7 | BUY fire_1@6,5 BUY fire_1@4,6 BUY fire_1@5,5 BUY fire_1@7,5 ATK 6,5→6,4 MOVE 8,6→7,1 END_ACTION | `374ea5a5` | yes | BUY fire_1@6,5 BUY fire_1@4,6 BUY fire_1@5,5 BUY fire_1@8,5 ATK 6,5→6,4 MOVE 9,6→8,1 END_ACTION | `d1cb7608` | yes | 4,653 | 4,795 | 142 | 5,366 | 3000 |
| 8 | BUY fire_1@8,5 BUY fire_1@9,5 BUY fire_1@6,6 END_PLACE MOVE 8,5→7,1 ATK 7,1→7,2 END_ACTION | `ee98427b` | yes | BUY lightning_1@4,7 END_PLACE MOVE 4,7→3,0 ATK 3,0→2,0 END_ACTION | `d8d709cc` | yes | 7,227 | 7,051 | -176 | 7,084 | 3012 |
| 9 | BUY fire_1@8,5 BUY fire_1@5,6 END_PLACE MOVE 7,7→1,7 MOVE 5,5→4,4 END_ACTION | `f11d1495` | yes | BUY fire_1@8,5 BUY fire_1@5,6 END_PLACE MOVE 7,7→1,7 MOVE 5,5→4,4 END_ACTION | `f11d1495` | yes | 5,937 | 5,937 | 0 | 10,200 | 3001 |
| 10 | BUY lightning_1@5,4 END_PLACE MOVE 5,4→0,0 END_ACTION | `7bfde5cf` | yes | END_PLACE MOVE 4,4→0,0 END_ACTION | `7c75bca1` | yes | 11,931 | 8,227 | -3,704 | 8,199 | 1723 |
| 11 | BUY fire_1@5,5 END_PLACE ATK 5,5→5,4 MOVE 7,5→7,1 MOVE 4,6→2,6 END_ACTION | `9cd84315` | yes | BUY fire_1@5,5 END_PLACE ATK 5,5→5,4 MOVE 7,5→7,1 MOVE 4,5→4,4 END_ACTION | `29b55420` | yes | 5,292 | 5,348 | 56 | 5,480 | 2067 |
| 12 | BUY fire_1@4,6 BUY fire_1@7,6 PROMOTE 4,5 END_PLACE MOVE 4,5→3,0 ATK 3,0→2,0 END_ACTION | `17157dbb` | yes | BUY fire_1@4,6 BUY fire_1@8,6 BUY fire_1@7,5 PROMOTE 4,5 END_PLACE MOVE 4,5→3,0 ATK 3,0→2,0 END_ACTION | `d45a7798` | yes | 3,098 | 6,090 | 2,992 | 6,732 | 1095 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 7127fc633b5c27fe IS among the 28 candidates at this root; the engine played 890b810619dbe899 instead, worth 863 cc to the adviser against 1240 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #8) and did not prefer it: its score 1466 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 12 (the seat's turn #12).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key d45a77982f1db135 IS among the 37 candidates at this root; the engine played 17157dbbfe3ad65b instead, worth 3098 cc to the adviser against 6090 cc. root exposure: 37 candidate(s) from a `completed-depth` list, 37 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #3) and scored it 6732 cc, ABOVE the played candidate #0 at 5842 cc — so this re-run did not play what the seat played (it chose candidate #3 at 6732 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_709625 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

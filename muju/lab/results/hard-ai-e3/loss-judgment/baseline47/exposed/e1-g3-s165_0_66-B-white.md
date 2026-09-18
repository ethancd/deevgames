# Replay analysis — e1-g3-s165_0_66-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g3-s165`. The game ended home-checkmate for white after 27 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 311 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `68650810` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `68650810` | yes | 902 | 902 | 0 | 1,488 | 3005 |
| 2 | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→3,5 MOVE 9,8→8,8 END_ACTION | `8617cdf6` | yes | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→4,4 MOVE 9,8→8,8 END_ACTION | `fb3637d3` | yes | -873 | -126 | 747 | -1,374 | 2401 |
| 3 | BUY fire_1@9,8 BUY fire_1@8,9 MOVE 8,8→5,5 MOVE 9,7→8,7 END_ACTION | `07e63e9c` | yes | BUY fire_1@8,9 END_PLACE MOVE 9,7→9,8 MOVE 8,8→7,5 ATK 7,5→7,6 END_ACTION | `ab3ce4b0` | yes | -2,378 | -1,178 | 1,200 | -826 | 2369 |
| 4 | PROMOTE 7,9 END_PLACE MOVE 8,9→7,2 END_ACTION | `5617f53f` | yes | END_PLACE MOVE 9,8→8,7 ATK 8,7→7,7 END_ACTION | `ed97a9d4` | yes | -5,151 | -2,678 | 2,473 | 1,077 | 2868 |
| 5 | BUY water_1@8,9 END_PLACE ATK 8,9→8,8 MOVE 7,9→7,7 END_ACTION | `40a5dd62` | yes | BUY water_1@8,9 END_PLACE ATK 8,9→8,8 MOVE 7,9→7,7 END_ACTION | `40a5dd62` | yes | -1,739 | -1,739 | 0 | -3,501 | 3001 |
| 6 | BUY water_1@9,9 END_PLACE ATK 9,9→9,8 MOVE 7,7→6,5 END_ACTION | `8852cc52` | yes | BUY water_1@9,9 END_PLACE ATK 9,9→9,8 MOVE 7,7→6,5 END_ACTION | `8852cc52` | yes | -16 | -16 | 0 | -965 | 3015 |
| 7 | BUY fire_1@7,5 BUY fire_1@8,8 BUY fire_1@9,5 ATK 7,5→7,4 MOVE 7,5→7,1 MOVE 6,5→5,5 END_ACTION | `0a0025d9` | yes | BUY fire_1@7,5 END_PLACE ATK 7,5→7,4 MOVE 7,5→7,1 MOVE 8,9→8,8 END_ACTION | `88c4f91a` | yes | 306 | 585 | 279 | 1,618 | 2945 |
| 8 | END_PLACE MOVE 5,5→4,5 MOVE 8,8→2,8 END_ACTION | `118a7c0d` | yes | BUY lightning_1@9,8 END_PLACE MOVE 5,5→4,5 MOVE 8,8→2,8 END_ACTION | `8d8c07ab` | yes | -295 | 886 | 1,181 | 975 | 3008 |
| 9 | BUY fire_1@4,6 BUY fire_1@6,5 BUY fire_1@9,8 BUY fire_1@8,8 MOVE 4,6→1,7 MOVE 6,5→7,2 END_ACTION | `69582eb9` | yes | BUY fire_1@4,6 BUY fire_1@6,5 BUY fire_1@9,8 END_PLACE MOVE 8,9→8,8 MOVE 4,6→2,8 ATK 2,8→3,8 END_ACTION | `e919cef6` | yes | 2,636 | 1,643 | -993 | 2,345 | 3000 |
| 10 | END_PLACE MOVE 8,9→8,8 ATK 8,8→7,8 MOVE 4,5→4,6 END_ACTION | `9f94dfb9` | yes | END_PLACE MOVE 8,9→8,8 ATK 8,8→7,8 MOVE 4,5→4,4 MOVE 4,4→5,4 END_ACTION | `71a68421` | yes | 1,970 | 2,849 | 879 | 3,366 | 3008 |
| 11 | BUY water_1@9,9 END_PLACE ATK 9,9→8,9 MOVE 4,6→4,4 MOVE 4,4→5,4 END_ACTION | `42a21048` | yes | BUY water_1@9,9 END_PLACE ATK 9,9→8,9 MOVE 4,6→4,4 MOVE 4,4→5,4 END_ACTION | `42a21048` | yes | 2,828 | 2,828 | 0 | 921 | 1042 |
| 12 | BUY fire_1@2,7 BUY fire_1@1,8 BUY lightning_1@6,5 ATK 5,4→4,4 MOVE 6,5→2,0 END_ACTION | `9778a636` | yes | BUY fire_1@2,7 BUY fire_1@1,8 BUY lightning_1@6,5 ATK 5,4→4,4 MOVE 6,5→2,0 END_ACTION | `9778a636` | yes | 7,577 | 7,577 | 0 | 7,692 | 1593 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key fb3637d321ff9593 IS among the 27 candidates at this root; the engine played 8617cdf679571323 instead, worth -873 cc to the adviser against -126 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 2, cutoff at -1. The root searched the adviser's best turn (candidate #3) and did not prefer it: its score -1374 cc is the chosen candidate #2's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 4 (the seat's turn #4).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key ed97a9d489e1393f IS among the 27 candidates at this root; the engine played 5617f53f50289c60 instead, worth -5151 cc to the adviser against -2678 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #16) and scored it -168 cc, ABOVE the played candidate #0 at -3175 cc — so this re-run did not play what the seat played (it chose candidate #14 at 1077 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_668626 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

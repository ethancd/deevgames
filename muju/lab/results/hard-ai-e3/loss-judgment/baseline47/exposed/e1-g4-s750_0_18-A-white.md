# Replay analysis — e1-g4-s750_0_18-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s750`. The game ended elimination for black after 27 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 306 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `7989ba64` | yes | END_ACTION | `7989ba64` | yes | 230 | 230 | 0 | 230 | 3000 |
| 2 | BUY water_1@0,0 MOVE 4,1→5,5 ATK 5,5→5,4 END_ACTION | `c2e21ffe` | yes | BUY water_1@1,0 MOVE 4,1→5,5 ATK 5,5→5,4 END_ACTION | `7d492daa` | yes | 1,275 | 515 | -760 | 1,802 | 2472 |
| 3 | BUY fire_1@1,1 BUY fire_1@0,2 BUY lightning_1@1,0 MOVE 1,2→2,2 MOVE 1,0→4,5 END_ACTION | `c8a1603f` | yes | BUY fire_1@1,1 BUY fire_1@0,2 BUY lightning_1@1,0 MOVE 1,2→2,2 MOVE 1,0→6,4 END_ACTION | `7bbfee33` | yes | 1,314 | 181 | -1,133 | 1,609 | 1289 |
| 4 | BUY fire_1@2,0 BUY fire_1@2,1 ATK 2,0→3,0 MOVE 2,1→8,1 END_ACTION | `531d6195` | yes | BUY fire_1@2,0 BUY lightning_1@2,1 ATK 2,0→3,0 MOVE 2,2→3,4 END_ACTION | `c96c8960` | yes | 2,155 | 2,738 | 583 | 2,727 | 2346 |
| 5 | BUY fire_1@6,0 BUY fire_1@7,1 BUY fire_1@1,0 MOVE 2,2→2,3 MOVE 6,0→5,5 END_ACTION | `d38f0ba3` | yes | BUY fire_1@7,1 BUY fire_1@1,0 BUY lightning_1@7,0 MOVE 2,2→3,4 ATK 3,4→4,4 END_ACTION | `8bf36cbe` | yes | 3,805 | 5,290 | 1,485 | 5,841 | 2923 |
| 6 | END_PLACE MOVE 2,3→3,3 ATK 3,3→3,2 MOVE 3,3→3,4 MOVE 8,1→7,2 END_ACTION | `4cb4da41` | yes | END_PLACE MOVE 2,3→3,3 ATK 3,3→3,2 MOVE 3,3→3,4 MOVE 8,1→7,2 END_ACTION | `4cb4da41` | yes | 4,936 | 4,936 | 0 | 4,655 | 1869 |
| 7 | BUY fire_1@6,0 BUY fire_1@7,0 BUY fire_1@2,1 BUY fire_1@6,1 PROMOTE 7,1 END_PLACE MOVE 7,0→8,1 MOVE 6,1→8,3 ATK 8,3→7,3 END_ACTION | `3a9721af` | yes | BUY fire_1@6,0 BUY fire_1@6,1 PROMOTE 7,1 END_PLACE MOVE 6,1→7,2 ATK 7,2→7,3 MOVE 6,0→8,2 END_ACTION | `f92c7b6b` | yes | 5,592 | 6,064 | 472 | 7,102 | 3006 |
| 8 | END_PLACE MOVE 3,4→4,4 ATK 4,4→5,4 END_ACTION | `ec071fbe` | yes | BUY fire_1@7,0 BUY fire_1@8,0 BUY fire_1@6,1 PROMOTE 6,0 MOVE 8,0→9,6 END_ACTION | `c46ceace` | yes | 4,742 | 6,401 | 1,659 | 7,715 | 2248 |
| 9 | BUY fire_1@7,0 PROMOTE 1,1 END_PLACE MOVE 6,0→6,5 MOVE 1,1→1,3 END_ACTION | `5fc3f662` | yes | END_PLACE MOVE 7,1→9,5 ATK 9,5→9,6 END_ACTION | `afc196a2` | yes | 5,985 | 6,476 | 491 | 8,261 | 2726 |
| 10 | BUY fire_1@8,0 BUY fire_1@6,1 PROMOTE 2,1 END_PLACE MOVE 6,1→6,5 MOVE 7,0→7,2 END_ACTION | `0712ddb0` | yes | END_PLACE MOVE 7,1→7,7 ATK 7,7→7,8 END_ACTION | `e10eac68` | yes | 6,012 | 8,317 | 2,305 | 8,920 | 2576 |
| 11 | BUY fire_1@6,2 PROMOTE 2,0 END_PLACE MOVE 0,2→1,7 MOVE 6,2→6,4 END_ACTION | `506a5319` | yes | BUY fire_1@6,2 PROMOTE 2,0 END_PLACE MOVE 2,1→2,7 MOVE 6,2→6,4 END_ACTION | `b94e80c1` | yes | 7,269 | 4,658 | -2,611 | 9,261 | 2984 |
| 12 | END_PLACE MOVE 8,1→8,7 END_ACTION | `c1edb04c` | yes | BUY shadow_1@6,2 END_PLACE MOVE 6,2→7,6 ATK 7,6→7,7 END_ACTION | `3d621fe4` | yes | 4,411 | 9,010 | 4,599 | 8,390 | 2362 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 4 (the seat's turn #4).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key c96c8960b49b5078 IS among the 27 candidates at this root; the engine played 531d6195bcdbad5c instead, worth 2155 cc to the adviser against 2738 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #8) and scored it 2727 cc, ABOVE the played candidate #0 at 2660 cc — so this re-run did not play what the seat played (it chose candidate #8 at 2727 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 12 (the seat's turn #12).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 3d621fe45cd1c6f8 IS among the 32 candidates at this root; the engine played c1edb04c685249fd instead, worth 4411 cc to the adviser against 9010 cc. root exposure: 32 candidate(s) from a `completed-depth` list, 32 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #1 (played) carry the same score 8390 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_584508 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

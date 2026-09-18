# Replay analysis — e1-g4-s250_0_16-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s250`. The game ended elimination for white after 36 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 392 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `b5cfac17` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `b5cfac17` | yes | -800 | -800 | 0 | -697 | 2570 |
| 2 | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→7,6 ATK 7,6→7,7 END_ACTION | `5440a63e` | yes | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→7,6 ATK 7,6→7,7 END_ACTION | `5440a63e` | yes | 870 | 870 | 0 | 2,448 | 1227 |
| 3 | BUY fire_1@8,8 BUY lightning_1@8,6 MOVE 9,7→9,8 MOVE 7,6→4,3 ATK 4,3→4,4 END_ACTION | `072ebeae` | yes | BUY fire_1@8,8 BUY lightning_1@8,6 MOVE 9,7→9,8 MOVE 7,6→3,4 ATK 3,4→4,4 END_ACTION | `249e8f73` | yes | -250 | 314 | 564 | 900 | 2493 |
| 4 | BUY fire_1@9,7 BUY fire_1@9,6 END_PLACE MOVE 9,7→1,7 END_ACTION | `3c0f5ce7` | yes | BUY fire_1@9,7 BUY fire_1@9,6 BUY fire_1@8,7 MOVE 8,7→7,2 MOVE 7,9→7,8 END_ACTION | `a634b683` | yes | 401 | 1,526 | 1,125 | 3,218 | 2729 |
| 5 | BUY fire_1@8,7 BUY water_1@9,7 END_PLACE MOVE 7,9→7,8 MOVE 9,6→7,2 END_ACTION | `42908f66` | yes | BUY fire_1@8,7 BUY water_1@9,7 END_PLACE MOVE 7,9→7,8 MOVE 8,6→2,6 ATK 2,6→2,7 END_ACTION | `5d14347f` | yes | 2,075 | 2,856 | 781 | 5,077 | 3005 |
| 6 | BUY shadow_1@7,9 END_PLACE MOVE 9,7→8,6 ATK 8,6→7,6 MOVE 7,8→7,7 END_ACTION | `2ba29ca5` | yes | BUY lightning_1@7,9 END_PLACE MOVE 8,7→2,7 ATK 2,7→1,7 END_ACTION | `75d1feb7` | yes | 1,147 | 1,717 | 570 | 3,085 | 2996 |
| 7 | BUY fire_1@8,2 BUY fire_1@9,2 BUY fire_1@7,3 PROMOTE 7,2 END_PLACE MOVE 9,2→7,1 MOVE 7,3→3,3 END_ACTION | `e188c1ac` | yes | BUY fire_1@8,2 BUY fire_1@9,2 BUY fire_1@7,3 PROMOTE 7,2 END_PLACE MOVE 9,2→7,1 MOVE 7,3→3,3 END_ACTION | `e188c1ac` | yes | 5,587 | 5,587 | 0 | 5,077 | 3008 |
| 8 | BUY fire_1@8,1 BUY fire_1@9,1 BUY fire_1@9,2 BUY fire_1@9,3 END_PLACE MOVE 3,3→2,3 ATK 2,3→2,2 MOVE 8,6→8,5 MOVE 7,7→7,6 END_ACTION | `81898051` | yes | BUY fire_1@8,1 BUY fire_1@9,1 BUY fire_1@9,2 BUY fire_1@9,3 END_PLACE MOVE 3,3→2,3 ATK 2,3→2,2 MOVE 8,6→8,5 MOVE 7,7→7,6 END_ACTION | `81898051` | yes | 8,912 | 8,912 | 0 | 9,715 | 3032 ⚠ |
| 9 | BUY fire_1@7,4 PROMOTE 7,2 END_PLACE MOVE 7,2→2,2 ATK 2,2→2,1 MOVE 2,2→1,1 END_ACTION | `9b9c4cff` | yes | BUY fire_1@7,4 PROMOTE 7,2 END_PLACE MOVE 7,2→2,2 ATK 2,2→1,2 MOVE 2,2→1,1 END_ACTION | `79ad8be3` | yes | 13,379 | 13,264 | -115 | 12,525 | 1238 |
| 10 | BUY fire_1@7,2 BUY fire_1@7,3 BUY fire_1@8,3 BUY fire_1@8,4 PROMOTE 8,8 END_PLACE MOVE 7,3→1,4 END_ACTION | `6b05c576` | yes | BUY fire_1@7,2 BUY fire_1@7,3 BUY fire_1@8,4 PROMOTE 8,8 END_PLACE MOVE 7,2→1,4 END_ACTION | `37b9d8de` | yes | 13,048 | 13,371 | 323 | 13,379 | 2273 |
| 11 | BUY fire_1@9,4 BUY fire_1@9,5 BUY fire_1@9,6 END_PLACE MOVE 7,2→1,1 END_ACTION | `e33cf2ec` | yes | BUY fire_1@9,4 BUY fire_1@9,5 BUY fire_1@9,6 BUY fire_1@8,6 END_PLACE MOVE 7,2→1,1 END_ACTION | `fa35bd6b` | yes | 13,920 | 14,722 | 802 | 13,827 | 1139 |
| 12 | BUY fire_1@7,2 BUY fire_1@8,6 BUY fire_1@9,7 BUY fire_1@7,5 PROMOTE 8,7 END_PLACE MOVE 7,2→1,1 END_ACTION | `c9c2ede9` | yes | BUY fire_1@7,2 BUY fire_1@8,6 BUY fire_1@9,7 BUY fire_1@7,3 PROMOTE 8,7 END_PLACE MOVE 7,3→1,1 END_ACTION | `8f72a96b` | yes | 14,587 | 14,841 | 254 | 17,739 | 1224 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 3 (the seat's turn #3).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 249e8f73a13399bc IS among the 27 candidates at this root; the engine played 072ebeae4d655923 instead, worth -250 cc to the adviser against 314 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #20) and scored it 900 cc, ABOVE the played candidate #0 at 432 cc — so this re-run did not play what the seat played (it chose candidate #20 at 900 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 4 (the seat's turn #4).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key a634b683b3651987 IS among the 28 candidates at this root; the engine played 3c0f5ce7ae7110fa instead, worth 401 cc to the adviser against 1526 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. Candidate #12 (adviser's best) and #0 (played) carry the same score 1949 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_724111 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

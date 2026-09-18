# Replay analysis — e1-g4-s650_0_58-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s650`. The game ended home-checkmate for white after 26 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 287 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→9,7 MOVE 9,8→8,8 MOVE 8,9→9,9 END_ACTION | `51ec848e` | yes | MOVE 8,8→9,7 MOVE 9,8→8,8 MOVE 8,9→9,9 END_ACTION | `51ec848e` | yes | 1,686 | 1,686 | 0 | 937 | 1691 |
| 2 | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→6,6 ATK 6,6→6,7 MOVE 8,8→8,9 END_ACTION | `c070a459` | yes | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→6,6 ATK 6,6→6,7 MOVE 8,8→8,9 END_ACTION | `c070a459` | yes | 2,629 | 2,629 | 0 | 2,820 | 2230 |
| 3 | BUY fire_1@8,6 BUY water_1@7,9 MOVE 6,6→4,5 ATK 4,5→5,5 MOVE 8,6→8,2 END_ACTION | `9b0590a4` | yes | BUY fire_1@8,6 BUY water_1@7,9 MOVE 6,6→5,4 ATK 5,4→5,5 MOVE 8,6→8,2 END_ACTION | `a7f77f05` | yes | 5,180 | 4,063 | -1,117 | 5,483 | 1242 |
| 4 | BUY fire_1@9,3 BUY fire_1@8,8 BUY lightning_1@8,3 MOVE 8,3→5,3 MOVE 9,3→7,1 MOVE 9,7→8,7 END_ACTION | `40da2d59` | yes | BUY fire_1@8,3 BUY fire_1@8,8 BUY lightning_1@8,4 MOVE 8,3→5,4 ATK 5,4→5,5 MOVE 8,2→7,1 END_ACTION | `e552c5ca` | yes | 5,361 | 6,451 | 1,090 | 6,138 | 2223 |
| 5 | BUY fire_1@9,7 END_PLACE MOVE 9,7→8,2 ATK 8,2→8,3 END_ACTION | `a3639c40` | yes | BUY fire_1@9,7 END_PLACE MOVE 9,7→8,2 ATK 8,2→8,3 END_ACTION | `a3639c40` | yes | 5,673 | 5,673 | 0 | 5,625 | 1472 |
| 6 | BUY shadow_1@7,2 END_PLACE MOVE 7,2→3,1 ATK 3,1→2,1 END_ACTION | `55609d62` | yes | BUY fire_1@7,2 BUY fire_1@7,3 BUY fire_1@9,3 BUY fire_1@8,1 END_PLACE MOVE 8,7→8,6 MOVE 7,9→7,8 MOVE 8,9→7,9 MOVE 7,3→5,3 END_ACTION | `288ae35e` | yes | 6,252 | 6,550 | 298 | 7,464 | 2773 |
| 7 | BUY shadow_1@7,2 END_PLACE MOVE 7,2→3,1 ATK 3,1→2,1 END_ACTION | `59eafac0` | yes | BUY fire_1@8,1 BUY fire_1@7,2 BUY fire_1@9,7 BUY fire_1@9,1 END_PLACE MOVE 8,8→2,8 MOVE 7,9→7,8 END_ACTION | `5c90fa66` | yes | 5,914 | 3,481 | -2,433 | 6,956 | 3007 |
| 8 | BUY shadow_1@7,2 END_PLACE MOVE 7,2→3,1 ATK 3,1→2,1 END_ACTION | `7b1a641c` | yes | BUY shadow_1@7,2 END_PLACE MOVE 7,2→3,1 ATK 3,1→2,1 END_ACTION | `7b1a641c` | yes | 5,749 | 5,749 | 0 | 7,993 | 2418 |
| 9 | BUY fire_1@8,1 BUY fire_1@7,2 BUY fire_1@9,1 BUY fire_1@9,2 PROMOTE 7,1 END_PLACE MOVE 8,8→1,7 END_ACTION | `9bd9783a` | yes | BUY fire_1@8,1 BUY fire_1@7,2 BUY fire_1@9,1 BUY fire_1@9,2 PROMOTE 7,1 END_PLACE MOVE 8,8→1,7 END_ACTION | `9bd9783a` | yes | 6,330 | 6,330 | 0 | 7,090 | 3020 |
| 10 | BUY lightning_1@7,6 END_PLACE MOVE 7,6→2,6 ATK 2,6→2,7 END_ACTION | `0bc162cc` | yes | BUY fire_1@7,3 BUY fire_1@8,3 BUY fire_1@9,3 PROMOTE 8,2 MOVE 7,3→2,2 ATK 2,2→2,1 END_ACTION | `a3543670` | yes | 6,008 | 6,664 | 656 | 5,087 | 3005 |
| 11 | BUY fire_1@8,3 PROMOTE 9,2 END_PLACE MOVE 7,1→2,2 ATK 2,2→2,1 END_ACTION | `9b609058` | yes | BUY fire_1@8,3 PROMOTE 8,2 END_PLACE MOVE 7,1→2,2 ATK 2,2→2,1 END_ACTION | `63c3a3ee` | yes | 5,388 | 5,724 | 336 | 8,571 | 3006 |
| 12 | BUY fire_1@7,3 PROMOTE 7,2 END_PLACE MOVE 7,3→2,2 ATK 2,2→2,1 END_ACTION | `09fb4de3` | yes | BUY fire_1@7,3 PROMOTE 8,3 END_PLACE MOVE 7,3→2,2 ATK 2,2→2,1 END_ACTION | `90194631` | yes | 4,427 | 4,167 | -260 | 8,921 | 1372 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**exposure-inconsistent** at turn 4 (the seat's turn #4).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key e552c5ca646e0c0b IS among the 27 candidates at this root; the engine played 40da2d5931d97e58 instead, worth 5361 cc to the adviser against 6451 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #24 (played) carry the same score 6138 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

### Largest swing

**exposure-inconsistent** at turn 4 (the seat's turn #4).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key e552c5ca646e0c0b IS among the 27 candidates at this root; the engine played 40da2d5931d97e58 instead, worth 5361 cc to the adviser against 6451 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #24 (played) carry the same score 6138 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_677382 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

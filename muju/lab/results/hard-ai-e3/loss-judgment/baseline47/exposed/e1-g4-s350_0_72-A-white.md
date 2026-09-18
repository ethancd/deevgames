# Replay analysis — e1-g4-s350_0_72-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s350`. The game ended elimination for black after 26 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 280 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `2873b1d3` | yes | END_ACTION | `2873b1d3` | yes | -1,780 | -1,780 | 0 | 1,045 | 3021 |
| 2 | BUY fire_1@2,0 END_PLACE MOVE 2,1→6,5 END_ACTION | `776795e2` | yes | BUY fire_1@1,0 BUY lightning_1@2,0 MOVE 2,1→6,5 END_ACTION | `913e127c` | yes | -36 | 1,038 | 1,074 | 1,962 | 2116 |
| 3 | BUY fire_1@1,0 BUY fire_1@0,1 END_PLACE MOVE 0,1→3,4 ATK 3,4→3,3 END_ACTION | `5f937a37` | yes | BUY fire_1@1,0 BUY fire_1@0,1 END_PLACE MOVE 0,1→3,4 ATK 3,4→3,3 END_ACTION | `5f937a37` | yes | 2,300 | 2,300 | 0 | 2,420 | 1830 |
| 4 | BUY fire_1@0,1 BUY fire_1@0,2 BUY lightning_1@2,4 MOVE 2,4→9,8 END_ACTION | `7b348e3f` | yes | BUY fire_1@0,1 BUY fire_1@0,2 BUY lightning_1@2,4 MOVE 2,4→9,8 END_ACTION | `7b348e3f` | yes | 4,784 | 4,784 | 0 | 4,648 | 1721 |
| 5 | BUY fire_1@2,4 BUY fire_1@2,2 BUY lightning_1@3,3 MOVE 1,1→1,2 MOVE 2,4→2,8 MOVE 3,4→4,4 END_ACTION | `98c943c2` | yes | BUY fire_1@2,4 BUY fire_1@1,2 BUY fire_1@0,3 MOVE 1,1→2,1 MOVE 2,4→2,8 MOVE 3,4→4,5 END_ACTION | `264e4ad8` | yes | 5,571 | 6,486 | 915 | 6,853 | 2991 |
| 6 | BUY shadow_1@2,4 END_PLACE MOVE 2,4→4,4 ATK 4,4→5,4 END_ACTION | `dbbf8c1c` | yes | BUY fire_1@2,4 BUY fire_1@1,7 BUY lightning_1@2,5 MOVE 3,3→9,7 END_ACTION | `19842827` | yes | 7,065 | 6,706 | -359 | 9,072 | 3010 |
| 7 | BUY fire_1@0,3 BUY fire_1@1,3 BUY fire_1@2,3 PROMOTE 3,3 MOVE 3,3→7,9 ATK 7,9→8,9 END_ACTION | `55189b65` | yes | BUY fire_1@0,3 BUY fire_1@1,3 BUY fire_1@0,4 PROMOTE 3,3 MOVE 3,3→7,9 ATK 7,9→8,9 END_ACTION | `f6238d19` | yes | 7,400 | 7,629 | 229 | 8,560 | 3003 |
| 8 | BUY fire_1@1,7 BUY fire_1@2,7 BUY fire_1@1,8 MOVE 2,2→8,2 MOVE 2,3→2,1 END_ACTION | `8fb6f81b` | yes | BUY fire_1@1,7 BUY fire_1@2,7 BUY fire_1@2,1 MOVE 2,2→8,2 MOVE 2,3→3,4 END_ACTION | `e13220bd` | yes | 7,768 | 7,838 | 70 | 9,271 | 3011 |
| 9 | BUY fire_1@3,4 BUY fire_1@4,3 PROMOTE 2,8 MOVE 4,4→8,6 MOVE 4,3→5,3 END_ACTION | `0dd24827` | yes | BUY fire_1@3,4 BUY fire_1@4,3 PROMOTE 2,8 MOVE 4,4→8,6 MOVE 4,3→5,3 END_ACTION | `0dd24827` | yes | 7,353 | 7,353 | 0 | 8,732 | 3000 |
| 10 | END_PLACE MOVE 2,8→7,9 ATK 7,9→8,9 END_ACTION | `ca15373f` | yes | END_PLACE MOVE 2,7→9,6 END_ACTION | `427e2b27` | yes | 12,067 | 6,005 | -6,062 | 11,961 | 1667 |
| 11 | BUY lightning_1@2,4 END_PLACE MOVE 2,4→9,9 END_ACTION | `d0e7c27d` | yes | BUY lightning_1@2,4 END_PLACE MOVE 2,4→9,9 END_ACTION | `d0e7c27d` | yes | 7,765 | 7,765 | 0 | 12,990 | 1615 |
| 12 | END_PLACE MOVE 2,7→9,6 END_ACTION | `c82208a5` | yes | BUY fire_1@1,1 BUY fire_1@0,4 BUY fire_1@0,5 PROMOTE 2,0 END_PLACE MOVE 1,3→4,4 ATK 4,4→4,3 MOVE 0,3→2,3 END_ACTION | `7f01ebc7` | yes | 8,611 | 9,631 | 1,020 | 11,112 | 1633 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**exposure-inconsistent** at turn 2 (the seat's turn #2).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 913e127c2d144ee2 IS among the 27 candidates at this root; the engine played 776795e20e2c813f instead, worth -36 cc to the adviser against 1038 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. Candidate #11 (adviser's best) and #0 (played) carry the same score 681 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

### Largest swing

**exposure-inconsistent** at turn 2 (the seat's turn #2).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 913e127c2d144ee2 IS among the 27 candidates at this root; the engine played 776795e20e2c813f instead, worth -36 cc to the adviser against 1038 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. Candidate #11 (adviser's best) and #0 (played) carry the same score 681 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_619026 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

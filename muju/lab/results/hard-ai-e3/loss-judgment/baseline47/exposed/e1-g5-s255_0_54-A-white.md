# Replay analysis — e1-g5-s255_0_54-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s255`. The game ended elimination for black after 22 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 252 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY fire_1@0,0 BUY lightning_1@1,1 MOVE 1,1→6,4 ATK 6,4→5,4 END_ACTION | `dd478773` | yes | BUY fire_1@0,0 BUY lightning_1@1,1 MOVE 1,1→6,4 ATK 6,4→5,4 END_ACTION | `dd478773` | yes | -199 | -199 | 0 | 1,693 | 3012 |
| 3 | BUY fire_1@1,0 BUY lightning_1@1,1 MOVE 2,1→2,2 MOVE 1,1→6,4 END_ACTION | `a52d7bcc` | yes | BUY fire_1@1,0 BUY lightning_1@1,1 MOVE 2,1→2,2 MOVE 1,1→6,4 END_ACTION | `a52d7bcc` | yes | 1,506 | 1,506 | 0 | 898 | 1362 |
| 4 | BUY fire_1@1,1 BUY fire_1@1,2 MOVE 0,1→0,2 MOVE 1,2→3,4 ATK 3,4→3,3 END_ACTION | `cea3fde7` | yes | BUY fire_1@1,1 BUY fire_1@1,2 MOVE 2,2→3,4 ATK 3,4→3,3 END_ACTION | `48d873e1` | yes | 2,571 | 2,735 | 164 | 3,772 | 2516 |
| 5 | BUY fire_1@3,3 BUY fire_1@0,1 END_PLACE ATK 3,4→4,4 MOVE 2,2→2,3 MOVE 3,3→5,3 MOVE 3,4→4,5 END_ACTION | `f769ce19` | yes | BUY fire_1@3,3 BUY fire_1@2,4 BUY fire_1@0,1 END_PLACE ATK 3,4→4,4 MOVE 2,2→2,3 MOVE 2,4→2,8 END_ACTION | `301af8ad` | yes | 5,714 | 5,383 | -331 | 5,229 | 2960 |
| 6 | BUY fire_1@1,2 BUY fire_1@3,3 END_PLACE MOVE 3,3→6,5 ATK 6,5→5,5 END_ACTION | `76a0306d` | yes | BUY fire_1@1,2 BUY fire_1@0,3 BUY fire_1@4,3 END_PLACE MOVE 4,3→6,5 ATK 6,5→5,5 MOVE 2,3→3,3 END_ACTION | `3eb237de` | yes | 5,012 | 6,220 | 1,208 | 6,165 | 2881 |
| 7 | BUY fire_1@0,3 BUY fire_1@1,3 BUY fire_1@4,3 PROMOTE 5,3 END_PLACE MOVE 4,3→6,5 ATK 6,5→5,5 MOVE 2,3→2,4 END_ACTION | `d9f4a435` | yes | BUY fire_1@0,3 BUY fire_1@3,3 BUY fire_1@4,3 PROMOTE 5,3 END_PLACE MOVE 4,3→6,5 ATK 6,5→5,5 MOVE 2,3→1,3 END_ACTION | `e48d324f` | yes | 5,903 | 5,859 | -44 | 7,295 | 2887 |
| 8 | BUY fire_1@0,4 BUY fire_1@1,4 END_PLACE MOVE 2,4→4,4 ATK 4,4→5,4 MOVE 1,4→3,4 END_ACTION | `1671c40e` | yes | BUY fire_1@0,4 BUY fire_1@1,4 BUY fire_1@2,1 BUY fire_1@2,3 PROMOTE 6,5 END_PLACE MOVE 2,1→7,2 MOVE 2,3→3,4 END_ACTION | `9f7776e2` | yes | 4,748 | 5,027 | 279 | 6,496 | 2548 |
| 9 | BUY lightning_1@4,3 END_PLACE MOVE 4,3→8,5 ATK 8,5→8,6 END_ACTION | `4b6456e5` | yes | BUY lightning_1@4,3 END_PLACE MOVE 4,3→8,5 ATK 8,5→8,6 END_ACTION | `4b6456e5` | yes | 6,205 | 6,205 | 0 | 5,459 | 1872 |
| 10 | BUY fire_1@3,3 PROMOTE 0,4 END_PLACE MOVE 1,3→4,6 MOVE 0,3→1,4 END_ACTION | `af32089d` | yes | END_PLACE MOVE 1,3→4,6 MOVE 1,2→1,4 END_ACTION | `c6c8b54a` | yes | 3,023 | 4,416 | 1,393 | 6,392 | 2406 |
| 11 | END_PLACE MOVE 1,2→5,4 MOVE 0,4→0,6 END_ACTION | `6e5794f8` | yes | BUY fire_1@1,3 PROMOTE 1,2 END_PLACE MOVE 1,2→5,4 MOVE 0,4→0,6 END_ACTION | `83d736c9` | yes | 3,489 | 4,042 | 553 | 4,710 | 2220 |
| 12 | BUY fire_1@0,5 PROMOTE 2,0 END_PLACE MOVE 1,1→4,6 END_ACTION | `400399e9` | yes | BUY fire_1@1,3 PROMOTE 1,1 END_PLACE MOVE 1,3→4,6 MOVE 0,6→1,7 END_ACTION | `c3efcc30` | yes | 4,498 | 3,443 | -1,055 | 5,005 | 2827 |
| 13 | BUY fire_1@0,3 BUY fire_1@1,3 PROMOTE 1,4 END_PLACE MOVE 1,4→2,7 MOVE 0,6→2,8 END_ACTION | `7d2cd30a` | yes | BUY fire_1@0,3 BUY fire_1@0,4 PROMOTE 0,5 END_PLACE MOVE 1,4→1,8 MOVE 0,6→2,8 END_ACTION | `832036b1` | yes | 348 | 1,588 | 1,240 | 3,441 | 1403 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 6 (the seat's turn #5).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 3eb237ded1e5ece9 IS among the 28 candidates at this root; the engine played 76a0306d29f864ec instead, worth 5012 cc to the adviser against 6220 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #3) and scored it 6165 cc, ABOVE the played candidate #0 at 5904 cc — so this re-run did not play what the seat played (it chose candidate #3 at 6165 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 10 (the seat's turn #9).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key c6c8b54aee2ef2f0 IS among the 28 candidates at this root; the engine played af32089ddcedd078 instead, worth 3023 cc to the adviser against 4416 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. Candidate #7 (adviser's best) and #23 (played) carry the same score 6392 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_570599 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

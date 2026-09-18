# Replay analysis — e1-g5-s415_3_41-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s415`. The game ended home-checkmate for black after 36 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 362 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY shadow_1@0,0 MOVE 4,1→5,5 ATK 5,5→5,4 END_ACTION | `47aa6558` | yes | BUY shadow_1@0,0 MOVE 4,1→5,5 ATK 5,5→5,4 END_ACTION | `47aa6558` | yes | 1,015 | 1,015 | 0 | 1,786 | 3000 |
| 3 | BUY lightning_1@1,0 BUY water_1@0,1 MOVE 1,0→5,5 ATK 5,5→5,4 END_ACTION | `41dd37dd` | yes | BUY lightning_1@1,0 END_PLACE MOVE 0,2→0,1 MOVE 1,0→5,5 END_ACTION | `d62472f7` | yes | 2,981 | -1,525 | -4,506 | 3,069 | 1317 |
| 4 | BUY lightning_1@1,0 MOVE 1,0→6,4 ATK 6,4→6,5 END_ACTION | `4a2bf29d` | yes | BUY fire_1@1,0 MOVE 0,2→0,3 MOVE 1,1→1,2 MOVE 1,2→1,3 MOVE 1,3→2,3 END_ACTION | `10e862a4` | yes | -1,130 | -702 | 428 | -447 | 2423 |
| 5 | BUY lightning_1@1,0 END_PLACE MOVE 1,0→6,4 ATK 6,4→6,5 END_ACTION | `640605d4` | yes | BUY lightning_1@1,0 END_PLACE MOVE 1,0→6,4 ATK 6,4→6,5 END_ACTION | `640605d4` | yes | 2,346 | 2,346 | 0 | 2,606 | 2559 |
| 6 | BUY fire_1@5,4 END_PLACE MOVE 5,4→7,8 ATK 7,8→8,8 END_ACTION | `32358b70` | yes | BUY fire_1@1,0 BUY fire_1@1,2 MOVE 1,1→2,0 MOVE 0,2→0,3 MOVE 0,3→0,4 END_ACTION | `ae80ac29` | yes | 693 | 2,322 | 1,629 | 3,781 | 1629 |
| 7 | BUY lightning_1@1,0 ATK 7,8→8,8 MOVE 1,1→2,0 MOVE 0,2→1,2 END_ACTION | `a5ec2972` | yes | BUY lightning_1@1,0 ATK 7,8→8,8 MOVE 7,8→9,9 END_ACTION | `5c636eb0` | yes | 5,258 | 2,866 | -2,392 | 7,297 | 2363 |
| 8 | BUY fire_1@0,2 END_PLACE MOVE 0,2→2,8 END_ACTION | `4e49a7a2` | yes | BUY fire_1@0,2 BUY plant_1@1,1 MOVE 0,2→1,7 MOVE 1,1→2,1 END_ACTION | `563135e4` | yes | 1,758 | 3,150 | 1,392 | 5,211 | 1872 |
| 9 | BUY fire_1@1,1 END_PLACE MOVE 1,1→4,6 END_ACTION | `c32538e3` | yes | BUY fire_1@1,1 END_PLACE MOVE 1,1→4,6 END_ACTION | `c32538e3` | yes | 3,411 | 3,411 | 0 | 7,272 | 2208 |
| 10 | BUY lightning_1@1,1 END_PLACE MOVE 1,1→4,4 ATK 4,4→4,5 END_ACTION | `a666363c` | yes | BUY lightning_1@1,1 END_PLACE MOVE 1,1→4,4 ATK 4,4→4,5 END_ACTION | `a666363c` | yes | 1,011 | 1,011 | 0 | 3,986 | 2415 |
| 11 | BUY fire_1@0,2 BUY plant_1@1,1 MOVE 0,2→1,7 MOVE 1,1→2,1 END_ACTION | `6d991dc6` | yes | BUY fire_1@1,1 END_PLACE MOVE 1,1→4,4 ATK 4,4→3,4 END_ACTION | `0ccf1065` | yes | -1,429 | 2,691 | 4,120 | 2,371 | 2638 |
| 12 | BUY fire_1@0,2 MOVE 0,2→1,7 ATK 1,7→2,7 END_ACTION | `ce48d725` | yes | BUY water_1@0,2 MOVE 1,2→2,3 MOVE 0,2→0,3 ATK 0,3→1,3 END_ACTION | `d08ac162` | yes | 2,090 | 3,373 | 1,283 | 1,669 | 2132 |
| 13 | BUY lightning_1@0,2 MOVE 0,2→2,6 ATK 2,6→2,7 END_ACTION | `029fc959` | yes | BUY water_1@0,2 MOVE 1,2→2,3 MOVE 0,2→0,3 ATK 0,3→1,3 END_ACTION | `ceda12c1` | yes | 323 | 2,093 | 1,770 | 1,767 | 2228 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 4 (the seat's turn #3).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 10e862a4a62029d4 IS among the 26 candidates at this root; the engine played 4a2bf29d7977c538 instead, worth -1130 cc to the adviser against -702 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #23) and scored it -447 cc, ABOVE the played candidate #0 at -694 cc — so this re-run did not play what the seat played (it chose candidate #23 at -447 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 11 (the seat's turn #10).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 0ccf10659c03b004 IS among the 27 candidates at this root; the engine played 6d991dc6108e1222 instead, worth -1429 cc to the adviser against 2691 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. Candidate #6 (adviser's best) and #24 (played) carry the same score 2371 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_535582 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

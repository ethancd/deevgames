# Replay analysis — e1-g4-s550_3_31-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s550`. The game ended elimination for white after 37 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 407 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,2 END_ACTION | `91040c29` | yes | BUY fire_1@9,9 MOVE 8,9→7,2 END_ACTION | `91040c29` | yes | 387 | 387 | 0 | -1,211 | 3008 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→4,4 END_ACTION | `49e02317` | yes | BUY lightning_1@8,9 END_PLACE MOVE 9,8→9,7 MOVE 8,9→4,4 END_ACTION | `49e02317` | yes | -1,919 | -1,919 | 0 | -1,010 | 2263 |
| 3 | BUY fire_1@9,8 BUY water_1@8,9 MOVE 8,8→8,6 ATK 8,6→9,6 MOVE 8,6→7,6 END_ACTION | `b03eea2d` | yes | BUY fire_1@9,8 BUY water_1@8,9 MOVE 8,8→8,6 ATK 8,6→9,6 MOVE 8,6→8,5 END_ACTION | `48129748` | yes | 980 | 1,590 | 610 | 421 | 2640 |
| 4 | BUY fire_1@7,9 BUY fire_1@9,6 PROMOTE 7,6 MOVE 7,6→6,4 ATK 6,4→6,5 END_ACTION | `a3a68bb3` | yes | BUY fire_1@9,6 PROMOTE 7,6 END_PLACE MOVE 7,6→5,5 ATK 5,5→6,5 END_ACTION | `502c67a3` | yes | 1,181 | 1,479 | 298 | 2,604 | 3006 |
| 5 | BUY fire_1@7,4 BUY fire_1@6,5 BUY lightning_1@8,4 MOVE 8,4→0,1 END_ACTION | `cc4cfab0` | yes | BUY fire_1@7,4 BUY fire_1@6,5 BUY lightning_1@7,5 MOVE 6,4→5,4 MOVE 9,7→8,6 MOVE 7,4→7,2 END_ACTION | `f5e1d90b` | yes | 1,438 | 2,415 | 977 | 3,836 | 3030 |
| 6 | BUY fire_1@6,5 BUY fire_1@9,4 END_PLACE ATK 6,5→5,5 MOVE 6,4→4,4 MOVE 7,4→7,2 END_ACTION | `c8a3d81c` | yes | BUY fire_1@6,6 BUY fire_1@6,5 BUY lightning_1@8,4 ATK 6,5→5,5 MOVE 6,4→5,4 MOVE 7,4→7,1 END_ACTION | `5f48c6e6` | yes | 4,409 | 5,184 | 775 | 4,934 | 3003 |
| 7 | BUY fire_1@8,2 BUY fire_1@9,2 BUY fire_1@7,3 BUY fire_1@8,3 END_PLACE MOVE 7,3→2,2 MOVE 8,9→8,8 END_ACTION | `53c411aa` | yes | BUY fire_1@8,2 BUY fire_1@9,2 BUY fire_1@7,3 BUY fire_1@8,3 END_PLACE MOVE 7,3→2,2 ATK 2,2→2,3 END_ACTION | `842cebb3` | yes | 4,320 | 5,664 | 1,344 | 6,744 | 3014 |
| 8 | BUY fire_1@7,3 BUY fire_1@6,6 BUY fire_1@9,3 BUY fire_1@8,9 END_PLACE MOVE 7,3→2,0 END_ACTION | `9ebfefba` | yes | BUY fire_1@7,3 BUY fire_1@9,3 BUY fire_1@8,9 END_PLACE MOVE 7,3→2,0 END_ACTION | `3dcefab8` | yes | 4,409 | 3,881 | -528 | 6,600 | 3004 |
| 9 | BUY fire_1@7,3 PROMOTE 7,9 END_PLACE MOVE 8,2→2,0 END_ACTION | `0fdd37a2` | yes | BUY fire_1@7,3 PROMOTE 9,6 END_PLACE MOVE 7,3→2,0 END_ACTION | `081bbc8b` | yes | 4,544 | 4,832 | 288 | 8,468 | 838 |
| 10 | BUY fire_1@8,2 BUY fire_1@7,5 PROMOTE 7,2 END_PLACE MOVE 7,3→2,0 END_ACTION | `0a804c41` | yes | BUY fire_1@8,2 BUY fire_1@8,4 PROMOTE 7,3 END_PLACE MOVE 7,3→2,2 ATK 2,2→2,1 END_ACTION | `1dc9a0ce` | yes | 3,905 | 4,858 | 953 | 7,077 | 744 |
| 11 | BUY fire_1@7,3 END_PLACE MOVE 7,3→3,3 ATK 3,3→2,3 END_ACTION | `afe75b4c` | yes | BUY lightning_1@7,3 END_PLACE MOVE 7,3→1,3 ATK 1,3→0,3 END_ACTION | `d6dd9856` | yes | 2,600 | 5,255 | 2,655 | 5,464 | 756 |
| 12 | END_PLACE MOVE 8,3→3,3 ATK 3,3→2,3 END_ACTION | `d74ee2d6` | yes | BUY lightning_1@7,3 END_PLACE MOVE 7,3→2,2 ATK 2,2→2,3 END_ACTION | `45a6aeaf` | yes | 4,794 | 5,387 | 593 | 8,295 | 862 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 3 (the seat's turn #3).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 4812974860f23821 IS among the 28 candidates at this root; the engine played b03eea2d4275f746 instead, worth 980 cc to the adviser against 1590 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #7) and scored it 421 cc, ABOVE the played candidate #0 at 370 cc — so this re-run did not play what the seat played (it chose candidate #1 at 421 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 11 (the seat's turn #11).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key d6dd9856e466a5ed IS among the 32 candidates at this root; the engine played afe75b4c146e95f9 instead, worth 2600 cc to the adviser against 5255 cc. root exposure: 32 candidate(s) from a `completed-depth` list, 32 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #29 (played) carry the same score 5464 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_602181 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

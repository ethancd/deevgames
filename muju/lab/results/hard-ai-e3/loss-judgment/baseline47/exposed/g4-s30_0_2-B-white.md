# Replay analysis — g4-s30_0_2-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g4-s30`. The game ended home-checkmate for white after 26 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 286 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `cf1b3202` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `cf1b3202` | yes | -1,610 | -1,610 | 0 | 915 | 3021 |
| 2 | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→4,4 ATK 4,4→4,5 END_ACTION | `5c5d7751` | yes | BUY lightning_1@9,8 BUY lightning_1@8,9 MOVE 8,9→4,4 ATK 4,4→4,5 END_ACTION | `8df2c9df` | yes | 1,211 | 921 | -290 | 2,571 | 1066 |
| 3 | BUY lightning_1@8,9 END_PLACE MOVE 9,7→9,6 MOVE 8,9→5,3 END_ACTION | `92a34ac8` | yes | BUY lightning_1@8,9 END_PLACE MOVE 9,7→8,7 MOVE 8,9→5,3 END_ACTION | `cf714b53` | yes | 2,095 | 1,954 | -141 | 1,761 | 2105 |
| 4 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→6,4 ATK 6,4→5,4 END_ACTION | `94be63c4` | yes | BUY lightning_1@9,7 END_PLACE MOVE 9,7→6,4 ATK 6,4→5,4 END_ACTION | `94be63c4` | yes | 4,710 | 4,710 | 0 | 4,055 | 2487 |
| 5 | BUY fire_1@8,4 BUY fire_1@6,5 BUY fire_1@8,8 BUY fire_1@8,9 MOVE 6,4→0,1 MOVE 9,6→9,5 END_ACTION | `d8b1f518` | yes | BUY fire_1@8,4 BUY fire_1@6,5 BUY fire_1@8,8 BUY fire_1@8,9 MOVE 6,4→0,1 MOVE 9,6→9,5 END_ACTION | `d8b1f518` | yes | 6,624 | 6,624 | 0 | 7,578 | 2608 |
| 6 | BUY fire_1@9,4 BUY fire_1@8,5 PROMOTE 8,4 MOVE 8,4→5,4 ATK 5,4→5,5 MOVE 7,9→7,8 END_ACTION | `c25f490d` | yes | BUY fire_1@9,4 BUY fire_1@8,7 PROMOTE 8,4 MOVE 8,4→8,2 MOVE 9,4→5,4 ATK 5,4→5,5 END_ACTION | `636c5769` | yes | 5,468 | 6,004 | 536 | 8,025 | 2986 |
| 7 | BUY fire_1@8,6 PROMOTE 9,4 END_PLACE MOVE 8,5→3,4 ATK 3,4→4,4 END_ACTION | `636eacfa` | yes | BUY fire_1@8,7 BUY fire_1@9,7 PROMOTE 9,4 MOVE 8,5→3,4 ATK 3,4→4,4 END_ACTION | `a1997034` | yes | 9,211 | 9,273 | 62 | 10,257 | 1569 |
| 8 | BUY fire_1@8,7 END_PLACE MOVE 9,4→7,2 MOVE 9,5→9,3 END_ACTION | `9c2d84bd` | yes | END_PLACE MOVE 9,4→4,4 ATK 4,4→3,4 END_ACTION | `d123451b` | yes | 6,708 | 3,659 | -3,049 | 7,680 | 2851 |
| 9 | END_PLACE MOVE 8,6→4,2 END_ACTION | `0afcfe5d` | yes | BUY lightning_1@9,4 END_PLACE MOVE 9,4→6,1 ATK 6,1→6,2 END_ACTION | `478c1750` | yes | 5,330 | 4,706 | -624 | 6,305 | 1511 |
| 10 | BUY fire_1@7,9 BUY water_1@9,7 END_PLACE MOVE 7,9→2,8 MOVE 8,7→7,7 END_ACTION | `3adc00e5` | yes | BUY fire_1@7,9 BUY water_1@9,7 END_PLACE MOVE 7,9→2,8 MOVE 8,7→8,5 END_ACTION | `a01892cf` | yes | 3,219 | 3,078 | -141 | 5,820 | 2240 |
| 11 | END_PLACE MOVE 7,7→5,1 END_ACTION | `2cd30317` | yes | BUY fire_1@7,9 BUY water_1@8,7 PROMOTE 7,7 END_PLACE MOVE 7,9→2,8 ATK 2,8→2,7 END_ACTION | `b4e6e870` | yes | 803 | 2,400 | 1,597 | 6,462 | 1938 |
| 12 | BUY lightning_1@7,9 END_PLACE MOVE 7,9→5,2 MOVE 8,8→8,6 END_ACTION | `31b91f09` | yes | BUY fire_1@7,9 PROMOTE 8,8 END_PLACE MOVE 7,9→2,8 ATK 2,8→2,7 END_ACTION | `9a95d451` | yes | 980 | 3,789 | 2,809 | 3,450 | 1541 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 6 (the seat's turn #6).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 636c5769f8906870 IS among the 27 candidates at this root; the engine played c25f490d6a27f82d instead, worth 5468 cc to the adviser against 6004 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 2, cutoff at -1. The root searched the adviser's best turn (candidate #12) and scored it 7679 cc, below the played candidate #23 at 8025 cc

### Largest swing

**exposure-inconsistent** at turn 12 (the seat's turn #12).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 9a95d451c320ed01 IS among the 29 candidates at this root; the engine played 31b91f0901b14260 instead, worth 980 cc to the adviser against 3789 cc. root exposure: 29 candidate(s) from a `completed-depth` list, 29 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #4 (played) carry the same score 1561 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_498582 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

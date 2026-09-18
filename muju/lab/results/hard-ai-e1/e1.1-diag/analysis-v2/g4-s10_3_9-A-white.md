# Replay analysis — g4-s10_3_9-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g4-s10`. The game ended home-checkmate for black after 22 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 284 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `47f92753` | yes | END_ACTION | `47f92753` | yes | -2,703 | -2,703 | 0 | -1,800 | 3019 |
| 2 | BUY lightning_1@1,0 MOVE 3,2→5,5 ATK 5,5→5,4 END_ACTION | `dd78b9da` | yes | BUY lightning_1@2,0 MOVE 3,2→5,5 ATK 5,5→5,4 END_ACTION | `8626bdd3` | yes | 305 | 895 | 590 | 772 | 1907 |
| 3 | BUY water_1@0,0 END_PLACE MOVE 1,0→6,4 ATK 6,4→5,4 END_ACTION | `c464a72b` | yes | BUY plant_1@0,0 MOVE 1,0→5,5 ATK 5,5→5,4 END_ACTION | `391f120e` | yes | 3,364 | 3,292 | -72 | 3,342 | 2679 |
| 4 | END_PLACE MOVE 0,1→1,0 MOVE 0,2→1,2 MOVE 1,2→2,2 END_ACTION | `7d8a9485` | yes | END_PLACE MOVE 0,1→1,1 MOVE 0,2→1,2 MOVE 1,2→2,2 END_ACTION | `9bd35dc1` | yes | -165 | 602 | 767 | -231 | 1693 |
| 5 | BUY fire_1@2,0 BUY fire_1@1,1 BUY fire_1@0,2 PROMOTE 2,2 END_PLACE ATK 0,2→0,3 MOVE 2,2→3,4 END_ACTION | `910e4b44` | yes | BUY fire_1@2,0 BUY fire_1@1,1 BUY fire_1@0,2 BUY fire_1@2,1 PROMOTE 2,2 ATK 0,2→0,3 MOVE 2,2→3,4 END_ACTION | `a86078a6` | yes | -350 | 33 | 383 | 1,064 | 2088 |
| 6 | BUY fire_1@3,3 END_PLACE MOVE 3,3→7,5 ATK 7,5→7,6 END_ACTION | `18443b37` | yes | BUY fire_1@2,1 END_PLACE MOVE 0,2→1,7 MOVE 1,7→2,8 END_ACTION | `29d5c9ae` | yes | -265 | 1,240 | 1,505 | 3,097 | 2906 |
| 7 | BUY fire_1@1,4 BUY fire_1@0,1 BUY fire_1@2,1 BUY fire_1@0,3 END_PLACE ATK 1,4→1,5 MOVE 0,2→1,2 MOVE 1,4→2,7 END_ACTION | `573aaa46` | yes | BUY fire_1@1,4 BUY fire_1@0,1 BUY fire_1@2,1 BUY fire_1@0,3 END_PLACE ATK 1,4→1,5 MOVE 0,2→1,2 MOVE 1,4→2,7 END_ACTION | `573aaa46` | yes | 2,105 | 2,105 | 0 | 1,530 | 3010 |
| 8 | BUY lightning_1@3,2 END_PLACE MOVE 3,2→6,2 ATK 6,2→6,3 END_ACTION | `4d2d0c48` | yes | BUY fire_1@2,3 PROMOTE 3,4 END_PLACE MOVE 3,4→2,7 MOVE 2,3→4,5 END_ACTION | `a97bdb57` | yes | 1,185 | 685 | -500 | 2,086 | 3015 |
| 9 | BUY fire_1@3,3 END_PLACE MOVE 3,3→6,4 ATK 6,4→7,4 END_ACTION | `81eed347` | yes | BUY fire_1@0,2 END_PLACE MOVE 3,4→4,4 MOVE 1,2→7,2 END_ACTION | `c6751d36` | yes | -1,120 | 415 | 1,535 | 1,310 | 1356 |
| 10 | END_PLACE MOVE 1,2→4,7 END_ACTION | `0e35ce50` | yes | END_PLACE MOVE 1,2→4,7 END_ACTION | `0e35ce50` | yes | -2,113 | -2,113 | 0 | 792 | 2090 |
| 11 | BUY lightning_1@0,2 PROMOTE 3,4 END_PLACE MOVE 3,4→1,7 MOVE 0,3→2,3 END_ACTION | `f4e6ecea` | yes | BUY lightning_1@0,2 END_PLACE MOVE 0,2→6,2 ATK 6,2→6,3 END_ACTION | `9ebb90d8` | yes | -3,763 | -3,588 | 175 | -3,823 | 1215 |
| 12 | BUY lightning_1@0,7 END_PLACE MOVE 0,7→4,9 ATK 4,9→5,9 END_ACTION | `d30c9fa8` | yes | BUY fire_1@1,5 END_PLACE MOVE 1,5→5,5 ATK 5,5→5,6 END_ACTION | `93de0349` | yes | -1,750 | -1,608 | 142 | 2,037 | 1422 |
| 13 | BUY fire_1@1,4 END_PLACE MOVE 1,4→5,5 ATK 5,5→6,5 END_ACTION | `e5514c1f` | yes | BUY lightning_1@0,7 END_PLACE MOVE 0,7→4,9 ATK 4,9→5,9 END_ACTION | `f926373c` | yes | -513 | -1,954 | -1,441 | 2,270 | 1711 |
| 14 | END_PLACE MOVE 1,7→1,8 MOVE 0,1→1,3 ATK 1,3→1,2 END_ACTION | `42c0c4f7` | yes | END_PLACE MOVE 1,7→1,8 MOVE 0,1→1,3 ATK 1,3→1,2 END_ACTION | `42c0c4f7` | yes | -2,235 | -2,235 | 0 | -2,301 | 2012 |
| 15 | BUY fire_1@1,7 BUY fire_1@1,3 BUY fire_1@0,4 END_PLACE ATK 1,7→2,7 ATK 1,3→2,3 MOVE 1,3→5,3 END_ACTION | `a7b04e15` | yes | BUY fire_1@1,7 BUY fire_1@1,3 BUY fire_1@0,4 BUY fire_1@1,4 ATK 1,7→2,7 ATK 1,3→2,3 MOVE 1,4→2,7 END_ACTION | `5731516b` | yes | -2,035 | -708 | 1,327 | 2,232 | 2155 |
| 16 | BUY fire_1@1,4 BUY water_1@0,5 MOVE 0,4→5,3 ATK 5,3→5,2 END_ACTION | `e135a479` | yes | BUY fire_1@1,4 BUY fire_1@1,5 MOVE 0,4→5,3 ATK 5,3→5,2 END_ACTION | `65afdf25` | yes | -2,098 | 1,813 | 3,911 | 3,009 | 1276 |
| 17 | BUY fire_1@1,1 END_PLACE MOVE 1,1→7,1 ATK 7,1→7,2 END_ACTION | `1ca386e9` | yes | BUY fire_1@1,4 BUY fire_1@0,6 ATK 1,4→2,4 MOVE 1,7→2,7 ATK 2,7→2,8 MOVE 0,5→0,4 END_ACTION | `0fced790` | yes | -659 | 1,612 | 2,271 | 2,537 | 1366 |
| 18 | BUY fire_1@1,3 END_PLACE MOVE 1,3→4,3 ATK 4,3→4,4 END_ACTION | `ebe98edf` | yes | BUY fire_1@1,5 BUY fire_1@1,6 BUY lightning_1@1,7 ATK 1,8→2,8 ATK 1,5→2,5 ATK 1,7→2,7 MOVE 1,7→3,7 END_ACTION | `e554854d` | yes | -3,224 | 594 | 3,818 | 2,876 | 2005 |
| 19 | BUY lightning_1@0,3 END_PLACE MOVE 0,3→6,3 ATK 6,3→7,3 END_ACTION | `03c199bd` | yes | BUY fire_1@0,1 BUY water_1@0,4 MOVE 0,1→3,3 MOVE 0,5→1,5 END_ACTION | `e7778afb` | yes | -5,702 | -862 | 4,840 | -262 | 1734 |
| 20 | BUY shadow_1@0,1 MOVE 1,8→1,7 MOVE 0,5→0,4 MOVE 0,1→3,2 END_ACTION | `16989996` | yes | BUY shadow_1@0,1 MOVE 1,8→1,7 ATK 1,7→2,7 MOVE 1,7→3,7 ATK 3,7→4,7 END_ACTION | `758f08a1` | yes | -4,885 | -5,223 | -338 | -1,155 | 1820 |
| 21 | BUY fire_1@0,3 ATK 1,7→2,7 MOVE 1,7→2,7 MOVE 0,3→4,3 END_ACTION | `b9ed7ffc` | yes | BUY fire_1@0,3 ATK 1,7→2,7 MOVE 1,7→2,7 MOVE 0,3→4,3 END_ACTION | `b9ed7ffc` | yes | 262 | 262 | 0 | 1,494 | 2351 |
| 22 | BUY lightning_1@0,3 MOVE 0,3→6,3 ATK 6,3→7,3 END_ACTION | `f9013e6c` | yes | BUY lightning_1@0,0 END_ACTION | `787e25f6` | yes | -997,000 | -997,000 | 0 | -1,896 | 1645 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key 8626bdd387867854 IS among the 27 candidates at this root; the engine played dd78b9da58210a23 instead, worth 305 cc to the adviser against 895 cc

### Largest swing

**strong-candidate-misjudged** at turn 19 (the seat's turn #19).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key e7778afbde82b0bd IS among the 36 candidates at this root; the engine played 03c199bda5420529 instead, worth -5702 cc to the adviser against -862 cc

_1539623 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

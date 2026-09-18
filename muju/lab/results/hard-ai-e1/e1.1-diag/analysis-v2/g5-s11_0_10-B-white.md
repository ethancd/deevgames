# Replay analysis — g5-s11_0_10-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g5-s11`. The game ended home-checkmate for white after 27 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 308 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 8,9→7,9 END_ACTION | `a932c749` | yes | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 9,8→9,7 MOVE 8,9→8,8 END_ACTION | `9693d7fa` | yes | -2,069 | -1,522 | 547 | -1,179 | 3006 |
| 2 | PROMOTE 9,8 MOVE 9,8→8,8 ATK 8,8→7,8 END_ACTION | `7f97efa1` | yes | PROMOTE 9,8 MOVE 9,8→8,8 ATK 8,8→7,8 END_ACTION | `7f97efa1` | yes | -2,200 | -2,200 | 0 | -2,003 | 1180 |
| 3 | BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 END_ACTION | `9bae35c5` | yes | BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 END_ACTION | `9bae35c5` | yes | -374 | -374 | 0 | -446 | 1670 |
| 4 | BUY fire_1@8,9 BUY water_1@8,8 MOVE 7,8→7,7 MOVE 9,8→9,7 ATK 9,7→8,7 MOVE 7,7→7,6 END_ACTION | `9e079178` | yes | BUY fire_1@8,8 BUY water_1@8,9 MOVE 7,8→7,6 MOVE 9,8→9,7 ATK 9,7→8,7 END_ACTION | `a9c602c9` | yes | -220 | -495 | -275 | 1,137 | 2843 |
| 5 | BUY water_1@9,8 MOVE 7,6→6,5 MOVE 8,8→8,9 ATK 8,9→7,9 END_ACTION | `4d7bc4b4` | yes | BUY water_1@8,9 ATK 8,9→7,9 MOVE 7,6→6,5 END_ACTION | `8bea4c30` | yes | 927 | 1,012 | 85 | 1,894 | 2454 |
| 6 | BUY lightning_1@7,5 END_PLACE MOVE 7,5→3,4 ATK 3,4→2,4 END_ACTION | `6ff882ec` | yes | BUY fire_1@7,5 BUY fire_1@6,6 END_PLACE ATK 6,6→5,6 MOVE 7,5→7,1 MOVE 6,6→4,6 END_ACTION | `22934dfa` | yes | -1,026 | 1,267 | 2,293 | 1,558 | 2966 |
| 7 | BUY fire_1@6,6 BUY fire_1@7,9 END_PLACE ATK 6,6→5,6 MOVE 6,6→5,3 MOVE 9,8→8,8 END_ACTION | `5a757949` | yes | BUY fire_1@7,5 BUY fire_1@6,6 END_PLACE ATK 7,5→7,4 ATK 6,6→5,6 MOVE 6,5→5,5 MOVE 8,9→7,9 END_ACTION | `cb22af45` | yes | -46 | 2,471 | 2,517 | 3,265 | 3001 |
| 8 | BUY lightning_1@6,6 END_PLACE MOVE 6,6→0,0 END_ACTION | `d54c603f` | yes | BUY fire_1@6,6 BUY fire_1@7,5 BUY fire_1@9,8 BUY fire_1@9,5 END_PLACE ATK 7,5→7,4 MOVE 6,5→4,5 MOVE 9,7→8,7 END_ACTION | `53883f36` | yes | 549 | 1,250 | 701 | 2,675 | 3009 |
| 9 | BUY metal_1@9,8 PROMOTE 6,5 END_PLACE ATK 8,8→7,8 MOVE 6,5→7,2 MOVE 8,9→7,9 END_ACTION | `ce87c532` | yes | END_PLACE ATK 8,8→7,8 END_ACTION | `bf712c08` | yes | -1,589 | -437 | 1,152 | -223 | 2210 |
| 10 | BUY fire_1@8,2 BUY lightning_1@7,5 ATK 7,5→6,5 MOVE 7,5→0,3 END_ACTION | `89af0ecd` | yes | BUY fire_1@8,2 BUY lightning_1@7,5 ATK 7,5→6,5 MOVE 7,5→0,3 END_ACTION | `89af0ecd` | yes | 1,928 | 1,928 | 0 | 3,032 | 2941 |
| 11 | BUY fire_1@7,3 END_PLACE MOVE 7,3→3,3 ATK 3,3→2,3 END_ACTION | `a0b451f2` | yes | BUY fire_1@7,4 END_PLACE MOVE 7,4→4,4 ATK 4,4→3,4 END_ACTION | `6c467265` | yes | 493 | 1,066 | 573 | 4,736 | 1566 |
| 12 | BUY fire_1@7,4 END_PLACE MOVE 7,4→4,4 ATK 4,4→3,4 END_ACTION | `6947ad15` | yes | BUY fire_1@7,6 BUY fire_1@7,3 ATK 7,6→6,6 MOVE 7,2→8,1 MOVE 8,8→8,7 MOVE 7,3→7,1 END_ACTION | `857045ea` | yes | 1,071 | 1,996 | 925 | 5,481 | 1371 |
| 13 | BUY lightning_1@7,4 END_PLACE MOVE 7,4→4,4 ATK 4,4→4,5 END_ACTION | `93b1afac` | yes | BUY fire_1@7,6 BUY fire_1@7,3 ATK 7,6→6,6 MOVE 7,2→8,1 MOVE 9,7→9,6 MOVE 7,3→7,1 END_ACTION | `a587de4a` | yes | 420 | 2,194 | 1,774 | 3,057 | 1379 |
| 14 | END_PLACE MOVE 7,2→6,5 ATK 6,5→6,6 END_ACTION | `7e488a83` | yes | BUY fire_1@8,9 MOVE 7,2→5,4 MOVE 8,8→8,7 MOVE 7,9→7,8 END_ACTION | `4472775f` | yes | -1,118 | -427 | 691 | 21 | 1892 |
| 15 | BUY lightning_1@8,5 MOVE 8,5→3,1 MOVE 6,5→5,5 END_ACTION | `4bc87c7b` | yes | BUY lightning_1@7,5 MOVE 7,5→3,0 MOVE 6,5→5,5 END_ACTION | `ad2120c1` | yes | 603 | 2,304 | 1,701 | 4,154 | 1335 |
| 16 | END_PLACE MOVE 5,5→7,1 MOVE 9,7→9,6 END_ACTION | `291f7099` | yes | BUY fire_1@8,9 MOVE 5,5→7,1 MOVE 9,7→9,6 END_ACTION | `a400ac46` | yes | -1,187 | -1,603 | -416 | 571 | 1351 |
| 17 | BUY fire_1@9,7 BUY shadow_1@8,9 MOVE 9,7→6,4 MOVE 8,8→8,7 END_ACTION | `46f6acd8` | yes | BUY fire_1@9,7 END_PLACE MOVE 9,7→5,5 ATK 5,5→4,5 END_ACTION | `9f0e3525` | yes | 1,724 | -45 | -1,769 | 4,122 | 1832 |
| 18 | BUY fire_1@8,8 BUY lightning_1@9,7 MOVE 8,8→6,4 MOVE 9,6→9,5 END_ACTION | `744ea08d` | yes | BUY fire_1@8,8 BUY lightning_1@9,7 MOVE 8,8→6,4 MOVE 9,6→9,5 END_ACTION | `744ea08d` | yes | 4,886 | 4,886 | 0 | 7,214 | 1282 |
| 19 | BUY lightning_1@8,8 MOVE 8,8→4,6 ATK 4,6→3,6 END_ACTION | `3ccbfca5` | yes | BUY fire_1@9,6 MOVE 9,6→6,5 ATK 6,5→5,5 END_ACTION | `764709a0` | yes | 5,368 | 3,106 | -2,262 | 8,268 | 1517 |
| 20 | END_PLACE MOVE 9,7→6,4 MOVE 9,5→8,5 ATK 8,5→8,4 END_ACTION | `d7c14970` | yes | BUY lightning_1@9,6 MOVE 9,6→6,3 ATK 6,3→5,3 MOVE 6,3→5,1 END_ACTION | `108dba72` | yes | 2,413 | 475 | -1,938 | 2,893 | 1526 |
| 21 | BUY fire_1@8,9 MOVE 8,5→8,4 MOVE 8,9→8,6 MOVE 6,4→7,2 END_ACTION | `9f85d609` | yes | END_PLACE ATK 9,9→9,8 ATK 6,4→5,4 MOVE 6,4→7,2 MOVE 8,5→8,4 END_ACTION | `ee7a8ea2` | yes | 2,336 | 2,237 | -99 | 4,734 | 2287 |
| 22 | END_PLACE MOVE 8,6→8,8 ATK 8,8→8,9 END_ACTION | `fcda2758` | yes | END_PLACE MOVE 8,6→8,8 ATK 8,8→8,9 END_ACTION | `fcda2758` | yes | 3,789 | 3,789 | 0 | 4,085 | 2409 |
| 23 | BUY lightning_1@8,5 END_PLACE MOVE 8,5→5,5 ATK 5,5→4,5 END_ACTION | `22156a8e` | yes | BUY lightning_1@8,5 END_PLACE MOVE 8,5→5,2 ATK 5,2→4,2 END_ACTION | `9778b35d` | yes | -997,000 | -997,000 | 0 | 5,997 | 1360 |
| 24 | BUY fire_1@8,5 MOVE 8,5→6,4 ATK 6,4→6,3 END_ACTION | `2d51c6de` | yes | BUY lightning_1@9,4 MOVE 9,4→5,5 ATK 5,5→4,5 MOVE 5,5→3,4 END_ACTION | `8f1f80cd` | yes | -991 | -603 | 388 | 2,863 | 1502 |
| 25 | END_ACTION | `33061dba` | yes | END_ACTION | `33061dba` | yes | -997,000 | -997,000 | 0 | -996,000 | 1184 |
| 26 | MOVE 9,9→7,7 END_ACTION | `43f8d292` | yes | MOVE 9,9→7,7 END_ACTION | `43f8d292` | yes | -999,000 | -999,000 | 0 | -998,000 | 1261 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 1 (the seat's turn #1).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key 9693d7fa61b4fb92 IS among the 19 candidates at this root; the engine played a932c749eddb7013 instead, worth -2069 cc to the adviser against -1522 cc

### Largest swing

**strong-candidate-misjudged** at turn 7 (the seat's turn #7).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key cb22af454b144edc IS among the 29 candidates at this root; the engine played 5a757949d9cee1dd instead, worth -46 cc to the adviser against 2471 cc

_1703465 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

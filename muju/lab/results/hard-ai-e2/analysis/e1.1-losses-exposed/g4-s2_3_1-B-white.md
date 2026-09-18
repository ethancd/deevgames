# Replay analysis — g4-s2_3_1-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g4-s2`. The game ended upkeep-elimination for white after 28 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 330 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `0f4ac124` | yes | END_PLACE MOVE 8,9→9,9 MOVE 9,8→9,7 END_ACTION | `4775a31d` | yes | -2,160 | -2,085 | 75 | -502 | 3007 |
| 2 | BUY lightning_1@9,8 PROMOTE 8,8 MOVE 9,8→2,3 END_ACTION | `82ee3187` | yes | BUY lightning_1@9,8 END_PLACE MOVE 9,8→6,3 ATK 6,3→5,3 END_ACTION | `dd8b0391` | yes | -2,610 | -615 | 1,995 | -1,015 | 2205 |
| 3 | BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 MOVE 9,9→8,9 END_ACTION | `c64ea2a8` | yes | BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 MOVE 9,9→8,9 END_ACTION | `c64ea2a8` | yes | -1,515 | -1,515 | 0 | -1,166 | 2339 |
| 4 | BUY fire_1@9,9 BUY water_1@8,8 MOVE 7,8→7,7 ATK 7,7→8,7 MOVE 8,9→7,9 MOVE 9,8→9,7 END_ACTION | `c44d74cb` | yes | BUY fire_1@9,9 BUY water_1@8,8 MOVE 7,8→7,6 MOVE 9,8→9,7 ATK 9,7→8,7 END_ACTION | `3e70ff29` | yes | -373 | -313 | 60 | -275 | 2458 |
| 5 | BUY fire_1@9,8 BUY fire_1@8,9 BUY fire_1@8,7 MOVE 8,7→6,5 MOVE 7,7→7,6 END_ACTION | `fc61c726` | yes | BUY fire_1@9,8 BUY fire_1@8,9 BUY fire_1@7,8 MOVE 7,8→2,7 MOVE 7,7→7,6 END_ACTION | `3279178d` | yes | -379 | -201 | 178 | -1,327 | 3024 |
| 6 | BUY fire_1@7,5 BUY fire_1@9,5 END_PLACE MOVE 7,5→3,4 ATK 3,4→3,5 END_ACTION | `a0d69ce1` | yes | BUY fire_1@7,5 BUY fire_1@6,6 END_PLACE MOVE 7,5→3,4 ATK 3,4→3,5 END_ACTION | `ff9bcfdb` | yes | -455 | 1,621 | 2,076 | 1,785 | 2660 |
| 7 | BUY fire_1@9,6 END_PLACE MOVE 7,6→7,2 END_ACTION | `f0be2ea4` | yes | BUY fire_1@9,6 PROMOTE 9,7 END_PLACE MOVE 7,6→7,2 END_ACTION | `dcd7d525` | yes | 1,189 | 482 | -707 | 1,508 | 2515 |
| 8 | BUY water_1@8,9 PROMOTE 9,7 END_PLACE MOVE 9,7→8,7 ATK 8,7→8,6 MOVE 7,2→7,1 MOVE 8,8→7,8 END_ACTION | `15944314` | yes | BUY water_1@8,9 END_PLACE MOVE 9,7→8,7 ATK 8,7→8,6 MOVE 7,2→7,1 MOVE 8,8→7,8 END_ACTION | `77f8ebf5` | yes | 2,068 | 2,408 | 340 | 3,065 | 2451 |
| 9 | BUY fire_1@9,8 BUY fire_1@8,8 END_PLACE ATK 8,7→9,7 MOVE 7,8→7,7 MOVE 8,8→6,6 END_ACTION | `404a8da8` | yes | BUY fire_1@9,8 BUY fire_1@7,9 END_PLACE ATK 8,7→9,7 MOVE 7,9→4,6 END_ACTION | `b66bc20e` | yes | 2,935 | 2,665 | -270 | 2,313 | 2255 |
| 10 | BUY fire_1@7,5 END_PLACE MOVE 7,5→5,5 ATK 5,5→5,6 END_ACTION | `447fe183` | yes | BUY fire_1@7,5 END_PLACE MOVE 7,5→1,5 ATK 1,5→1,4 END_ACTION | `9a4eb80d` | yes | 2,420 | 2,728 | 308 | 3,921 | 2569 |
| 11 | BUY fire_1@8,1 BUY fire_1@7,2 BUY fire_1@8,2 END_PLACE MOVE 5,5→1,3 ATK 1,3→0,3 END_ACTION | `6bbfd071` | yes | BUY fire_1@8,1 BUY fire_1@9,1 BUY fire_1@7,2 BUY fire_1@8,2 MOVE 8,1→1,0 END_ACTION | `09ed6d48` | yes | 2,794 | 4,614 | 1,820 | 3,010 | 2966 |
| 12 | BUY fire_1@9,1 BUY fire_1@9,2 BUY lightning_1@7,5 MOVE 7,5→1,0 END_ACTION | `1062e019` | yes | BUY fire_1@9,1 BUY fire_1@9,2 BUY lightning_1@7,5 MOVE 7,5→1,0 END_ACTION | `1062e019` | yes | 2,830 | 2,830 | 0 | 4,074 | 3000 |
| 13 | BUY fire_1@7,4 MOVE 7,4→5,4 ATK 5,4→4,4 END_ACTION | `c738639d` | yes | BUY lightning_1@7,3 MOVE 7,3→3,1 MOVE 8,7→8,6 MOVE 9,1→8,0 END_ACTION | `8618817d` | yes | 2,581 | 1,031 | -1,550 | 1,732 | 3018 |
| 14 | BUY fire_1@5,6 END_PLACE MOVE 5,6→2,6 ATK 2,6→1,6 END_ACTION | `b5feede0` | yes | BUY fire_1@8,4 BUY fire_1@5,5 ATK 5,4→4,4 ATK 8,4→8,3 MOVE 8,7→8,6 MOVE 9,2→8,2 END_ACTION | `bad7814e` | yes | 1,073 | 633 | -440 | 3,873 | 1333 |
| 15 | END_PLACE MOVE 7,2→5,4 ATK 5,4→4,4 END_ACTION | `f403ef0c` | yes | END_PLACE MOVE 7,2→6,3 ATK 6,3→5,3 END_ACTION | `a4fc712a` | yes | 2,665 | 2,180 | -485 | 5,020 | 1972 |
| 16 | BUY lightning_1@7,8 END_PLACE MOVE 7,8→5,4 ATK 5,4→5,5 END_ACTION | `a4ff8847` | yes | BUY lightning_1@7,8 END_PLACE MOVE 7,8→2,7 ATK 2,7→2,6 END_ACTION | `d36a6462` | yes | 26 | 791 | 765 | 4,209 | 1767 |
| 17 | BUY fire_1@8,8 END_PLACE MOVE 7,1→7,2 MOVE 9,1→6,1 ATK 6,1→5,1 END_ACTION | `448740fd` | yes | BUY fire_1@9,7 BUY fire_1@7,8 END_PLACE MOVE 7,1→8,1 MOVE 9,1→6,2 MOVE 9,7→8,6 END_ACTION | `c088961c` | yes | 1,009 | -269 | -1,278 | 3,513 | 1546 |
| 18 | BUY fire_1@7,8 END_PLACE MOVE 7,8→1,8 MOVE 8,7→8,6 END_ACTION | `a7190ebe` | yes | BUY fire_1@7,8 END_PLACE MOVE 7,8→2,7 ATK 2,7→2,6 END_ACTION | `9d402f51` | yes | 241 | -537 | -778 | 1,100 | 1081 |
| 19 | BUY fire_1@9,6 BUY lightning_1@8,7 MOVE 8,8→4,6 MOVE 9,6→9,4 END_ACTION | `0b617de5` | yes | BUY fire_1@9,6 BUY lightning_1@9,7 MOVE 8,8→4,6 MOVE 9,6→9,4 END_ACTION | `ae710d09` | yes | -3,516 | -203 | 3,313 | 732 | 1368 |
| 20 | END_PLACE MOVE 8,7→1,5 END_ACTION | `092266e6` | yes | END_PLACE MOVE 8,7→3,2 END_ACTION | `49e45c42` | yes | -6,240 | -6,093 | 147 | -1,989 | 1378 |
| 21 | PROMOTE 8,9 MOVE 7,2→4,2 MOVE 8,6→8,5 END_ACTION | `c95ba955` | yes | END_PLACE MOVE 7,2→6,2 MOVE 8,6→8,5 MOVE 7,7→7,5 END_ACTION | `3d3359d3` | yes | -10,521 | -5,755 | 4,766 | -3,973 | 1083 |
| 22 | ATK 8,9→9,9 MOVE 4,2→3,0 END_ACTION | `f6dbb81e` | yes | ATK 8,9→9,9 END_ACTION | `c1e2fc14` | yes | -9,788 | -10,972 | -1,184 | -10,670 | 760 |
| 23 | MOVE 8,5→6,4 MOVE 7,7→7,6 END_ACTION | `7da6e6fd` | yes | MOVE 8,5→8,2 MOVE 7,7→6,7 END_ACTION | `21d0807c` | yes | -10,134 | -9,470 | 664 | -3,894 | 1381 |
| 24 | MOVE 6,4→4,2 END_ACTION | `3e3fc5c1` | yes | ATK 6,4→6,5 MOVE 6,4→4,4 MOVE 7,6→8,6 END_ACTION | `c115c092` | yes | -997,000 | -9,015 | 987,985 | -4,740 | 1235 |
| 25 | UPKEEP(keep 2) ATK 8,9→9,9 MOVE 7,6→5,6 END_ACTION | `8e348ba8` | yes | UPKEEP(keep 2) ATK 8,9→9,9 MOVE 7,6→4,6 END_ACTION | `2411ece6` | yes | -7,130 | -8,020 | -890 | -8,364 | 1407 |
| 26 | MOVE 8,9→7,9 MOVE 7,9→8,9 MOVE 8,9→9,9 END_ACTION | `8b3016ad` | yes | END_ACTION | `fb58a0e4` | yes | -996,000 | -996,000 | 0 | -8,280 | 1941 |
| 27 | END_ACTION | `29d561e7` | yes | END_ACTION | `29d561e7` | yes | -998,000 | -998,000 | 0 | -997,000 | 1144 |
| 28 | UPKEEP(keep 0) | `1e01e2e4` | yes | UPKEEP(keep 0) | `1e01e2e4` | yes | -999,000 | -999,000 | 0 | -999,000 | 0 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key dd8b039153935d77 IS among the 28 candidates at this root; the engine played 82ee31872ff9ee0a instead, worth -2610 cc to the adviser against -615 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #26) and scored it -1015 cc, ABOVE the played candidate #0 at -3270 cc — so this re-run did not play what the seat played (it chose candidate #26 at -1015 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 24 (the seat's turn #24).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key c115c092a5d094a7 IS among the 22 candidates at this root; the engine played 3e3fc5c14264af1d instead, worth -997000 cc to the adviser against -9015 cc. root exposure: 22 candidate(s) from a `completed-depth` list, 22 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #1 (played) carry the same score -9697 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_1627843 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

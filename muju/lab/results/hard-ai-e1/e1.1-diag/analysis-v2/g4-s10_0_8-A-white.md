# Replay analysis — g4-s10_0_8-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g4-s10`. The game ended elimination for black after 31 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 356 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `014ba38c` | yes | END_ACTION | `014ba38c` | yes | 702 | 702 | 0 | 702 | 3004 |
| 2 | BUY fire_1@2,0 MOVE 3,2→6,5 MOVE 0,1→0,0 END_ACTION | `cfc2a1ad` | yes | BUY fire_1@2,0 MOVE 3,2→6,5 MOVE 0,1→0,0 END_ACTION | `cfc2a1ad` | yes | 1,226 | 1,226 | 0 | 2,507 | 2318 |
| 3 | BUY fire_1@1,0 BUY lightning_1@0,1 MOVE 0,1→3,4 ATK 3,4→3,3 MOVE 0,2→1,2 END_ACTION | `4fa3d959` | yes | BUY fire_1@1,0 BUY fire_1@0,1 MOVE 0,1→3,4 ATK 3,4→3,3 END_ACTION | `bd1579e6` | yes | 1,381 | 2,415 | 1,034 | 2,428 | 2791 |
| 4 | BUY fire_1@1,1 BUY fire_1@0,1 BUY lightning_1@2,4 MOVE 2,4→9,8 END_ACTION | `c9c698fe` | yes | BUY fire_1@1,1 BUY fire_1@0,1 BUY lightning_1@2,4 MOVE 2,4→9,8 END_ACTION | `c9c698fe` | yes | 4,176 | 4,176 | 0 | 4,219 | 2852 |
| 5 | BUY fire_1@2,4 BUY fire_1@0,2 BUY fire_1@2,2 MOVE 1,2→0,3 MOVE 2,4→2,8 END_ACTION | `8792b71a` | yes | BUY fire_1@2,4 BUY fire_1@0,2 BUY fire_1@2,2 MOVE 3,4→8,9 END_ACTION | `0be09591` | yes | 6,782 | 5,723 | -1,059 | 6,348 | 3017 |
| 6 | BUY fire_1@1,7 PROMOTE 3,4 MOVE 3,4→8,7 ATK 8,7→7,7 MOVE 8,7→9,7 END_ACTION | `a583ae23` | yes | BUY fire_1@2,4 BUY fire_1@1,7 BUY lightning_1@3,3 MOVE 3,3→9,8 END_ACTION | `2f2e7399` | yes | 5,906 | 8,305 | 2,399 | 10,466 | 1852 |
| 7 | BUY fire_1@2,7 BUY fire_1@1,8 PROMOTE 2,8 MOVE 2,2→5,5 MOVE 0,3→1,3 END_ACTION | `d51dfa0e` | yes | BUY shadow_1@2,4 END_PLACE MOVE 2,4→4,4 ATK 4,4→5,4 END_ACTION | `dcc7fe3b` | yes | 5,717 | 7,582 | 1,865 | 8,398 | 996 |
| 8 | BUY fire_1@2,1 BUY fire_1@0,4 PROMOTE 2,7 END_PLACE MOVE 0,2→5,5 END_ACTION | `12c10b77` | yes | BUY fire_1@2,1 BUY fire_1@2,3 BUY fire_1@0,4 PROMOTE 2,7 MOVE 0,2→8,2 END_ACTION | `8fdca4e3` | yes | 6,556 | 4,390 | -2,166 | 6,250 | 909 |
| 9 | BUY fire_1@2,7 BUY fire_1@2,4 END_PLACE MOVE 0,1→7,2 END_ACTION | `8ba79589` | yes | BUY water_1@2,7 END_PLACE ATK 2,7→3,7 END_ACTION | `607bc9ed` | yes | 3,879 | 4,429 | 550 | 8,322 | 941 |
| 10 | BUY fire_1@2,7 BUY fire_1@2,3 BUY fire_1@1,4 BUY fire_1@1,5 PROMOTE 2,4 END_PLACE MOVE 2,4→7,5 MOVE 2,3→3,4 END_ACTION | `dd508298` | yes | BUY lightning_1@2,2 END_PLACE MOVE 2,2→7,2 ATK 7,2→7,3 END_ACTION | `c4976f88` | yes | 2,116 | 2,328 | 212 | 3,822 | 1526 |
| 11 | BUY fire_1@2,3 BUY fire_1@2,5 END_PLACE MOVE 2,5→8,7 END_ACTION | `713c2426` | yes | BUY fire_1@2,3 BUY fire_1@2,5 END_PLACE MOVE 2,5→8,7 END_ACTION | `713c2426` | yes | 2,483 | 2,483 | 0 | 2,567 | 1845 |
| 12 | BUY fire_1@2,7 BUY fire_1@0,5 BUY fire_1@1,6 END_PLACE MOVE 2,8→8,8 MOVE 1,4→3,4 END_ACTION | `62e11871` | yes | END_PLACE MOVE 2,8→6,7 ATK 6,7→7,7 END_ACTION | `5b796728` | yes | 276 | 73 | -203 | 208 | 1128 |
| 13 | BUY fire_1@0,6 BUY fire_1@0,7 BUY fire_1@0,8 END_PLACE MOVE 2,1→4,5 MOVE 1,6→2,7 END_ACTION | `a3d9d2ea` | yes | END_PLACE MOVE 2,3→8,3 ATK 8,3→9,3 END_ACTION | `b056c6bf` | yes | 545 | 2,155 | 1,610 | 1,045 | 1240 |
| 14 | BUY fire_1@2,0 END_PLACE ATK 2,0→3,0 MOVE 1,5→4,6 MOVE 2,3→3,4 END_ACTION | `0ec86589` | yes | BUY fire_1@2,6 END_PLACE MOVE 1,5→4,6 MOVE 0,8→3,9 END_ACTION | `051558ef` | yes | 1,163 | 4,016 | 2,853 | 4,069 | 1357 |
| 15 | BUY fire_1@1,6 END_PLACE MOVE 0,8→4,9 MOVE 1,6→2,7 END_ACTION | `9d70eb67` | yes | BUY fire_1@1,6 END_PLACE MOVE 0,8→4,9 MOVE 1,6→2,7 END_ACTION | `9d70eb67` | yes | 1,217 | 1,217 | 0 | 2,590 | 987 |
| 16 | BUY fire_1@1,6 PROMOTE 0,5 END_PLACE MOVE 0,5→4,5 ATK 4,5→4,4 MOVE 0,4→2,4 END_ACTION | `6230a9ce` | yes | PROMOTE 0,5 END_PLACE MOVE 0,5→4,5 ATK 4,5→4,4 MOVE 0,6→2,6 END_ACTION | `5bccd66f` | yes | -323 | 1,231 | 1,554 | 1,573 | 1024 |
| 17 | BUY fire_1@1,6 END_PLACE MOVE 2,4→4,6 MOVE 0,7→0,9 MOVE 1,7→2,8 END_ACTION | `63ab0d75` | yes | BUY fire_1@1,4 END_PLACE MOVE 2,4→4,6 MOVE 0,7→0,9 MOVE 1,4→3,4 END_ACTION | `3dea78ce` | yes | -659 | 2,373 | 3,032 | 3 | 1115 |
| 18 | BUY fire_1@1,7 PROMOTE 2,8 END_PLACE MOVE 1,7→8,8 END_ACTION | `67f9cabd` | yes | BUY fire_1@1,4 END_PLACE MOVE 1,4→3,4 ATK 3,4→3,5 END_ACTION | `12e654b0` | yes | 1,167 | 589 | -578 | 5,178 | 873 |
| 19 | BUY fire_1@0,2 END_PLACE MOVE 0,6→5,9 END_ACTION | `b0cf5f29` | yes | PROMOTE 0,6 END_PLACE ATK 0,6→1,6 MOVE 0,6→3,6 ATK 3,6→3,5 END_ACTION | `c8c9f01c` | yes | 1,347 | 1,898 | 551 | 2,508 | 1804 |
| 20 | BUY fire_1@0,8 END_PLACE MOVE 0,9→6,9 END_ACTION | `ab8f50e1` | yes | BUY fire_1@0,8 END_PLACE MOVE 0,9→6,9 END_ACTION | `ab8f50e1` | yes | -565 | -565 | 0 | 2,932 | 1108 |
| 21 | BUY fire_1@0,1 BUY fire_1@0,4 END_PLACE MOVE 0,4→4,6 MOVE 1,1→2,2 END_ACTION | `936d2f5b` | yes | BUY fire_1@0,1 END_PLACE MOVE 1,1→4,6 END_ACTION | `592bf5da` | yes | -112 | -13 | 99 | 2,372 | 1559 |
| 22 | BUY lightning_1@0,3 END_PLACE MOVE 0,3→7,3 ATK 7,3→8,3 END_ACTION | `776ea9fa` | yes | BUY fire_1@0,4 END_PLACE MOVE 0,4→5,5 ATK 5,5→5,6 END_ACTION | `43a097af` | yes | -247 | -535 | -288 | 1,504 | 1153 |
| 23 | END_PLACE MOVE 1,0→3,4 ATK 3,4→3,5 END_ACTION | `642f3d8e` | yes | PROMOTE 0,2 END_PLACE ATK 0,2→1,2 MOVE 2,0→6,0 MOVE 0,2→2,2 END_ACTION | `c65099c6` | yes | -2,303 | 38 | 2,341 | 531 | 918 |
| 24 | END_PLACE MOVE 0,1→4,5 END_ACTION | `5a6aa1a0` | yes | BUY lightning_1@1,0 END_PLACE MOVE 1,0→9,4 END_ACTION | `6596231b` | yes | -7,950 | -2,290 | 5,660 | 607 | 1347 |
| 25 | PROMOTE 0,0 ATK 0,0→1,0 MOVE 0,0→1,0 END_ACTION | `ba567bf5` | yes | PROMOTE 0,0 ATK 0,0→1,0 MOVE 0,0→1,0 MOVE 1,0→2,0 END_ACTION | `897175c4` | yes | -9,210 | -8,762 | 448 | -9,566 | 859 |
| 26 | BUY water_1@0,0 PROMOTE 1,0 MOVE 1,0→3,1 ATK 3,1→2,1 END_ACTION | `6dc22adf` | yes | BUY water_1@0,0 PROMOTE 1,0 MOVE 1,0→3,1 ATK 3,1→2,1 END_ACTION | `6dc22adf` | yes | -10,350 | -10,350 | 0 | -8,797 | 3028 |
| 27 | UPKEEP(keep 1) MOVE 0,0→0,1 MOVE 0,1→0,2 MOVE 0,2→1,2 ATK 1,2→1,3 END_ACTION | `095ad67a` | yes | UPKEEP(keep 1) MOVE 0,0→0,1 MOVE 0,1→0,2 MOVE 0,2→1,2 ATK 1,2→1,3 END_ACTION | `095ad67a` | yes | -999,000 | -999,000 | 0 | -998,000 | 1367 |
| 28 | MOVE 1,2→1,1 ATK 1,1→2,1 END_ACTION | `a80c7e78` | yes | MOVE 1,2→1,1 ATK 1,1→2,1 END_ACTION | `a80c7e78` | yes | -995,000 | -995,000 | 0 | -8,371 | 2037 |
| 29 | MOVE 1,1→1,0 MOVE 1,0→0,0 END_ACTION | `11722e32` | yes | MOVE 1,1→1,0 MOVE 1,0→0,0 END_ACTION | `11722e32` | yes | -995,000 | -995,000 | 0 | -7,997 | 3024 |
| 30 | END_ACTION | `159ebf81` | yes | END_ACTION | `159ebf81` | yes | -997,000 | -997,000 | 0 | -996,000 | 1683 |
| 31 | MOVE 0,0→2,1 ATK 2,1→2,2 END_ACTION | `801a76f2` | yes | MOVE 0,0→2,1 ATK 2,1→2,2 END_ACTION | `801a76f2` | yes | -999,000 | -999,000 | 0 | -998,000 | 1169 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key bd1579e6f2486e15 IS among the 27 candidates at this root; the engine played 4fa3d95989eb433c instead, worth 1381 cc to the adviser against 2415 cc

### Largest swing

**strong-candidate-misjudged** at turn 24 (the seat's turn #24).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key 6596231b22bdc36f IS among the 29 candidates at this root; the engine played 5a6aa1a09c953c3d instead, worth -7950 cc to the adviser against -2290 cc

_1815024 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

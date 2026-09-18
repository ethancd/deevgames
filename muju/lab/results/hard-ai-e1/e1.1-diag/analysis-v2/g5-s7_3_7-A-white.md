# Replay analysis — g5-s7_3_7-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g5-s7`. The game ended home-checkmate for black after 35 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 381 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY fire_1@4,4 BUY lightning_1@4,2 MOVE 4,2→9,9 END_ACTION | `8377308e` | yes | BUY fire_1@4,4 BUY lightning_1@4,2 MOVE 4,2→9,9 END_ACTION | `8377308e` | yes | 3,634 | 3,634 | 0 | 3,572 | 3020 |
| 3 | BUY fire_1@4,1 END_PLACE ATK 4,1→5,1 END_ACTION | `77a85b67` | yes | BUY fire_1@0,0 BUY fire_1@1,0 MOVE 4,5→6,5 MOVE 0,1→0,2 MOVE 1,1→2,0 END_ACTION | `cb1ecf89` | yes | 1,974 | 1,841 | -133 | 2,891 | 2224 |
| 4 | BUY fire_1@4,3 BUY fire_1@3,4 BUY fire_1@4,4 MOVE 0,1→0,0 MOVE 1,1→1,0 MOVE 4,1→7,2 END_ACTION | `ff62fc22` | yes | BUY fire_1@3,3 BUY fire_1@3,4 BUY fire_1@4,4 MOVE 0,1→0,0 MOVE 4,1→8,1 MOVE 3,3→5,3 END_ACTION | `05b0c06e` | yes | 2,911 | 3,797 | 886 | 3,522 | 2690 |
| 5 | BUY fire_1@3,5 BUY fire_1@0,2 END_PLACE ATK 3,5→3,6 MOVE 4,3→7,2 ATK 7,2→6,2 END_ACTION | `ee3afa76` | yes | BUY fire_1@3,5 BUY fire_1@2,4 BUY fire_1@2,0 ATK 3,5→3,6 MOVE 4,3→7,2 ATK 7,2→6,2 END_ACTION | `4472a6ec` | yes | 5,011 | 4,950 | -61 | 5,168 | 3016 |
| 6 | END_PLACE MOVE 4,5→7,6 ATK 7,6→7,7 END_ACTION | `b6165b03` | yes | BUY fire_1@2,0 BUY fire_1@2,1 BUY fire_1@1,2 BUY fire_1@2,2 END_PLACE MOVE 2,1→7,2 ATK 7,2→6,2 END_ACTION | `4cb02bd1` | yes | 4,562 | 6,636 | 2,074 | 6,398 | 2908 |
| 7 | END_PLACE MOVE 1,0→1,1 ATK 1,1→1,2 END_ACTION | `a6cd1fa1` | yes | END_PLACE MOVE 1,0→1,1 ATK 1,1→1,2 END_ACTION | `a6cd1fa1` | yes | 5,406 | 5,406 | 0 | 6,209 | 1535 |
| 8 | BUY fire_1@2,0 BUY fire_1@0,2 BUY fire_1@3,4 BUY fire_1@2,1 END_PLACE MOVE 3,5→2,8 MOVE 4,4→5,5 END_ACTION | `21736374` | yes | BUY fire_1@2,0 BUY fire_1@0,2 BUY fire_1@3,4 BUY fire_1@2,1 END_PLACE MOVE 3,5→2,8 MOVE 4,4→5,5 END_ACTION | `21736374` | yes | 7,237 | 7,237 | 0 | 7,069 | 2401 |
| 9 | BUY fire_1@1,7 BUY fire_1@2,7 BUY fire_1@1,8 BUY fire_1@0,1 END_PLACE MOVE 1,1→1,2 MOVE 2,1→7,2 END_ACTION | `12720cb6` | yes | BUY fire_1@1,7 BUY fire_1@2,7 BUY fire_1@1,8 BUY fire_1@1,0 PROMOTE 2,8 END_PLACE MOVE 2,1→8,1 MOVE 3,4→5,4 END_ACTION | `2792c597` | yes | 8,992 | 6,909 | -2,083 | 10,158 | 2977 |
| 10 | BUY shadow_1@3,2 END_PLACE MOVE 3,2→5,2 ATK 5,2→6,2 END_ACTION | `0c5831c5` | yes | BUY shadow_1@3,2 END_PLACE MOVE 3,2→5,2 ATK 5,2→6,2 END_ACTION | `0c5831c5` | yes | 8,475 | 8,475 | 0 | 10,232 | 2303 |
| 11 | END_PLACE MOVE 2,8→9,7 END_ACTION | `6b295088` | yes | BUY fire_1@0,3 BUY fire_1@2,1 BUY fire_1@3,0 PROMOTE 3,4 END_PLACE MOVE 3,0→8,2 END_ACTION | `bac221c0` | yes | 8,383 | 7,326 | -1,057 | 9,198 | 3001 |
| 12 | BUY fire_1@1,0 BUY fire_1@1,1 BUY fire_1@2,2 BUY fire_1@0,3 PROMOTE 2,7 END_PLACE MOVE 1,1→7,1 MOVE 1,2→1,3 END_ACTION | `5003f518` | yes | BUY fire_1@1,0 BUY fire_1@1,1 BUY fire_1@2,2 BUY fire_1@0,3 PROMOTE 2,7 END_PLACE MOVE 1,1→8,2 END_ACTION | `c6606f30` | yes | 9,489 | 9,041 | -448 | 10,553 | 2698 |
| 13 | END_PLACE MOVE 2,7→7,9 END_ACTION | `ca3a8b83` | yes | END_PLACE MOVE 2,7→7,9 END_ACTION | `ca3a8b83` | yes | 10,109 | 10,109 | 0 | 11,556 | 2331 |
| 14 | BUY fire_1@2,3 PROMOTE 2,2 END_PLACE MOVE 3,4→8,2 END_ACTION | `e2c58b11` | yes | BUY fire_1@5,0 END_PLACE MOVE 5,2→6,1 ATK 6,1→7,1 MOVE 5,0→7,0 ATK 7,0→7,1 END_ACTION | `a0141016` | yes | 4,868 | 9,456 | 4,588 | 8,105 | 2872 |
| 15 | BUY fire_1@0,4 PROMOTE 2,0 END_PLACE MOVE 2,2→5,3 MOVE 1,3→2,3 ATK 2,3→3,3 END_ACTION | `a4e71f27` | yes | BUY fire_1@1,4 PROMOTE 2,0 END_PLACE MOVE 2,2→5,3 MOVE 1,4→2,7 END_ACTION | `5d040c18` | yes | 7,400 | 7,689 | 289 | 10,879 | 1497 |
| 16 | END_PLACE MOVE 1,7→8,8 END_ACTION | `2a12819e` | yes | END_PLACE MOVE 1,7→8,8 END_ACTION | `2a12819e` | yes | 8,679 | 8,679 | 0 | 8,840 | 2821 |
| 17 | END_PLACE MOVE 5,2→8,2 END_ACTION | `1a043b27` | yes | BUY fire_1@1,3 BUY fire_1@2,1 BUY fire_1@2,2 BUY fire_1@4,0 PROMOTE 5,2 END_PLACE ATK 1,3→1,4 MOVE 5,2→8,2 MOVE 2,3→3,3 END_ACTION | `74b24efd` | yes | 7,673 | 6,799 | -874 | 9,465 | 2159 |
| 18 | BUY fire_1@2,1 BUY fire_1@1,2 PROMOTE 2,3 END_PLACE MOVE 0,3→2,7 ATK 2,7→1,7 END_ACTION | `623d290c` | yes | BUY fire_1@2,1 BUY fire_1@2,2 END_PLACE MOVE 0,3→2,7 MOVE 2,2→3,3 END_ACTION | `f12facb2` | yes | 8,042 | 8,189 | 147 | 7,134 | 2279 |
| 19 | BUY fire_1@1,1 BUY fire_1@2,2 BUY fire_1@0,3 PROMOTE 2,1 END_PLACE MOVE 2,0→4,6 END_ACTION | `5a1ff4e4` | yes | END_PLACE MOVE 0,2→4,6 END_ACTION | `05ab835d` | yes | 4,465 | 8,605 | 4,140 | 8,271 | 2339 |
| 20 | END_PLACE MOVE 2,2→8,4 END_ACTION | `dd53a7eb` | yes | END_PLACE MOVE 2,2→8,4 END_ACTION | `dd53a7eb` | yes | 3,273 | 3,273 | 0 | 8,193 | 2087 |
| 21 | BUY fire_1@2,1 BUY fire_1@2,0 PROMOTE 1,2 END_PLACE ATK 2,1→3,1 MOVE 0,3→2,7 END_ACTION | `29a2d42d` | yes | BUY lightning_1@2,2 END_PLACE MOVE 2,2→5,5 ATK 5,5→5,6 END_ACTION | `e5054625` | yes | 737 | 3,221 | 2,484 | 4,708 | 1825 |
| 22 | END_PLACE MOVE 1,2→2,7 ATK 2,7→2,6 END_ACTION | `33dbe237` | yes | BUY fire_1@1,3 MOVE 1,3→2,8 MOVE 2,3→2,4 END_ACTION | `add66786` | yes | 1,412 | 3,478 | 2,066 | 1,931 | 2087 |
| 23 | BUY water_1@1,7 MOVE 2,1→5,4 MOVE 2,7→2,8 END_ACTION | `884f81d3` | yes | BUY water_1@1,7 MOVE 2,1→5,4 MOVE 0,2→0,4 END_ACTION | `ed58a3bc` | yes | 2,057 | 2,990 | 933 | 3,647 | 2274 |
| 24 | BUY lightning_1@1,8 MOVE 1,8→8,8 MOVE 0,2→0,4 END_ACTION | `1919b2a7` | yes | BUY lightning_1@1,8 MOVE 1,8→8,8 MOVE 0,2→0,4 END_ACTION | `1919b2a7` | yes | 4,977 | 4,977 | 0 | 4,726 | 2149 |
| 25 | BUY fire_1@1,4 MOVE 0,4→6,5 END_ACTION | `ddebe6b2` | yes | BUY lightning_1@2,7 MOVE 2,7→9,5 MOVE 0,4→2,4 END_ACTION | `5164eb49` | yes | 4,891 | 5,102 | 211 | 5,527 | 1465 |
| 26 | BUY lightning_1@2,4 MOVE 2,4→9,5 END_ACTION | `7a1ae231` | yes | END_PLACE MOVE 2,8→7,9 ATK 7,9→8,9 END_ACTION | `4767363c` | yes | 4,572 | 4,030 | -542 | 7,717 | 1860 |
| 27 | BUY fire_1@2,0 ATK 2,0→3,0 END_ACTION | `8a63f307` | yes | BUY water_1@2,7 MOVE 2,8→6,6 MOVE 1,7→1,8 END_ACTION | `d2d30a1d` | yes | 4,774 | 3,403 | -1,371 | 6,188 | 1959 |
| 28 | BUY fire_1@1,5 MOVE 1,7→2,8 ATK 2,8→3,8 MOVE 1,4→2,4 END_ACTION | `7e50b1c9` | yes | BUY fire_1@1,5 MOVE 1,7→2,8 ATK 2,8→3,8 MOVE 1,4→2,4 END_ACTION | `7e50b1c9` | yes | 7,145 | 7,145 | 0 | 8,761 | 2449 |
| 29 | BUY fire_1@0,5 MOVE 2,8→2,7 MOVE 2,0→6,0 MOVE 1,5→1,6 END_ACTION | `e1339776` | yes | BUY fire_1@0,5 MOVE 2,0→6,0 MOVE 1,1→2,4 END_ACTION | `c0d7c155` | yes | 5,455 | 4,848 | -607 | 7,012 | 2798 |
| 30 | END_PLACE MOVE 1,1→4,6 END_ACTION | `f6714ad6` | yes | END_PLACE MOVE 1,1→4,6 END_ACTION | `f6714ad6` | yes | 5,507 | 5,507 | 0 | 7,138 | 2846 |
| 31 | BUY fire_1@0,4 END_PLACE MOVE 0,5→4,6 MOVE 0,4→2,4 END_ACTION | `5b702f1a` | yes | BUY fire_1@0,4 END_PLACE MOVE 0,5→4,6 MOVE 0,4→2,4 END_ACTION | `5b702f1a` | yes | 7,028 | 7,028 | 0 | 8,192 | 2819 |
| 32 | BUY lightning_1@3,0 END_PLACE MOVE 3,0→3,3 ATK 3,3→3,4 END_ACTION | `f1ac742e` | yes | BUY fire_1@2,0 BUY fire_1@4,0 END_PLACE MOVE 4,0→4,4 ATK 4,4→3,4 MOVE 6,0→6,1 END_ACTION | `f7e02d9e` | yes | 5,009 | 5,949 | 940 | 8,567 | 2626 |
| 33 | PROMOTE 0,1 END_PLACE MOVE 0,1→4,5 END_ACTION | `b73da8ab` | yes | END_PLACE MOVE 0,1→4,5 END_ACTION | `5a79ce5a` | yes | 97 | -10 | -107 | 3,190 | 1858 |
| 34 | PROMOTE 1,0 MOVE 1,0→2,7 END_ACTION | `6825fe89` | yes | PROMOTE 1,0 MOVE 1,0→2,7 END_ACTION | `6825fe89` | yes | -995,000 | -995,000 | 0 | -4,420 | 2555 |
| 35 | ATK 0,0→0,1 MOVE 0,0→1,1 MOVE 1,1→1,2 END_ACTION | `c59389c3` | yes | ATK 0,0→0,1 MOVE 0,0→1,1 MOVE 1,1→1,2 END_ACTION | `c59389c3` | yes | -999,000 | -999,000 | 0 | -998,000 | 490 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 4 (the seat's turn #3).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key 05b0c06e62f7726c IS among the 29 candidates at this root; the engine played ff62fc2285f6bed1 instead, worth 2911 cc to the adviser against 3797 cc

### Largest swing

**strong-candidate-misjudged** at turn 14 (the seat's turn #13).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key a01410167df2b37a IS among the 29 candidates at this root; the engine played e2c58b11e124265c instead, worth 4868 cc to the adviser against 9456 cc

_1836417 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

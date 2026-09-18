# Replay analysis — e1-g3-s465_0_74-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g3-s465`. The game ended elimination for white after 26 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 310 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `bead54cb` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `bead54cb` | yes | -767 | -767 | 0 | -1,464 | 2736 |
| 2 | BUY lightning_1@9,8 BUY lightning_1@8,9 MOVE 9,8→7,7 ATK 7,7→8,7 MOVE 9,7→9,8 MOVE 7,7→7,4 END_ACTION | `53c47481` | yes | BUY lightning_1@9,8 BUY lightning_1@8,9 MOVE 8,9→7,7 ATK 7,7→8,7 MOVE 7,9→8,9 MOVE 9,8→8,6 END_ACTION | `00b95a63` | yes | 1,710 | 290 | -1,420 | 1,731 | 2158 |
| 3 | END_PLACE MOVE 8,9→7,4 MOVE 9,8→8,8 END_ACTION | `437daf52` | yes | END_PLACE MOVE 8,9→7,5 MOVE 9,8→8,8 END_ACTION | `4df0a26a` | yes | 623 | 653 | 30 | -467 | 2251 |
| 4 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→7,7 ATK 7,7→8,7 MOVE 7,9→7,8 MOVE 7,8→8,8 END_ACTION | `2dfa5ac7` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→7,7 ATK 7,7→8,7 MOVE 7,9→7,8 MOVE 7,8→8,8 END_ACTION | `2dfa5ac7` | yes | 1,997 | 1,997 | 0 | 1,298 | 1637 |
| 5 | BUY fire_1@8,9 BUY fire_1@9,7 BUY fire_1@9,8 END_PLACE MOVE 7,7→5,6 ATK 5,6→6,6 MOVE 8,8→7,8 MOVE 5,6→5,3 END_ACTION | `d2fb8b25` | yes | BUY fire_1@8,9 BUY fire_1@9,7 BUY fire_1@9,8 END_PLACE MOVE 7,7→5,6 ATK 5,6→6,6 MOVE 8,8→7,8 MOVE 5,6→5,3 END_ACTION | `d2fb8b25` | yes | 378 | 378 | 0 | 2,819 | 2547 |
| 6 | BUY fire_1@8,8 BUY water_1@7,9 MOVE 8,8→7,1 END_ACTION | `3de61e70` | yes | BUY fire_1@8,8 BUY water_1@7,9 MOVE 8,8→7,1 END_ACTION | `3de61e70` | yes | 1,302 | 1,302 | 0 | 985 | 2764 |
| 7 | BUY water_1@8,8 PROMOTE 7,8 MOVE 9,7→5,5 MOVE 7,8→7,7 END_ACTION | `2e362c2c` | yes | BUY water_1@8,8 PROMOTE 7,8 MOVE 9,7→5,5 MOVE 7,8→7,7 END_ACTION | `2e362c2c` | yes | -195 | -195 | 0 | 124 | 2773 |
| 8 | BUY fire_1@9,7 BUY fire_1@8,7 END_PLACE ATK 9,7→9,6 MOVE 8,7→7,2 END_ACTION | `d34bb969` | yes | BUY fire_1@9,7 BUY fire_1@8,7 END_PLACE ATK 9,7→9,6 MOVE 8,7→7,2 END_ACTION | `d34bb969` | yes | -240 | -240 | 0 | 1,465 | 2175 |
| 9 | BUY fire_1@8,7 END_PLACE MOVE 8,7→7,2 ATK 7,2→7,3 END_ACTION | `3db678bb` | yes | BUY fire_1@8,7 BUY water_1@7,8 END_PLACE MOVE 8,7→7,2 ATK 7,2→7,3 END_ACTION | `cd2b31d7` | yes | 395 | -2,211 | -2,606 | 1,513 | 3005 |
| 10 | BUY fire_1@8,7 BUY water_1@7,8 END_PLACE MOVE 8,7→7,2 ATK 7,2→7,3 END_ACTION | `e1f2bbb5` | yes | BUY fire_1@8,7 BUY fire_1@7,8 END_PLACE MOVE 7,8→2,7 MOVE 7,7→7,6 END_ACTION | `13f5a455` | yes | 186 | -1,448 | -1,634 | 416 | 2632 |
| 11 | BUY fire_1@8,7 MOVE 8,7→7,2 ATK 7,2→7,3 END_ACTION | `faa0d52a` | yes | BUY plant_1@8,7 MOVE 7,7→6,5 MOVE 9,7→8,6 END_ACTION | `c5664272` | yes | -2,080 | -1,961 | 119 | 665 | 3009 |
| 12 | END_PLACE MOVE 7,7→6,5 MOVE 8,8→8,7 END_ACTION | `350de911` | yes | BUY shadow_1@8,7 MOVE 7,7→6,5 MOVE 9,7→8,6 END_ACTION | `4ca0ffda` | yes | 1,296 | -2,737 | -4,033 | 1,668 | 1167 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**unclear** at no turn.

Rule: none of the above separates, or no turn reached the swing threshold

Evidence: no consequential decision found at this threshold (no turn reached 300 cc of swing over 12 turn(s))

### Largest swing

**unclear** at turn 11 (the seat's turn #11).

Rule: none of the above separates, or no turn reached the swing threshold

Evidence: the largest swing over the game is 119 cc on turn 11, below the 300 cc threshold

_592726 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

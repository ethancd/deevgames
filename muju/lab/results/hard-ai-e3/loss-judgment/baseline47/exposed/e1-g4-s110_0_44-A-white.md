# Replay analysis — e1-g4-s110_0_44-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s110`. The game ended home-checkmate for black after 40 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 442 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `cbc53490` | yes | END_ACTION | `cbc53490` | yes | -1,677 | -1,677 | 0 | 73 | 3018 |
| 2 | BUY fire_1@1,0 BUY fire_1@2,0 MOVE 2,3→5,5 ATK 5,5→5,4 END_ACTION | `26f29238` | yes | BUY fire_1@1,0 BUY fire_1@2,0 MOVE 2,3→5,5 ATK 5,5→5,4 END_ACTION | `26f29238` | yes | 504 | 504 | 0 | 2,018 | 2569 |
| 3 | BUY fire_1@1,1 BUY lightning_1@0,1 MOVE 1,2→1,3 MOVE 0,1→5,4 END_ACTION | `e13b829b` | yes | BUY fire_1@1,1 BUY lightning_1@0,1 MOVE 1,2→1,3 MOVE 0,1→5,4 END_ACTION | `e13b829b` | yes | 1,067 | 1,067 | 0 | 1,211 | 1664 |
| 4 | BUY fire_1@0,2 BUY fire_1@0,3 BUY lightning_1@1,2 ATK 1,2→2,2 MOVE 0,3→2,7 END_ACTION | `128e8eea` | yes | BUY fire_1@0,2 BUY fire_1@0,3 BUY lightning_1@1,2 ATK 1,2→2,2 MOVE 0,3→2,7 END_ACTION | `128e8eea` | yes | 3,511 | 3,511 | 0 | 4,234 | 1636 |
| 5 | BUY fire_1@0,1 BUY water_1@1,7 MOVE 1,3→1,4 MOVE 1,2→5,4 ATK 5,4→4,4 END_ACTION | `1fd65f49` | yes | BUY fire_1@0,1 BUY water_1@1,7 MOVE 1,3→1,4 MOVE 1,2→5,4 ATK 5,4→4,4 END_ACTION | `1fd65f49` | yes | 6,178 | 6,178 | 0 | 6,218 | 3022 |
| 6 | BUY fire_1@2,1 BUY fire_1@2,2 BUY fire_1@0,3 MOVE 0,3→6,5 END_ACTION | `2fac7ebc` | yes | BUY fire_1@2,1 BUY fire_1@2,2 BUY fire_1@0,3 MOVE 0,3→6,5 END_ACTION | `2fac7ebc` | yes | 6,122 | 6,122 | 0 | 6,034 | 1512 |
| 7 | BUY fire_1@0,3 BUY fire_1@0,4 BUY fire_1@2,4 PROMOTE 2,7 MOVE 2,4→4,4 ATK 4,4→4,3 MOVE 1,4→3,4 END_ACTION | `6413568e` | yes | BUY fire_1@0,3 BUY fire_1@2,4 END_PLACE MOVE 2,4→4,4 ATK 4,4→4,3 MOVE 1,4→3,4 END_ACTION | `baa94f35` | yes | 6,558 | 4,615 | -1,943 | 9,075 | 2787 |
| 8 | BUY fire_1@3,3 BUY fire_1@0,5 PROMOTE 2,7 MOVE 2,7→9,7 ATK 9,7→9,6 END_ACTION | `848acaf2` | yes | BUY fire_1@3,3 BUY fire_1@0,5 PROMOTE 2,7 MOVE 2,7→9,7 ATK 9,7→9,6 END_ACTION | `848acaf2` | yes | 6,428 | 6,428 | 0 | 8,679 | 3005 |
| 9 | BUY fire_1@3,3 BUY fire_1@1,5 END_PLACE ATK 3,3→4,3 MOVE 1,7→1,8 MOVE 2,2→5,3 END_ACTION | `4360a401` | yes | BUY fire_1@3,3 BUY fire_1@0,6 END_PLACE ATK 3,3→4,3 MOVE 1,7→1,8 MOVE 2,2→4,4 END_ACTION | `7cb3539e` | yes | 5,589 | 5,370 | -219 | 7,967 | 997 |
| 10 | BUY fire_1@1,7 BUY fire_1@2,4 BUY fire_1@0,6 PROMOTE 3,3 END_PLACE MOVE 3,3→5,5 ATK 5,5→5,4 MOVE 3,4→3,5 END_ACTION | `4c74d85f` | yes | BUY fire_1@1,7 BUY fire_1@1,6 PROMOTE 1,5 END_PLACE MOVE 3,3→5,5 ATK 5,5→5,4 MOVE 3,4→4,4 END_ACTION | `968f6e74` | yes | 6,579 | 5,341 | -1,238 | 5,013 | 927 |
| 11 | BUY lightning_1@3,4 END_PLACE MOVE 3,4→6,7 ATK 6,7→7,7 END_ACTION | `af4aca7f` | yes | BUY lightning_1@3,4 END_PLACE MOVE 3,4→6,7 ATK 6,7→7,7 END_ACTION | `af4aca7f` | yes | 5,996 | 5,996 | 0 | 7,011 | 939 |
| 12 | BUY fire_1@1,6 PROMOTE 2,1 END_PLACE MOVE 1,5→4,6 MOVE 0,5→2,7 END_ACTION | `45bad63c` | yes | BUY fire_1@1,6 PROMOTE 0,2 END_PLACE MOVE 1,5→4,6 MOVE 0,5→2,7 END_ACTION | `ae334218` | yes | 6,101 | 3,790 | -2,311 | 6,491 | 920 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**unclear** at no turn.

Rule: none of the above separates, or no turn reached the swing threshold

Evidence: no consequential decision found at this threshold (no turn reached 300 cc of swing over 12 turn(s))

### Largest swing

**unclear** at turn 1 (the seat's turn #1).

Rule: none of the above separates, or no turn reached the swing threshold

Evidence: the largest swing over the game is 0 cc on turn 1, below the 300 cc threshold

_570083 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

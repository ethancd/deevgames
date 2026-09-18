# Replay analysis — g5-s11_3_11-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g5-s11`. The game ended elimination for white after 18 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 207 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `baf55944` | yes | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 8,8→8,9 MOVE 9,8→9,7 MOVE 8,9→8,8 END_ACTION | `63f6d50f` | yes | -1,397 | -2,117 | -720 | -1,013 | 3006 |
| 2 | BUY lightning_1@9,8 PROMOTE 8,8 MOVE 9,8→2,3 END_ACTION | `b3e778cc` | yes | BUY water_1@9,8 MOVE 8,9→6,5 MOVE 6,5→4,5 END_ACTION | `a11c745a` | yes | -3,572 | -2,307 | 1,265 | -2,945 | 2465 |
| 3 | BUY water_1@8,9 ATK 8,9→7,9 MOVE 8,8→9,8 MOVE 8,9→7,9 MOVE 9,8→9,7 END_ACTION | `d4aa5ff0` | yes | BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 END_ACTION | `22690201` | yes | -1,440 | -1,372 | 68 | -246 | 1803 |
| 4 | BUY lightning_1@9,8 BUY lightning_1@9,9 ATK 7,9→8,9 MOVE 7,9→8,9 MOVE 9,8→8,6 MOVE 8,6→8,3 END_ACTION | `df71e33c` | yes | BUY lightning_1@9,8 BUY lightning_1@9,9 ATK 7,9→8,9 MOVE 7,9→8,9 MOVE 9,8→8,6 MOVE 8,6→8,3 END_ACTION | `df71e33c` | yes | 416 | 416 | 0 | -1,224 | 2478 |
| 5 | BUY fire_1@9,8 MOVE 9,7→7,6 ATK 7,6→7,7 END_ACTION | `dec94781` | yes | BUY fire_1@9,8 MOVE 9,7→7,6 ATK 7,6→7,7 END_ACTION | `dec94781` | yes | -742 | -742 | 0 | -376 | 1727 |
| 6 | BUY water_1@7,9 ATK 7,9→6,9 MOVE 7,6→4,6 END_ACTION | `f3475957` | yes | BUY water_1@7,9 ATK 7,9→6,9 MOVE 7,6→4,6 END_ACTION | `f3475957` | yes | 538 | 538 | 0 | 1,997 | 2355 |
| 7 | BUY fire_1@7,6 BUY lightning_1@5,6 MOVE 5,6→0,1 END_ACTION | `8e1a1efe` | yes | BUY fire_1@7,6 BUY lightning_1@5,6 MOVE 5,6→0,1 END_ACTION | `8e1a1efe` | yes | 1,749 | 1,749 | 0 | 5,470 | 1620 |
| 8 | BUY lightning_1@5,6 MOVE 5,6→0,0 END_ACTION | `5038e895` | yes | BUY fire_1@7,6 MOVE 7,6→4,5 ATK 4,5→4,4 MOVE 7,9→7,8 END_ACTION | `24223157` | yes | 480 | 968 | 488 | 2,689 | 2267 |
| 9 | BUY fire_1@5,6 MOVE 5,6→3,3 ATK 3,3→2,3 END_ACTION | `46b14959` | yes | BUY lightning_1@5,6 MOVE 5,6→0,2 MOVE 8,9→8,8 END_ACTION | `96173c87` | yes | -1,136 | 430 | 1,566 | 2,587 | 2879 |
| 10 | BUY fire_1@7,6 ATK 7,6→7,5 MOVE 7,6→7,2 MOVE 4,6→3,6 END_ACTION | `99979474` | yes | BUY fire_1@5,6 MOVE 4,6→2,7 MOVE 5,6→5,5 END_ACTION | `358eee21` | yes | -2,077 | -2,779 | -702 | -1,956 | 2971 |
| 11 | BUY lightning_1@6,6 MOVE 6,6→3,0 MOVE 8,9→8,8 END_ACTION | `7310d50f` | yes | BUY lightning_1@6,6 MOVE 6,6→3,0 MOVE 8,9→8,8 END_ACTION | `7310d50f` | yes | -2,237 | -2,237 | 0 | 938 | 3012 |
| 12 | BUY fire_1@8,9 MOVE 3,6→2,7 ATK 2,7→1,7 MOVE 9,8→9,6 END_ACTION | `d6bc5277` | yes | END_PLACE MOVE 3,6→2,3 END_ACTION | `61724e4c` | yes | -4,405 | -1,184 | 3,221 | 3,091 | 1152 |
| 13 | BUY water_1@9,8 MOVE 8,8→8,7 MOVE 8,9→6,5 END_ACTION | `b12f7b42` | yes | BUY fire_1@9,8 MOVE 9,8→8,5 ATK 8,5→8,6 MOVE 8,8→7,8 END_ACTION | `8b57f244` | yes | -3,969 | -192 | 3,777 | 4,195 | 1875 |
| 14 | END_PLACE MOVE 6,5→6,4 ATK 6,4→5,4 END_ACTION | `82d788d4` | yes | END_PLACE MOVE 6,5→2,7 ATK 2,7→1,7 END_ACTION | `9aa5c606` | yes | 67 | 1,536 | 1,469 | 4,941 | 1168 |
| 15 | BUY fire_1@8,9 END_PLACE ATK 8,9→8,8 MOVE 8,9→7,5 END_ACTION | `5030b8aa` | yes | BUY fire_1@8,9 END_PLACE ATK 8,9→8,8 END_ACTION | `4b09c086` | yes | -5,518 | -2,378 | 3,140 | 5,201 | 1621 |
| 16 | BUY fire_1@8,9 MOVE 8,9→5,4 END_ACTION | `40676e66` | yes | BUY fire_1@8,9 MOVE 8,9→5,4 END_ACTION | `40676e66` | yes | -2,647 | -2,647 | 0 | 3,859 | 1839 |
| 17 | MOVE 9,9→9,4 ATK 9,4→9,3 END_ACTION | `247e8028` | yes | MOVE 9,9→9,4 ATK 9,4→9,3 END_ACTION | `247e8028` | yes | -999,000 | -999,000 | 0 | -998,000 | 2154 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key a11c745a8590e61d IS among the 28 candidates at this root; the engine played b3e778cca6ace100 instead, worth -3572 cc to the adviser against -2307 cc

### Largest swing

**strong-candidate-misjudged** at turn 13 (the seat's turn #13).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key 8b57f244913b2ba2 IS among the 29 candidates at this root; the engine played b12f7b42d815331b instead, worth -3969 cc to the adviser against -192 cc

_899849 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

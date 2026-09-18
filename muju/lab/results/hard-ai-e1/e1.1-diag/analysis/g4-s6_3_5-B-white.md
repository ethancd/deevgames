# Replay analysis — g4-s6_3_5-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g4-s6`. The game ended elimination for white after 22 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 264 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `4844d47f` | yes | BUY fire_1@9,9 MOVE 9,8→9,7 MOVE 9,9→9,8 MOVE 8,9→9,9 END_ACTION | `559e2d60` | yes | -2,473 | -1,797 | 676 | -949 | 2110 |
| 2 | BUY lightning_1@9,8 PROMOTE 8,8 MOVE 9,8→2,3 END_ACTION | `ed33ab4e` | yes | BUY water_1@9,8 MOVE 8,9→6,5 MOVE 6,5→5,4 END_ACTION | `f0bb83e5` | yes | -3,572 | -1,650 | 1,922 | -2,945 | 2244 |
| 3 | BUY water_1@8,9 ATK 8,9→7,9 MOVE 8,8→9,8 MOVE 8,9→7,9 MOVE 9,8→9,7 END_ACTION | `8a7e8c72` | yes | BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 END_ACTION | `7cbdd183` | yes | -1,440 | -1,372 | 68 | -246 | 1651 |
| 4 | BUY lightning_1@9,8 BUY lightning_1@9,9 ATK 7,9→8,9 MOVE 7,9→8,9 MOVE 9,8→8,6 MOVE 8,6→8,3 END_ACTION | `81a530be` | yes | BUY lightning_1@9,8 BUY lightning_1@9,9 ATK 7,9→8,9 MOVE 7,9→8,9 MOVE 9,8→8,6 MOVE 8,6→8,3 END_ACTION | `81a530be` | yes | -809 | -809 | 0 | -1,224 | 2246 |
| 5 | BUY fire_1@9,8 MOVE 9,7→7,6 ATK 7,6→7,7 END_ACTION | `801d9403` | yes | BUY fire_1@9,8 MOVE 9,7→7,6 ATK 7,6→7,7 END_ACTION | `801d9403` | yes | -527 | -527 | 0 | -376 | 1593 |
| 6 | BUY water_1@7,9 ATK 7,9→6,9 MOVE 7,6→4,6 END_ACTION | `ad938ad5` | yes | BUY water_1@7,9 ATK 7,9→6,9 MOVE 7,6→4,6 END_ACTION | `ad938ad5` | yes | 417 | 417 | 0 | 2,105 | 2144 |
| 7 | BUY fire_1@7,6 BUY lightning_1@5,6 MOVE 5,6→0,1 END_ACTION | `d0cecd7c` | yes | BUY lightning_1@5,6 END_PLACE MOVE 5,6→0,1 END_ACTION | `6b215fd0` | yes | 1,883 | 2,970 | 1,087 | 3,060 | 2056 |
| 8 | BUY lightning_1@5,6 MOVE 5,6→0,0 END_ACTION | `0eec3b17` | yes | BUY fire_1@5,6 MOVE 5,6→4,3 ATK 4,3→3,3 MOVE 7,9→7,8 END_ACTION | `65c62ee7` | yes | 111 | 1,753 | 1,642 | 4,394 | 2115 |
| 9 | BUY fire_1@5,6 MOVE 5,6→3,3 ATK 3,3→2,3 END_ACTION | `18659adb` | yes | BUY fire_1@7,6 ATK 7,6→7,5 MOVE 7,6→7,2 MOVE 8,9→8,8 END_ACTION | `40e03019` | yes | -1,824 | 3,350 | 5,174 | 2,467 | 2492 |
| 10 | BUY fire_1@7,6 ATK 7,6→7,5 MOVE 7,6→7,2 MOVE 4,6→3,6 END_ACTION | `c74347f6` | yes | BUY fire_1@7,6 ATK 7,6→7,5 MOVE 7,6→7,2 MOVE 4,6→3,6 END_ACTION | `c74347f6` | yes | -2,196 | -2,196 | 0 | -1,945 | 2506 |
| 11 | BUY fire_1@5,6 MOVE 3,6→2,7 MOVE 8,9→8,8 MOVE 5,6→5,4 END_ACTION | `877c72fd` | yes | BUY lightning_1@6,6 MOVE 6,6→3,0 MOVE 8,9→8,8 END_ACTION | `91f6c92e` | yes | -2,044 | -2,292 | -248 | 1,083 | 3008 |
| 12 | BUY fire_1@9,8 ATK 9,8→9,7 MOVE 9,8→6,5 END_ACTION | `4f9043cc` | yes | BUY fire_1@9,8 ATK 9,8→9,7 MOVE 9,8→6,5 END_ACTION | `4f9043cc` | yes | -1,104 | -1,104 | 0 | -1,104 | 3008 |
| 13 | BUY lightning_1@6,7 END_PLACE MOVE 6,7→4,1 ATK 4,1→5,1 END_ACTION | `a596a718` | yes | BUY fire_1@6,7 END_PLACE MOVE 6,7→6,5 ATK 6,5→5,5 END_ACTION | `81c930e9` | yes | -615 | 1,559 | 2,174 | 1,416 | 1255 |
| 14 | BUY lightning_1@8,9 MOVE 8,8→8,7 MOVE 7,9→7,7 MOVE 8,7→8,6 END_ACTION | `89b78f87` | yes | BUY fire_1@8,9 MOVE 8,8→7,8 MOVE 8,9→8,5 END_ACTION | `adb0d37a` | yes | -1,524 | 2,392 | 3,916 | 7,503 | 1038 |
| 15 | BUY fire_1@9,9 ATK 9,9→9,8 MOVE 8,9→4,4 END_ACTION | `5deac0a6` | yes | BUY water_1@9,9 ATK 9,9→9,8 MOVE 8,9→4,4 END_ACTION | `9583f2c5` | yes | 1,194 | 4,762 | 3,568 | 4,746 | 1204 |
| 16 | BUY fire_1@9,6 BUY fire_1@8,7 MOVE 8,6→6,5 MOVE 7,7→7,8 END_ACTION | `c7c8c48c` | yes | BUY fire_1@9,6 BUY fire_1@8,7 MOVE 8,6→6,5 MOVE 7,7→7,8 END_ACTION | `c7c8c48c` | yes | 5,237 | 5,237 | 0 | 8,553 | 1524 |
| 17 | BUY fire_1@9,7 BUY fire_1@7,9 ATK 7,8→7,7 MOVE 7,9→3,9 MOVE 9,6→8,5 END_ACTION | `009866ca` | yes | BUY fire_1@9,7 BUY fire_1@9,8 MOVE 9,6→5,4 ATK 5,4→5,3 END_ACTION | `d07e847b` | yes | 5,927 | 10,209 | 4,282 | 10,636 | 1411 |
| 18 | BUY fire_1@8,7 END_PLACE MOVE 8,7→3,6 ATK 3,6→3,5 END_ACTION | `2e4897e6` | yes | BUY fire_1@8,7 END_PLACE MOVE 8,7→3,6 ATK 3,6→3,5 END_ACTION | `2e4897e6` | yes | 15,164 | 15,164 | 0 | 16,458 | 1334 |
| 19 | BUY lightning_1@9,8 END_PLACE MOVE 9,8→1,4 END_ACTION | `deec7fec` | yes | BUY fire_1@9,8 BUY fire_1@8,8 MOVE 8,8→6,5 ATK 6,5→7,5 END_ACTION | `94968eb8` | yes | 10,509 | 14,915 | 4,406 | 13,886 | 2391 |
| 20 | BUY lightning_1@9,8 MOVE 9,8→4,5 ATK 4,5→3,5 END_ACTION | `03c4c5d1` | yes | BUY fire_1@9,8 MOVE 9,7→6,6 MOVE 9,8→9,6 MOVE 9,6→9,4 END_ACTION | `6a8edaec` | yes | -2,320 | -645 | 1,675 | 13,208 | 1344 |
| 21 | MOVE 9,7→6,5 ATK 6,5→6,4 END_ACTION | `0adb3eb6` | yes | MOVE 9,7→6,5 ATK 6,5→6,4 END_ACTION | `0adb3eb6` | yes | -997,000 | -997,000 | 0 | -996,000 | 633 |

`played cc` is the adviser's value of the position the played turn left (searched from the opponent and negated); `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**reply-missed** at turn 1 (the seat's turn #1).

Rule: the production engine reproduced the played turn and scored it at least the swing threshold ABOVE the adviser's assessment of it, and the adviser's refutation is an opponent reply the production generator does not offer at the reply node

Evidence: the production engine reproduced the played turn and scored it -949 cc; the adviser values the same position at -2473 cc, and its refutation (end key 196d229407b0bcdd) is not among the 20 replies the production generator offers at that node

### Largest swing

**reply-missed** at turn 9 (the seat's turn #9).

Rule: the production engine reproduced the played turn and scored it at least the swing threshold ABOVE the adviser's assessment of it, and the adviser's refutation is an opponent reply the production generator does not offer at the reply node

Evidence: the production engine reproduced the played turn and scored it 2467 cc; the adviser values the same position at -1824 cc, and its refutation (end key 4022db3f08448ac2) is not among the 20 replies the production generator offers at that node

_1236509 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

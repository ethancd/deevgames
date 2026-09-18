# Replay analysis — g3-s1_0_1-B-white

Seat under analysis: **black** (`hard@lab`) against `aiv2-hard`, opening `g3-s1`. The game ended home-checkmate for black after 9 turns — a **win** for this seat.

Adviser: `hard@lab` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 93 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 8,9→7,9 END_ACTION | `5b834a72` | yes | MOVE 8,9→9,9 MOVE 9,9→7,9 MOVE 9,8→9,9 END_ACTION | `1bcb15b8` | yes | -2,136 | -2,236 | -100 | -1,849 | 4584 ⚠ |
| 2 | PROMOTE 9,8 MOVE 9,8→9,7 END_ACTION | `f644f893` | yes | PROMOTE 9,8 MOVE 9,9→8,9 END_ACTION | `413dd1fd` | yes | -3,948 | -3,882 | 66 | -3,521 | 1662 |
| 3 | MOVE 9,7→9,8 ATK 9,8→9,9 MOVE 9,8→8,8 ATK 8,8→7,8 END_ACTION | `c17cb827` | yes | MOVE 9,7→9,8 ATK 9,8→9,9 MOVE 9,8→8,8 ATK 8,8→7,8 END_ACTION | `c17cb827` | yes | -4,360 | -4,360 | 0 | -8,449 | 1858 |
| 4 | BUY fire_1@8,9 BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 MOVE 7,8→7,7 MOVE 7,7→7,6 END_ACTION | `b0c33ee2` | yes | BUY fire_1@8,9 BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 MOVE 7,8→7,7 MOVE 7,7→7,6 END_ACTION | `b0c33ee2` | yes | 760 | 760 | 0 | -285 | 1207 |
| 5 | BUY water_1@9,9 MOVE 9,9→8,9 ATK 8,9→7,9 END_ACTION | `4bb64528` | yes | BUY water_1@9,9 MOVE 9,9→8,9 ATK 8,9→7,9 END_ACTION | `4bb64528` | yes | 214 | 214 | 0 | 502 | 1107 |
| 6 | BUY water_1@9,9 MOVE 7,6→6,5 MOVE 9,8→9,7 MOVE 8,9→7,9 END_ACTION | `5cc37f6a` | yes | BUY fire_1@7,8 ATK 7,8→6,8 MOVE 7,6→4,6 END_ACTION | `a163d189` | yes | -1,092 | 475 | 1,567 | 905 | 2012 |
| 7 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→4,1 END_ACTION | `3db03da2` | yes | BUY fire_1@9,8 BUY water_1@8,9 MOVE 6,5→5,4 MOVE 9,8→7,8 ATK 7,8→6,8 END_ACTION | `0e5980d0` | yes | -36 | 781 | 817 | 1,012 | 2726 |
| 8 | PROMOTE 6,5 MOVE 6,5→0,3 END_ACTION | `3acf4b2b` | yes | PROMOTE 6,5 MOVE 6,5→0,3 END_ACTION | `3acf4b2b` | yes | -964 | -964 | 0 | 1,839 | 1430 |
| 9 | END_PLACE MOVE 0,3→1,0 ATK 1,0→2,0 MOVE 1,0→0,0 | `9ac3eff3` | yes | END_PLACE MOVE 0,3→1,0 ATK 1,0→2,0 MOVE 1,0→0,0 | `9ac3eff3` | yes | 999,000 | 999,000 | 0 | 999,000 | 9 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**reply-missed** at turn 6 (the seat's turn #6).

Rule: the production engine reproduced the played turn and scored it at least the swing threshold ABOVE the adviser's assessment of it, and the adviser's refutation is an opponent reply the production generator does not offer at the reply node

Evidence: the production engine reproduced the played turn and scored it 905 cc; the adviser values the same position at -1092 cc, and its refutation (end key 42688c5570e45c84) is not among the 19 replies the production generator offers at that node

### Largest swing

**reply-missed** at turn 6 (the seat's turn #6).

Rule: the production engine reproduced the played turn and scored it at least the swing threshold ABOVE the adviser's assessment of it, and the adviser's refutation is an opponent reply the production generator does not offer at the reply node

Evidence: the production engine reproduced the played turn and scored it 905 cc; the adviser values the same position at -1092 cc, and its refutation (end key 42688c5570e45c84) is not among the 19 replies the production generator offers at that node

_332444 ms of analysis wall time; analyser config `hard:lab:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:lab:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

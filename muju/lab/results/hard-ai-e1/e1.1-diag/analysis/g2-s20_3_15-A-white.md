# Replay analysis — g2-s20_3_15-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g2-s20`. The game ended elimination for black after 27 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 300 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 3,0→3,4 END_ACTION | `9f35cd24` | yes | MOVE 3,0→3,4 END_ACTION | `9f35cd24` | yes | 1,034 | 1,034 | 0 | -83 | 3002 |
| 2 | BUY fire_1@0,0 BUY lightning_1@2,4 MOVE 2,4→9,9 END_ACTION | `30f34800` | yes | BUY fire_1@0,0 BUY fire_1@0,1 MOVE 3,4→5,5 ATK 5,5→4,5 END_ACTION | `da9c29b6` | yes | 1,559 | 1,352 | -207 | 2,225 | 2450 |
| 3 | BUY fire_1@0,1 BUY shadow_1@1,0 MOVE 1,0→3,4 ATK 3,4→3,3 END_ACTION | `c5f8b28e` | yes | BUY fire_1@1,0 BUY lightning_1@0,1 MOVE 0,2→0,3 MOVE 0,1→3,4 ATK 3,4→3,3 END_ACTION | `987d5cba` | yes | 952 | 1,503 | 551 | 1,870 | 2782 |
| 4 | BUY fire_1@1,0 BUY lightning_1@3,3 MOVE 0,2→0,3 MOVE 3,3→7,5 ATK 7,5→6,5 END_ACTION | `22a7569a` | yes | BUY fire_1@2,0 BUY lightning_1@3,3 MOVE 0,2→0,3 MOVE 3,3→7,5 ATK 7,5→6,5 END_ACTION | `3c611542` | yes | 4,630 | 4,361 | -269 | 3,271 | 3001 |
| 5 | BUY fire_1@2,0 BUY lightning_1@3,3 MOVE 1,1→2,1 MOVE 3,3→7,5 ATK 7,5→6,5 END_ACTION | `525ff784` | yes | BUY fire_1@2,0 BUY lightning_1@2,4 MOVE 1,1→2,1 MOVE 2,4→6,6 ATK 6,6→6,5 END_ACTION | `f381de0f` | yes | 4,305 | 3,305 | -1,000 | 4,322 | 2951 |
| 6 | BUY fire_1@1,2 BUY fire_1@3,0 BUY lightning_1@2,4 MOVE 3,0→7,2 MOVE 0,3→0,4 END_ACTION | `81817d58` | yes | BUY fire_1@1,2 BUY fire_1@3,0 BUY lightning_1@2,4 MOVE 3,0→8,2 END_ACTION | `c0fb2947` | yes | 5,237 | 4,789 | -448 | 6,043 | 2198 |
| 7 | BUY fire_1@6,0 BUY fire_1@7,1 BUY fire_1@6,2 MOVE 6,2→8,8 END_ACTION | `0aadff3e` | yes | BUY fire_1@6,0 BUY fire_1@7,1 BUY lightning_1@5,1 MOVE 5,1→9,8 END_ACTION | `3a5ea28b` | yes | 6,229 | 8,396 | 2,167 | 9,968 | 2077 |
| 8 | BUY fire_1@1,2 BUY fire_1@7,0 PROMOTE 7,2 ATK 1,2→1,3 MOVE 2,1→2,2 MOVE 0,4→0,5 MOVE 7,0→8,1 END_ACTION | `9ada9050` | yes | BUY fire_1@1,2 BUY fire_1@6,1 PROMOTE 7,2 ATK 1,2→1,3 MOVE 0,4→0,5 MOVE 6,0→8,2 END_ACTION | `03ade006` | yes | 6,540 | 5,649 | -891 | 7,505 | 3011 |
| 9 | BUY fire_1@3,3 BUY fire_1@7,0 BUY fire_1@8,0 PROMOTE 8,1 ATK 3,3→4,3 MOVE 0,5→1,7 END_ACTION | `20bda1d0` | yes | BUY fire_1@3,3 BUY fire_1@7,0 BUY fire_1@8,0 PROMOTE 6,0 ATK 3,3→4,3 MOVE 0,5→1,7 END_ACTION | `ba2da455` | yes | 2,050 | 2,439 | 389 | 7,833 | 2984 |
| 10 | END_PLACE MOVE 8,1→8,5 ATK 8,5→8,6 END_ACTION | `50dc858d` | yes | END_PLACE MOVE 8,1→8,5 ATK 8,5→8,6 END_ACTION | `50dc858d` | yes | 3,341 | 3,341 | 0 | 8,282 | 3019 |
| 11 | BUY fire_1@6,1 PROMOTE 0,1 END_PLACE MOVE 6,0→5,4 MOVE 8,0→8,2 END_ACTION | `85120e98` | yes | BUY fire_1@6,1 PROMOTE 1,0 END_PLACE MOVE 6,0→5,4 MOVE 8,0→8,2 END_ACTION | `3d8b9f06` | yes | 4,160 | 4,160 | 0 | 5,668 | 3022 |
| 12 | BUY fire_1@1,4 PROMOTE 7,1 END_PLACE MOVE 6,1→8,5 ATK 8,5→9,5 END_ACTION | `1e14b593` | yes | END_PLACE MOVE 6,1→8,5 ATK 8,5→9,5 END_ACTION | `4e449f2a` | yes | 6,575 | 6,324 | -251 | 5,560 | 951 |
| 13 | END_PLACE MOVE 7,0→8,2 ATK 8,2→7,2 MOVE 1,7→2,7 END_ACTION | `d28dc1b9` | yes | BUY lightning_1@1,6 END_PLACE MOVE 1,6→7,6 ATK 7,6→8,6 END_ACTION | `06d094b7` | yes | 5,718 | 5,872 | 154 | 8,035 | 1438 |
| 14 | END_PLACE MOVE 1,4→8,5 END_ACTION | `79519081` | yes | BUY shadow_1@2,6 END_PLACE MOVE 2,6→7,7 ATK 7,7→7,8 END_ACTION | `6bda5287` | yes | 5,405 | 5,863 | 458 | 5,998 | 1391 |
| 15 | BUY lightning_1@2,5 END_PLACE MOVE 2,5→9,7 ATK 9,7→9,8 END_ACTION | `b1d6ce28` | yes | BUY fire_1@2,4 END_PLACE MOVE 2,4→6,4 ATK 6,4→7,4 END_ACTION | `20c728d3` | yes | 3,941 | 7,981 | 4,040 | 5,881 | 3009 |
| 16 | BUY fire_1@1,1 BUY fire_1@2,1 BUY water_1@0,2 PROMOTE 1,2 END_PLACE MOVE 2,1→7,2 MOVE 1,2→1,3 END_ACTION | `afdf33ee` | yes | BUY fire_1@1,1 BUY fire_1@2,1 BUY fire_1@0,2 PROMOTE 1,2 END_PLACE MOVE 2,1→7,2 MOVE 1,2→1,3 END_ACTION | `6876b580` | yes | 525 | 1,866 | 1,341 | 2,717 | 1268 |
| 17 | BUY fire_1@7,1 BUY fire_1@6,1 PROMOTE 7,2 END_PLACE MOVE 6,1→8,7 END_ACTION | `fe9371db` | yes | BUY fire_1@7,1 BUY fire_1@1,2 BUY fire_1@6,2 BUY fire_1@6,1 PROMOTE 7,2 END_PLACE MOVE 6,2→8,8 END_ACTION | `69defba6` | yes | 3,475 | 3,179 | -296 | 5,983 | 2739 |
| 18 | END_PLACE MOVE 7,2→8,5 ATK 8,5→8,6 END_ACTION | `9292c0e5` | yes | BUY fire_1@6,2 PROMOTE 1,1 END_PLACE ATK 6,2→6,3 MOVE 2,2→2,3 MOVE 6,2→8,4 END_ACTION | `082f6a79` | yes | 2,871 | 3,987 | 1,116 | 6,198 | 1371 |
| 19 | BUY fire_1@6,1 PROMOTE 1,1 END_PLACE MOVE 6,1→7,3 ATK 7,3→6,3 MOVE 2,2→2,3 END_ACTION | `c644a3c1` | yes | BUY fire_1@7,0 BUY fire_1@1,2 PROMOTE 2,0 END_PLACE MOVE 7,0→9,4 MOVE 2,2→2,3 END_ACTION | `13bc9ec0` | yes | 1,082 | 1,425 | 343 | 5,046 | 2510 |
| 20 | BUY fire_1@6,0 BUY fire_1@6,1 BUY lightning_1@7,0 MOVE 7,0→9,8 END_ACTION | `735493d4` | yes | BUY fire_1@6,1 END_PLACE MOVE 1,3→2,8 MOVE 7,1→8,2 END_ACTION | `b4c52977` | yes | -1,366 | 2,580 | 3,946 | 3,781 | 1589 |
| 21 | MOVE 6,1→9,6 END_ACTION | `a2672422` | yes | MOVE 6,1→9,6 END_ACTION | `a2672422` | yes | 449 | 449 | 0 | 55 | 2781 |
| 22 | UPKEEP(keep 5) MOVE 2,0→8,1 END_ACTION | `7ff68870` | yes | UPKEEP(keep 6) MOVE 1,1→8,2 END_ACTION | `5db42dce` | yes | -2,942 | 179 | 3,121 | -36 | 2011 |
| 23 | MOVE 2,3→4,3 MOVE 0,0→0,1 MOVE 0,1→1,1 END_ACTION | `19ff6267` | yes | MOVE 2,3→3,3 MOVE 1,0→4,3 END_ACTION | `ac3df61a` | yes | -2,623 | -4,082 | -1,459 | -894 | 2948 |
| 24 | END_PLACE MOVE 0,2→0,1 END_ACTION | `82fbd7a7` | yes | END_PLACE MOVE 1,1→6,2 ATK 6,2→6,3 END_ACTION | `e38f266b` | yes | -2,743 | -3,213 | -470 | -1,138 | 2611 |
| 25 | BUY fire_1@1,0 ATK 1,0→2,0 END_ACTION | `7888d846` | yes | END_PLACE MOVE 1,1→6,2 ATK 6,2→6,3 END_ACTION | `041cb208` | yes | -995,000 | -7,145 | 987,855 | -2,681 | 3021 |
| 26 | END_ACTION | `033b2439` | yes | MOVE 1,1→7,3 END_ACTION | `6e244d3f` | yes | -997,000 | -5,214 | 991,786 | -5,604 | 1128 |
| 27 | MOVE 0,1→2,2 ATK 2,2→2,1 END_ACTION | `de4de959` | yes | MOVE 0,1→2,2 ATK 2,2→2,1 END_ACTION | `de4de959` | yes | -999,000 | -999,000 | 0 | -998,000 | 1044 |

`played cc` is the adviser's value of the position the played turn left (searched from the opponent and negated); `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key 987d5cba3b0297a2 IS among the 28 candidates at this root; the engine played c5f8b28ed6e36696 instead, worth 952 cc to the adviser against 1503 cc

### Largest swing

**clock-fallback** at turn 26 (the seat's turn #26).

Rule: the seat's own turn wall time exceeded its allowance (max(10ms, 1%) tolerance), or the turn dispatched nothing but phase ends, or the adviser itself returned a fallback (pack-error / engine-error / divergence). Per-turn wall time is real (players[side].turnMs); the run's overruns/budgetExhausted counters are per GAME, so a fallback on a specific turn can be suspected from them but not proved

Evidence: the turn dispatched nothing but phase ends

_1440723 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

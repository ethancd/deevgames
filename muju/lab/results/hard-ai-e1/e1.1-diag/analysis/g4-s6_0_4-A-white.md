# Replay analysis — g4-s6_0_4-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g4-s6`. The game ended home-checkmate for black after 30 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 341 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `32059b56` | yes | END_ACTION | `32059b56` | yes | 2,489 | 2,489 | 0 | 1,487 | 3015 |
| 2 | BUY fire_1@4,4 BUY fire_1@3,3 MOVE 4,5→6,5 MOVE 0,1→0,0 MOVE 3,3→5,3 ATK 5,3→5,4 END_ACTION | `49883ca8` | yes | BUY fire_1@4,4 BUY fire_1@3,4 ATK 4,4→5,4 MOVE 0,1→0,0 MOVE 3,4→2,7 END_ACTION | `74a931f0` | yes | 2,412 | 2,709 | 297 | 2,817 | 2647 |
| 3 | BUY fire_1@3,4 BUY water_1@1,0 MOVE 3,4→4,6 ATK 4,6→3,6 MOVE 4,4→5,5 END_ACTION | `f618501d` | yes | BUY fire_1@3,4 BUY fire_1@1,0 MOVE 3,4→4,6 ATK 4,6→3,6 MOVE 4,4→5,5 END_ACTION | `295f6a7a` | yes | 3,528 | 3,338 | -190 | 3,693 | 1366 |
| 4 | BUY fire_1@2,5 BUY fire_1@3,4 BUY lightning_1@5,1 MOVE 2,5→2,7 ATK 2,7→2,6 MOVE 1,1→2,1 END_ACTION | `aee34087` | yes | BUY fire_1@2,5 BUY fire_1@3,4 BUY lightning_1@5,1 ATK 2,5→2,6 MOVE 1,1→0,2 MOVE 2,5→2,7 END_ACTION | `f19ab202` | yes | 3,774 | 4,151 | 377 | 5,175 | 1411 |
| 5 | BUY fire_1@3,3 BUY fire_1@2,4 PROMOTE 5,1 MOVE 5,1→8,9 ATK 8,9→9,9 END_ACTION | `d3080663` | yes | END_PLACE MOVE 5,3→5,5 ATK 5,5→5,6 END_ACTION | `651447da` | yes | 4,488 | 4,086 | -402 | 3,774 | 2439 |
| 6 | BUY fire_1@2,0 BUY fire_1@0,2 BUY lightning_1@5,1 MOVE 2,4→2,7 ATK 2,7→2,6 END_ACTION | `968ac1b2` | yes | BUY fire_1@2,0 BUY fire_1@0,2 BUY lightning_1@5,1 MOVE 5,1→9,8 END_ACTION | `46079986` | yes | 4,351 | 4,436 | 85 | 4,231 | 2459 |
| 7 | BUY fire_1@4,3 END_PLACE MOVE 5,3→7,1 ATK 7,1→6,1 MOVE 2,1→2,2 END_ACTION | `29ebc477` | yes | BUY fire_1@4,3 BUY fire_1@1,5 BUY lightning_1@5,1 MOVE 5,3→7,1 ATK 7,1→6,1 MOVE 2,1→2,2 END_ACTION | `3156e2a7` | yes | 2,982 | 4,134 | 1,152 | 5,330 | 3009 |
| 8 | BUY fire_1@6,0 BUY fire_1@0,1 END_PLACE MOVE 3,3→2,8 MOVE 4,3→4,5 END_ACTION | `8b8cca61` | yes | BUY fire_1@6,0 BUY fire_1@6,1 BUY fire_1@0,1 BUY fire_1@1,2 PROMOTE 7,1 MOVE 6,1→7,2 MOVE 3,4→2,7 MOVE 4,3→4,4 END_ACTION | `6f598710` | yes | 3,363 | 2,004 | -1,359 | 3,417 | 3007 |
| 9 | BUY fire_1@7,0 BUY fire_1@6,1 BUY fire_1@1,1 PROMOTE 7,1 END_PLACE MOVE 6,1→6,5 MOVE 2,2→2,3 MOVE 7,0→8,1 END_ACTION | `fbf1a27d` | yes | BUY fire_1@7,0 BUY fire_1@6,1 BUY fire_1@1,1 PROMOTE 7,1 END_PLACE MOVE 6,1→6,5 MOVE 2,2→2,3 MOVE 7,0→8,1 END_ACTION | `fbf1a27d` | yes | 1,794 | 1,794 | 0 | 3,013 | 2875 |
| 10 | BUY fire_1@8,0 BUY fire_1@6,1 BUY fire_1@0,3 END_PLACE MOVE 8,1→8,9 END_ACTION | `371a7f97` | yes | BUY fire_1@8,0 BUY fire_1@1,2 END_PLACE MOVE 8,1→8,9 END_ACTION | `b31fb666` | yes | 2,555 | 1,655 | -900 | 2,927 | 2211 |
| 11 | END_PLACE MOVE 6,1→6,9 END_ACTION | `74184870` | yes | END_PLACE MOVE 6,1→6,9 END_ACTION | `74184870` | yes | 1,327 | 1,327 | 0 | 1,632 | 1933 |
| 12 | BUY water_1@2,1 END_PLACE ATK 0,2→1,2 ATK 1,1→1,2 MOVE 2,1→2,2 ATK 2,2→1,2 END_ACTION | `e51bc539` | yes | BUY fire_1@5,1 BUY fire_1@7,0 END_PLACE MOVE 6,0→8,2 MOVE 8,0→8,1 MOVE 5,1→6,2 END_ACTION | `bc4e06a2` | yes | 353 | -3 | -356 | 2,372 | 2553 |
| 13 | BUY fire_1@1,2 END_PLACE MOVE 6,0→8,2 MOVE 8,0→8,1 MOVE 1,2→1,4 END_ACTION | `a08b0124` | yes | BUY fire_1@1,2 END_PLACE MOVE 6,0→8,2 MOVE 8,0→8,1 MOVE 1,2→1,4 END_ACTION | `a08b0124` | yes | 788 | 788 | 0 | 2,184 | 2582 |
| 14 | BUY fire_1@7,0 BUY fire_1@6,1 BUY fire_1@7,1 END_PLACE MOVE 1,1→2,7 END_ACTION | `9922198b` | yes | END_PLACE MOVE 8,2→9,8 END_ACTION | `37cb08df` | yes | 1,348 | 1,457 | 109 | 2,715 | 3004 |
| 15 | BUY fire_1@7,2 BUY fire_1@0,2 END_PLACE ATK 0,2→0,3 MOVE 0,2→4,4 END_ACTION | `1e3e2acf` | yes | BUY fire_1@6,2 BUY fire_1@7,2 BUY fire_1@0,2 END_PLACE ATK 0,2→0,3 MOVE 0,2→4,4 END_ACTION | `c1e0706d` | yes | 3,423 | 2,982 | -441 | 4,230 | 3023 |
| 16 | BUY fire_1@1,2 END_PLACE MOVE 8,1→9,8 END_ACTION | `ecfc126e` | yes | BUY fire_1@1,2 END_PLACE MOVE 1,2→2,7 ATK 2,7→2,8 END_ACTION | `612cd90a` | yes | 3,057 | 4,273 | 1,216 | 4,749 | 2805 |
| 17 | BUY fire_1@8,1 BUY fire_1@3,2 END_PLACE ATK 3,2→3,3 MOVE 1,2→1,8 END_ACTION | `1c8b8537` | yes | BUY fire_1@8,1 BUY fire_1@6,2 BUY fire_1@3,2 END_PLACE ATK 3,2→3,3 MOVE 1,2→1,8 END_ACTION | `63f98d33` | yes | 1,328 | 3,611 | 2,283 | 3,749 | 1743 |
| 18 | BUY fire_1@3,2 END_PLACE ATK 3,2→3,3 MOVE 6,1→6,5 MOVE 3,2→3,4 END_ACTION | `9ddd08a6` | yes | BUY fire_1@6,2 BUY fire_1@3,2 END_PLACE ATK 3,2→3,3 MOVE 6,1→5,4 MOVE 3,2→3,4 END_ACTION | `86db07a6` | yes | 6,143 | 5,287 | -856 | 5,388 | 1594 |
| 19 | BUY fire_1@6,2 END_PLACE MOVE 8,1→9,8 END_ACTION | `ec7d6142` | yes | BUY fire_1@8,0 BUY fire_1@5,1 BUY fire_1@6,2 PROMOTE 3,4 END_PLACE MOVE 7,2→9,8 END_ACTION | `02e80e26` | yes | 4,898 | 4,952 | 54 | 6,954 | 913 |
| 20 | BUY fire_1@8,0 BUY fire_1@8,1 PROMOTE 6,2 END_PLACE MOVE 8,1→9,8 END_ACTION | `b521ff6e` | yes | BUY fire_1@8,0 BUY fire_1@8,1 PROMOTE 2,0 END_PLACE MOVE 8,1→9,8 END_ACTION | `e9bb29d9` | yes | 4,320 | 3,682 | -638 | 6,187 | 797 |
| 21 | END_PLACE MOVE 8,2→9,8 END_ACTION | `39a2ac2b` | yes | BUY fire_1@8,1 BUY fire_1@6,2 PROMOTE 0,1 END_PLACE MOVE 7,2→9,8 END_ACTION | `ace6a2d5` | yes | 2,509 | 3,602 | 1,093 | 4,602 | 860 |
| 22 | BUY fire_1@5,1 BUY fire_1@6,1 BUY fire_1@5,0 PROMOTE 0,1 END_PLACE MOVE 7,1→9,7 END_ACTION | `92a34b12` | yes | BUY fire_1@5,1 BUY fire_1@6,1 PROMOTE 0,1 END_PLACE MOVE 8,0→9,7 END_ACTION | `539e3a65` | yes | 687 | 1,409 | 722 | 1,749 | 673 |
| 23 | END_PLACE MOVE 6,1→7,6 ATK 7,6→7,7 END_ACTION | `350318a9` | yes | END_PLACE MOVE 7,0→8,7 END_ACTION | `721f4927` | yes | -879 | -502 | 377 | 3,115 | 835 |
| 24 | BUY lightning_1@6,0 END_PLACE MOVE 6,0→7,6 ATK 7,6→7,7 END_ACTION | `8097cdd6` | yes | BUY fire_1@4,0 PROMOTE 2,0 END_PLACE MOVE 8,0→9,5 MOVE 7,0→8,1 END_ACTION | `f4c1485f` | yes | 1,209 | -2,267 | -3,476 | 1,881 | 1269 |
| 25 | END_PLACE MOVE 5,0→5,6 ATK 5,6→5,7 END_ACTION | `f8826984` | yes | BUY water_1@2,0 END_PLACE ATK 2,0→2,1 END_ACTION | `d4a776e5` | yes | -50 | 1,299 | 1,349 | 3,213 | 813 |
| 26 | END_PLACE ATK 1,0→1,1 MOVE 8,0→9,5 END_ACTION | `7adcdd01` | yes | END_PLACE ATK 1,0→1,1 MOVE 8,0→9,5 END_ACTION | `7adcdd01` | yes | 2,427 | 2,427 | 0 | 3,437 | 865 |
| 27 | BUY fire_1@3,0 END_PLACE MOVE 3,0→4,5 MOVE 7,0→8,1 END_ACTION | `ad3de092` | yes | BUY fire_1@3,0 END_PLACE MOVE 3,0→4,5 MOVE 7,0→8,1 END_ACTION | `ad3de092` | yes | -927 | -927 | 0 | 4,062 | 1362 |
| 28 | PROMOTE 0,1 MOVE 0,1→8,5 END_ACTION | `b1c33ff0` | yes | END_PLACE MOVE 0,1→6,1 ATK 6,1→7,1 END_ACTION | `db8b7fb5` | yes | -9,505 | -2,686 | 6,819 | -1,149 | 1154 |
| 29 | MOVE 1,0→1,4 END_ACTION | `8fc124e5` | yes | MOVE 1,0→1,4 END_ACTION | `8fc124e5` | yes | -6,856 | -6,856 | 0 | -6,799 | 3006 |
| 30 | END_PLACE MOVE 0,0→1,0 MOVE 1,0→1,1 MOVE 1,1→1,3 END_ACTION | `da8fff0c` | yes | END_PLACE MOVE 0,0→1,0 MOVE 1,0→1,1 MOVE 1,1→1,3 END_ACTION | `da8fff0c` | yes | -999,000 | -999,000 | 0 | -998,000 | 760 |

`played cc` is the adviser's value of the position the played turn left (searched from the opponent and negated); `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 4 (the seat's turn #4).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key f19ab20217e49e6f IS among the 30 candidates at this root; the engine played aee340870423b0a4 instead, worth 3774 cc to the adviser against 4151 cc

### Largest swing

**strong-candidate-misjudged** at turn 28 (the seat's turn #28).

Rule: the adviser's best turn IS in the production generator's K list, and the production engine preferred the played turn anyway. NOT separable from "strong candidate discarded": RootResult exposes neither per-candidate scores nor which candidates the root searched, so "in the list but never searched" and "searched and mis-scored" are one class here

Evidence: the adviser's best end key db8b7fb51b5487f3 IS among the 25 candidates at this root; the engine played b1c33ff005911e3e instead, worth -9505 cc to the adviser against -2686 cc

_1719938 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

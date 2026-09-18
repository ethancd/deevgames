# Replay analysis — g4-s10_0_8-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g4-s10`. The game ended elimination for white after 35 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 401 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `254fc782` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `254fc782` | yes | -253 | -253 | 0 | -702 | 3007 |
| 2 | BUY fire_1@9,8 BUY fire_1@8,9 ATK 9,8→8,8 MOVE 9,7→8,8 MOVE 9,8→9,6 END_ACTION | `156927c8` | yes | BUY fire_1@9,8 BUY fire_1@8,9 ATK 9,8→8,8 MOVE 9,7→8,8 MOVE 9,8→9,6 END_ACTION | `156927c8` | yes | -393 | -393 | 0 | 1,009 | 1898 |
| 3 | BUY fire_1@9,7 END_PLACE ATK 9,7→8,7 END_ACTION | `ae1f1964` | yes | BUY fire_1@9,7 END_PLACE ATK 9,7→8,7 END_ACTION | `ae1f1964` | yes | -1,175 | -1,175 | 0 | 676 | 1771 |
| 4 | BUY water_1@9,8 END_PLACE MOVE 9,6→6,5 MOVE 8,8→8,7 MOVE 7,9→7,8 END_ACTION | `12ba024a` | yes | BUY water_1@9,8 END_PLACE MOVE 9,6→6,5 MOVE 8,8→8,7 MOVE 8,7→7,7 END_ACTION | `a7817295` | yes | -784 | -929 | -145 | 866 | 3001 |
| 5 | BUY fire_1@8,8 BUY water_1@7,9 END_PLACE MOVE 9,7→6,5 ATK 6,5→6,6 END_ACTION | `acf042f6` | yes | BUY fire_1@8,8 BUY fire_1@7,9 END_PLACE MOVE 7,9→4,6 MOVE 8,7→8,6 END_ACTION | `5fa8ecf1` | yes | 73 | -932 | -1,005 | 766 | 3008 |
| 6 | BUY water_1@9,7 END_PLACE ATK 9,7→9,6 MOVE 8,7→7,7 MOVE 8,8→7,5 END_ACTION | `2ebcbad8` | yes | BUY fire_1@9,7 END_PLACE ATK 9,7→9,6 MOVE 8,7→7,7 MOVE 8,8→8,4 END_ACTION | `0aff45ef` | yes | 176 | 118 | -58 | 1,115 | 2706 |
| 7 | BUY fire_1@8,7 BUY lightning_1@8,8 PROMOTE 7,7 END_PLACE MOVE 8,7→5,5 ATK 5,5→6,5 END_ACTION | `3a68d3df` | yes | BUY fire_1@8,8 BUY fire_1@8,7 END_PLACE MOVE 8,7→4,5 MOVE 7,7→7,6 END_ACTION | `35b6a6ff` | yes | -951 | 253 | 1,204 | 959 | 3015 |
| 8 | BUY fire_1@6,5 BUY fire_1@5,6 END_PLACE MOVE 7,7→8,6 MOVE 5,6→4,5 MOVE 5,5→5,3 END_ACTION | `17848261` | yes | BUY fire_1@6,5 BUY fire_1@9,5 END_PLACE MOVE 7,7→7,6 MOVE 6,5→7,2 MOVE 5,5→4,4 END_ACTION | `4493f897` | yes | 1,838 | 1,792 | -46 | 2,709 | 3019 |
| 9 | BUY fire_1@8,5 BUY fire_1@6,6 END_PLACE MOVE 6,5→3,4 ATK 3,4→4,4 MOVE 6,6→4,6 END_ACTION | `cdcd622d` | yes | BUY fire_1@6,6 END_PLACE MOVE 6,5→3,4 ATK 3,4→4,4 END_ACTION | `379803f7` | yes | 3,243 | 1,824 | -1,419 | 4,656 | 1685 |
| 10 | END_PLACE MOVE 3,4→2,3 ATK 2,3→1,3 END_ACTION | `c6fdb0e0` | yes | BUY fire_1@9,5 BUY fire_1@9,6 END_PLACE ATK 3,4→3,3 MOVE 8,5→7,2 MOVE 8,6→8,5 END_ACTION | `af2d55ef` | yes | 1,797 | 2,007 | 210 | 5,238 | 1681 |
| 11 | BUY fire_1@9,5 PROMOTE 8,8 END_PLACE MOVE 8,8→2,4 ATK 2,4→3,4 END_ACTION | `96344080` | yes | BUY fire_1@9,5 PROMOTE 8,6 END_PLACE MOVE 8,8→2,4 END_ACTION | `9e49ac52` | yes | 2,247 | 585 | -1,662 | 3,990 | 987 |
| 12 | BUY fire_1@8,8 PROMOTE 8,6 END_PLACE MOVE 8,6→7,4 ATK 7,4→7,5 END_ACTION | `7dbf8c18` | yes | BUY fire_1@8,8 PROMOTE 8,6 END_PLACE MOVE 8,6→7,4 ATK 7,4→7,5 END_ACTION | `7dbf8c18` | yes | 1,921 | 1,921 | 0 | 1,976 | 1427 |
| 13 | END_PLACE MOVE 7,4→7,2 MOVE 8,8→6,6 END_ACTION | `97a1be0c` | yes | PROMOTE 8,8 END_PLACE MOVE 7,4→7,2 MOVE 8,8→7,6 END_ACTION | `58faf24e` | yes | 794 | 1,530 | 736 | 2,164 | 1462 |
| 14 | BUY fire_1@8,8 END_PLACE MOVE 7,2→8,2 MOVE 8,8→6,6 ATK 6,6→7,6 END_ACTION | `09248167` | yes | BUY fire_1@8,8 PROMOTE 7,8 END_PLACE MOVE 7,2→8,2 MOVE 8,8→6,6 ATK 6,6→7,6 END_ACTION | `3f905b96` | yes | 552 | 698 | 146 | 2,514 | 1658 |
| 15 | BUY fire_1@9,2 BUY fire_1@8,3 BUY fire_1@9,3 END_PLACE MOVE 8,3→3,2 ATK 3,2→2,2 END_ACTION | `9310573a` | yes | BUY fire_1@8,3 END_PLACE MOVE 8,3→3,2 ATK 3,2→2,2 END_ACTION | `71e79b21` | yes | -1,017 | 334 | 1,351 | 875 | 1178 |
| 16 | BUY fire_1@9,3 BUY fire_1@9,5 END_PLACE MOVE 8,2→8,1 MOVE 9,5→5,5 ATK 5,5→5,6 END_ACTION | `e4f02215` | yes | BUY fire_1@9,3 BUY fire_1@9,4 BUY fire_1@9,5 END_PLACE ATK 8,2→8,3 MOVE 8,2→8,1 MOVE 9,4→5,4 END_ACTION | `a2718898` | yes | -1,574 | 942 | 2,516 | 1,750 | 1136 |
| 17 | BUY lightning_1@9,4 END_PLACE MOVE 9,4→6,4 ATK 6,4→5,4 END_ACTION | `e3edbc92` | yes | BUY fire_1@9,3 BUY fire_1@9,4 BUY fire_1@9,5 PROMOTE 9,2 END_PLACE ATK 9,3→8,3 MOVE 8,1→7,1 MOVE 9,2→7,2 MOVE 9,3→9,1 END_ACTION | `f50f42d6` | yes | -1,904 | -485 | 1,419 | 1,856 | 1203 |
| 18 | BUY lightning_1@8,8 END_PLACE MOVE 8,8→7,3 ATK 7,3→6,3 END_ACTION | `01389468` | yes | BUY lightning_1@8,8 END_PLACE MOVE 8,8→7,3 ATK 7,3→6,3 END_ACTION | `01389468` | yes | 1,891 | 1,891 | 0 | 1,149 | 1624 |
| 19 | BUY fire_1@8,3 BUY fire_1@9,4 END_PLACE ATK 8,3→8,2 MOVE 7,3→3,1 MOVE 8,3→7,2 END_ACTION | `b1e84b34` | yes | BUY fire_1@8,3 BUY fire_1@8,4 BUY fire_1@7,6 END_PLACE ATK 8,3→8,2 MOVE 7,3→3,1 MOVE 8,3→7,2 END_ACTION | `254bcf05` | yes | 1,805 | 2,102 | 297 | 2,238 | 1109 |
| 20 | BUY fire_1@9,5 BUY fire_1@8,8 END_PLACE MOVE 9,4→5,4 ATK 5,4→5,5 MOVE 9,5→8,4 END_ACTION | `0cadb13e` | yes | BUY fire_1@9,5 END_PLACE MOVE 9,4→5,4 ATK 5,4→5,5 MOVE 9,5→9,4 END_ACTION | `b23e4d79` | yes | -154 | 416 | 570 | 3,764 | 1632 |
| 21 | PROMOTE 7,8 END_PLACE MOVE 8,8→7,1 END_ACTION | `37bfc359` | yes | PROMOTE 7,8 END_PLACE MOVE 8,8→7,1 END_ACTION | `37bfc359` | yes | 1,866 | 1,866 | 0 | 3,088 | 1238 |
| 22 | BUY fire_1@8,8 END_PLACE ATK 8,8→8,7 MOVE 8,8→4,6 END_ACTION | `4edff218` | yes | BUY fire_1@8,8 END_PLACE ATK 8,8→8,7 MOVE 8,8→4,6 END_ACTION | `4edff218` | yes | 2,036 | 2,036 | 0 | 1,519 | 1261 |
| 23 | BUY fire_1@8,8 END_PLACE MOVE 8,8→4,6 ATK 4,6→5,6 END_ACTION | `ccb6481f` | yes | BUY fire_1@8,8 END_PLACE MOVE 8,8→4,6 ATK 4,6→5,6 END_ACTION | `ccb6481f` | yes | 49 | 49 | 0 | 2,828 | 2670 |
| 24 | PROMOTE 7,8 MOVE 7,8→7,1 END_ACTION | `59a5e221` | yes | BUY lightning_1@8,8 END_PLACE MOVE 8,8→4,3 MOVE 7,8→7,7 END_ACTION | `4739396a` | yes | -3,214 | -1,292 | 1,922 | -211 | 2275 |
| 25 | END_ACTION | `a2a4d080` | yes | MOVE 7,1→7,5 ATK 7,5→7,6 END_ACTION | `61e11e04` | yes | -5,037 | -3,337 | 1,700 | -4,180 | 2245 |
| 26 | END_PLACE ATK 7,9→8,9 END_ACTION | `4b1dc8ca` | yes | BUY fire_1@9,9 ATK 7,9→8,9 MOVE 7,1→2,2 END_ACTION | `6dce8ccd` | yes | -6,917 | -995,000 | -988,083 | -6,093 | 1681 |
| 27 | BUY lightning_1@8,9 MOVE 8,9→5,6 ATK 5,6→5,7 END_ACTION | `b95e8592` | yes | BUY shadow_1@8,9 MOVE 7,1→2,2 END_ACTION | `7939c61b` | yes | -4,724 | -5,793 | -1,069 | 1,797 | 2742 |
| 28 | MOVE 7,1→6,2 ATK 6,2→5,2 END_ACTION | `7ff229c9` | yes | MOVE 7,1→6,2 ATK 6,2→5,2 MOVE 6,2→2,2 END_ACTION | `2d5499b0` | yes | -5,677 | -5,236 | 441 | 2,151 | 1005 |
| 29 | BUY fire_1@8,9 MOVE 8,9→7,4 ATK 7,4→6,4 END_ACTION | `45d14245` | yes | BUY fire_1@8,9 MOVE 6,2→2,2 END_ACTION | `22bbd984` | yes | -997,000 | -3,450 | 993,550 | -1,552 | 1778 |
| 30 | UPKEEP(keep 2) MOVE 7,9→7,6 ATK 7,6→7,5 END_ACTION | `9f09e625` | yes | UPKEEP(keep 2) MOVE 9,8→9,6 MOVE 7,9→7,8 MOVE 7,8→6,8 END_ACTION | `71d6529c` | yes | -997,000 | -995,000 | 2,000 | -3,738 | 2200 |
| 31 | BUY lightning_1@9,9 MOVE 7,6→6,5 ATK 6,5→5,5 MOVE 9,8→8,8 END_ACTION | `802b0b6e` | yes | BUY fire_1@9,9 MOVE 9,9→6,6 ATK 6,6→5,6 END_ACTION | `f98e9ac2` | yes | -995,000 | 1,242 | 996,242 | 34 | 1721 |
| 32 | MOVE 8,8→8,9 ATK 8,9→9,9 END_ACTION | `7bd6552c` | yes | MOVE 8,8→8,9 ATK 8,9→9,9 END_ACTION | `7bd6552c` | yes | -997,000 | -997,000 | 0 | -996,000 | 1071 |
| 33 | ATK 8,9→9,9 END_ACTION | `36db145f` | yes | ATK 8,9→9,9 MOVE 8,9→8,8 MOVE 8,8→9,8 END_ACTION | `372e595f` | yes | -995,000 | -995,000 | 0 | -2,660 | 1316 |
| 34 | MOVE 8,9→6,7 END_ACTION | `d74f21b7` | yes | MOVE 8,9→6,7 END_ACTION | `d74f21b7` | yes | -999,000 | -999,000 | 0 | -998,000 | 1167 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 7 (the seat's turn #7).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 35b6a6ff6efb0277 IS among the 27 candidates at this root; the engine played 3a68d3dfecf6326f instead, worth -951 cc to the adviser against 253 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #11) and scored it 959 cc, ABOVE the played candidate #0 at 706 cc — so this re-run did not play what the seat played (it chose candidate #11 at 959 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**exposure-inconsistent** at turn 31 (the seat's turn #31).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key f98e9ac22e6bb0bc IS among the 31 candidates at this root; the engine played 802b0b6ed5ac5bcb instead, worth -995000 cc to the adviser against 1242 cc. root exposure: 31 candidate(s) from a `completed-depth` list, 31 searched, completed depth 3, cutoff at -1. Candidate #3 (adviser's best) and #10 (played) carry the same score 34 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_1929919 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

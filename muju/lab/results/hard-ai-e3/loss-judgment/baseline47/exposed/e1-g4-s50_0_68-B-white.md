# Replay analysis — e1-g4-s50_0_68-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s50`. The game ended home-checkmate for white after 17 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 195 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `4b18c92f` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `4b18c92f` | yes | 1,154 | 1,154 | 0 | 1,317 | 3014 |
| 2 | BUY fire_1@9,8 BUY lightning_1@8,9 MOVE 8,9→4,4 MOVE 9,8→8,8 END_ACTION | `020f861e` | yes | BUY lightning_1@9,8 BUY lightning_1@8,9 MOVE 9,8→5,3 MOVE 5,3→5,0 END_ACTION | `58fb076d` | yes | -1,812 | -1,814 | -2 | -1,687 | 2269 |
| 3 | BUY water_1@8,9 END_PLACE MOVE 8,8→4,6 ATK 4,6→5,6 END_ACTION | `df0cfb68` | yes | BUY water_1@8,9 END_PLACE MOVE 8,8→4,6 ATK 4,6→5,6 END_ACTION | `df0cfb68` | yes | -1,628 | -1,628 | 0 | -31 | 2488 |
| 4 | BUY lightning_1@9,8 PROMOTE 7,9 END_PLACE MOVE 9,7→9,6 MOVE 9,8→6,5 ATK 6,5→6,6 END_ACTION | `355455a4` | yes | BUY lightning_1@9,8 PROMOTE 7,9 END_PLACE MOVE 9,7→9,6 MOVE 9,8→6,5 ATK 6,5→6,6 END_ACTION | `355455a4` | yes | 35 | 35 | 0 | -969 | 1943 |
| 5 | BUY fire_1@9,8 BUY lightning_1@9,7 END_PLACE MOVE 9,6→6,5 END_ACTION | `17e6f12b` | yes | BUY fire_1@9,8 BUY fire_1@9,7 END_PLACE MOVE 9,7→4,4 END_ACTION | `7e2007f3` | yes | -2,403 | -663 | 1,740 | -2,191 | 2386 |
| 6 | END_PLACE MOVE 7,9→7,7 ATK 7,7→8,7 MOVE 7,7→8,7 END_ACTION | `c92ab048` | yes | END_PLACE MOVE 7,9→7,7 ATK 7,7→8,7 MOVE 7,7→7,6 END_ACTION | `e640a776` | yes | -1,959 | -2,157 | -198 | -2,546 | 2277 |
| 7 | BUY fire_1@8,8 BUY fire_1@9,7 END_PLACE MOVE 9,7→5,5 MOVE 8,9→7,9 END_ACTION | `bb712787` | yes | BUY fire_1@8,8 BUY fire_1@9,7 END_PLACE MOVE 9,7→5,5 MOVE 8,9→7,9 END_ACTION | `bb712787` | yes | -1,393 | -1,393 | 0 | -544 | 3000 |
| 8 | BUY fire_1@9,7 BUY shadow_1@8,9 END_PLACE MOVE 9,7→6,4 ATK 6,4→6,5 END_ACTION | `f4b6226c` | yes | BUY fire_1@9,7 END_PLACE MOVE 9,7→6,4 ATK 6,4→6,5 END_ACTION | `010ad865` | yes | -833 | 170 | 1,003 | 1,312 | 3010 |
| 9 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→8,5 ATK 8,5→7,5 END_ACTION | `0b242514` | yes | BUY fire_1@9,7 END_PLACE MOVE 9,7→5,5 MOVE 8,7→8,6 END_ACTION | `b45beaf4` | yes | 2,504 | 1,872 | -632 | 3,741 | 3006 |
| 10 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→8,5 ATK 8,5→7,5 END_ACTION | `a7389236` | yes | BUY lightning_1@9,7 END_PLACE MOVE 9,7→8,5 ATK 8,5→7,5 END_ACTION | `a7389236` | yes | 2,934 | 2,934 | 0 | 6,974 | 961 |
| 11 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→3,1 END_ACTION | `ae14aacb` | yes | BUY lightning_1@9,7 END_PLACE MOVE 9,7→6,3 ATK 6,3→5,3 END_ACTION | `f0fd6d26` | yes | 1,275 | 1,202 | -73 | 5,022 | 1185 |
| 12 | END_PLACE MOVE 8,8→5,5 MOVE 8,7→7,7 END_ACTION | `2f60d868` | yes | BUY fire_1@9,7 MOVE 9,7→8,2 MOVE 7,9→7,8 END_ACTION | `357a2d36` | yes | 1,800 | 4,763 | 2,963 | 8,385 | 1135 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**exposure-inconsistent** at turn 5 (the seat's turn #5).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 7e2007f3390aa9b5 IS among the 26 candidates at this root; the engine played 17e6f12ba9cfdc74 instead, worth -2403 cc to the adviser against -663 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #14 (played) carry the same score -2191 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

### Largest swing

**fixed-work-divergence** at turn 12 (the seat's turn #12).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 357a2d365dd133e6 IS among the 29 candidates at this root; the engine played 2f60d86875862618 instead, worth 1800 cc to the adviser against 4763 cc. root exposure: 29 candidate(s) from a `completed-depth` list, 29 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and scored it 8385 cc, ABOVE the played candidate #14 at 7550 cc — so this re-run did not play what the seat played (it chose candidate #1 at 8385 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_599630 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

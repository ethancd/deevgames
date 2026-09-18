# Replay analysis — g4-s30_3_3-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g4-s30`. The game ended home-checkmate for black after 50 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 533 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `adadd2d3` | yes | END_ACTION | `adadd2d3` | yes | -3,572 | -3,572 | 0 | -1,548 | 3000 |
| 2 | BUY water_1@0,0 MOVE 1,0→8,1 END_ACTION | `d9e968bf` | yes | BUY water_1@0,0 MOVE 1,0→8,1 END_ACTION | `d9e968bf` | yes | -2,724 | -2,724 | 0 | -1,667 | 2334 |
| 3 | PROMOTE 1,1 END_PLACE MOVE 0,1→0,2 MOVE 1,1→2,1 ATK 2,1→2,0 END_ACTION | `83739ed8` | yes | BUY water_1@1,0 PROMOTE 1,1 ATK 1,0→2,0 MOVE 0,1→0,2 MOVE 1,1→2,1 MOVE 1,0→2,0 END_ACTION | `0a7eb6a6` | yes | -1,674 | -1,449 | 225 | 493 | 1202 |
| 4 | BUY fire_1@1,1 BUY fire_1@2,0 BUY fire_1@0,1 END_PLACE MOVE 2,1→2,2 ATK 2,2→1,2 MOVE 0,0→1,0 MOVE 0,1→0,0 END_ACTION | `d086735d` | yes | BUY fire_1@1,1 BUY fire_1@2,0 END_PLACE ATK 1,1→1,2 MOVE 1,1→1,7 END_ACTION | `70ee239c` | yes | -1,723 | -323 | 1,400 | 797 | 2890 |
| 5 | BUY fire_1@2,0 END_PLACE ATK 2,0→3,0 END_ACTION | `513059d3` | yes | BUY fire_1@2,0 BUY fire_1@0,1 BUY fire_1@2,1 END_PLACE ATK 2,0→3,0 MOVE 2,1→7,1 END_ACTION | `d490a619` | yes | -1,983 | -1,339 | 644 | 710 | 1942 |
| 6 | BUY fire_1@2,0 BUY fire_1@0,1 BUY fire_1@1,2 END_PLACE ATK 2,0→3,0 MOVE 2,2→2,3 MOVE 0,2→0,3 END_ACTION | `0026f66d` | yes | BUY fire_1@2,0 BUY fire_1@0,1 PROMOTE 2,2 END_PLACE ATK 2,0→3,0 MOVE 2,2→8,2 END_ACTION | `d3cc2b70` | yes | -590 | -1,276 | -686 | 989 | 1646 |
| 7 | BUY fire_1@2,0 BUY fire_1@0,2 BUY fire_1@1,3 BUY fire_1@2,1 END_PLACE ATK 2,0→3,0 MOVE 2,3→3,4 MOVE 0,3→0,4 END_ACTION | `ee5099c7` | yes | BUY fire_1@2,0 BUY fire_1@0,2 BUY fire_1@1,3 END_PLACE ATK 2,0→3,0 MOVE 2,3→3,4 MOVE 3,4→4,4 END_ACTION | `2a776b4b` | yes | 929 | -1,249 | -2,178 | 1,427 | 3003 |
| 8 | BUY fire_1@0,3 END_PLACE MOVE 2,1→7,2 MOVE 0,3→1,3 END_ACTION | `607b70fa` | yes | BUY shadow_1@0,3 END_PLACE MOVE 2,1→7,2 MOVE 1,2→1,4 END_ACTION | `1059e626` | yes | -108 | 486 | 594 | 1,964 | 1778 |
| 9 | BUY water_1@0,3 PROMOTE 3,4 END_PLACE MOVE 3,4→2,7 MOVE 0,4→1,4 MOVE 1,1→2,1 END_ACTION | `4db3277a` | yes | BUY water_1@0,3 PROMOTE 3,4 END_PLACE MOVE 3,4→2,7 MOVE 0,4→1,4 MOVE 1,1→2,1 END_ACTION | `4db3277a` | yes | -438 | -438 | 0 | -199 | 1290 |
| 10 | BUY fire_1@2,0 END_PLACE ATK 2,0→3,0 MOVE 2,1→7,2 END_ACTION | `afae60fa` | yes | END_PLACE MOVE 2,7→7,9 END_ACTION | `0babfff0` | yes | 879 | 41 | -838 | 1,475 | 1403 |
| 11 | BUY water_1@1,1 END_PLACE ATK 1,1→2,1 MOVE 1,2→6,3 END_ACTION | `0a47c700` | yes | BUY water_1@1,1 END_PLACE ATK 1,1→2,1 MOVE 1,2→6,3 END_ACTION | `0a47c700` | yes | 1,541 | 1,541 | 0 | 2,013 | 1403 |
| 12 | BUY fire_1@2,4 BUY fire_1@2,5 BUY fire_1@1,7 END_PLACE MOVE 1,7→7,9 END_ACTION | `7dbecbf0` | yes | BUY fire_1@2,4 BUY fire_1@1,5 BUY fire_1@2,5 BUY fire_1@1,7 END_PLACE MOVE 1,7→7,9 END_ACTION | `2104ea4c` | yes | 1,480 | 1,334 | -146 | 4,334 | 1056 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 4 (the seat's turn #4).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 70ee239c46d1b56a IS among the 30 candidates at this root; the engine played d086735dd5bd1adb instead, worth -1723 cc to the adviser against -323 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #18) and scored it 797 cc, ABOVE the played candidate #0 at -2086 cc — so this re-run did not play what the seat played (it chose candidate #18 at 797 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 4 (the seat's turn #4).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 70ee239c46d1b56a IS among the 30 candidates at this root; the engine played d086735dd5bd1adb instead, worth -1723 cc to the adviser against -323 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #18) and scored it 797 cc, ABOVE the played candidate #0 at -2086 cc — so this re-run did not play what the seat played (it chose candidate #18 at 797 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_613445 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

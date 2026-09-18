# Replay analysis — e1-g5-s975_0_46-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s975`. The game ended elimination for black after 6 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 59 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY fire_1@0,1 BUY lightning_1@6,0 MOVE 6,0→9,9 END_ACTION | `013f0b45` | yes | BUY fire_1@0,0 BUY lightning_1@6,0 MOVE 6,1→8,1 MOVE 6,0→6,4 ATK 6,4→5,4 END_ACTION | `87a6cf2a` | yes | 1,576 | 1,786 | 210 | 4,426 | 3026 |
| 3 | BUY fire_1@0,0 BUY fire_1@2,0 MOVE 6,1→6,5 MOVE 0,2→2,2 END_ACTION | `332a5e4b` | yes | BUY fire_1@1,0 BUY fire_1@2,0 MOVE 6,1→6,5 MOVE 0,2→0,3 MOVE 0,1→0,0 END_ACTION | `ebbcd22d` | yes | 603 | 2,490 | 1,887 | 2,942 | 2035 |
| 4 | BUY fire_1@1,0 END_PLACE MOVE 6,5→4,5 MOVE 2,0→7,1 END_ACTION | `bd3535c4` | yes | BUY fire_1@1,0 END_PLACE MOVE 6,5→4,5 MOVE 2,0→7,1 END_ACTION | `bd3535c4` | yes | 733 | 733 | 0 | 1,323 | 1133 |
| 5 | END_PLACE MOVE 4,5→2,7 MOVE 2,7→1,7 MOVE 1,7→2,7 END_ACTION | `f0fa3806` | yes | END_PLACE MOVE 4,5→9,8 END_ACTION | `8edb0747` | yes | -3,308 | -2,925 | 383 | -1,444 | 1928 |
| 6 | END_PLACE MOVE 7,1→5,3 MOVE 5,3→4,4 MOVE 4,4→3,4 END_ACTION | `7d2d9b0d` | yes | END_PLACE MOVE 7,1→5,3 MOVE 5,3→4,4 MOVE 4,4→3,4 END_ACTION | `7d2d9b0d` | yes | -999,000 | -999,000 | 0 | -998,000 | 1232 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 3 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key ebbcd22d0bd4e95d IS among the 27 candidates at this root; the engine played 332a5e4b2daf3c64 instead, worth 603 cc to the adviser against 2490 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #4) and scored it 2942 cc, ABOVE the played candidate #0 at -446 cc — so this re-run did not play what the seat played (it chose candidate #2 at 2942 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**fixed-work-divergence** at turn 3 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key ebbcd22d0bd4e95d IS among the 27 candidates at this root; the engine played 332a5e4b2daf3c64 instead, worth 603 cc to the adviser against 2490 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #4) and scored it 2942 cc, ABOVE the played candidate #0 at -446 cc — so this re-run did not play what the seat played (it chose candidate #2 at 2942 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_175063 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

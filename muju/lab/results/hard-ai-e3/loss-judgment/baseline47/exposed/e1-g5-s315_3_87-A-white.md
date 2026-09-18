# Replay analysis — e1-g5-s315_3_87-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s315`. The game ended elimination for black after 17 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 189 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | END_PLACE MOVE 4,0→5,3 ATK 5,3→5,4 END_ACTION | `a0175b57` | yes | END_PLACE MOVE 4,0→5,3 ATK 5,3→5,4 END_ACTION | `a0175b57` | yes | -147 | -147 | 0 | 1,121 | 3012 |
| 3 | BUY lightning_1@2,0 END_PLACE MOVE 2,0→5,3 ATK 5,3→5,4 END_ACTION | `c8f198c8` | yes | BUY lightning_1@2,0 END_PLACE MOVE 2,0→5,3 ATK 5,3→5,4 END_ACTION | `c8f198c8` | yes | 1,154 | 1,154 | 0 | 764 | 2029 |
| 4 | BUY fire_1@4,3 BUY fire_1@1,0 END_PLACE MOVE 2,1→2,0 MOVE 5,3→8,9 END_ACTION | `0a9aeef4` | yes | BUY fire_1@4,3 BUY fire_1@1,0 BUY fire_1@0,1 ATK 4,3→4,4 MOVE 5,3→8,9 END_ACTION | `13491e6a` | yes | -114 | 3,125 | 3,239 | 3,854 | 2131 |
| 5 | PROMOTE 2,0 END_PLACE MOVE 0,0→0,1 MOVE 1,0→1,1 MOVE 1,1→0,2 MOVE 0,1→1,1 END_ACTION | `2ed8d8b0` | yes | END_PLACE MOVE 1,0→4,3 ATK 4,3→4,4 END_ACTION | `4ebb7bce` | yes | -4,722 | -874 | 3,848 | -195 | 2194 |
| 6 | BUY lightning_1@1,0 END_PLACE MOVE 1,0→5,3 ATK 5,3→5,4 END_ACTION | `1e67a856` | yes | BUY fire_1@1,0 BUY water_1@0,0 MOVE 0,0→1,1 ATK 1,1→1,2 MOVE 1,0→0,1 END_ACTION | `5f8f2754` | yes | -4,471 | -3,695 | 776 | -3,253 | 2287 |
| 7 | BUY fire_1@1,0 BUY water_1@0,0 MOVE 2,0→2,2 ATK 2,2→1,2 MOVE 0,0→0,1 END_ACTION | `33b7091f` | yes | BUY fire_1@1,0 BUY water_1@0,0 MOVE 2,0→2,2 ATK 2,2→1,2 MOVE 0,0→0,1 END_ACTION | `33b7091f` | yes | -2,241 | -2,241 | 0 | -3,257 | 1643 |
| 8 | BUY water_1@0,0 MOVE 0,0→1,0 ATK 1,0→2,0 MOVE 2,2→2,3 END_ACTION | `02ac200b` | yes | BUY water_1@0,0 MOVE 0,0→1,0 ATK 1,0→2,0 MOVE 2,2→2,3 END_ACTION | `02ac200b` | yes | -1,405 | -1,405 | 0 | -490 | 2998 |
| 9 | BUY lightning_1@2,1 MOVE 2,1→6,3 ATK 6,3→6,4 END_ACTION | `6c49497e` | yes | BUY water_1@0,2 MOVE 2,3→3,3 ATK 3,3→3,2 MOVE 3,3→3,4 END_ACTION | `0b86e7c8` | yes | -1,927 | -1,725 | 202 | -85 | 2768 |
| 10 | BUY fire_1@1,3 END_PLACE MOVE 1,3→6,4 ATK 6,4→7,4 END_ACTION | `71f518d5` | yes | BUY fire_1@1,3 END_PLACE MOVE 1,3→6,4 ATK 6,4→7,4 END_ACTION | `71f518d5` | yes | -2,040 | -2,040 | 0 | -300 | 3002 |
| 11 | BUY fire_1@0,2 BUY lightning_1@2,2 ATK 2,2→3,2 MOVE 2,2→5,8 END_ACTION | `0f0912e3` | yes | BUY fire_1@0,2 BUY lightning_1@2,2 ATK 2,2→3,2 MOVE 2,2→5,8 END_ACTION | `0f0912e3` | yes | -2,235 | -2,235 | 0 | -2,545 | 3008 |
| 12 | MOVE 0,1→0,2 MOVE 2,3→2,6 END_ACTION | `435f63ed` | yes | MOVE 0,1→0,2 ATK 0,2→1,2 MOVE 2,3→1,3 MOVE 1,0→0,0 END_ACTION | `7181092c` | yes | -6,933 | -2,953 | 3,980 | -1,925 | 2426 |
| 13 | BUY shadow_1@0,0 MOVE 2,6→5,6 MOVE 1,0→1,1 END_ACTION | `ffbe15fc` | yes | BUY lightning_1@0,0 MOVE 2,6→5,6 MOVE 1,0→2,0 END_ACTION | `4be2ebdb` | yes | -3,667 | -4,212 | -545 | -4,414 | 3001 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 4 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 13491e6a30bbe10e IS among the 27 candidates at this root; the engine played 0a9aeef4bd07a071 instead, worth -114 cc to the adviser against 3125 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and scored it 2816 cc, below the played candidate #7 at 3854 cc

### Largest swing

**fixed-work-divergence** at turn 12 (the seat's turn #11).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 7181092c4b082275 IS among the 28 candidates at this root; the engine played 435f63eda898fc5f instead, worth -6933 cc to the adviser against -2953 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #6) and scored it -2453 cc, ABOVE the played candidate #3 at -4077 cc — so this re-run did not play what the seat played (it chose candidate #7 at -1925 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_554914 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

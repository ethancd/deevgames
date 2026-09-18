# Replay analysis — g3-s45_3_11-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g3-s45`. The game ended elimination for white after 24 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 302 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `1f73553e` | yes | BUY fire_1@9,9 MOVE 8,9→7,9 MOVE 9,9→8,9 MOVE 9,8→9,9 END_ACTION | `1f73553e` | yes | 766 | 766 | 0 | 325 | 2322 |
| 2 | BUY fire_1@9,8 END_PLACE ATK 9,8→9,7 MOVE 8,8→9,7 MOVE 8,9→8,8 END_ACTION | `5cfd9379` | yes | BUY fire_1@9,8 END_PLACE ATK 9,8→9,7 MOVE 8,8→9,7 MOVE 8,9→8,8 END_ACTION | `5cfd9379` | yes | -986 | -986 | 0 | -55 | 1142 |
| 3 | BUY water_1@8,9 END_PLACE ATK 7,9→7,8 MOVE 8,8→5,5 END_ACTION | `dec3c0cf` | yes | BUY water_1@8,9 END_PLACE ATK 7,9→7,8 MOVE 8,8→5,5 END_ACTION | `dec3c0cf` | yes | 1,624 | 1,624 | 0 | 1,488 | 1324 |
| 4 | END_PLACE MOVE 7,9→2,8 MOVE 9,7→9,6 END_ACTION | `8c574f7b` | yes | PROMOTE 7,9 END_PLACE MOVE 7,9→2,8 MOVE 9,7→9,6 END_ACTION | `5a6cd0f7` | yes | -595 | -820 | -225 | -709 | 1944 |
| 5 | BUY lightning_1@9,7 PROMOTE 9,6 END_PLACE MOVE 9,7→2,3 END_ACTION | `9b94a56b` | yes | BUY lightning_1@9,7 END_PLACE MOVE 9,7→3,7 ATK 3,7→3,8 END_ACTION | `0b2a3b25` | yes | -2,698 | -3,057 | -359 | 1,324 | 2992 |
| 6 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→3,7 ATK 3,7→3,8 END_ACTION | `f95c052b` | yes | BUY lightning_1@9,7 END_PLACE MOVE 9,7→3,1 END_ACTION | `d6064c67` | yes | -2,901 | -2,787 | 114 | -3,149 | 2838 |
| 7 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→4,6 ATK 4,6→4,7 END_ACTION | `306e6a9e` | yes | BUY lightning_1@9,7 END_PLACE MOVE 9,7→4,6 ATK 4,6→4,7 END_ACTION | `306e6a9e` | yes | -4,913 | -4,913 | 0 | -1,951 | 1700 |
| 8 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→4,1 END_ACTION | `53910a4f` | yes | END_PLACE MOVE 9,8→4,5 END_ACTION | `e048b170` | yes | -4,766 | -2,459 | 2,307 | -974 | 3009 |
| 9 | BUY fire_1@9,8 BUY shadow_1@9,7 END_PLACE ATK 8,9→8,8 MOVE 9,6→8,6 MOVE 8,9→7,9 MOVE 9,8→8,8 END_ACTION | `66b7c5da` | yes | BUY fire_1@9,7 BUY lightning_1@9,8 END_PLACE ATK 8,9→8,8 MOVE 9,6→8,6 MOVE 8,9→7,9 MOVE 9,7→8,8 END_ACTION | `dd771d22` | yes | -4,028 | -2,088 | 1,940 | -789 | 3006 |
| 10 | BUY fire_1@8,8 BUY fire_1@9,6 END_PLACE ATK 7,9→7,8 MOVE 9,6→6,5 MOVE 8,6→7,6 END_ACTION | `49e3eba8` | yes | BUY fire_1@8,8 BUY fire_1@9,6 END_PLACE ATK 7,9→7,8 MOVE 9,6→6,5 MOVE 8,6→8,5 END_ACTION | `8b1ec78f` | yes | -612 | 240 | 852 | 1,528 | 3004 |
| 11 | BUY fire_1@7,7 END_PLACE ATK 7,7→6,7 MOVE 8,8→8,2 END_ACTION | `05f47caf` | yes | BUY fire_1@7,7 END_PLACE ATK 7,7→6,7 MOVE 8,8→8,2 END_ACTION | `05f47caf` | yes | 1,720 | 1,720 | 0 | 3,860 | 2208 |
| 12 | BUY fire_1@8,4 END_PLACE MOVE 8,4→6,4 ATK 6,4→5,4 END_ACTION | `eadbf2be` | yes | BUY fire_1@7,7 BUY fire_1@8,3 END_PLACE ATK 7,7→6,7 MOVE 8,3→4,1 END_ACTION | `ada9620d` | yes | 2,042 | 4,450 | 2,408 | 3,797 | 1365 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**fixed-work-divergence** at turn 8 (the seat's turn #8).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key e048b170f13690fb IS among the 30 candidates at this root; the engine played 53910a4f54c3651e instead, worth -4766 cc to the adviser against -2459 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #9) and scored it -1482 cc, ABOVE the played candidate #0 at -3214 cc — so this re-run did not play what the seat played (it chose candidate #19 at -974 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

### Largest swing

**strong-candidate-misjudged** at turn 12 (the seat's turn #12).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key ada9620d359293c6 IS among the 42 candidates at this root; the engine played eadbf2be8fa1547e instead, worth 2042 cc to the adviser against 4450 cc. root exposure: 42 candidate(s) from a `completed-depth` list, 42 searched, completed depth 2, cutoff at -1. The root searched the adviser's best turn (candidate #0) and scored it 3597 cc, below the played candidate #35 at 3797 cc

_640878 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

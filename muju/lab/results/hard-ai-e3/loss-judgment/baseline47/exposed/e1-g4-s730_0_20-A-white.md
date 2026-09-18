# Replay analysis — e1-g4-s730_0_20-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s730`. The game ended upkeep-elimination for black after 38 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 425 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `13d63e4c` | yes | END_ACTION | `13d63e4c` | yes | -1,417 | -1,417 | 0 | 828 | 3036 ⚠ |
| 2 | BUY water_1@0,0 MOVE 0,2→5,5 END_ACTION | `8035182d` | yes | BUY water_1@0,0 MOVE 0,2→5,5 END_ACTION | `8035182d` | yes | -157 | -157 | 0 | 728 | 894 |
| 3 | BUY lightning_1@0,1 END_PLACE MOVE 1,1→2,0 MOVE 0,1→1,3 ATK 1,3→1,2 END_ACTION | `c2bfee61` | yes | BUY lightning_1@0,1 END_PLACE MOVE 1,1→2,0 MOVE 0,1→1,3 ATK 1,3→1,2 END_ACTION | `c2bfee61` | yes | 1,252 | 1,252 | 0 | 688 | 1759 |
| 4 | BUY fire_1@0,1 BUY fire_1@0,2 BUY fire_1@0,3 BUY fire_1@1,1 MOVE 1,1→8,2 END_ACTION | `961a7104` | yes | BUY fire_1@0,1 BUY fire_1@0,2 BUY fire_1@1,1 END_PLACE MOVE 1,1→7,2 END_ACTION | `e08eab5d` | yes | 591 | 1,753 | 1,162 | 1,865 | 2608 |
| 5 | BUY fire_1@7,1 BUY fire_1@7,2 END_PLACE MOVE 0,3→2,7 MOVE 1,0→1,1 END_ACTION | `039fd9df` | yes | BUY fire_1@6,0 BUY fire_1@7,1 BUY fire_1@6,2 BUY fire_1@7,2 MOVE 0,3→2,7 MOVE 6,2→5,3 END_ACTION | `5444cd0c` | yes | 4,309 | 4,255 | -54 | 3,684 | 3002 |
| 6 | BUY fire_1@8,1 BUY fire_1@1,2 BUY fire_1@1,0 BUY fire_1@7,0 END_PLACE ATK 1,2→1,3 MOVE 1,1→2,1 MOVE 1,2→1,3 MOVE 1,0→1,2 END_ACTION | `adf2aa77` | yes | BUY fire_1@8,1 BUY fire_1@1,2 BUY fire_1@7,0 END_PLACE ATK 1,2→1,3 MOVE 1,1→2,1 MOVE 1,2→3,4 END_ACTION | `18813a59` | yes | 5,605 | 5,523 | -82 | 5,322 | 3006 |
| 7 | END_PLACE MOVE 8,2→8,5 ATK 8,5→8,6 END_ACTION | `fbdf3f8e` | yes | BUY water_1@7,2 END_PLACE ATK 7,2→7,3 END_ACTION | `f5d3e0ef` | yes | 4,881 | 7,617 | 2,736 | 8,487 | 3013 |
| 8 | BUY water_1@7,1 END_PLACE ATK 7,1→7,2 END_ACTION | `e3f2d16c` | yes | BUY fire_1@7,1 BUY fire_1@1,0 BUY fire_1@1,1 BUY fire_1@8,0 END_PLACE MOVE 1,3→1,7 MOVE 2,1→2,2 MOVE 8,1→8,2 END_ACTION | `77877f43` | yes | 4,742 | 3,061 | -1,681 | 5,839 | 3011 |
| 9 | BUY fire_1@1,0 BUY fire_1@1,1 BUY fire_1@6,0 BUY fire_1@6,1 END_PLACE MOVE 7,0→9,2 ATK 9,2→8,2 MOVE 2,1→2,2 END_ACTION | `f75637fc` | yes | BUY fire_1@1,0 BUY fire_1@1,1 BUY fire_1@6,0 BUY fire_1@0,3 END_PLACE MOVE 7,0→9,2 ATK 9,2→8,2 MOVE 2,1→2,2 END_ACTION | `e9497b98` | yes | 7,133 | 7,190 | 57 | 6,625 | 2644 |
| 10 | BUY fire_1@0,3 BUY fire_1@3,0 BUY fire_1@3,1 END_PLACE MOVE 1,3→2,8 MOVE 6,1→7,2 END_ACTION | `a2ecaef6` | yes | BUY fire_1@0,3 BUY fire_1@3,0 BUY fire_1@3,1 END_PLACE MOVE 1,3→2,8 MOVE 3,1→3,3 END_ACTION | `be453d81` | yes | 7,942 | 6,552 | -1,390 | 7,674 | 2905 |
| 11 | BUY fire_1@1,7 BUY fire_1@1,8 BUY fire_1@2,7 BUY fire_1@2,1 PROMOTE 2,8 END_PLACE MOVE 6,0→7,5 MOVE 2,2→2,3 END_ACTION | `9c9c3b7c` | yes | BUY fire_1@2,7 END_PLACE MOVE 2,7→6,7 ATK 6,7→7,7 END_ACTION | `a9c25dec` | yes | 6,320 | 4,808 | -1,512 | 8,162 | 1037 |
| 12 | END_PLACE MOVE 3,1→8,2 MOVE 7,1→7,2 END_ACTION | `4dba5e80` | yes | END_PLACE MOVE 2,7→6,7 ATK 6,7→7,7 END_ACTION | `4f97cbe8` | yes | 5,090 | 5,158 | 68 | 7,768 | 1079 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 4 (the seat's turn #4).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key e08eab5d5c08c1a4 IS among the 27 candidates at this root; the engine played 961a7104f44cf084 instead, worth 591 cc to the adviser against 1753 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #22) and did not prefer it: its score 1865 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 7 (the seat's turn #7).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key f5d3e0ef2b933b19 IS among the 31 candidates at this root; the engine played fbdf3f8e36d041c3 instead, worth 4881 cc to the adviser against 7617 cc. root exposure: 31 candidate(s) from a `completed-depth` list, 31 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #3) and scored it 8487 cc, ABOVE the played candidate #0 at 5718 cc — so this re-run did not play what the seat played (it chose candidate #3 at 8487 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_654030 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

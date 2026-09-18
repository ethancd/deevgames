# Replay analysis — g5-s31_0_4-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `g5-s31`. The game ended elimination for white after 15 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 170 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 8,9→7,9 END_ACTION | `a21dd000` | yes | MOVE 8,9→9,9 MOVE 9,9→7,9 MOVE 9,8→9,9 END_ACTION | `e2558fca` | yes | -2,613 | -1,840 | 773 | -1,275 | 3011 |
| 2 | PROMOTE 9,8 MOVE 9,8→8,8 MOVE 9,9→9,8 MOVE 8,8→8,9 END_ACTION | `2f9189ac` | yes | PROMOTE 9,8 MOVE 9,9→8,9 END_ACTION | `45c7fefa` | yes | -4,151 | -2,954 | 1,197 | -3,643 | 2083 |
| 3 | BUY water_1@9,9 ATK 9,9→9,8 MOVE 8,9→8,8 END_ACTION | `5196ad23` | yes | BUY fire_1@9,9 ATK 9,9→9,8 MOVE 9,9→9,7 MOVE 9,7→6,6 END_ACTION | `9fc8e758` | yes | -10,006 | -6,088 | 3,918 | -5,922 | 2071 |
| 4 | BUY lightning_1@8,9 ATK 8,9→7,9 MOVE 8,9→4,4 END_ACTION | `fe7393ee` | yes | BUY lightning_1@8,9 ATK 8,9→7,9 MOVE 8,9→4,4 END_ACTION | `fe7393ee` | yes | -2,516 | -2,516 | 0 | -2,480 | 2757 |
| 5 | BUY lightning_1@8,9 MOVE 8,9→6,8 ATK 6,8→6,9 END_ACTION | `b82d60d5` | yes | BUY water_1@8,9 MOVE 8,8→9,7 MOVE 8,9→7,9 ATK 7,9→6,9 END_ACTION | `b6091b3b` | yes | -8,042 | -4,070 | 3,972 | -2,910 | 2324 |
| 6 | BUY fire_1@9,8 MOVE 9,8→7,4 ATK 7,4→8,4 END_ACTION | `aa582ae0` | yes | BUY water_1@9,8 MOVE 8,8→7,7 MOVE 9,9→8,9 ATK 8,9→7,9 END_ACTION | `2f34dc47` | yes | -4,599 | -4,888 | -289 | -2,989 | 1348 |
| 7 | BUY lightning_1@8,9 ATK 8,9→7,9 MOVE 8,8→8,7 MOVE 8,9→7,4 END_ACTION | `d2b67346` | yes | BUY fire_1@9,8 MOVE 8,8→7,7 MOVE 9,9→8,9 ATK 8,9→7,9 END_ACTION | `f8251a80` | yes | -9,548 | -7,260 | 2,288 | -5,605 | 3002 |
| 8 | MOVE 8,7→7,4 END_ACTION | `de588aa1` | yes | MOVE 8,7→8,5 ATK 8,5→8,4 END_ACTION | `eb2e03cd` | yes | -11,269 | -6,618 | 4,651 | -6,764 | 3001 |
| 9 | MOVE 7,4→5,3 ATK 5,3→5,4 END_ACTION | `55a1d7de` | yes | END_ACTION | `1fdf6bb3` | yes | -11,610 | -13,116 | -1,506 | -9,362 | 1217 |
| 10 | MOVE 9,9→8,9 END_ACTION | `cac044a6` | yes | MOVE 9,9→9,7 ATK 9,7→8,7 MOVE 5,3→4,3 END_ACTION | `8d41187f` | yes | -12,527 | -11,511 | 1,016 | -10,776 | 1512 |
| 11 | BUY lightning_1@9,9 MOVE 5,3→7,2 MOVE 8,9→7,9 END_ACTION | `26b07c3d` | yes | BUY lightning_1@9,9 ATK 5,3→4,3 MOVE 8,9→7,9 END_ACTION | `021cac2f` | yes | -995,000 | -5,660 | 989,340 | -669 | 871 |
| 12 | END_PLACE ATK 7,9→8,9 END_ACTION | `718b42b4` | yes | END_PLACE ATK 7,9→8,9 END_ACTION | `718b42b4` | yes | -11,598 | -11,598 | 0 | -11,528 | 1895 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 1 (the seat's turn #1).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key e2558fca3dd57f3f IS among the 19 candidates at this root; the engine played a21dd000366e3606 instead, worth -2613 cc to the adviser against -1840 cc. root exposure: 19 candidate(s) from a `completed-depth` list, 19 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #5) and did not prefer it: its score -1275 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 11 (the seat's turn #11).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 021cac2f771a926d IS among the 29 candidates at this root; the engine played 26b07c3dcf7d418f instead, worth -995000 cc to the adviser against -5660 cc. root exposure: 29 candidate(s) from a `completed-depth` list, 29 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #19) and scored it -894 cc, ABOVE the played candidate #1 at -9300 cc — so this re-run did not play what the seat played (it chose candidate #18 at -669 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_666892 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

# Replay analysis — e1-g5-s255_0_54-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s255`. The game ended elimination for white after 30 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 330 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `4a217c56` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `4a217c56` | yes | -2,231 | -2,231 | 0 | -577 | 2381 |
| 2 | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→5,3 MOVE 8,9→8,8 END_ACTION | `f633e8f8` | yes | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→5,4 ATK 5,4→5,5 END_ACTION | `69a6037d` | yes | -346 | 326 | 672 | 86 | 2593 |
| 3 | END_PLACE MOVE 8,8→7,6 ATK 7,6→6,6 END_ACTION | `dcc52a08` | yes | END_PLACE MOVE 8,8→7,6 ATK 7,6→6,6 END_ACTION | `dcc52a08` | yes | -416 | -416 | 0 | -1,149 | 2553 |
| 4 | BUY fire_1@8,9 BUY water_1@9,8 END_PLACE MOVE 9,7→8,7 MOVE 8,9→6,5 END_ACTION | `8b631c85` | yes | BUY fire_1@8,9 BUY water_1@9,8 END_PLACE MOVE 9,7→8,7 MOVE 8,9→6,5 END_ACTION | `8b631c85` | yes | -2,012 | -2,012 | 0 | -2,118 | 2552 |
| 5 | BUY fire_1@8,8 BUY fire_1@9,7 END_PLACE MOVE 9,7→5,5 MOVE 8,7→7,7 END_ACTION | `e5a390c2` | yes | BUY fire_1@8,9 BUY fire_1@9,7 END_PLACE MOVE 9,7→6,5 ATK 6,5→6,6 END_ACTION | `c71b459d` | yes | -423 | -1,352 | -929 | -366 | 2905 |
| 6 | BUY fire_1@8,9 BUY fire_1@8,7 BUY fire_1@7,8 END_PLACE ATK 8,7→8,6 MOVE 7,7→6,5 END_ACTION | `2be69388` | yes | BUY fire_1@8,9 BUY fire_1@8,7 BUY fire_1@7,8 END_PLACE ATK 8,7→8,6 MOVE 8,7→8,1 END_ACTION | `b27c4559` | yes | -537 | -304 | 233 | -234 | 2230 |
| 7 | BUY fire_1@9,7 END_PLACE MOVE 8,7→7,2 MOVE 9,7→9,5 END_ACTION | `56e49a10` | yes | BUY water_1@9,7 END_PLACE MOVE 8,7→7,2 MOVE 7,9→7,8 END_ACTION | `7d9defc2` | yes | 548 | 1,016 | 468 | 833 | 3003 |
| 8 | BUY fire_1@9,7 END_PLACE MOVE 9,7→4,6 MOVE 9,5→8,4 END_ACTION | `1895b55e` | yes | BUY fire_1@9,6 END_PLACE MOVE 9,5→4,4 ATK 4,4→3,4 END_ACTION | `b2472714` | yes | 636 | 1,710 | 1,074 | 1,817 | 3008 |
| 9 | END_PLACE MOVE 9,8→9,6 MOVE 8,8→8,6 MOVE 7,9→7,8 END_ACTION | `ae4342b5` | yes | END_PLACE MOVE 8,8→8,4 ATK 8,4→7,4 END_ACTION | `731c3d1d` | yes | -1,805 | 813 | 2,618 | 2,909 | 2664 |
| 10 | BUY water_1@9,9 END_PLACE ATK 9,9→9,8 MOVE 7,8→7,5 END_ACTION | `3a7d8432` | yes | BUY water_1@9,9 END_PLACE ATK 9,9→9,8 MOVE 7,8→7,5 END_ACTION | `3a7d8432` | yes | 370 | 370 | 0 | 238 | 1512 |
| 11 | BUY fire_1@9,7 BUY shadow_1@9,8 END_PLACE MOVE 9,7→8,2 MOVE 9,6→8,6 END_ACTION | `8424b272` | yes | BUY fire_1@9,7 BUY lightning_1@9,8 END_PLACE MOVE 9,7→8,2 MOVE 9,6→9,5 END_ACTION | `0618ccaf` | yes | 716 | 137 | -579 | 1,867 | 1402 |
| 12 | BUY fire_1@8,5 BUY fire_1@7,9 BUY fire_1@9,5 END_PLACE ATK 7,9→6,9 MOVE 7,9→2,8 END_ACTION | `93afca75` | yes | BUY fire_1@8,5 BUY fire_1@7,9 BUY fire_1@9,5 BUY fire_1@8,8 END_PLACE ATK 7,9→6,9 MOVE 7,9→2,8 END_ACTION | `21cb4388` | yes | 647 | 1,949 | 1,302 | 3,844 | 3014 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 69a6037d0e6b56c3 IS among the 26 candidates at this root; the engine played f633e8f8994f575f instead, worth -346 cc to the adviser against 326 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #1) and did not prefer it: its score 86 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**strong-candidate-misjudged** at turn 9 (the seat's turn #9).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 731c3d1da341c570 IS among the 26 candidates at this root; the engine played ae4342b5d344ae3f instead, worth -1805 cc to the adviser against 813 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #0) and scored it 238 cc, below the played candidate #14 at 2909 cc

_589108 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

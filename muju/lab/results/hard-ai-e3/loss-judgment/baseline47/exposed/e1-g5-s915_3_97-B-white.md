# Replay analysis — e1-g5-s915_3_97-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s915`. The game ended home-checkmate for white after 8 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 82 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,8 END_ACTION | `bafc72b6` | yes | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,8 END_ACTION | `bafc72b6` | yes | -198 | -198 | 0 | 852 | 2310 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→6,5 MOVE 9,8→8,8 ATK 8,8→8,7 END_ACTION | `61bcd16a` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→6,5 MOVE 9,8→8,8 ATK 8,8→8,7 END_ACTION | `61bcd16a` | yes | 2,960 | 2,960 | 0 | 2,804 | 1896 |
| 3 | END_PLACE MOVE 8,8→5,3 END_ACTION | `c5fe9ff2` | yes | END_PLACE MOVE 8,8→6,5 ATK 6,5→5,5 END_ACTION | `8ce6dcfd` | yes | -931 | 410 | 1,341 | -463 | 2443 |
| 4 | BUY fire_1@8,9 BUY fire_1@9,8 PROMOTE 7,9 END_PLACE ATK 9,7→8,7 MOVE 7,9→7,7 ATK 7,7→8,7 END_ACTION | `113bd373` | yes | BUY fire_1@8,9 BUY fire_1@9,8 PROMOTE 7,9 END_PLACE ATK 9,7→8,7 MOVE 7,9→7,7 ATK 7,7→8,7 END_ACTION | `113bd373` | yes | 433 | 433 | 0 | 917 | 1560 |
| 5 | END_PLACE MOVE 9,7→9,6 MOVE 7,7→6,5 END_ACTION | `d8ae4ed7` | yes | PROMOTE 9,8 END_PLACE MOVE 9,7→8,8 MOVE 9,9→8,9 ATK 8,9→7,9 END_ACTION | `102b8991` | yes | -1,775 | -2,228 | -453 | -1,310 | 2646 |
| 6 | PROMOTE 6,5 END_PLACE MOVE 6,5→2,3 MOVE 9,9→8,9 END_ACTION | `ea05a836` | yes | PROMOTE 6,5 END_PLACE MOVE 6,5→2,3 MOVE 9,9→8,9 END_ACTION | `ea05a836` | yes | -2,924 | -2,924 | 0 | -2,328 | 1467 |
| 7 | END_PLACE ATK 2,3→2,2 ATK 9,8→9,9 MOVE 2,3→3,4 MOVE 9,8→8,8 END_ACTION | `4ded49a3` | yes | END_PLACE ATK 2,3→2,2 ATK 9,8→9,9 MOVE 2,3→3,4 MOVE 9,8→8,8 END_ACTION | `4ded49a3` | yes | -997,000 | -997,000 | 0 | -996,000 | 1223 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 8ce6dcfd902ae226 IS among the 28 candidates at this root; the engine played c5fe9ff25c1ef7d4 instead, worth -931 cc to the adviser against 410 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 2, cutoff at -1. The root searched the adviser's best turn (candidate #4) and did not prefer it: its score -463 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 8ce6dcfd902ae226 IS among the 28 candidates at this root; the engine played c5fe9ff25c1ef7d4 instead, worth -931 cc to the adviser against 410 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 2, cutoff at -1. The root searched the adviser's best turn (candidate #4) and did not prefer it: its score -463 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

_285256 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

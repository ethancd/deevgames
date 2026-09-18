# Replay analysis — e1-g5-s935_3_57-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s935`. The game ended home-checkmate for black after 16 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 163 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 2 | BUY lightning_1@2,0 END_PLACE MOVE 2,0→5,3 ATK 5,3→5,4 END_ACTION | `7b29d9b6` | yes | BUY lightning_1@2,0 END_PLACE MOVE 2,0→5,3 ATK 5,3→5,4 END_ACTION | `7b29d9b6` | yes | 1,172 | 1,172 | 0 | 1,542 | 3014 |
| 3 | BUY lightning_1@2,0 END_PLACE MOVE 2,0→5,3 ATK 5,3→5,4 END_ACTION | `e96eb7ff` | yes | BUY fire_1@1,0 BUY fire_1@2,0 BUY fire_1@0,2 MOVE 2,1→5,5 END_ACTION | `235bf000` | yes | 2,080 | 88 | -1,992 | 1,531 | 2033 |
| 4 | BUY fire_1@4,3 BUY fire_1@1,0 BUY fire_1@0,1 ATK 4,3→4,4 MOVE 5,3→8,9 END_ACTION | `54e2e648` | yes | BUY fire_1@4,3 BUY fire_1@1,0 BUY fire_1@0,1 ATK 4,3→4,4 MOVE 5,3→8,9 END_ACTION | `54e2e648` | yes | 3,184 | 3,184 | 0 | 4,104 | 2320 |
| 5 | BUY fire_1@2,0 MOVE 1,2→0,2 MOVE 2,1→1,1 MOVE 4,3→5,3 MOVE 5,3→5,5 END_ACTION | `825b3a80` | yes | BUY water_1@1,1 MOVE 1,2→0,2 MOVE 2,1→2,0 MOVE 4,3→5,3 MOVE 5,3→5,5 END_ACTION | `d1c5234e` | yes | 7,016 | 6,405 | -611 | 9,137 | 1706 |
| 6 | PROMOTE 1,1 END_PLACE MOVE 1,1→1,7 MOVE 1,7→2,7 END_ACTION | `71fb6854` | yes | PROMOTE 1,1 END_PLACE MOVE 1,1→1,7 MOVE 1,7→2,7 END_ACTION | `71fb6854` | yes | 4,747 | 4,747 | 0 | 5,614 | 1466 |
| 7 | PROMOTE 0,2 END_PLACE MOVE 2,0→4,4 ATK 4,4→3,4 END_ACTION | `5ad5910c` | yes | PROMOTE 0,2 END_PLACE MOVE 2,0→4,4 ATK 4,4→3,4 END_ACTION | `5ad5910c` | yes | 2,886 | 2,886 | 0 | 4,609 | 1837 |
| 8 | PROMOTE 1,0 END_PLACE MOVE 1,0→3,4 ATK 3,4→3,3 END_ACTION | `039bbb92` | yes | END_PLACE MOVE 1,0→3,4 ATK 3,4→3,3 END_ACTION | `c3c86ea6` | yes | 2,786 | 2,713 | -73 | 2,842 | 2431 |
| 9 | END_PLACE MOVE 0,1→4,3 ATK 4,3→4,4 END_ACTION | `2a2d60ad` | yes | END_PLACE MOVE 0,2→1,1 MOVE 0,1→0,3 MOVE 0,3→1,3 END_ACTION | `e69833d4` | yes | -410 | -322 | 88 | 1,846 | 1997 |
| 10 | BUY lightning_1@0,1 END_PLACE MOVE 0,1→7,5 END_ACTION | `842503fe` | yes | BUY fire_1@0,1 END_PLACE MOVE 0,1→3,2 ATK 3,2→3,3 END_ACTION | `89afdc2b` | yes | -2,498 | -2,811 | -313 | -449 | 2057 |
| 11 | BUY fire_1@0,1 MOVE 0,1→3,2 ATK 3,2→3,3 END_ACTION | `6a722bd7` | yes | BUY shadow_1@0,1 MOVE 0,2→0,3 MOVE 0,0→2,0 MOVE 0,1→0,0 END_ACTION | `b99534dd` | yes | -3,306 | -1,826 | 1,480 | -1,351 | 2690 |
| 12 | MOVE 0,2→3,2 ATK 3,2→3,3 END_ACTION | `d4805850` | yes | MOVE 0,2→3,2 ATK 3,2→3,3 END_ACTION | `d4805850` | yes | -7,428 | -7,428 | 0 | -5,160 | 2776 |
| 13 | ATK 3,2→3,3 MOVE 3,2→5,3 END_ACTION | `ac8a0564` | yes | ATK 3,2→3,3 MOVE 3,2→5,3 END_ACTION | `ac8a0564` | yes | -8,182 | -8,182 | 0 | -5,701 | 1790 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 11 (the seat's turn #10).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key b99534dda0e53230 IS among the 26 candidates at this root; the engine played 6a722bd74103b660 instead, worth -3306 cc to the adviser against -1826 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #16) and did not prefer it: its score -1351 cc is the chosen candidate #8's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**strong-candidate-misjudged** at turn 11 (the seat's turn #10).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key b99534dda0e53230 IS among the 26 candidates at this root; the engine played 6a722bd74103b660 instead, worth -3306 cc to the adviser against -1826 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #16) and did not prefer it: its score -1351 cc is the chosen candidate #8's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

_514005 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

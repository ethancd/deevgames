# Replay analysis — e1-g5-s315_3_87-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g5-s315`. The game ended elimination for white after 22 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 235 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→2,7 END_ACTION | `a35b1743` | yes | BUY fire_1@9,9 MOVE 8,8→7,9 MOVE 9,8→9,7 END_ACTION | `2c40cfb6` | yes | -1,587 | -80 | 1,507 | 1,439 | 3003 |
| 2 | BUY lightning_1@8,9 PROMOTE 8,8 MOVE 8,9→2,7 ATK 2,7→3,7 END_ACTION | `8b75eaa5` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→4,7 ATK 4,7→3,7 END_ACTION | `c4a681bd` | yes | -1,856 | 1,229 | 3,085 | 578 | 2359 |
| 3 | BUY lightning_1@8,9 MOVE 8,9→6,6 ATK 6,6→5,6 END_ACTION | `7e1fd894` | yes | BUY lightning_1@8,9 MOVE 8,9→6,6 ATK 6,6→5,6 END_ACTION | `7e1fd894` | yes | 398 | 398 | 0 | 418 | 1338 |
| 4 | BUY lightning_1@8,9 MOVE 8,9→6,6 ATK 6,6→5,6 END_ACTION | `6338b558` | yes | BUY lightning_1@8,9 MOVE 8,9→6,6 ATK 6,6→5,6 END_ACTION | `6338b558` | yes | 560 | 560 | 0 | 217 | 1254 |
| 5 | BUY water_1@8,9 MOVE 9,8→9,7 MOVE 8,8→8,7 MOVE 8,7→8,6 MOVE 8,6→7,6 END_ACTION | `57ac97ab` | yes | BUY water_1@8,9 MOVE 9,8→9,7 MOVE 8,8→8,7 MOVE 8,7→8,6 MOVE 8,6→7,6 END_ACTION | `57ac97ab` | yes | -77 | -77 | 0 | 554 | 1493 |
| 6 | BUY water_1@9,9 END_PLACE ATK 9,9→9,8 MOVE 7,6→6,5 MOVE 6,5→5,5 END_ACTION | `92c7d64d` | yes | BUY water_1@9,9 END_PLACE ATK 9,9→9,8 MOVE 7,6→6,5 MOVE 6,5→5,5 END_ACTION | `92c7d64d` | yes | 2,572 | 2,572 | 0 | 2,728 | 2538 |
| 7 | BUY shadow_1@6,5 END_PLACE MOVE 6,5→3,2 ATK 3,2→2,2 END_ACTION | `d0d539b9` | yes | BUY fire_1@6,5 BUY fire_1@7,5 END_PLACE MOVE 5,5→4,5 MOVE 8,9→7,9 MOVE 7,5→7,2 END_ACTION | `b6885150` | yes | 4,090 | 4,085 | -5 | 4,009 | 2894 |
| 8 | BUY lightning_1@6,5 END_PLACE MOVE 6,5→0,0 END_ACTION | `5c25113c` | yes | BUY fire_1@6,5 BUY fire_1@5,6 BUY fire_1@7,9 END_PLACE MOVE 5,6→2,7 MOVE 5,5→5,4 MOVE 5,4→5,3 END_ACTION | `46e180f0` | yes | 4,133 | 3,630 | -503 | 4,373 | 2795 |
| 9 | BUY lightning_1@6,5 END_PLACE MOVE 6,5→5,0 ATK 5,0→6,0 END_ACTION | `4604fcba` | yes | BUY fire_1@6,5 BUY fire_1@6,6 END_PLACE MOVE 6,6→4,6 MOVE 5,5→5,4 MOVE 9,7→8,7 MOVE 8,9→7,9 END_ACTION | `b8b1f872` | yes | 2,749 | 2,970 | 221 | 5,727 | 2824 |
| 10 | PROMOTE 5,5 END_PLACE MOVE 5,5→3,4 MOVE 9,7→9,6 MOVE 8,9→7,9 END_ACTION | `09b4ea98` | yes | BUY lightning_1@9,8 PROMOTE 5,5 MOVE 5,5→3,4 MOVE 9,7→9,6 MOVE 8,9→7,9 END_ACTION | `7857a075` | yes | -1,335 | -637 | 698 | 1,585 | 1521 |
| 11 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→8,4 ATK 8,4→8,3 END_ACTION | `1ab49979` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→8,4 ATK 8,4→8,3 END_ACTION | `1ab49979` | yes | 230 | 230 | 0 | 1,466 | 1824 |
| 12 | BUY fire_1@8,5 END_PLACE MOVE 8,5→5,4 ATK 5,4→4,4 END_ACTION | `023a069a` | yes | BUY fire_1@9,4 BUY fire_1@8,5 PROMOTE 8,4 MOVE 8,4→0,0 MOVE 7,9→7,8 END_ACTION | `9a5562d0` | yes | 3,816 | 1,389 | -2,427 | 3,940 | 1617 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 1 (the seat's turn #1).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 2c40cfb6ea06453d IS among the 20 candidates at this root; the engine played a35b17433dfddb9a instead, worth -1587 cc to the adviser against -80 cc. root exposure: 20 candidate(s) from a `completed-depth` list, 20 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #7) and did not prefer it: its score 1439 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key c4a681bdc4d37f3b IS among the 26 candidates at this root; the engine played 8b75eaa538d9d2d8 instead, worth -1856 cc to the adviser against 1229 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #12) and did not prefer it: its score 578 cc is the chosen candidate #3's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

_522471 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

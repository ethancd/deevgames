# Replay analysis — e1-g4-s750_0_18-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s750`. The game ended home-checkmate for white after 22 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 250 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 9,8→9,7 MOVE 8,9→8,8 END_ACTION | `2fae7bf3` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `5d8dde6a` | yes | -1,178 | -102 | 1,076 | 1,943 | 3021 |
| 2 | BUY fire_1@8,9 END_PLACE MOVE 8,8→9,8 MOVE 9,8→7,8 ATK 7,8→7,9 END_ACTION | `f2590f19` | yes | BUY fire_1@8,9 END_PLACE ATK 8,9→7,9 END_ACTION | `ba13d807` | yes | -215 | -1,123 | -908 | 935 | 1527 |
| 3 | BUY fire_1@9,8 BUY fire_1@7,9 BUY fire_1@8,8 MOVE 7,8→6,5 MOVE 6,5→5,4 MOVE 5,4→3,4 END_ACTION | `bc2ad484` | yes | BUY fire_1@9,8 BUY fire_1@8,8 BUY water_1@7,9 MOVE 7,8→2,7 MOVE 9,7→9,6 END_ACTION | `797ede93` | yes | -1,590 | 2 | 1,592 | -546 | 2368 |
| 4 | END_PLACE MOVE 8,8→2,8 MOVE 9,7→9,6 END_ACTION | `3a3559b8` | yes | END_PLACE MOVE 8,8→6,8 ATK 6,8→6,9 END_ACTION | `199b7193` | yes | -976 | -1,293 | -317 | 503 | 2591 |
| 5 | BUY lightning_1@3,8 END_PLACE MOVE 3,8→0,0 END_ACTION | `658c37bd` | yes | BUY lightning_1@3,8 END_PLACE MOVE 3,8→0,0 END_ACTION | `658c37bd` | yes | 485 | 485 | 0 | 3,024 | 2444 |
| 6 | BUY lightning_1@4,8 END_PLACE MOVE 4,8→4,2 ATK 4,2→4,1 END_ACTION | `cea4061d` | yes | BUY fire_1@8,8 BUY fire_1@9,7 BUY fire_1@7,9 BUY fire_1@3,8 END_PLACE ATK 8,8→8,7 MOVE 9,6→9,5 MOVE 3,8→1,7 END_ACTION | `1e0f2e9d` | yes | -2,238 | 1,487 | 3,725 | 1,448 | 2918 |
| 7 | BUY fire_1@9,7 PROMOTE 9,6 END_PLACE MOVE 9,7→2,7 END_ACTION | `17bb438f` | yes | BUY fire_1@9,7 END_PLACE MOVE 9,7→2,7 END_ACTION | `5983f294` | yes | -983 | -2,498 | -1,515 | -765 | 2225 |
| 8 | BUY fire_1@9,7 END_PLACE MOVE 9,6→8,6 MOVE 9,7→8,8 ATK 8,8→8,9 MOVE 9,8→8,7 END_ACTION | `51462bf2` | yes | BUY lightning_1@9,7 END_PLACE ATK 9,9→8,9 MOVE 9,6→8,6 MOVE 9,8→8,8 ATK 8,8→8,9 END_ACTION | `ce715da4` | yes | -1,971 | -1,368 | 603 | -1,097 | 2359 |
| 9 | BUY fire_1@8,9 BUY fire_1@9,8 BUY lightning_1@9,7 MOVE 8,7→6,5 MOVE 8,6→8,5 MOVE 8,9→7,9 END_ACTION | `4d87c0e2` | yes | BUY fire_1@8,9 BUY fire_1@9,8 BUY lightning_1@9,7 MOVE 8,7→6,5 MOVE 8,6→7,6 MOVE 8,9→7,9 END_ACTION | `8f7aecc5` | yes | 538 | -1,362 | -1,900 | 891 | 3015 |
| 10 | END_PLACE ATK 8,8→7,8 MOVE 8,5→6,5 ATK 6,5→6,4 END_ACTION | `c28a4e97` | yes | BUY fire_1@9,5 ATK 8,8→7,8 MOVE 8,5→6,5 ATK 6,5→6,4 END_ACTION | `1e50af8e` | yes | 217 | 280 | 63 | 2,082 | 2820 |
| 11 | BUY lightning_1@7,5 END_PLACE MOVE 7,5→4,2 ATK 4,2→4,3 END_ACTION | `6f4ea6fe` | yes | BUY lightning_1@7,5 END_PLACE MOVE 7,5→4,2 ATK 4,2→4,3 END_ACTION | `6f4ea6fe` | yes | 2,008 | 2,008 | 0 | 2,983 | 3013 |
| 12 | BUY fire_1@7,5 END_PLACE MOVE 7,5→3,3 ATK 3,3→2,3 END_ACTION | `2b25ba4a` | yes | BUY fire_1@8,9 BUY fire_1@7,5 BUY fire_1@7,6 MOVE 6,5→5,5 MOVE 7,5→3,4 END_ACTION | `2c212381` | yes | -95 | 99 | 194 | 1,883 | 3014 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 1 (the seat's turn #1).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 5d8dde6a87f2522a IS among the 16 candidates at this root; the engine played 2fae7bf3c753c677 instead, worth -1178 cc to the adviser against -102 cc. root exposure: 16 candidate(s) from a `completed-depth` list, 16 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #3) and did not prefer it: its score 1943 cc is the chosen candidate #1's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**exposure-inconsistent** at turn 6 (the seat's turn #6).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 1e0f2e9ddeda94ea IS among the 30 candidates at this root; the engine played cea4061d67891aea instead, worth -2238 cc to the adviser against 1487 cc. root exposure: 30 candidate(s) from a `completed-depth` list, 30 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #28 (played) carry the same score 1448 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_579590 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

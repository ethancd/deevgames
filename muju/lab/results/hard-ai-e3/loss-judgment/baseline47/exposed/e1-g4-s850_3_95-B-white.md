# Replay analysis — e1-g4-s850_3_95-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s850`. The game ended home-checkmate for white after 26 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 304 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | BUY fire_1@9,9 MOVE 8,9→2,7 END_ACTION | `bb340948` | yes | BUY fire_1@9,9 MOVE 8,9→2,7 END_ACTION | `bb340948` | yes | -1,191 | -1,191 | 0 | 593 | 3001 |
| 2 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→2,4 END_ACTION | `fe95ff06` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→2,4 END_ACTION | `fe95ff06` | yes | -1,027 | -1,027 | 0 | -307 | 2043 |
| 3 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→4,5 ATK 4,5→4,6 END_ACTION | `e2fd3b05` | yes | BUY lightning_1@8,9 END_PLACE MOVE 8,9→5,6 ATK 5,6→4,6 END_ACTION | `1853c2b5` | yes | -2,481 | 458 | 2,939 | -1,584 | 1982 |
| 4 | BUY lightning_1@8,9 PROMOTE 8,8 END_PLACE MOVE 9,8→9,7 MOVE 8,9→5,3 END_ACTION | `34f6147c` | yes | BUY lightning_1@8,9 PROMOTE 8,8 END_PLACE MOVE 9,8→9,7 MOVE 8,9→5,3 END_ACTION | `34f6147c` | yes | -1,773 | -1,773 | 0 | -695 | 1950 |
| 5 | BUY fire_1@8,9 END_PLACE MOVE 8,8→8,7 MOVE 8,7→8,6 MOVE 8,6→7,6 ATK 7,6→6,6 END_ACTION | `c3f9031d` | yes | BUY fire_1@8,9 END_PLACE MOVE 8,8→8,7 MOVE 8,7→8,6 MOVE 8,6→7,6 ATK 7,6→6,6 END_ACTION | `c3f9031d` | yes | -611 | -611 | 0 | -224 | 2676 |
| 6 | BUY fire_1@7,8 BUY fire_1@7,9 BUY fire_1@8,6 BUY fire_1@7,7 ATK 7,8→6,8 MOVE 7,6→6,5 MOVE 9,7→9,6 END_ACTION | `38796ba3` | yes | BUY fire_1@7,8 BUY fire_1@7,9 BUY fire_1@8,6 END_PLACE ATK 7,8→6,8 MOVE 8,6→8,2 MOVE 9,7→8,7 END_ACTION | `be742c99` | yes | 847 | 596 | -251 | 1,612 | 3006 |
| 7 | BUY fire_1@8,7 BUY fire_1@9,8 END_PLACE MOVE 7,8→7,2 MOVE 9,8→7,8 END_ACTION | `b90c9aa7` | yes | BUY fire_1@8,7 BUY fire_1@8,8 END_PLACE MOVE 9,6→9,5 MOVE 7,8→7,2 END_ACTION | `aba3ee3c` | yes | 1,412 | 1,582 | 170 | 1,867 | 3007 |
| 8 | BUY fire_1@8,5 END_PLACE MOVE 8,5→7,0 ATK 7,0→6,0 END_ACTION | `7148d778` | yes | BUY fire_1@8,5 END_PLACE MOVE 8,5→7,0 ATK 7,0→6,0 END_ACTION | `7148d778` | yes | 3,460 | 3,460 | 0 | 4,934 | 3006 |
| 9 | BUY fire_1@9,8 BUY lightning_1@8,8 END_PLACE ATK 9,8→9,7 MOVE 7,0→4,1 ATK 4,1→4,2 END_ACTION | `3e31c1af` | yes | BUY fire_1@9,8 BUY lightning_1@8,8 END_PLACE ATK 9,8→9,7 MOVE 7,0→4,1 ATK 4,1→4,2 END_ACTION | `3e31c1af` | yes | 2,955 | 2,955 | 0 | 3,989 | 1466 |
| 10 | END_PLACE MOVE 8,8→4,0 END_ACTION | `76c0277e` | yes | BUY fire_1@7,5 BUY fire_1@6,6 END_PLACE MOVE 6,5→5,4 MOVE 7,5→7,1 END_ACTION | `b481db15` | yes | 2,791 | 3,450 | 659 | 4,829 | 3000 |
| 11 | BUY fire_1@7,5 END_PLACE MOVE 7,5→7,1 ATK 7,1→6,1 END_ACTION | `c9cae2c9` | yes | BUY fire_1@7,5 BUY fire_1@8,5 END_PLACE MOVE 6,5→5,4 MOVE 7,5→7,1 END_ACTION | `9c79bea6` | yes | 3,838 | 4,659 | 821 | 4,431 | 2848 |
| 12 | BUY fire_1@7,5 BUY fire_1@8,5 BUY fire_1@9,5 END_PLACE MOVE 6,5→6,3 ATK 6,3→7,3 MOVE 7,5→5,5 END_ACTION | `6c040bae` | yes | BUY fire_1@7,5 BUY fire_1@8,5 BUY fire_1@9,5 END_PLACE MOVE 6,5→6,3 ATK 6,3→7,3 MOVE 7,5→5,5 END_ACTION | `6c040bae` | yes | 1,678 | 1,678 | 0 | 3,684 | 2761 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 1853c2b5c955957b IS among the 26 candidates at this root; the engine played e2fd3b05a4e0b065 instead, worth -2481 cc to the adviser against 458 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #12) and did not prefer it: its score -1584 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 1853c2b5c955957b IS among the 26 candidates at this root; the engine played e2fd3b05a4e0b065 instead, worth -2481 cc to the adviser against 458 cc. root exposure: 26 candidate(s) from a `completed-depth` list, 26 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #12) and did not prefer it: its score -1584 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

_523890 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

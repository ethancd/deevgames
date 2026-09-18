# Replay analysis — g3-s45_3_11-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `g3-s45`. The game ended home-checkmate for black after 33 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 387 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 3,0→2,0 END_ACTION | `1397d799` | yes | MOVE 3,0→3,1 END_ACTION | `70ab01d6` | yes | -2,300 | 906 | 3,206 | -1,503 | 2449 |
| 2 | BUY water_1@0,0 MOVE 2,0→7,1 MOVE 7,1→8,1 END_ACTION | `4ad72328` | yes | END_PLACE MOVE 2,0→5,3 ATK 5,3→5,4 END_ACTION | `67176261` | yes | -2,806 | 1,221 | 4,027 | -791 | 2337 |
| 3 | BUY water_1@0,1 BUY water_1@1,0 ATK 1,0→2,0 MOVE 0,2→0,3 MOVE 1,1→1,2 MOVE 1,2→2,2 END_ACTION | `1d282f8e` | yes | BUY fire_1@1,0 BUY water_1@0,1 ATK 1,0→2,0 MOVE 0,2→1,2 MOVE 1,2→2,2 END_ACTION | `346a936a` | yes | -1,817 | -2,202 | -385 | -1,002 | 2578 |
| 4 | BUY fire_1@2,0 BUY fire_1@1,1 BUY fire_1@2,1 END_PLACE MOVE 2,1→4,6 END_ACTION | `a28b1191` | yes | BUY fire_1@2,0 BUY fire_1@1,1 BUY fire_1@1,2 END_PLACE MOVE 1,1→4,6 END_ACTION | `e10e3739` | yes | -1,517 | -1,598 | -81 | -663 | 2839 |
| 5 | BUY fire_1@2,0 BUY fire_1@1,2 BUY fire_1@0,2 PROMOTE 2,2 END_PLACE ATK 2,0→3,0 MOVE 1,2→2,7 END_ACTION | `b1deba19` | yes | BUY fire_1@2,0 BUY fire_1@2,1 BUY fire_1@0,2 END_PLACE MOVE 0,2→4,5 END_ACTION | `1939ef23` | yes | -1,981 | -1,412 | 569 | 461 | 2858 |
| 6 | BUY fire_1@1,2 PROMOTE 2,2 ATK 2,0→3,0 MOVE 2,2→7,2 END_ACTION | `591728ae` | yes | BUY lightning_1@2,1 END_PLACE MOVE 2,1→6,4 ATK 6,4→6,5 END_ACTION | `43cb8417` | yes | -2,636 | -3,577 | -941 | 1,352 | 3001 |
| 7 | BUY lightning_1@5,2 END_PLACE MOVE 5,2→7,7 ATK 7,7→7,8 END_ACTION | `7eafcee6` | yes | BUY fire_1@7,1 BUY fire_1@1,2 BUY lightning_1@5,1 MOVE 5,1→7,7 ATK 7,7→7,8 END_ACTION | `f05c1f39` | yes | -1,788 | 110 | 1,898 | 1,300 | 1749 |
| 8 | BUY fire_1@7,1 BUY fire_1@1,2 BUY lightning_1@5,1 MOVE 5,1→9,8 END_ACTION | `3444e596` | yes | BUY fire_1@7,1 BUY fire_1@1,2 BUY lightning_1@5,1 MOVE 5,1→9,9 END_ACTION | `50440a84` | yes | 1,113 | 706 | -407 | 3,179 | 2062 |
| 9 | END_PLACE MOVE 7,2→9,8 END_ACTION | `7168718a` | yes | END_PLACE MOVE 7,2→9,8 END_ACTION | `7168718a` | yes | 998,000 | 998,000 | 0 | 997,000 | 2978 |
| 10 | BUY fire_1@6,0 BUY fire_1@7,0 BUY fire_1@2,1 MOVE 0,2→1,7 MOVE 1,1→1,2 END_ACTION | `f3edc581` | yes | BUY fire_1@6,0 BUY fire_1@2,1 BUY fire_1@6,1 MOVE 0,2→1,7 MOVE 6,1→7,2 END_ACTION | `bd759183` | yes | 1,866 | 4,144 | 2,278 | 3,992 | 2672 |
| 11 | BUY fire_1@5,0 END_PLACE ATK 6,0→6,1 MOVE 5,0→5,4 MOVE 7,0→8,1 END_ACTION | `7642b486` | yes | BUY fire_1@5,0 END_PLACE ATK 6,0→6,1 MOVE 5,0→5,4 MOVE 7,0→8,1 END_ACTION | `7642b486` | yes | 1,670 | 1,670 | 0 | 4,133 | 3016 |
| 12 | BUY fire_1@6,1 BUY water_1@7,1 MOVE 6,1→8,7 END_ACTION | `bdd89f9b` | yes | BUY fire_1@6,1 BUY water_1@7,1 MOVE 6,1→8,7 END_ACTION | `bdd89f9b` | yes | 3,370 | 3,370 | 0 | 3,213 | 3015 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 1 (the seat's turn #1).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 70ab01d60508097e IS among the 7 candidates at this root; the engine played 1397d79975c2aad9 instead, worth -2300 cc to the adviser against 906 cc. root exposure: 7 candidate(s) from a `completed-depth` list, 7 searched, completed depth 4, cutoff at -1. The root searched the adviser's best turn (candidate #4) and did not prefer it: its score -1503 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 2 (the seat's turn #2).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key 671762613c2757c5 IS among the 28 candidates at this root; the engine played 4ad72328d59b74f7 instead, worth -2806 cc to the adviser against 1221 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #10) and scored it -791 cc, ABOVE the played candidate #0 at -1828 cc — so this re-run did not play what the seat played (it chose candidate #3 at -791 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_558934 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

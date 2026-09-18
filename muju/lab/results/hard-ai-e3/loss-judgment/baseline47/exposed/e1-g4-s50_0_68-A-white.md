# Replay analysis — e1-g4-s50_0_68-A-white

Seat under analysis: **white** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s50`. The game ended elimination for black after 34 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 370 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | END_ACTION | `6f1cad21` | yes | END_ACTION | `6f1cad21` | yes | 226 | 226 | 0 | 226 | 3017 |
| 2 | BUY fire_1@0,0 BUY fire_1@0,1 MOVE 2,3→5,5 ATK 5,5→5,4 END_ACTION | `2320e529` | yes | BUY fire_1@0,0 BUY fire_1@1,0 MOVE 2,3→6,5 MOVE 1,2→2,2 END_ACTION | `27978e99` | yes | 959 | 2,072 | 1,113 | 2,138 | 2274 |
| 3 | END_PLACE MOVE 0,1→5,4 END_ACTION | `2d3289df` | yes | BUY fire_1@0,2 BUY lightning_1@1,0 MOVE 1,2→1,3 MOVE 1,0→6,4 END_ACTION | `5ecc3f36` | yes | 673 | 1,582 | 909 | 959 | 2107 |
| 4 | BUY fire_1@1,0 END_PLACE MOVE 1,1→0,1 MOVE 1,0→2,3 ATK 2,3→2,2 END_ACTION | `da996c4b` | yes | BUY fire_1@1,0 END_PLACE MOVE 1,1→0,1 MOVE 1,0→2,3 ATK 2,3→2,2 END_ACTION | `da996c4b` | yes | -346 | -346 | 0 | 2,387 | 1558 |
| 5 | BUY fire_1@2,2 END_PLACE ATK 2,2→3,2 END_ACTION | `e75747fb` | yes | BUY fire_1@2,2 END_PLACE ATK 2,2→3,2 END_ACTION | `e75747fb` | yes | 3,215 | 3,215 | 0 | 3,307 | 2043 |
| 6 | BUY fire_1@1,0 BUY fire_1@2,0 BUY fire_1@0,2 BUY fire_1@2,1 MOVE 2,3→4,5 ATK 4,5→4,4 MOVE 2,2→1,3 END_ACTION | `317ed6d1` | yes | BUY fire_1@1,0 BUY fire_1@2,0 BUY fire_1@0,2 BUY fire_1@2,1 MOVE 2,3→4,5 ATK 4,5→4,4 MOVE 2,2→3,3 END_ACTION | `745f6a3a` | yes | 2,095 | 2,960 | 865 | 4,744 | 2885 |
| 7 | BUY lightning_1@1,2 END_PLACE MOVE 1,2→5,4 ATK 5,4→5,5 END_ACTION | `841d5253` | yes | BUY lightning_1@1,2 END_PLACE MOVE 1,2→5,4 ATK 5,4→5,5 END_ACTION | `841d5253` | yes | 4,703 | 4,703 | 0 | 5,068 | 1628 |
| 8 | BUY lightning_1@1,2 END_PLACE MOVE 1,2→5,4 ATK 5,4→5,5 END_ACTION | `b89da624` | yes | BUY lightning_1@1,2 END_PLACE MOVE 1,2→5,4 ATK 5,4→5,5 END_ACTION | `b89da624` | yes | 4,988 | 4,988 | 0 | 5,428 | 1448 |
| 9 | BUY fire_1@1,1 BUY fire_1@1,2 END_PLACE MOVE 1,2→7,2 MOVE 1,3→1,4 END_ACTION | `5b22c07a` | yes | BUY lightning_1@1,2 END_PLACE MOVE 1,2→5,4 ATK 5,4→5,5 END_ACTION | `e2a5bfee` | yes | 2,501 | 4,001 | 1,500 | 4,137 | 2737 |
| 10 | BUY fire_1@6,0 BUY fire_1@6,1 BUY fire_1@7,1 PROMOTE 7,2 END_PLACE MOVE 2,1→3,4 ATK 3,4→2,4 MOVE 0,2→0,4 END_ACTION | `d41b122d` | yes | BUY fire_1@6,1 BUY fire_1@7,1 END_PLACE MOVE 2,1→3,4 ATK 3,4→2,4 MOVE 1,1→2,2 END_ACTION | `f68340e6` | yes | 2,104 | 5,570 | 3,466 | 5,749 | 2909 |
| 11 | BUY fire_1@6,2 BUY fire_1@7,0 END_PLACE MOVE 6,2→9,5 MOVE 7,0→8,1 END_ACTION | `2a5fa4c6` | yes | BUY fire_1@0,2 PROMOTE 7,2 END_PLACE MOVE 7,2→8,9 END_ACTION | `d0e9a207` | yes | 4,153 | 2,482 | -1,671 | 4,482 | 2951 |
| 12 | END_PLACE MOVE 6,1→6,5 ATK 6,5→6,6 END_ACTION | `8c7b8893` | yes | END_PLACE MOVE 6,1→6,5 ATK 6,5→6,6 END_ACTION | `8c7b8893` | yes | 4,220 | 4,220 | 0 | 5,616 | 2116 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 2 (the seat's turn #2).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 27978e99e97004d1 IS among the 27 candidates at this root; the engine played 2320e529ed28f014 instead, worth 959 cc to the adviser against 2072 cc. root exposure: 27 candidate(s) from a `completed-depth` list, 27 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #13) and did not prefer it: its score 2138 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**fixed-work-divergence** at turn 10 (the seat's turn #10).

Rule: the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser's best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`'s work sweep is what tests that

Evidence: the adviser's best end key f68340e6d1ed45bf IS among the 33 candidates at this root; the engine played d41b122d4562de97 instead, worth 2104 cc to the adviser against 5570 cc. root exposure: 33 candidate(s) from a `completed-depth` list, 33 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #10) and scored it 5225 cc, ABOVE the played candidate #0 at 4060 cc — so this re-run did not play what the seat played (it chose candidate #31 at 5749 cc). The re-run is fixed work and the seat played under a wall clock, which is the expected cause; the exposure describes the re-run, not the seat's own search

_531781 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd|black=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c`._

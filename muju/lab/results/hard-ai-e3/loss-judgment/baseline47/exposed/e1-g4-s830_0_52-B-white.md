# Replay analysis — e1-g4-s830_0_52-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s830`. The game ended home-checkmate for white after 36 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 413 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `5df6cbad` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `5df6cbad` | yes | 454 | 454 | 0 | 1,407 | 3023 |
| 2 | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→7,6 ATK 7,6→7,7 MOVE 9,7→9,8 END_ACTION | `101ac9a6` | yes | BUY fire_1@8,9 BUY lightning_1@9,8 MOVE 9,8→7,6 ATK 7,6→7,7 MOVE 9,7→9,8 END_ACTION | `101ac9a6` | yes | 2,781 | 2,781 | 0 | 3,259 | 1634 |
| 3 | BUY fire_1@7,8 BUY water_1@8,8 ATK 7,8→6,8 MOVE 7,8→2,7 END_ACTION | `076f42d4` | yes | BUY fire_1@7,8 BUY water_1@8,8 ATK 7,8→6,8 MOVE 7,8→1,8 END_ACTION | `405f8ce5` | yes | 2,296 | 3,099 | 803 | 3,729 | 1281 |
| 4 | BUY fire_1@9,7 BUY fire_1@8,6 BUY fire_1@9,6 MOVE 8,6→5,5 ATK 5,5→5,6 END_ACTION | `816720df` | yes | BUY fire_1@9,7 BUY fire_1@8,6 PROMOTE 7,6 MOVE 8,6→5,5 ATK 5,5→5,6 MOVE 7,6→7,2 END_ACTION | `d5fd570e` | yes | 2,567 | 4,015 | 1,448 | 1,615 | 3018 |
| 5 | BUY fire_1@8,6 BUY fire_1@7,7 BUY fire_1@7,8 END_PLACE MOVE 8,6→4,4 ATK 4,4→4,5 END_ACTION | `e495f20f` | yes | BUY fire_1@8,6 BUY fire_1@7,7 BUY fire_1@7,8 END_PLACE MOVE 8,6→4,4 ATK 4,4→4,5 END_ACTION | `e495f20f` | yes | 3,998 | 3,998 | 0 | 4,525 | 1245 |
| 6 | BUY fire_1@8,6 BUY water_1@8,7 END_PLACE MOVE 9,6→6,5 MOVE 8,6→8,2 END_ACTION | `d295e661` | yes | BUY fire_1@8,6 BUY water_1@8,7 END_PLACE MOVE 9,6→6,5 MOVE 8,6→8,2 END_ACTION | `d295e661` | yes | 3,071 | 3,071 | 0 | 2,519 | 2554 |
| 7 | END_PLACE MOVE 7,6→6,5 ATK 6,5→5,5 END_ACTION | `35dc0089` | yes | BUY shadow_1@8,3 END_PLACE MOVE 8,3→3,2 ATK 3,2→2,2 END_ACTION | `2421451f` | yes | 2,533 | 3,074 | 541 | 2,783 | 2782 |
| 8 | BUY fire_1@9,2 BUY fire_1@8,3 BUY fire_1@9,3 BUY fire_1@9,4 END_PLACE MOVE 7,8→5,4 ATK 5,4→5,5 END_ACTION | `924a4b83` | yes | BUY fire_1@9,2 BUY fire_1@8,3 BUY fire_1@9,3 BUY fire_1@9,4 END_PLACE MOVE 7,8→5,4 ATK 5,4→5,5 END_ACTION | `924a4b83` | yes | 2,737 | 2,737 | 0 | 2,460 | 3003 |
| 9 | BUY fire_1@8,4 BUY fire_1@9,5 BUY fire_1@8,6 END_PLACE MOVE 7,7→4,6 ATK 4,6→5,6 MOVE 8,3→7,2 END_ACTION | `8d4f6080` | yes | BUY fire_1@8,4 BUY fire_1@8,5 BUY fire_1@8,6 END_PLACE MOVE 7,7→5,5 ATK 5,5→5,6 MOVE 9,2→8,1 END_ACTION | `9aa91637` | yes | 2,050 | 2,570 | 520 | 3,126 | 3007 |
| 10 | BUY fire_1@9,6 BUY fire_1@7,6 BUY fire_1@7,3 BUY fire_1@7,5 END_PLACE ATK 7,6→6,6 MOVE 9,2→7,1 MOVE 7,3→5,3 END_ACTION | `9124e3e9` | yes | BUY fire_1@9,6 BUY fire_1@7,6 BUY fire_1@7,3 BUY fire_1@7,5 END_PLACE ATK 7,6→6,6 MOVE 9,2→8,1 MOVE 7,3→5,3 MOVE 7,5→5,5 END_ACTION | `d465dc48` | yes | 3,494 | 4,448 | 954 | 4,038 | 3001 |
| 11 | BUY fire_1@8,5 BUY fire_1@7,3 BUY fire_1@7,4 BUY fire_1@8,3 END_PLACE MOVE 9,3→7,1 MOVE 7,3→5,3 ATK 5,3→5,4 END_ACTION | `2b3dd3b4` | yes | BUY fire_1@8,5 BUY fire_1@7,3 BUY fire_1@8,3 END_PLACE MOVE 8,4→5,3 ATK 5,3→5,4 MOVE 7,5→5,5 END_ACTION | `f75fa53e` | yes | 3,173 | 1,861 | -1,312 | 4,842 | 1277 |
| 12 | END_PLACE MOVE 7,6→2,5 ATK 2,5→1,5 END_ACTION | `92de99be` | yes | END_PLACE MOVE 8,2→7,1 ATK 7,1→6,1 END_ACTION | `91cbae17` | yes | 2,500 | 1,743 | -757 | 3,386 | 1551 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**strong-candidate-misjudged** at turn 3 (the seat's turn #3).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key 405f8ce559c4d54a IS among the 28 candidates at this root; the engine played 076f42d4d0641575 instead, worth 2296 cc to the adviser against 3099 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. The root searched the adviser's best turn (candidate #24) and did not prefer it: its score 3729 cc is the chosen candidate #0's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

### Largest swing

**strong-candidate-misjudged** at turn 4 (the seat's turn #4).

Rule: the adviser's best turn IS in the root's candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate's. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent's score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`

Evidence: the adviser's best end key d5fd570ef456aa13 IS among the 28 candidates at this root; the engine played 816720df7daa3479 instead, worth 2567 cc to the adviser against 4015 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 2, cutoff at -1. The root searched the adviser's best turn (candidate #16) and did not prefer it: its score 1615 cc is the chosen candidate #2's own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure

_641122 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

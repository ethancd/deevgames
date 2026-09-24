# Replay analysis — SO01-B

Seat under analysis: **white** (`hard@desktop`) against `llm@gpt-6-sol`, opening `initial`. The game ended home-checkmate for black after 12 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 156 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 1,0→0,0 MOVE 0,1→0,2 END_ACTION BUY lightning_1@1,0 END_PLACE | `57c562b3` | yes | MOVE 1,0→0,0 MOVE 0,1→0,2 END_ACTION BUY lightning_1@1,0 END_PLACE | `57c562b3` | yes | -1,107 | -1,107 | 0 | 571 | 60017 |
| 2 | MOVE 0,2→0,1 MOVE 1,1→2,0 MOVE 1,0→3,1 END_ACTION BUY fire_1@1,0 BUY fire_1@1,1 BUY lightning_1@2,1 END_PLACE | `7253a97a` | yes | MOVE 0,2→0,1 MOVE 1,1→2,0 MOVE 1,0→3,1 END_ACTION BUY fire_1@1,0 BUY fire_1@3,0 BUY fire_1@1,1 END_PLACE | `327287a2` | yes | -569 | -1,026 | -457 | 1,058 | 52190 |
| 3 | MOVE 3,1→7,8 END_ACTION PROMOTE 2,1 END_PLACE | `9ee0d1d3` | yes | MOVE 3,1→7,8 END_ACTION PROMOTE 2,1 END_PLACE | `9ee0d1d3` | yes | 3,696 | 3,696 | 0 | -2,418 | 60001 |
| 4 | MOVE 2,1→8,7 ATK 8,7→7,7 END_ACTION PROMOTE 8,7 END_PLACE | `8493c0f1` | yes | MOVE 2,1→8,7 ATK 8,7→7,7 END_ACTION PROMOTE 8,7 END_PLACE | `8493c0f1` | yes | -2,170 | -2,170 | 0 | -1,801 | 53532 |
| 5 | MOVE 0,1→0,2 MOVE 1,1→1,7 END_ACTION BUY fire_1@1,1 BUY fire_1@1,2 BUY fire_1@0,3 END_PLACE | `6164820a` | yes | MOVE 0,1→0,2 MOVE 1,1→1,7 END_ACTION BUY fire_1@1,1 BUY fire_1@1,2 BUY fire_1@0,3 END_PLACE | `6164820a` | yes | -5,702 | -5,702 | 0 | -1,280 | 60011 |
| 6 | MOVE 1,2→7,2 MOVE 1,7→2,7 END_ACTION BUY fire_1@2,1 BUY fire_1@7,1 BUY fire_1@1,7 END_PLACE | `7f4c8715` | yes | MOVE 1,2→7,2 MOVE 1,7→2,7 END_ACTION BUY fire_1@2,1 BUY fire_1@7,1 BUY fire_1@1,7 END_PLACE | `7f4c8715` | yes | 1,037 | 1,037 | 0 | 381 | 60011 |
| 7 | MOVE 2,7→7,6 END_ACTION BUY plant_1@1,2 BUY metal_1@0,4 END_PLACE | `1bd4a0f6` | yes | MOVE 2,7→7,7 ATK 7,7→8,7 END_ACTION END_PLACE | `7bb809f7` | yes | 292 | -2,897 | -3,189 | -1,977 | 60007 |
| 8 | MOVE 2,1→7,2 MOVE 1,7→1,8 END_ACTION BUY fire_1@6,0 BUY fire_1@1,7 BUY plant_1@7,1 END_PLACE | `23039e34` | yes | MOVE 2,1→7,2 MOVE 1,7→1,8 END_ACTION BUY lightning_1@3,0 BUY lightning_1@4,0 BUY lightning_1@5,0 BUY lightning_1@0,1 END_PLACE | `b207f49f` | yes | 1,175 | 335 | -840 | 950 | 60008 |
| 9 | MOVE 0,3→3,4 MOVE 2,0→2,1 MOVE 1,2→1,3 END_ACTION BUY plant_1@2,2 BUY plant_1@2,3 BUY plant_1@3,3 BUY plant_1@1,4 END_PLACE | `b4ba99f9` | yes | MOVE 0,3→3,4 MOVE 2,0→2,1 MOVE 1,2→1,3 END_ACTION BUY plant_1@2,2 BUY plant_1@2,3 BUY plant_1@3,3 BUY plant_1@1,4 END_PLACE | `b4ba99f9` | yes | -3,038 | -3,038 | 0 | -1,433 | 51133 |
| 10 | MOVE 1,8→6,9 ATK 6,9→7,9 END_ACTION END_PLACE | `7cd93f33` | yes | MOVE 1,8→6,9 ATK 6,9→7,9 END_ACTION END_PLACE | `7cd93f33` | yes | -997,000 | -997,000 | 0 | -1,514 | 40998 |
| 11 | MOVE 1,3→3,4 MOVE 1,4→2,4 END_ACTION BUY plant_1@0,5 BUY plant_1@1,5 BUY plant_1@0,6 BUY plant_1@1,6 END_PLACE | `179e0a33` | yes | MOVE 1,3→3,4 MOVE 1,4→2,4 END_ACTION BUY plant_1@0,5 BUY plant_1@1,5 BUY plant_1@0,6 BUY plant_1@1,6 END_PLACE | `179e0a33` | yes | -997,000 | -997,000 | 0 | -2,860 | 59634 |
| 12 | MOVE 1,0→7,1 END_ACTION BUY plant_1@0,1 BUY plant_1@0,3 END_PLACE | `92fc4c15` | yes | MOVE 1,0→7,1 END_ACTION BUY plant_1@0,1 BUY plant_1@0,3 END_PLACE | `92fc4c15` | yes | -997,000 | -997,000 | 0 | -4,610 | 60022 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**unclear** at no turn.

Rule: none of the above separates, or no turn reached the swing threshold

Evidence: no consequential decision found at this threshold (no turn reached 300 cc of swing over 12 turn(s))

### Largest swing

**unclear** at turn 1 (the seat's turn #1).

Rule: none of the above separates, or no turn reached the swing threshold

Evidence: the largest swing over the game is 0 cc on turn 1, below the 300 cc threshold

_421351 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#b449e33af2dcba68fbbef5f4f0e2e165c09d835b4f619cbd5274b5bb4fbbd2be`; run recorded `none`._

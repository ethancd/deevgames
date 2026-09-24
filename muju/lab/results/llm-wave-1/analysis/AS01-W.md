# Replay analysis — AS01-W

Seat under analysis: **black** (`hard@desktop`) against `llm@gpt-6-astra`, opening `initial`. The game ended kill-clock for white after 5 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 57 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→9,7 MOVE 9,8→8,8 MOVE 8,9→9,9 END_ACTION BUY lightning_1@9,8 BUY lightning_1@8,9 END_PLACE | `06fd1a9b` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION BUY lightning_1@8,9 BUY water_1@9,8 END_PLACE | `ebc804a6` | yes | 1,089 | 2,504 | 1,415 | 15 | 60015 |
| 2 | MOVE 8,8→7,9 MOVE 9,8→6,8 MOVE 6,8→6,5 END_ACTION BUY lightning_1@7,5 BUY water_1@9,8 END_PLACE | `59ddd559` | yes | MOVE 8,8→7,9 MOVE 9,8→6,8 MOVE 6,8→6,5 END_ACTION BUY lightning_1@7,5 BUY water_1@9,8 END_PLACE | `59ddd559` | yes | 1,567 | 1,567 | 0 | -1,054 | 59626 |
| 3 | END_ACTION END_PLACE | `1994e1f8` | yes | END_ACTION END_PLACE | `1994e1f8` | yes | 973 | 973 | 0 | 936 | 60002 |
| 4 | MOVE 7,5→2,0 END_ACTION BUY shadow_1@7,5 BUY shadow_1@8,5 BUY shadow_1@9,5 END_PLACE | `0551b6f7` | yes | MOVE 7,5→2,0 END_ACTION BUY shadow_1@7,5 BUY shadow_1@8,5 BUY shadow_1@9,5 END_PLACE | `0551b6f7` | yes | -449 | -449 | 0 | -2,318 | 60009 |
| 5 | MOVE 6,5→0,3 END_ACTION END_PLACE | `cd12c44f` | yes | MOVE 6,5→0,3 END_ACTION END_PLACE | `cd12c44f` | yes | -999,000 | -999,000 | 0 | -999,000 | 90 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**exposure-inconsistent** at turn 1 (the seat's turn #1).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key ebc804a6d88a6b90 IS among the 25 candidates at this root; the engine played 06fd1a9b1045cfc1 instead, worth 1089 cc to the adviser against 2504 cc. root exposure: 25 candidate(s) from a `completed-depth` list, 25 searched, completed depth 2, cutoff at -1. Candidate #5 (adviser's best) and #1 (played) carry the same score 15 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

### Largest swing

**exposure-inconsistent** at turn 1 (the seat's turn #1).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key ebc804a6d88a6b90 IS among the 25 candidates at this root; the engine played 06fd1a9b1045cfc1 instead, worth 1089 cc to the adviser against 2504 cc. root exposure: 25 candidate(s) from a `completed-depth` list, 25 searched, completed depth 2, cutoff at -1. Candidate #5 (adviser's best) and #1 (played) carry the same score 15 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_105798 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#b449e33af2dcba68fbbef5f4f0e2e165c09d835b4f619cbd5274b5bb4fbbd2be`; run recorded `none`._

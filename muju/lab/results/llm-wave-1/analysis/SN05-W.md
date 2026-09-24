# Replay analysis — SN05-W

Seat under analysis: **black** (`hard@desktop`) against `llm@claude-sonnet-5`, opening `initial`. The game ended kill-clock for black after 5 turns — a **win** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 54 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION BUY shadow_1@8,9 BUY plant_1@9,8 END_PLACE | `27a0f8df` | yes | MOVE 8,8→9,7 MOVE 9,8→8,8 MOVE 8,9→9,9 END_ACTION BUY metal_1@9,8 BUY metal_1@8,9 END_PLACE | `3c5ebb5b` | yes | 1,434 | 342 | -1,092 | 3,337 | 60014 |
| 2 | MOVE 8,9→8,7 MOVE 7,9→8,9 MOVE 8,7→7,6 MOVE 7,6→7,4 END_ACTION BUY fire_1@7,5 BUY plant_1@8,8 BUY plant_1@7,9 BUY metal_1@8,4 END_PLACE | `bff28b56` | yes | MOVE 8,9→8,7 MOVE 7,9→8,9 MOVE 8,7→7,6 MOVE 7,6→7,4 END_ACTION BUY water_1@8,4 BUY water_1@9,4 BUY plant_1@8,8 BUY plant_1@7,9 END_PLACE | `72b47586` | yes | 2,889 | 4,470 | 1,581 | 5,060 | 51996 |
| 3 | MOVE 9,7→9,6 MOVE 7,5→5,5 MOVE 7,4→7,2 END_ACTION BUY water_1@8,5 BUY plant_1@8,2 BUY plant_1@9,4 BUY plant_1@6,5 END_PLACE | `95bd6b08` | yes | MOVE 9,7→9,6 MOVE 7,5→5,5 MOVE 7,4→7,2 END_ACTION BUY water_1@7,5 BUY plant_1@8,2 BUY plant_1@9,4 BUY plant_1@6,5 END_PLACE | `2af860d9` | yes | 5,149 | 5,149 | 0 | 5,213 | 45385 |
| 4 | MOVE 9,6→9,5 MOVE 7,2→9,1 MOVE 5,5→4,4 END_ACTION BUY plant_1@5,4 BUY plant_1@4,5 BUY plant_1@5,5 BUY plant_1@4,6 END_PLACE | `2ec1f61b` | yes | END_ACTION END_PLACE | `0582ee4a` | yes | 3,683 | 998,000 | 994,317 | 997,000 | 49507 |
| 5 | END_ACTION END_PLACE | `6ac9887a` | yes | END_ACTION END_PLACE | `6ac9887a` | yes | 999,000 | 999,000 | 0 | 999,000 | 10 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**exposure-inconsistent** at turn 2 (the seat's turn #2).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 72b47586f9c76672 IS among the 25 candidates at this root; the engine played bff28b56dbd8cc20 instead, worth 2889 cc to the adviser against 4470 cc. root exposure: 25 candidate(s) from a `completed-depth` list, 25 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #19 (played) carry the same score 5060 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

### Largest swing

**exposure-inconsistent** at turn 4 (the seat's turn #4).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 0582ee4a48615d54 IS among the 28 candidates at this root; the engine played 2ec1f61bec82d675 instead, worth 3683 cc to the adviser against 998000 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. Candidate #0 (adviser's best) and #5 (played) carry the same score 997000 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_156982 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#b449e33af2dcba68fbbef5f4f0e2e165c09d835b4f619cbd5274b5bb4fbbd2be`; run recorded `none`._

# Replay analysis — e1-g4-s350_0_72-B-white

Seat under analysis: **black** (`hard@desktop`) against `aiv2-hard`, opening `e1-g4-s350`. The game ended elimination for white after 27 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 295 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `0c77d5dd` | yes | MOVE 8,8→7,9 MOVE 9,8→9,7 MOVE 8,9→9,9 END_ACTION | `0c77d5dd` | yes | 1,780 | 1,780 | 0 | -1,045 | 3026 |
| 2 | BUY lightning_1@9,8 END_PLACE MOVE 9,8→6,6 ATK 6,6→5,6 END_ACTION | `ea515ad3` | yes | BUY lightning_1@9,8 END_PLACE MOVE 9,8→6,6 ATK 6,6→5,6 END_ACTION | `ea515ad3` | yes | 1,385 | 1,385 | 0 | 2,329 | 2206 |
| 3 | BUY fire_1@8,8 BUY fire_1@9,8 BUY fire_1@7,6 MOVE 7,6→4,5 MOVE 7,9→8,9 MOVE 6,6→6,3 END_ACTION | `95f60545` | yes | BUY fire_1@6,8 END_PLACE ATK 6,8→5,8 END_ACTION | `6534ed72` | yes | 3,410 | 3,071 | -339 | 3,518 | 2237 |
| 4 | PROMOTE 6,3 END_PLACE MOVE 6,3→2,0 MOVE 8,9→8,8 ATK 8,8→8,7 END_ACTION | `940ab9cc` | yes | PROMOTE 6,3 END_PLACE MOVE 6,3→2,0 MOVE 8,9→8,8 ATK 8,8→8,7 END_ACTION | `940ab9cc` | yes | 5,258 | 5,258 | 0 | 4,938 | 1260 |
| 5 | BUY fire_1@8,9 BUY fire_1@9,5 BUY lightning_1@8,6 MOVE 9,5→8,1 MOVE 4,5→3,4 END_ACTION | `6b4dd4f8` | yes | BUY fire_1@8,9 BUY fire_1@9,5 BUY fire_1@7,7 MOVE 9,5→7,1 MOVE 4,5→3,4 END_ACTION | `6e2c3705` | yes | 6,328 | 7,074 | 746 | 7,807 | 2689 |
| 6 | BUY fire_1@8,2 END_PLACE MOVE 8,6→4,4 ATK 4,4→4,5 MOVE 8,8→8,7 END_ACTION | `091c78d0` | yes | BUY fire_1@8,2 BUY fire_1@8,3 MOVE 8,3→4,4 ATK 4,4→4,5 END_ACTION | `1f22283d` | yes | 6,941 | 6,233 | -708 | 6,795 | 2511 |
| 7 | BUY fire_1@8,3 BUY fire_1@5,4 PROMOTE 4,4 MOVE 4,4→0,1 ATK 0,1→0,0 MOVE 8,3→7,2 END_ACTION | `f7c4f1a9` | yes | BUY fire_1@8,3 BUY fire_1@5,4 PROMOTE 4,4 MOVE 4,4→0,1 ATK 0,1→0,0 MOVE 8,3→7,2 END_ACTION | `f7c4f1a9` | yes | 7,391 | 7,391 | 0 | 8,235 | 2870 |
| 8 | BUY fire_1@9,1 BUY fire_1@7,3 BUY lightning_1@8,3 MOVE 8,3→1,1 END_ACTION | `95adcd71` | yes | BUY fire_1@9,1 BUY fire_1@7,3 BUY lightning_1@8,3 MOVE 8,1→0,1 END_ACTION | `d11cd66e` | yes | 6,076 | 6,473 | 397 | 7,265 | 2869 |
| 9 | END_PLACE MOVE 8,1→1,1 END_ACTION | `634e2164` | yes | END_PLACE MOVE 8,1→1,1 END_ACTION | `634e2164` | yes | 5,353 | 5,353 | 0 | 6,856 | 2423 |
| 10 | BUY fire_1@9,2 BUY fire_1@8,3 PROMOTE 7,2 END_PLACE MOVE 9,1→6,0 MOVE 9,2→8,1 END_ACTION | `41923d8a` | yes | END_PLACE MOVE 8,2→1,1 END_ACTION | `603be6dc` | yes | 4,779 | 2,975 | -1,804 | 8,527 | 2694 |
| 11 | BUY fire_1@8,5 END_PLACE MOVE 8,5→2,5 ATK 2,5→1,5 END_ACTION | `e81b5c2a` | yes | BUY fire_1@8,5 END_PLACE MOVE 8,5→2,5 ATK 2,5→1,5 END_ACTION | `e81b5c2a` | yes | 4,197 | 4,197 | 0 | 6,451 | 2495 |
| 12 | BUY lightning_1@9,7 END_PLACE MOVE 9,7→3,4 ATK 3,4→2,4 END_ACTION | `a038f784` | yes | BUY fire_1@8,8 BUY fire_1@9,7 PROMOTE 9,8 MOVE 6,0→7,1 MOVE 9,7→5,5 END_ACTION | `b94b1c8d` | yes | 4,748 | 4,039 | -709 | 6,181 | 2105 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**exposure-inconsistent** at turn 5 (the seat's turn #5).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 6e2c370561c3b63f IS among the 28 candidates at this root; the engine played 6b4dd4f8e69940cc instead, worth 6328 cc to the adviser against 7074 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. Candidate #11 (adviser's best) and #25 (played) carry the same score 7807 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

### Largest swing

**exposure-inconsistent** at turn 5 (the seat's turn #5).

Rule: the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser's best turn is in the generator's list but absent from the root's published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three

Evidence: the adviser's best end key 6e2c370561c3b63f IS among the 28 candidates at this root; the engine played 6b4dd4f8e69940cc instead, worth 6328 cc to the adviser against 7074 cc. root exposure: 28 candidate(s) from a `completed-depth` list, 28 searched, completed depth 3, cutoff at -1. Candidate #11 (adviser's best) and #25 (played) carry the same score 7807 cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure

_527762 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#43ea6a26a0a0e679300d0e1c8e9bfae56205e33e61c6c14f7660352fb511d90d`; run recorded `white=aiv2:hard:full:wall:3000#dc7e4607ea81aad2967ce361b45e3bf3e8ff2a93e1e74db305b96b6c42a5918c|black=hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`._

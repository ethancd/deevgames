# Alternate versus current map

Read `PLAN.md` for the pre-result hypotheses and `FOLLOWUP.md` for the separately labeled exploratory central-anchor follow-up. The analysis is in `../../../docs/ALTERNATE_MAP_REPORT-2026-09-12.md`.

Run from `muju/` with installed dependencies. Results go to `lab/results/alternate-map-2026-09-12/`; match runners refuse to overwrite existing logs. For reproduction, preserve/move the existing output directory first and restore the archived source in a separate checkout. `source-manifest.json` records the engine snapshot used by the game records; `final-source-manifest.json` and `final-source.tar.gz` include the finished experiment code. No production files were edited.

```
node --import tsx lab/experiments/alternate-map/run.ts 20 main current,alternate,homeExpansionOnly,centerOnly
node --import tsx lab/experiments/alternate-map/run.ts 20 routes current,alternate
node --import tsx lab/experiments/alternate-map/run.ts 20 routes-deep current,alternate
node --import tsx lab/experiments/alternate-map/probes.ts
node --import tsx lab/experiments/alternate-map/ai.ts
python3 lab/experiments/alternate-map/analyze.py
python3 lab/experiments/alternate-map/report.py
```

Main: 1,280 games across four maps. Initial route screen: 960 games across two maps. Exploratory deeper-anchor screen: 480. Search-engine supplement: 16. The 32-game scripted pilot and one AI pilot are excluded. A pilot AI match completed, but saving its replay failed because a colon in a filename was interpreted as a URL scheme. The filename was sanitized and the AI series restarted; that pilot is retained separately. No decision logic was changed for that fix.

All game comparisons pair map variants at the same policy, seed, and color. Distinct policies swap colors; mirrors run once. Route groups use different tie-breaking seed streams across different targets; do not treat cross-route rankings as a paired comparison. The same initial seed labels are used for the two maps within each route. Strict legal-action and per-transition conservation/occupancy checks run on every game. Caps are unresolved, not adjudicated victories. All replays from seed index 0 are retained. AI games use production medium search and WASM with the existing fast preset (120 ms / 60 MCTS iterations), not the UI's full thinking budget. Timing can change exact search decisions even at the same seed.

Economic probes retain actual starters, collision-aware movement, shared four-action turns and real production purchases/income. The opponent passes. Exactly one Muju is purchased in each of turns 2 and 3 when feasible; no promotions or further buying. Moves and purchases stay within the specified Manhattan radius of home. Search uses widths 64 and 256 and a fixed residual-income heuristic. Every selected horizon witness is independently replayed with invariant checks. The reported five-turn totals meet simple upper bounds: 51 from the scheduled miners' output, or 48 from the smaller region's entire stock. This certifies these particular no-opponent maxima, not a competitive opening.

The study's TypeScript check reaches a pre-existing lab typing mismatch: `lab/harness/runner.ts:154` assigns the current `home-checkmate` victory reason to a stale `WinType` union in `lab/harness/types.ts`. It does not affect runtime results. The mismatch was left untouched to keep this work confined to analysis files. This is not a claim that the full repository typecheck passed.

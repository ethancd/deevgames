Four-action counterfactual, 2026-09-12. See [the report](../../../docs/FOUR_ACTIONS_REPORT-2026-09-12.md).

The engine is copied from the current source into an ignored `.sandbox` directory. `prepare.py` changes only `MAX_ACTIONS_PER_TURN`, selecting four or six using `MUJU_ACTIONS`. Current map, catalogue, elemental rules, passive income, upkeep, purchase/promotion timing, healing, Cleave, victory rules and draw clock are preserved. The source archive, file hashes and exact substitution are saved with the results.

The study uses existing scripted policies with existing home-awareness, invasion, siege or guard wrappers. Their action selection and bounded home-defense search are unchanged. These games do not use the production MCTS player or its placement-phase WASM search. Tactical solver probes start in the action phase, where their budget is read from the supplied state; they never invoke the six-action placement shortcut in the production kernel.

There are 20 seeds per cell. Distinct policies play both colors at each seed; mirrors run once because the swapped game would be identical. Both rule variants receive matching seeds and matchups. Eight cells produce 280 games per variant, 560 total. A separate 32-game pilot verified execution and was excluded from all reported statistics. Policies and the matchup mix were fixed before the pilot.

The existing runner's cap adjudication is treated as unresolved by this study. No main game reached the 120-round or 8,000-dispatch cap. Every transition is checked for legality, action budget and board/resource invariants. `verify-baseline.ts` independently reproduces eight six-action games using production modules, ignoring generated unit identifiers when comparing results.

Run from `muju`, in a checkout with dependencies installed:

```sh
python3 lab/experiments/four-actions/prepare.py
MUJU_ACTIONS=6 node --import tsx lab/experiments/four-actions/run.ts 20 paired
MUJU_ACTIONS=4 node --import tsx lab/experiments/four-actions/run.ts 20 paired
MUJU_ACTIONS=6 node --import tsx lab/experiments/four-actions/probes.ts
MUJU_ACTIONS=4 node --import tsx lab/experiments/four-actions/probes.ts
node --import tsx lab/experiments/four-actions/verify-baseline.ts
python3 lab/experiments/four-actions/analyze.py
```

The runner refuses to overwrite existing main results, including compressed files. Use a fresh checkout/output directory for a complete rerun. `prepare.py` also refuses to mix newer production source with an existing source manifest. The archived `source.tar.gz` preserves the study's exact rules.

Results are under `lab/results/four-actions-2026-09-12/`: `paired-*.jsonl.gz` contain full game records, `replay-paired-*.json.gz` preserve the first seed of each matchup/color, `probes-*.json` contain tactical states and witnesses, and `summary.json` contains all matchup results. `analyze.py` and baseline verification read compressed or uncompressed game records.

Round numbers are the engine's white/black round counter. First-kill medians exclude the few games without an attack kill. Draws are included in game-length statistics. No confidence claims are inferred from this fixed and heterogeneous policy mix. Telemetry is supplementary: whole-game action totals include terminal partial turns, whereas `completedTurns` counts explicit turn endings; dividing those fields is not an exact per-turn rate.

# Balance Lab — Experiment Designs (Phase 3)

All experiments are seeded configs in `lab/experiments/*.json`, run with
`npx tsx lab/harness/cli.ts --config <file>` from `muju/`. Every game row is
stamped with the engine git hash; summaries (Wilson 95% CIs) land in
`lab/results/<name>/summary.csv` and are the committed canon (raw JSONL is
gitignored above the sampling caps; see `lab/results/.gitignore`).

## Power math

For detecting a win-rate deviation from 50% at 95% confidence with ~80% power:

| Detectable effect | Games per cell |
|---|---|
| 50% vs 55% (5 pt) | ~780 |
| 50% vs 57.5% (7.5 pt) | ~350 |
| 50% vs 60% (10 pt) | ~195 |
| 50% vs 65% (15 pt) | ~85 |
| 50% vs 75% (25 pt) | ~30 |

Measured throughput (Apple Silicon, single process, this repo):

- Scripted bots: ~100–180 games/s (fast cells), ~10–25 games/s for
  cap-bound pairings (Turtle/Random mirrors that run all 120 rounds).
- `AIv2-*-fast` engine bots: ~0.05–0.1 games/s (≈ 10–20 s per game).
- `AIv2-*` UI-speed presets: minutes per game — confirmation subsets only.

Cell sizes are chosen accordingly: scripted cells use 200–800 games
(detect ≥7.5–10 pt effects per ordered cell, ≥5 pt pooled); engine cells use
20–40 games (detect only large effects, ≥25 pt — reported as coarse gates,
not fine-grained claims).

## Calibration gates (must pass before fine-grained claims)

| Gate | Threshold | Experiment |
|---|---|---|
| G1 ladder | Greedy ≥70% vs Random; each L2 archetype ≥70% vs Random | e2-ladder-gates |
| G2 engine floor | AIv2-medium ≥95% vs Random | e2-engine-gates |
| G3 engine vs Greedy | AIv2-medium ≥65% vs Greedy | e2-engine-gates |
| G4 sensitivity | +1 global ATK (white) in Greedy/Balanced mirrors shifts white WR ≥10 pts vs e3 baseline | e3-sensitivity vs e3-first-player |

If G4 fails, the instrument cannot support stat-level patch claims
(±1 ATK-sized changes) and the report must say so.

Note on G1: the L2-vs-L1 plan gate ("each tier ≥70% vs tier below") is
interpreted vs **Random** for archetype bots — archetypes are *stances*, not
strictly stronger policies than Greedy; e.g. Expand by design loses to
aggression. The Greedy-vs-archetype cells are still measured and reported.

## Experiments

- **E1 length/perf** — `lab/harness/bench.ts`; games/s per tier, game length
  distributions from all E2–E7 rows (turns histogram in the report).
- **E2 ladder gates** — `e2-ladder-gates.json` (scripted), 
  `e2-engine-gates.json` (engine, mirrored seats). Gates G1–G3.
- **E3 first-player advantage** — `e3-first-player.json`: 400-game mirrors
  (Greedy, Rush, Balanced; 200 AntiRush). White WR CI vs 50%.
  **Sensitivity** — `e3-sensitivity.json`: same mirrors with white +1 ATK.
- **E4 mono-element matrix** — `e4-mono-matrix.json`: 6×6 Mono-X bots
  (Greedy policy, queue restricted to one element; standard symmetric
  starting trio per harness ruling J-006), 200 games per ordered cell,
  both seat orders, plus self-mirrors.
- **E5 archetype matrix** — `e5-archetype-matrix.json`: Rush/Expand/Balanced
  round-robin, 400/cell mirrored.
- **E6 degenerate probes** — `e6-degenerate-probes.json`: the headline
  **rush band** cell (Rush vs AntiRush, 800 games mirrored — ruling E-2:
  target 35–55%, >65% balance failure, <25% over-nerfed) plus
  Rush-vs-Turtle/Expand (rush must beat passivity and greedy economy),
  Tier1Spam and MiningDenial probes. `e6-rush-vs-ai.json`: Rush and
  Tier1Spam vs AIv2-hard-fast (coarse, 20–30 games/cell).
- **E7 advantage-graph comparison** — `e7-graph-comparison.json`: the same
  8 elementally-sensitive cells under 4 graphs: `double-thick` (incumbent),
  `dual-triangle` (v1.0), `rush-edge-only`, and `none` (control only — NOT a
  candidate; violates ruling E-1). Candidates must preserve the rush→expand
  edge (pinned by tests in `tests/game/lab-knobs.test.ts`).

## Cross-checks and known limits

- Engine-bot rows run "as-shipped" (J-005): illegal AI emissions (D1/D2) are
  counted per game and reported; a non-trivial count forces the J-002
  exception (fix D1/D2 before trusting engine rows).
- Scripted bots cannot cheat by construction (rules-filtered legal set).
- Adjudication rates are reported per cell; cells dominated by adjudication
  (e.g. Turtle mirrors) measure the adjudication rule as much as the bots —
  flagged in the report.
- Greedy-level matrices are sign-checked against AIv2 confirmation cells
  where available; disagreement downgrades confidence (plan §P3).

## Results

Filled in as runs complete; see `lab/results/<experiment>/summary.csv` and
the Phase 3 findings section of `muju/docs/BALANCE_REPORT.md` (Phase 5).

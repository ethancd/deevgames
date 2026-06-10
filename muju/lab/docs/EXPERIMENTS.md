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

## Results (Phase 3, engine 2eaee60, 2026-06-09)

Canon = `lab/results/<experiment>/summary.csv` (post-D13-fix rerun; the
pre-fix run at 18cf304 produced statistically identical numbers plus 4
ID-collision aborts in ~27k games, which led to the D13 fix). 27,400 games,
zero invariant violations.

### Gates

| Gate | Result | Numbers |
|---|---|---|
| G1 ladder | **PASS** | Greedy 100% vs Random (200g); Balanced 99.0%, Rush 99.0% vs Random |
| G2 engine floor | **PASS** | AIv2-medium-fast 100% vs Random (40g, CI ≥91.2%) |
| G3 engine vs Greedy | **PASS** | AIv2-medium-fast 80.0% [65.2–89.5] (40g); AIv2-hard-fast 83.3% [66.4–92.7] (30g) |
| G4 sensitivity | **PASS** (huge) | +1 white ATK: Greedy mirror 52.8%→98.0% white WR; Balanced mirror 51.5%→95.2% |

All four calibration gates pass; fine-grained claims are licensed, with the
G3 caveat that the `-fast` engine presets are weaker than the UI presets
(80% vs Greedy, not a ceiling).

G4 interpretation: a ±1 ATK change is not a "fine-grained" change in this
game — it flips one-shot kill thresholds across the T1 roster and swings
mirrors by ~45 pts. The instrument easily resolves stat patches; conversely,
±1 stat patches are sledgehammers, and cost/build-time levers are the finer
instruments.

### E3 first-player advantage: none detectable

White WR in 400-game mirrors: Greedy 52.8% [47.9–57.6], Rush 48.2%,
Balanced 51.5%, AntiRush 48.5% (200g). No CI excludes 50%.

Related null (initiative hypothesis): scoring **first blood does not predict
winning** — 51.5% in Greedy mirrors (n=400), 50.0% in Balanced mirrors
(n=396). Risk-free attacking does not visibly snowball at bot level; kills
are decided by the wall/threshold math, not by who swings first.

### E6 headline — the rush band (ruling E-2: target 35–55%)

| Cell | Rush WR | Verdict |
|---|---|---|
| Rush vs AntiRush (800g) | **14.2%** [12.0–16.8] | **below band — over-defended** |
| Rush vs AIv2-hard-fast (30g) | **6.7%** [1.8–21.3] | below band vs the real AI too (sign-consistent with scripted) |
| Rush vs Greedy (400g, E2) | 6.0% | far below band |
| Rush vs Turtle (400g) | 44.0% [39.2–48.9] | rush cannot reliably punish pure passivity |
| Rush vs Expand (400g) | **97.2%** | rush SHOULD beat greedy economy ✓ (E-2) |
| Rush vs Balanced (800g, E5) | 43.6% | inside band vs a non-specialist |

Both arms of ruling E-2's "best defensive responder" agree: the scripted
AntiRush (14.2%) and the hard AI (6.7%, mean game 6 turns — the engine
counter-attacks the rusher's economy directly). The v1.1 §5.2 complaint
("AI gets roflstomped by mass Fire_1 rush") no longer holds for engine-v2.
**Phase 4 must move the defended-rush number UP toward 35–55%** without
breaking Rush-beats-Expand — candidate levers per the E7 finding are stats
and costs (e.g. tank cost/DEF trims, fire build-time/cost), not the graph.

Mass fire_1 is binary: it annihilates pure economy in ~15 turns but collapses
against any defense that (a) walls with DEF ≥ 3 bodies and (b) exploits the
water→fire attack penalty. The defended cells sit far below the 35–55% band.

### E4 mono-element matrix (queue-restricted Greedy lines, 200g/ordered cell)

Row = line, win rate vs column line (pooled both seats):

|  | fire | light | water | shadow | plant | metal |
|---|---|---|---|---|---|---|
| **fire** | — | 67% | **0%** | 6% | 100% | 61% |
| **lightning** | 33% | — | 0% | 0% | 79% | **3%** |
| **water** | 100% | 100% | — | 99% | 2% | 0% |
| **shadow** | 94% | 100% | 1% | — | 65% | 0% |
| **plant** | 0% | 21% | 98% | 35% | — | 4% |
| **metal** | 39% | 97% | 100% | 99% | 96% | — |

- The Double-Thick Triangle's edges carry 6 of 8 cross-pair cells, but
  **lightning→metal (3%) and plant→shadow (35%) fail** despite elemental
  advantage: ±1 ATK cannot rescue lines whose stats can't convert it.
- Within pairs (neutral element): **water dominates shadow 99%** and
  **metal dominates plant 96%** — each pair has a strong and a trap partner.
- Line power ranking: metal ≳ water ≫ shadow > fire ≫ plant > lightning.
  Lightning loses every cell except vs plant; its DEF-1, MINE-0 line is a
  trap exactly as the static analysis predicted.

### E5 archetype matrix (800g/cell mirrored)

Rush 96.5% vs Expand; Balanced 56.4% vs Rush; Balanced 52.9% vs Expand
(93% adjudication — two passive stances stall to the cap).

### E7 advantage graphs (same cells under 4 graphs)

Rush WR vs AntiRush: incumbent **12.5%**, dual-triangle 11.2%,
rush-edge-only **96.0%**, none (control) **97.8%**.

The water/shadow→fire/lightning *back-edge* is what makes rush defendable at
all: Hi at ATK 2−1=1 cannot one-shot Sjor (DEF 2); remove the penalty and it
can, and the dedicated defense collapses from 88% to 2–4%. Within ruling
E-1's candidate set the incumbent (or dual-triangle, nearly identical on
these cells) is the only viable family; the band failure (12.5% ≪ 35%) must
be fixed with **stat/cost levers, not the graph**. Secondary E7 findings:
Balanced-vs-Expand flips from 43% (incumbent, expand propped up by its edge
into water/shadow) to ~95% under all other graphs; lightning→metal stays
broken under every graph (2–17%).

### E1 length/perf

Scripted cells: ~65–200 games/s end-to-end; mean game lengths from 6 turns
(Expand dies to Rush) to the 120-turn cap (passive mirrors; adjudication
rates flagged per cell). Engine `-fast` bots: ~0.05–0.1 games/s. Bench
details: `lab/harness/bench.ts`.

### Engine cells (AIv2, as-shipped, J-005)

`lab/results/e2-engine-gates/summary.csv`:

| Cell | AI WR | Illegal emissions |
|---|---|---|
| AIv2-medium-fast vs Random (40g) | 100% [91.2–100] | 0 |
| AIv2-medium-fast vs Greedy (40g) | 80.0% [65.2–89.5] | **11 (in 4 games)** |
| AIv2-hard-fast vs Greedy (30g) | 83.3% [66.4–92.7] | 0 |

Legality instrumentation: the AI emitted 11 illegal actions across 4 of 110
games (medium preset only; mixed winners in affected games). The follow-up
probe (`lab/results/illegal-probe/`, 32 games, runner logs each emission
verbatim) classified them: **MOVE 3 / ATTACK 6 — not D1/D2** (no tech-skip
queues, no bad spawns), but a previously undocumented divergence, now
**D14**: plans searched over belief-determinized states reference a world
that diverged from reality, and `ai/simulate` applies MOVE/ATTACK without
re-validating (ghost attacks burn actions; MOVE has no occupancy guard).
Materiality call for J-002: ~0.3 emissions/game on medium, 0 observed on
hard; mostly self-penalizing (wasted actions) and no board corruption seen in
27k+ invariant-checked games — baseline engine rows stand, flagged; D14
joins D1/D2 in the P4a fix list, after which `legality: 'strict'` reruns
quantify the delta.

`lab/results/e6-rush-vs-ai/summary.csv` (hard preset):

| Cell | AI WR | Illegal emissions |
|---|---|---|
| AIv2-hard-fast vs Rush (30g) | 93.3% [78.7–98.2], mean 6 turns | 18 (0.6/game) |
| AIv2-hard-fast vs Tier1Spam (20g) | 100% [83.9–100] | 71 (3.5/game) |

The P4a acceptance criterion "hard AI beats Tier1Spam" already holds at
baseline. D14 emission rates scale with enemy-unit churn (spam games breed
belief drift: imagined enemies die or move constantly), reinforcing the P4a
priority on validating actions at application time.

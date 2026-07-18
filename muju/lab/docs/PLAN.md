# Muju Hono Balance Lab (v3 — refined for remote execution)

## Context

Goal: improve the balance of Muju Hono Tanka across **ruleset, piece catalog, and AI player**. This refines the "Balance Lab v2" plan against the actual state of this repo and Ethan's new design rulings. The v2 plan's core architecture (audit → harness → experiments → decide/patch/report) is sound and is kept; the refinements below correct stale assumptions, fold in bugs found during exploration, add an explicit AI-improvement workstream, and encode three new design priors.

**Verified ground truth (this session):** 418/418 tests green (16 files). v1.1 stats are implemented in `muju/src/game/units.ts`. Element system is the Double-Thick Triangle (`muju/src/game/elements.ts`): Fire&Lightning → Plant&Metal → Water&Shadow → back; ±1 ATK only. 6 actions/turn, repeatable actions, no summoning sickness, full heal at owner's turn start (`board.ts:resetUnitActions`), action-free placement, tech-gating T2+ (`building.ts:meetsTechRequirement`). AI = MCTS + beam + belief (`src/ai/engine-v2.ts`). `forge/docs/BALANCE_ANALYSIS.md` exists (house style). `AI_ENGINE_QUESTIONS.md` Q4–Q12 open.

## Ethan's design rulings (new — constrain everything below)

1. **Element graph prior:** Rush beating Expand elementally is *intended* (SC2 meta: mass Fire_1 = zerg rush). The incumbent Double-Thick Triangle is the favored incumbent; E7 compares only alternatives that **preserve the rush→expand edge**. Overturning the incumbent needs strong evidence.
2. **Rush acceptance band:** mass-Fire_1 rush must be **defendable but not inevitable** — it should beat greedy pure-economy play, and lose to a competent prepared defense. Operationalize: vs best defensive responder (scripted anti-rush bot and hard AI), rush win rate target ≈ 35–55%; >65% = balance failure; <25% = over-nerfed.
3. **Board-game-ability constraint on rule patches:** game state must stay trackable by piece position / a human head — no persistent per-unit HP, no spreadsheet state. Within-turn damage (existing, resets at owner's turn start) is acceptable; cross-turn damage counters are not. Structural changes are otherwise allowed.

## Corrections to the v2 plan (the refinement delta)

| # | v2 plan said | Reality / change |
|---|--------------|------------------|
| 1 | Branch `muju-lab`, tags `muju-lab-checkpoint-1..4` | This session must develop on **`claude/refine-muju-balance-nulzjj`**. Checkpoints = pushed commits titled `checkpoint-N: …` (tags optional, only if push succeeds). |
| 2 | January conversation JSONs at `/Users/ashkie/src/radar/...` as ground truth | **Not present in this remote container.** Drop; design intent is recoverable from SPEC.md (v1.0) vs `docs/v1.1-spec.md` deltas. |
| 3 | Property tests: "≤4 steps/turn, action-type uniqueness" | Stale v1.0 rules. Correct invariants: **≤6 actions/turn** (`MAX_ACTIONS_PER_TURN`), repeated actions allowed, no summoning sickness, full-heal-at-own-turn-start, promotion once per placement and never on placement turn. |
| 4 | "Prove the engine faithful to SPEC.md" | **SPEC.md is stale (v1.0)**: 4 actions, +1ATK/+1DEF bonus, two separate triangles, summoning sickness, old stats, `player`/`ai` IDs. Audit target = produce an updated **SPEC.md rewritten to current rules** (per CLAUDE.md: design changes require doc updates), with traceability against the *updated* spec. The v1.0→v1.1→code delta table replaces the January-transcript delta table. |
| 5 | AI treated purely as measurement instrument | Add **Phase 4a: AI player improvement** (the stated goal explicitly includes the AI implementation). See below. |
| 6 | Results JSONL committed wholesale | Container is **ephemeral** — anything not pushed is lost. Commit experiment configs, summary CSVs + Wilson CIs, and sampled replays; compress or cap raw JSONL (gitignore above ~5 MB per experiment, keep summaries). Push at every checkpoint. |
| 7 | (not known) | **Known AI legality bugs found in exploration** — seed the audit's divergence list, fix in Phase 4a (they corrupt both AI strength and measurement): `src/ai/moves.ts:generateQueueActions` and `src/ai/simulate.ts:applyQueueUnit` ignore `meetsTechRequirement` (real reducer enforces it, `useGameState.ts:230,348`) so the AI plans illegal tech-skipping builds; `building.ts:getAvailableBuildOptions` same; `simulate.ts:applyPlaceUnit` skips `isValidSpawnPosition`; `simulate.ts:applyEndActionPhase` doesn't mirror `startQueuePhase` auto-end; `useAI.ts` `maxIterations = 20` can truncate long turns (6 actions + placements + queue). |

## Balance hypotheses to test (seeded from static analysis — to validate, not pre-commit)

- **Hi (fire_1) is a stat outlier:** 6 stat-points per 1 cost, build time 1, +1 ATK vs the tanks meant to stop it (one-shots Inyan DEF 3, Muju DEF 2). Candidate patches if the band in ruling #2 is violated: cost 1→2, tank DEF +1, or rush-side build-time friction.
- **Lightning line is a trap:** DEF 1 at every tier + full-heal rule means the cost-10 Dhorubakali dies to any single attack from anything. Speed-as-defense only works if kiting is real. Candidates: DEF 1/1/2/2 or cost cuts.
- **One-turn-kill walls:** full heal at owner's turn start means kills must complete within one 6-action turn; Wakanwicasa (DEF 8) needs 8 combined ATK adjacent simultaneously. Tanks may be binary walls; chip strategies don't exist. Any fix must respect ruling #3.
- **No retaliation:** attacking is risk-free except positioning — measure whether initiative dominates.
- **Action-free placement:** economy converts to board presence at zero action cost, favoring wide cheap armies; the global 6-action cap is the only tall-favoring force vs steep tier stat-efficiency decline (T1 ≈ 3–6 stat-pts/cost, T4 ≈ 0.7–1.4). Measure tier usage in self-play.
- **Mining economics:** actions are the real currency — Plant_1 yields 3/action vs Fire_1's 1/action; verify expand economy actually outpaces rush when left alone.

## Phases (revised; one autonomous run on `claude/refine-muju-balance-nulzjj`)

```
P1 Audit ──► P2 Harness+Bots ──► P3 Calibrate+Experiments ──► P4 Decide+Patch ──► P4a AI improve ──► P5 Report
   │              │                      │                        │                  │
   SPEC.md      lab/harness         E1–E7 matrices           stat patches      bug fixes, counter-rush,
   rewrite      bot ladder          rush-band check          graph ruling      weight tuning ──► E8 rerun
   fixtures     replay viewer       (ruling #2)              (ruling #1)       (validates BOTH)
```

**P1 — Audit + canon.** Read all ground truth (SPEC.md, v1.1-spec.md, AI_ENGINE_*.md, src/game, tests). Rewrite `muju/SPEC.md` to current rules; produce `lab/docs/SPEC_AUDIT.md` with clause→code/test traceability against the *updated* spec, the v1.0→v1.1→code delta table, and the divergence list pre-seeded with the table-7 bugs. Add corrected property tests over seeded random playouts (resource conservation, occupancy, ≤6 actions, heal-reset semantics, depth monotonicity, determinism, serialize round-trip). Adversarial fixtures: mixed-element combined attacks, spawn-rectangle edges, dry-cell mining, promotion timing, queued-units-don't-prevent-loss (`victory.ts` ruling). Fix code only where the updated spec is unambiguous; else log a ruling in `muju/JUDGMENT_LOG.md`. **Checkpoint-1 commit+push.**

**P2 — Harness + bot ladder.** `muju/lab/harness/`: headless match runner importing `src/game` + `src/ai` directly (engine is React-free; run via `npx tsx`, add as devDep). Per-turn cheap invariants (abort on violation); JSONL stamped with engine git hash. Bot API over the existing observation layer (hidden stockpile/queue respected, type-enforced). Ladder: L0 Random, L1 Greedy, L2 ArchetypeBots (rush/expand/balanced — rush bot = mass Fire_1, per ruling #2), L3 `AIEngineV2` presets; probe bots: Turtle, Tier1Spam, mining-Denial, **AntiRush** (scripted best-known defense — needed to evaluate ruling #2's band). Seeded tie-breaks. Bench games/sec per tier; MCTS for confirmation subsets only. Turn cap + repetition adjudication by material+stockpile, rates always reported. Single-file `lab/tools/replay-viewer.html` early. **Checkpoint-2.**

**P3 — Calibration + experiments.** Gates: each tier ≥70% vs tier below; AIEngineV2 ≥95% vs Random, ≥65% vs Greedy; +1-global-ATK handicap must shift win rate ≥10 pts (else report instrument insensitivity honestly and stop short of fine-grained claims). Experiments as configs in `lab/experiments/*.json`, mass runs as background bash:
- E1 length/perf; E2 ladder gates; E3 first-player advantage (mirrors).
- E4 6×6 mono-element matrix (fixed trio of that element's T1s, queue restricted — logged harness ruling), both seat orders, sample sizes from bench + power math in `lab/docs/EXPERIMENTS.md` (~780/cell for 55-vs-50 detection; scale honestly to measured throughput).
- E5 3×3 archetype matrix; **E6 degenerate probes incl. the rush-band measurement (ruling #2) — this is the headline number**.
- E7 advantage-graph comparison, **restricted by ruling #1**: incumbent vs C0 dual-triangle vs alternatives preserving rush→expand (graph made injectable behind a config in `elements.ts` with tests).
- Per-game log: config, hash, bots+seeds, seat order, winner, win type, turns, first blood, resources, material curve, promotions, tier usage (tall-vs-wide hypothesis). 1% replay sample + all anomalies. Cross-bot sign-consistency between Greedy and MCTS matrices downgrades confidence. **Checkpoint-3.**

**P4 — Decide + patch (catalog & rules).** Rule on the graph (ruling #1 prior). Propose stat patches tied to findings (hypotheses above are the candidate list); any rule patch must pass the board-game-ability test (ruling #3) and gets a JUDGMENT_LOG entry. Apply patches behind the stat table / config.

**P4a — AI player improvement.** (a) Fix table-7 legality bugs (tech-gated queue generation; spawn-validated placement in sim; raise/loop-fix `maxIterations`). (b) Counter-rush competence (v1.1 §5.2): rush-detection signal (enemy cheap-attacker count × proximity) feeding queue-phase choices and eval; defensive templates in `src/ai/planner/templates.ts` (body-block spawn rows, focus-fire ordering, retreat-from-kill-range) alongside the two existing kill templates. (c) Tune `DEFAULT_WEIGHTS`/presets via harness; answer Q4–Q7, Q9–Q10 empirically (judgment-logged). Acceptance: hard AI beats every probe bot incl. Tier1Spam; ladder gates still pass; rush band (ruling #2) holds vs hard AI.

**P5 — Validate + report.** E8: rerun affected cells on patched table + improved AI — each patch fixes what it claims, regresses nothing; rush band verified end-state. Write `muju/docs/BALANCE_REPORT.md` in forge voice (exec summary, matchup matrices, first-player advantage, degenerate results, graph decision + evidence, validated patches, AI-improvement results, instrument limitations). Update player-facing docs per CLAUDE.md (SPEC.md final pass, `InstructionsModal.tsx` if rules changed, printable `docs/rules-sheet.html`). Final JUDGMENT_LOG pass. **Checkpoint-4, final push.** Open a PR only if Ethan asks.

## Deliverables

`muju/lab/` (harness, bots, experiment configs, summary results, replay viewer), rewritten `muju/SPEC.md`, `lab/docs/SPEC_AUDIT.md` + `EXPERIMENTS.md`, `muju/docs/BALANCE_REPORT.md`, `muju/JUDGMENT_LOG.md`, `docs/rules-sheet.html`, patched catalog/rules/AI with tests — all on `claude/refine-muju-balance-nulzjj`.

## Verification

- All 418 existing tests + new property/fixture suites green (`npm test` in muju) at every checkpoint.
- Instrument gates + handicap sensitivity passed or honestly reported failed (blocking fine-grained claims).
- Headline: E6 rush-band number inside 35–55% vs AntiRush and hard AI **after** patches; rush still beats Turtle/greedy-economy.
- Every report claim traces to an experiment config + seeds, reproducible from the committed files; engine-hash-stamped rows current.
- AI: legality bugs covered by regression tests (AI never generates tech-illegal queue actions); hard AI beats all probe bots.

## Risks

Ephemeral container (push at every checkpoint, summaries over raw logs); MCTS too slow for mass runs (bench-gated tiering, Greedy-level matrices + MCTS confirmation); bots too weak for signal (gates + sensitivity, honest failure mode); rush band and ladder gates conflicting after patches (iterate E8, report tradeoff if irreconcilable); looping games (cap + adjudication, rates reported); judgment drift (structured log, per-phase checkpoints).

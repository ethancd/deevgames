# Judgment Log — Muju Hono Balance Lab

Every autonomous ruling made during the balance lab run is recorded here:
question, options considered, ruling, rationale, blast radius, reversal cost.

Design priors fixed by Ethan (2026-06-09, via plan review — these are inputs,
not autonomous rulings, recorded for traceability):

- **E-1 Element graph prior:** Rush beating Expand elementally is intended
  (SC2 meta; mass Fire_1 = zerg rush). The Double-Thick Triangle is the
  incumbent; alternative graphs considered in E7 must preserve the
  rush→expand edge. Overturning the incumbent requires strong evidence.
- **E-2 Rush acceptance band:** mass-Fire_1 rush must be defendable but not
  inevitable. Operationalized: vs best defensive responder (AntiRush bot and
  hard AI), rush win rate target ≈ 35–55%; >65% = balance failure; <25% =
  over-nerfed. Rush SHOULD beat greedy pure-economy play.
- **E-3 Board-game-ability:** rule patches must keep state trackable by piece
  position / a human head. Within-turn damage (resets at owner's turn start)
  is acceptable; persistent per-unit HP is not.

---

## J-001: Property-test playouts drive the AI action path, not the React reducer

- **Question:** Which action-application path should seeded random playouts
  use — the human reducer (`useGameState.ts`) or the AI path
  (`ai/simulate.applyAction`)?
- **Options:** (a) reducer via React testing harness; (b) `applyAction`;
  (c) both.
- **Ruling:** (b), with queue actions pre-filtered through `canBuildUnit`
  because the raw generator is missing the tech check (divergence D1).
- **Rationale:** `applyAction` is the real path for all AI moves
  (APPLY_AI_ACTION) and the only headless one; the harness (P2) will use it
  too, so invariants tested here guard the lab instrument directly. The
  reducer path is already covered by the existing 418 tests.
- **Blast radius:** test-only. **Reversal cost:** low (swap the apply fn).

## J-002: Known divergences D1–D6 deferred to Phase 4a rather than fixed in P1

- **Question:** Fix the AI legality/info-leak bugs (SPEC_AUDIT D1–D6)
  immediately, or defer?
- **Ruling:** Defer fixes to P4a; document now; property tests filter around
  D1 so they assert *engine* invariants, not generator bugs.
- **Rationale:** Plan sequencing — the measurement instrument (P2/P3 baseline
  matrices) should first measure the game as-shipped; engine-hash stamping
  marks pre/post-fix datasets. Exception: if calibration (P3 gates) shows
  D1-cheating distorts baseline matrices materially, fix D1/D2 first and
  re-stamp.
- **Blast radius:** experiment ordering. **Reversal cost:** low.

## J-003: Harness engine bots get throughput presets via an additive AIEngineV2.setConfig

- **Question:** UI-speed MCTS presets (800–3000 ms per re-plan, ~10+ re-plans
  per turn) make mass runs infeasible (~12 s/game even with caps). How do
  engine bots run at lab throughput?
- **Options:** (a) run experiments only at UI speed with tiny N; (b) fork the
  engine for the lab; (c) add a small additive `setConfig(overrides)` to
  `AIEngineV2` and define `AIv2-*-fast` presets (mctsTimeLimit 120 ms,
  60 iterations, 10 particles, difficulty shape otherwise preserved).
- **Ruling:** (c). Gameplay code still uses difficulty presets only; the
  shipped presets are unchanged. UI-speed bots remain in the registry for
  confirmation subsets, per the plan ("MCTS for confirmation subsets only").
- **Blast radius:** one additive method on the engine; experiment validity
  (fast presets are weaker than UI presets — results labeled `-fast` and gate
  E2 checks both where feasible). **Reversal cost:** trivial.

## J-004: Capped games adjudicated by material + stockpile + queue value

- **Question:** The plan requires a turn cap with "repetition adjudication by
  material+stockpile". Exact scoring?
- **Ruling:** At `maxTurns` (default 120 rounds) or the ply safety cap, the
  winner is the higher of: Σ on-board unit cost + current resources +
  Σ queued unit cost. Equal → draw. Win type recorded as `adjudication`
  (rates always reported per pairing in summary.csv).
- **Rationale:** cost-weighted material is the only common currency across
  archetypes; including stockpile+queue avoids punishing a player mid-convert.
  No positional component — a positional edge that never converts within 120
  rounds is not an edge this game's win condition recognizes.
- **Blast radius:** capped games only (Random/Turtle mirrors mostly).
  **Reversal cost:** low (rerun affected cells).

## J-005: Scripted-bot legality is enforced by construction; engine-bot legality is observed, not enforced

- **Question:** Should the harness block illegal engine actions (D1/D2)?
- **Ruling:** Default `legality: 'as-shipped'` — engine emissions are checked
  against the legal set, violations *counted* per game, but applied anyway,
  because APPLY_AI_ACTION applies them in the real game. A `strict` mode
  exists for post-fix (P4a) comparison runs. Scripted bots can only choose
  from the rules-filtered legal set (J-001), so probes/ladder cannot cheat.
- **Rationale:** J-002 — baseline matrices must measure the game as-shipped;
  the illegal-action counter is exactly the signal that decides whether
  D1/D2 must be fixed before calibration claims are made.
- **Blast radius:** all engine-bot rows. **Reversal cost:** none (flag flip).

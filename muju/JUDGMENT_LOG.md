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

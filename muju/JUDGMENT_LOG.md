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

## J-006: E4 mono-element bots keep the standard starting trio; only the queue is element-restricted

- **Question:** The plan sketches E4 as "fixed trio of that element's T1s,
  queue restricted — logged harness ruling". Lightning and Shadow T1s have
  Mining 0; a trio of them has literally zero income, so those two rows would
  be lost-by-construction and measure nothing beyond a stat we can read off
  the table.
- **Ruling:** Mono-X bots start with the standard symmetric trio
  (fire_1/water_1/plant_1, same as real games) and restrict only QUEUE_UNIT
  (and PROMOTE_UNIT) to element X. The matrix then measures "element X as a
  build strategy on the real opening", which is the question players face.
- **Blast radius:** E4/E7 interpretation — rows measure element *lines*, not
  element-pure armies. **Reversal cost:** low (bot variant + rerun, ~2 min).

## J-007: Archetype ladder gate interpreted vs Random, not vs Greedy

- **Question:** Plan gate "each tier ≥70% vs tier below" — archetype bots
  (L2) vs Greedy (L1)?
- **Ruling:** Gate G1 requires archetypes ≥70% vs Random; the Greedy cells
  are measured and reported but not gated. Archetypes are *stances* (Expand
  deliberately refuses combat), not uniformly stronger policies; failing
  Expand-vs-Greedy says "aggression beats greed", which is a finding, not an
  instrument failure.
- **Blast radius:** gate bookkeeping only. **Reversal cost:** none.

## J-008: D13 (ID collisions in ai/simulate) fixed immediately, not deferred to P4a

- **Question:** J-002 defers AI-path divergences to P4a so baselines measure
  the game as-shipped. The lab's occupancy invariant caught a new one mid-E3:
  simulate IDs (Date.now() + 3 random chars) collide for same-millisecond
  units, and a by-ID MOVE then relocates BOTH units (seed 1720018195).
  Defer or fix now?
- **Ruling:** Fix immediately (monotonic counter + 5 random chars in
  queue/place IDs). This is the J-002 exception by design: ID collisions are
  random state corruption, not a strategic property of the shipped game —
  leaving them in distorts baselines with noise no player experiences as
  "balance". Scripted experiments are rerun on the fixed engine
  (hash-stamped); the one aborted E3 game is excluded either way.
- **Blast radius:** engine IDs only; no rules change. **Reversal cost:** n/a
  (strictly a correctness fix; regression-tested).

## J-009: Correctness before catalogue tuning (2026-09-07)

User requested AI correctness fixes plus brainstorming, evaluation, adversarial critique and design recommendations. Implement the shared legality/transition repair and search logic fixes; evaluate catalogue prototypes only inside lab processes. Keep current catalogue and element graph intact pending recommendation review and stronger mixed-army validation. D3 is resolved by separating committed from manifested spending, not hiding internal accounting needed for own assets.

The June fixed-Fire-Rush target is not a sufficient release criterion: current probes show many AntiRush successes are capped adjudications, and adaptive pressure behaves differently. Prefer meaningful options and counterplay, distinguish natural finishes from caps, and do not infer all-unit viability from mono-line win rates. Highest-priority tested prototype is Lightning ATK 2/3/3/4; Plant differentiation is next; Shadow remains unresolved. See the dated repair and balance reports under `docs/`. Reversal cost: balance prototypes are process-local and never enter normal gameplay.

## J-010: Implement v1.3 after static and component checks (2026-09-07)

The user explicitly authorized following the recommendations, building a static value solver, and applying balance improvements. Adopt Lightning ATK 2/3/3/4 and Plant mining 3/4/5/5 with T4 speed 2. Preserve all other catalogue values and mechanics. The solver removes the historical Sachita dominance and finds a sole-cheapest declared mission witness for each of 24 units; this is not a universal balance proof. Component tests favor Plant's deeper progression over T2 alone for actual finishes, and 6,400 fresh-seed confirmation games follow the 6,400-game component screen. Keep Shadow unchanged: its mixed mobility/mining role appears when the mission grid includes the required mining-2 threshold. Fix the model's missing threshold instead of tuning the catalogue to it.

Do not install a static power score in the playing AI or claim that a stat has one universal crystal value. Report action thresholds, conditional substitution costs, explicit financing assumptions, capped games and natural wins separately. Earlier references to promotion downtime were mistaken: promotion allows immediate action. See `docs/BALANCE_IMPLEMENTATION-2026-09-07.md` and `lab/solver/README.md`.


## J-011: Remove tier 4; tier 3 is the cap (v1.5)

- **Question:** Keep the six costly ultimate units, retune them, or shorten the ladder?
- **Options:** retain all 24; alter tier-4 economics; remove tier 4 with lower values initially frozen.
- **Ruling:** Remove Gokamoka, Dhorubakali, Hafkafstormur, Karabasan, Cuauhtlimallki and Wakanwicasa. Eighteen remain. Derive promotion terminality and shop rows from the catalogue. Cleave remains capped by tier (1/2/3); all other rules remain.
- **Rationale:** Tier 4 had the weakest stat-per-crystal at cost 10–20/build 2–3; Map D cut fifth-layer work from 100 to 20 crystals; three tiers are easier to learn. DEF 6 Metal III is defensible but falls to two Karanlık at 3 effective damage each. Accept losing Metal IV invasions and Fire IV’s four-kill sweep. The initial cut lost Metal III’s sole-cheapest witness. The user then explicitly approved Tanka Speed 1 → 2 to help it reposition and invade; all other T1–T3 numbers remain. Re-run the paired study and keep the cap-only evidence.
- **Sub-rulings:** Retire the crest, keep the T3 inner rim. Bump save schema to 3 and discard unfinished prior games without migration. ABI 3 adds host-sized catalogue and power buffers. User follow-up names Metal Inyan / Mazask / Tanka, making the unchanged title Muju Hono Tanka a tier-1 / tier-2 / tier-3 sequence.
- **Blast radius:** catalogue, promotion, AI evaluation/WASM, UI/tutorial, persistence, tactical fixtures, lab policies and reports. Historical runs keep their original data; current study reruns paired v1.4 and v1.5 catalogues with Cleave.
- **Reversal cost:** restore six definitions and bump the save schema again; rerun validation and publish a new bundle. Discarded unfinished games cannot be recovered by a code rollback.

## J-012: Tier upkeep, player-chosen, unpaid units removed (v1.6)

- **Date:** 2026-09-08.
- **Decision:** charge own on-board tiers1/2/3 rent0/1/2 from the existing bank before healing and queue advancement; historical tier4 would owe3. No action charge. Queued units first owe rent at their next own turn after placement.
- **Intent:** income must sustain binary DEF walls. Rent applies equally to forward armies and home garrisons; tier1 swarms stay free, constrained by six actions and Cleave.
- **Choice:** affordable all-keep defaults automatic. Shortfalls require a legal affordable keep-set. Per-player optional review permits voluntary release of any unit, including free tier1 units. Losing the last unit is elimination. No attack/Cleave/history side effects.
- **Alternative rejected:** “must pay for every unit you can afford” leaves multiple competing maximal subsets ambiguous and removes the intended voluntary choice.
- **Public spending:** paid upkeep enters both committed and manifested totals; resourcesUpkeep is a subtotal. Release cannot prove poverty because it is voluntary.
- **Lab-only alternative:** steep0/1/3/5 is injectable and resets to shipped after each game. No arbitrary static discount is added; search uses real rent transitions.
- **Evidence/limits:** [paired study](docs/UPKEEP_DRAW-2026-09-08.md). Scripted-policy wins are evidence about those policies, not optimal play.

## J-013: Draw after20 complete quiet plies (v1.6)

- **Date:** 2026-09-08.
- **Decision:** successful mining or an enemy attack kill resets the public clock immediately; its turn completes at0. Every complete quiet player turn adds1. At20, draw after checking home occupation and existing elimination and before upkeep.
- **Non-progress:** chip attacks, movement, buying, placing, promoting, releasing and resigning do not reset. Zero-yield mining remains illegal. Upkeep losses never count as kills.
- **Interpretation:**20 complete quiet turns, not resetting during an action then immediately incrementing a progress turn to1. An explicit phase='victory', winner=null, reason='inactivity' persists and evaluates as0 from either side.
- **Blast radius:** shared transition, observations, AI evaluation, UI/tutorial, schema4, harness telemetry and historical-report pointers.

## J-014: Lightning damage and mining, Tanka extraction (v1.7)

- **Date:** 2026-09-08, explicit user direction after the upkeep release.
- **Decision:** Radi ATK1, Umeme ATK2, Kimubunga MINE0, Tanka MINE4. Preserve every other stat, price, build time and rule, including Tanka Speed2.
- **Scope:** shared catalogue propagates into gameplay, AI, WASM catalogue configuration, shop, previews and tutorial. Update reference exports and communicate exact values to the video process.
- **Evidence:** [balance follow-up](docs/BALANCE_FOLLOWUP-2026-09-08.md). Historical studies remain pinned to their actual catalogues; no old sample is relabeled.


## J-015: Tier-1 units cannot be released during upkeep (v1.8)

- **Date:** 2026-09-08, explicit user correction.
- **Decision:** all owned tier-1 units must appear in every legal upkeep keep-set. They cost zero and cannot be voluntarily released, including when reviewing affordable upkeep.
- **Supersedes:** J-012's permission to release free tier-1 units. T2/T3 voluntary release and elimination of an all-higher-tier army remain legal.
- **Implementation:** shared action legality rejects omitted T1 units; settlement preserves them defensively; upkeep checkboxes are disabled and explain mandatory retention. AI keep-sets already retain free units.
- **Verification:** 669 unit tests, production build, and four mobile/tablet upkeep/draw browser checks pass. Academy episode 5 narration and visuals corrected for video version 2.


## J-016: Ten quiet turns draw immediately at turn end (v1.9)

- **Date:** 2026-09-08, explicit user request after episode 8.
- **Decision:** ten consecutive quiet player turns, resolved at the ending turn before the next home-win check. Supersedes J-013's twenty-turn threshold and home-win precedence.
- **Reason:** simpler timing and faster resolution; the historical upkeep sample had zero of 805 natural wins reaching ten quiet turns. Purposeful maneuvering can still be quiet, so this is a pace choice rather than a universal dead-position claim.
- **Details and evidence:** [ten-turn decision](docs/DRAW_TEN-2026-09-08.md). T1 upkeep retention remains unchanged.

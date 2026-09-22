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


## J-017: Passive end-of-turn mining, reserves 4/8/10 (v2.0)

- **Date:** 2026-09-09, explicit designer direction. The prompt proposed J-015;
  that identifier already records mandatory T1 retention. Preserve history and
  append here instead.
- **Decision:** at the end of your turn, every owned unit takes
  `min(Mining, reserve)` from its current square, unconditionally. No mine
  action, depth, idle test or per-unit dryness. Same 10×10 Unequal routes
  topology and rotation; reserves 0/3/4/5 become 0/4/8/10, total 520.
- **Intent:** the well made extraction a sequence of one-shot draws whose
  amounts were fixed by the map; the mining stat mainly changed action costs.
  Passive income joins combat, rectangles and invasion as a consequence of
  position, giving a familiar move more consequential meanings. Ordinary
  Mining 1/2/4 empties in 4/2/1 turns, shelf Mining 2/3/4 in 4/3/2, and rich
  Mining 3/4/5 in 4/3/2. Experts strip rich cells quickly and must relocate;
  foragers collect while serving another purpose. Mining 0 never pays income.
- **Alternatives rejected by the designer:** worker-or-soldier idle condition
  adds a state test and separates fighting from earning; graded ore with
  action mining retains a separate operational chore; a Mining-3 deep-well
  gate adds a threshold exception; doubled 6/8/10 reserves reduce the intended
  ordinary-ground threshold separation. The latter remains a proposed lab
  comparator, not a gameplay setting.
- **Timing:** income → inactivity counter/draw → next player's home/elimination
  check → upkeep → heal/reset → Place. Positive income resets the clock. Undo
  cannot cross income settlement. Tiers, costs, Cleave, six actions, upkeep,
  home occupation and elimination are unchanged.
- **Evidence/limits:** [implementation report](docs/MINING_SIMPLIFICATION-2026-09-09.md).
  Tests establish the rule and conservation; they do not establish pacing,
  expert net value, comeback rates or first-player fairness. A tier-3 Plant's
  rich-cell gross income 5 minus rent 2 is 3, like a Muju's gross 3 before
  exhaustion; whether tempo and denial justify the expert is unmeasured.
- **Blast radius/reversal:** rules, AI, lab, solver, UI/tutorial, documents and
  save schema 5. Older unfinished games start fresh. Reverting code cannot
  recover saves already discarded. Tested branch, not production deployment.

## J-018: Public tier-1 purchase and visible promotion climb (v2.1)

- **Date:** 2026-09-09, explicit designer direction. The prompt's J-016 is
  occupied by the ten-turn draw ruling; this entry appends without renumbering.
- **Decision:** Place then Act. During Place, buy any affordable number of
  tier-1 units into legal empty spawn squares and promote existing units in
  any order. Pay catalogue costs/cost differences, no actions. Six move/attack
  actions follow. Delete the queue, build times and explicit tech requirement;
  higher tiers arise only from promotion on the board. Banks and income are
  public; delete observation/belief/particle/re-determinization machinery.
- **Haste retained:** placed and promoted units act immediately. This is the
  existing rule under which September evidence was gathered. The Lightning-I
  sprint and summon-and-strike remain legal; Guard, blocked rectangles, action
  costs and Cleave remain available. This is not proof of their balance under
  the new combined economy.
- **No promotion on placement turn:** each promoting unit must have existed
  at Place start and can promote only once per turn. A purchased tier-1 reaches
  tier-2 no earlier than next own turn and tier-3 the turn after that, exposing
  the climb to two full opponent turns. Tier 3 is terminal.
- **Intent:** retire the queue's hidden information, build-time delay,
  persistence and third phase. The bank replaces blocked-spawn persistence;
  the visible promotion climb supplies higher-tier delay and a contestable
  investment. Tier-1 timing is unchanged for build-time-1 lines using last
  turn's income, but build-time-2 Muju/Inyan can arrive earlier.
- **Alternatives rejected by the designer:** end-of-turn placement skips the
  anchor-survival test; start-of-turn summoning sickness changes existing
  haste; build-only without promotion loses grow-in-place and penalizes slow
  lines while retaining tech machinery; promotion on purchase turn collapses
  the intended climb.
- **Evidence/limits:** [implementation report](docs/PLACEMENT_SIMPLIFICATION-2026-09-09.md).
  No opening geometry, catalogue, haste, six-action budget or compensation
  was changed in response to the Sjor-to-E5 concern. Its legality and rectangle
  blocking are tested; whether White's advantage is overwhelming is unmeasured.
- **Blast radius/reversal:** rule state and legality, simulation/planning/MCTS,
  worker protocol 2, WASM ABI 4, public UI, lab and documents. General placement
  remains outside the tactical proof; bounded purchase templates are planning
  candidates. Save schema 5 starts older unfinished games fresh. Tested branch,
  not production deployment.

## J-019: Four actions only; quiet means no kills (v2.6, 2026-09-12)

- **Designer decision:** make four shared actions the sole game version and
  define a quiet player turn as one without an enemy kill by attack.
- **Resolution:** remove the six-action setup option. Only a combat kill resets
  the clock, immediately and through the end of that turn. Income, chip damage,
  movement, purchases, promotions and upkeep releases do not reset it. Ten
  consecutive completed player turns (five full rounds) draw, before the next
  home-occupation, upkeep or healing checks.
- **AI and teaching:** use four actions in turn transitions, previews, reference
  text, beam planning, raid proximity and JavaScript/WASM tactical proofs (ABI 6).
  A five-action rotation is now an impossible rescue in the regression fixtures.
- **Compatibility:** schema-5 saves and online version-2/3 rooms retain their
  boards and seats while upgrading. Deduct already-spent actions from four,
  floored at zero; reset the changed clock to zero. Keep completed results final.
  Discard online undo/replay history from the old rules. New saves use schema 6;
  new rooms use online rules version 4.

## J-020: Expansion economy and Plant Mining 3/5/8 (v2.8, 2026-09-13)

- **Designer decision:** six home squares per player hold 8; each four-square expansion holds 16 per square; Plant tiers 2 and 3 gain Mining 5 and 8.
- **Resolution:** new maps total 504 crystals. All other reserves, combat stats, prices, upkeep, speed and action rules stay the same. Preserve colors 0–10 and blend 11–16 toward neutral white. Extend the painter and reserve stacks through 16.
- **Compatibility:** existing boards and painter drafts retain their reserves; the current Plant catalogue applies when games resume. No save/room reset.
- **Intent and limits:** encourage earlier expansion and meaningful economic promotions. These incentives are not a playtested claim about win rates or turtling. See `docs/EXPANSION_ECONOMY-2026-09-13.md`.
- **Release authorization:** the designer reviewed the color mockup and instructed, “Pull the trigger on the map and plant changes!”


## 2026-09-18 — Metal v2.9

User-requested Metal ATK/DEF/SPD/MINE: 1/3/0/3, 1/4/1/4, 2/5/2/5; rename Inyan to Yan. Preserve stable IDs, costs, other elements and historical evidence. Speed 0 permits adjacent attacks, mining and promotion, but no movement. Existing saves/rooms adopt the current catalogue; replay snapshots and labels remain historical. See docs/changes/2026-09-18-metal-yan.md for verification and release scope.


## J-021: The quiet-turn draw clock is twenty plies (v3.0, rules revision `muju-phasing-2`, 2026-09-19)

- **Date:** 2026-09-19. Owner decision (Ethan), recorded as amendment A4 of
  `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`. This is a change to the
  game, not to any gate, threshold or acceptance condition.
- **Decision:** the inactivity limit goes from **10 quiet plies to 20** — ten
  hand-offs per player. The in-game warning keeps its three-ply margin, so the
  public counter turns amber at **17** instead of 7. Supersedes J-016's ten-turn
  threshold; J-016's *timing* (resolved at the ending turn, before the next
  home-win check) and J-019's definition of a quiet turn both stand.
- **Rationale:** amendment A3 recorded that under Phasing the clock is reset only
  by an attack that removes a unit, so two players who both decline the first
  trade **drew in five turns each** regardless of material or territory, and the
  scripted-bot reference drew **49.5%** of its games. Five turns each is not
  enough game. Phasing's delayed summons in particular need time to arrive and
  matter before the board is adjudicated dead; at ten plies a committed summon
  could be paid for, arrive, and never influence a result. Twenty plies gives the
  variant's own timing room to express itself without making a genuinely dead
  position drag.
- **Deliberately NOT changed: what counts as progress.** Only an attack that
  removes a unit resets the clock. Buying, summoning, promoting, mining new
  ground, chip damage, income, upkeep releases and contesting a home rectangle
  still do not reset it. Making mining or summoning count as progress was
  considered and rejected here: it is a different and larger design question
  about what the game is about, and mixing it into a pacing fix would have made
  the A3 evidence uninterpretable. The timing of the check, the reasons a game
  can end, and the draw's precedence over the home-win check are also unchanged.
- **Implementation:** one shared constant, `INACTIVITY_LIMIT` in
  `src/game/inactivity.ts`, serves Standard and Phasing. It was deliberately not
  forked per ruleset: Standard is being retired, and a second constant would be
  dead weight the next reader has to reason about. `resolveInactivityDraw` gained
  an optional `limit` defaulting to the live constant, plus an exported
  `LEGACY_INACTIVITY_LIMIT = 10`, so a replay of an archived `muju-phasing-1`
  game can pin the limit its record was made under without editing the archive.
- **Blast radius:** rules revision `muju-phasing-1` → `muju-phasing-2`. Every
  identity hash carried by a ladder row, suite measurement or Gate 1 row changes,
  so evidence cannot be pooled across the two revisions. Void until redone:
  the 840-game scripted-bot reference and the purchase/inactivity bands frozen
  from it, every Gate 1 game so far, hard-engine replica parity evidence, and the
  M5 v1 suite measurement. The opening books are unaffected — by their recorded
  stop rule no opening carries a clock value the two limits treat differently.
  Academy lesson R09, "The Ten Quiet Turns", now states the wrong number and
  needs re-narration in a future release.
- **Compatibility:** local save schema 7 → **8**. A save written under schema 5–7
  is adjudicated once under the limit it was recorded with, so a position already
  at 10 or more quiet plies still loads as the draw `muju-phasing-1` would have
  given it; a position still playing resumes with its clock restarted at 0, because
  a stored count no longer means what it meant when it was written. The revision is
  stamped in so that restart happens at most once, and a finished game is never
  revived. Completed results stay final.
- **Reversal cost:** low in code (one constant), high in evidence — reverting
  would void `muju-phasing-2` measurements the same way this change voids
  `muju-phasing-1` ones.


## J-022: Phasing is the sole ruleset; Standard is retired (SPEC v3.1, rules revision unchanged at `muju-phasing-2`, 2026-09-21)

- **Date:** 2026-09-21. **Owner instruction (Ethan), and that instruction is the
  authority for this entry:** make Phasing the only deployed ruleset — retire
  Standard, never display it — make the AI engine good and solid, and finish the
  repo's next-session list. Recorded in parallel as amendment **A6** of
  `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`, which carries the
  gate-order half of the same instruction.
- **Decision:** Phasing is the only rule set Muju offers. Standard cannot be
  chosen in the browser, hosted online, created over HTTP or MCP, resumed from a
  local save, or named as an option in any current-authority document. `SPEC.md`
  v3.1 states the Phasing turn normatively; `docs/PHASING-2026-09-16.md` is
  superseded and kept as the dated record of the variant era. The ruleset field,
  `isPhasing`, `rulesetLabel` and the badge survive in code only to render
  retired records.
- **Blast radius — deliberately NO rules revision advance.** The rules revision
  remains **`muju-phasing-2`**. No rule text changed: v3.1 deletes an option and
  folds an already-shipped variant description into the normative body. Nothing
  is voided. In particular the 2026-09-20 Hard-engine repair measurements
  (`docs/hard-ai/phasing/repair-2026-09-20/`, 53–0–11 on held-out openings)
  remain valid evidence about the engine that ships. Two concrete reasons a bump
  would have been wrong as well as unnecessary:
  1. `server/rooms.ts` opens a room only when its stored `rulesVersion` is on a
     hard allow-list. A new string would 409 the four `muju-phasing-2` rooms that
     are the only openable rooms in production — retiring Standard would have
     retired the surviving games too.
  2. `src/ai/hard/config.ts` pins `muju-phasing-2` as the lab identity carried by
     every ladder row, suite measurement and weight artefact. Advancing it would
     unpool the repair evidence from the code that produced it, for a change that
     alters no rule.
  This is a deliberate deviation from the `server-runtime` node of
  `content-dag.json`, whose retire-a-rule-set rule reads "issue a new
  rulesVersion". That rule exists to stop a stored game being reinterpreted, and
  nothing here reinterprets a stored game: the retired rows keep returning
  `RULES_CHANGED` and the production database is neither reset nor rewritten, so
  the rest of that node's requirement is met as written. J-021's standard also
  stands — a revision advance means evidence cannot be pooled, and that is
  exactly the signal this change must not send.
- **Rationale:** two rule sets cost more than they earned. Every current-authority
  surface had to describe both (31 of them did, several wrongly — `MCP_TOOL_TAPS.md`
  told agents to omit `END_PLACE_PHASE`, which hangs an agent's own turn), the
  browser AI was gated behind a `?phasingAi=1` preview flag so the shipped engine
  never met a player, and the strength lab had to keep a Standard control alive
  beside the Phasing one. Phasing is the ruleset the owner wants played; the
  variant framing was the last thing keeping it from being the game.
- **Implementation:** browser — the Phasing preview flag and `RulesetSelect` are
  deleted, `ModeSelect` starts `'phasing'` explicitly, and the worker's Phasing
  refusal is gone. Server — `server/rooms.ts` creates and opens only
  `muju-phasing-2`; `RULES_VERSION` becomes the exported, never-creatable
  `RETIRED_STANDARD_VERSION`; `server/schema.ts`'s create-room schema takes
  `ruleset: z.literal('phasing').default('phasing')` and `muju_rules` takes
  `ruleset: z.literal('phasing').optional()` (`server/mcp.ts:71` — accepted and
  ignored for one release, because the live `SKILL.md` told agents to pass it).
  An explicit `'standard'` is refused on both surfaces, but they refuse
  differently, and a test or a TAP must expect the right one: over **HTTP**,
  `POST /api/muju/rooms {"ruleset":"standard"}` is a **400 `INVALID_REQUEST`**
  with a Zod issue naming `ruleset` and `expected: "phasing"`; over **MCP**,
  `muju_create_room` answers with an **SDK invalid-params tool error naming
  `ruleset`** — not a `RoomError` and not a 400.
  Docs — SPEC v3.1 plus banners on the dated records. `createInitialGameState`'s
  own default stays `'standard'` this pass and every entry point passes
  `'phasing'` explicitly; flipping the 243 defaulted call sites is filed as a
  follow-up, not smuggled into this change.
  Lab — `WEIGHTS_VERSION` stays **2**, but its contract changes with this entry:
  it is bumped **when the vector's schema changes** (the feature count, their
  meaning, or the file shape `loadWeights` accepts), not whenever the numbers
  change. The numbers did change on 2026-09-20 without a bump, when
  `phasing-hand-priors-v1` replaced the five-nonzero M6 bootstrap; that was
  deliberate, because a bump makes `loadWeights` reject every stored vector,
  including the **32 reviewed weight JSONs** under
  `docs/hard-ai/phasing/repair-2026-09-20/weights/` and the book key. (That
  directory holds 33 files, 32 of them `.json`; the 33rd is `make-variants.ts`.
  The "33 JSONs" phrasing is inherited from
  `src/ai/hard/eval/weights.ts:19-23`.) Stated at
  `src/ai/hard/eval/weights.ts:14` and in
  `docs/hard-ai/RELEASE-2026-09-21-phasing.md`.
- **Compatibility:** stated as three decisions, none of which rewrites a stored
  row.
  - *Local saves.* `SCHEMA_VERSION = 9`, readable `[5,6,7,8,9]`; a non-Phasing
    payload is moved byte-for-byte to `elemental-tactics-save-retired` and
    `loadGameState()` returns null (never `clearGameState()`); the current key
    stays `elemental-tactics-save`. A Standard save on a player's device is
    moved, never deleted and never reinterpreted.
  - *Online archive.* Retired rooms stay listed and 409 on open, which is the
    status quo since 2026-09-13; the lobby suppresses the dead `Analyze →` link
    and labels them retired. The local Standard save is reviewable read-only at
    `/muju/analysis?local=1&retired=1` with "Explore from here" disabled — the
    one client-side path that could have reinterpreted a Standard position under
    Phasing rules is closed by that condition.
  - *No in-place migration.* `MIGRATABLE_RULES_VERSIONS` and the `legacy` room
    branch are removed with their importers, so no stored room is reinterpreted.
    Migrating a Standard room into the current revision is the forbidden silent
    reinterpretation; production holds zero such rows in any case.
    `src/game/migrate.ts` itself is left **byte-untouched**:
    `lab/hard-ai/suites/phasing/canonical.ts` hashes every `.ts` under `src/game`
    into the `rulesSourcesSha256` that the committed v2 suite fixtures pin, so
    deleting the file breaks the canonical source binding and with it the suite
    contract test and the Phasing suite measure. `migrateLegacyGame` is therefore
    unreferenced dead code as of this entry; removing it is filed as a separate
    change that carries the fixture re-pin it requires.
- **Reproducibility anchors:** two tags, and `standard-final` does **not** move.
  `standard-final` stays where it is, at commit `71a2c511` (2026-09-18), and is
  pushed as it stands. It is an *annotated* tag, so `2b0f2bc0` is its tag-object
  id, not a commit; the commit it names is `71a2c511`, the last one where the
  Hard replica, the Standard pins and `docs/hard-ai/RELEASE-2026-09-18.md` are
  valid for Standard rules — the replica itself became Phasing-only at
  `142f0904` (2026-09-19). Re-pointing the tag past that commit would silently
  invalidate the evidence it exists to anchor, so it is left alone. A **new**
  tag `dual-ruleset-final` is created at the **first parent of this cutover's
  merge commit on `master`** — the last commit that supported both rule sets,
  i.e. the tree to check out to build and run Standard, which is what
  `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` §Fixed definitions asks
  for — and pushed. `standard-final` anchors the Standard-era strength records;
  `dual-ruleset-final` anchors the last dual-ruleset tree. Every Standard-era
  strength record, including `docs/hard-ai/RELEASE-2026-09-18.md`, is history
  with respect to current play.
- **Reversal cost:** low. Revert the cutover merge and Standard is offered again;
  saves parked under the retired key survive untouched and become resumable
  again, because they were never rewritten. The rules revision does not move in
  either direction, so no measurement has to be redone on the way out.

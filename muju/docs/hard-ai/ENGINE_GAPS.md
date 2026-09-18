# Engine gaps: what the shipped AI computes versus what the strategic model requires

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai` (HEAD `44c41c4`, v2.8 snapshot).
Companion to `docs/hard-ai/STRATEGIC_UNDERSTANDING.md` (SU). Sources: the six reader maps under
`docs/hard-ai/understand/` — `current-ai.md` (CA), `engine-techniques.md` (ET), `rules-engine.md` (RE),
`strategy-docs.md` (SD), `game-records.md` (GR), `lab-harness.md` (LH) — and the napkin (NK). Paths relative to `muju/`.

Labels: **[code]** verified in source · **[measured]** run in this worktree by a reader (CA/ET, Node v24.11.1,
Apple M2 Max) · **[game]** a recorded real game · **[sim]** scripted/census · **[doc]** repo document ·
**[inference]** my judgement.

---

## 0. What the shipped engine actually is

`AIEngineV2.findBestAction` (`src/ai/engine-v2.ts:57-189`) **[code]** runs, in order: upkeep keep-set branch →
bounded placement templates (`planner/placement.ts:14-59`) → immediate-elimination scan → home-rescue prover →
per-enemy combination-kill solver (≤ 3,000 DFS nodes each) → raid candidates with a proved defender reply →
a one-turn beam (`planner/beam.ts`) capped to 20 plans → a home-safety pass → MCTS (`search/mcts.ts`) → deadline
fallbacks. The UI (`src/hooks/useAI.ts:49-64`) calls it once per **action**, executes `plan.actions[0]`, and
re-searches.

The defining measurement (CA §0) **[measured]**: **MCTS completes 0 iterations in 138 of 140 decisions** of a
Medium self-play game (1 in the other 2); 0 at `fixedWork` 1,200 and 4,000; 1 at 20,000 (1.45 s); 5 at 100,000
(7.6 s). Root cause: the `until` / `maxCandidates` fences at `engine-v2.ts:126-127` apply only when
`sim === observed`, so the first rollout's beam call (`mcts.ts:83-90`) drains the whole `SearchBudget`; root
widening `floor((visits+1)^0.5)` needs ≥ 3 visits to open a second child. **In practice the engine is: tactical
overrides → ≤ 20 bounded candidates → a static one-ply ranking by `scorePartialPlan + strategicValue`**
(`planner/scoring.ts:28-34`, `planner/strategies.ts:11-38`). Easy/Medium/Hard chose the identical move in the
opening probe **[measured]**. The quiescence sharpener and the two tactical templates are implemented, tested and
unreachable in production (`templates: false` at `engine-v2.ts:125`; `sharpener.ts` is called only from the MCTS
leaf).

What is genuinely good and must be kept (CA §7): the canonical transition `src/ai/simulate.ts:25` with
reject-returns-identity and deterministic purchase ids; the WASM/JS target-removal prover (ABI 6, 18/18 rescue
fixtures in 14.8 ms total vs 12/18 in 37.8 s for the archived pre-WASM engine, witnesses re-validated through
`isLegalAction`) **[measured, code]**; `SearchBudget` fixed-work determinism; the worker protocol; `useAI`'s
commit-acknowledgement loop.

Evaluation: fourteen symmetric-difference features with `DEFAULT_WEIGHTS` (`src/ai/types.ts:73-88`) **[code]**:
unitValue 1.0 · resourceAdvantage 0.5 · territoryControl 0.3 · miningPotential 0.2 · threatLevel 0.4 · mobility 0.3 ·
centerControl 0.2 · unitHealth 0.1 · killThreatsReceived −2.0 · combinedAttackPotential 0.8 · spawnDenialPressure
−1.5 · spawnInfiltration 1.0 · stepEfficiency 0.2 · techTreeProgress 0.4; `VICTORY_SCORE = 100000`. Cost 71.9 µs
per call (13,904/s), 58 % of it six `getAllSpawnPositions` calls **[measured]**.

---

## 1. The gaps, prioritized

Impact is my estimate of strength effect against the current Hard preset, assuming the gap is closed on top of a
search that actually runs (gaps 1 and 13 are preconditions). "Would have prevented" cites the recorded game or
lesson in SU §6.2's failure table.

### G1 — No adversarial search: the opponent's reply is never modelled except at the home corner

**Gap.** Every candidate turn is scored by a static evaluation of the position *immediately after our own turn*
(`scoring.ts:26`) **[code]**. The opponent's reply is searched in exactly three places: our raider on their
corner (`engine-v2.ts:117`), a candidate ending on their corner (`:147`), an enemy on our corner (`:91`). MCTS,
which was meant to supply the adversarial layer, does not run (§0). There is no iterative deepening above the
kernel, no transposition table anywhere in `src/ai` (CA W10).

**Evidence.** F2, F3, F7, F10 (a unit left where the reply kills it) and F13 (a kill that needed the reply to be
seen as bad-for-them) are all one-reply-deep failures **[game]**. The archived game's decisive economic
decisions (Black's tier-3 climb vs White's banking) are 3–5 rounds deep **[game]**. The alternate-map supplement:
the production search at the lab fast preset lost every game to a scripted Rush (0/2/2, 0/4/0) (LH §2) **[sim]**.

**Technique.** ET §4.1 iterative-deepening PVS over macro-turns, negamax at the *turn* level (never sign-flip
inside a turn), mate scores by ply; §4.3 macro TT on `Kpos`; §4.4 move ordering (TT turn, kill-value-per-action,
home entry/rescue first, spawn-denial high, killers by turn signature, history for buys); §4.5 quiescence over
*tactical turns* with a depth cap and no income inside quiescence; §4.7 LMR on rank > 6, never on force-injected
turns; §4.8 home-threat extension. Explicitly **not** classical null-move (§4.6: income, upkeep and the draw
clock break the no-zugzwang assumption) — use the quiet-turn substitute. Budget model (§4.0): with a bitboard
kernel, K≈24 candidates, ~20,000 interior macro-nodes in 3 s → 5–7 macro-plies.

**Impact: HIGH** (ET step 7 estimates +200–350; the largest single jump). Reasoning: the game is deterministic,
public and sharply tactical (one kill swings 3–17 crystals; Cleave takes three units in a turn), so a verified
minimax with a horizon-safe leaf dominates a heuristic one-ply rank on every recorded loss class.

### G2 — Threat detection is adjacency-now and purchase-blind

**Gap.** `threatLevel`, `killThreatsReceived`, `combinedAttackPotential` (`src/ai/evaluation.ts:162-266`) use
`getValidAttacks` / `getAttackersFor` on the *current* board: enemies already adjacent, no approach cost, no
next-turn reach, no purchases, no promotions **[code]**. The move generator emits only one-action moves
(`moves.ts:15-29` → `getValidMoves`, `movement.ts:29-32`), so `mobility` reports a speed-1 unit as nearly
immobile although its kill radius is 4 (CA W8). The engine models its *own* summon-and-strike
(`placement.ts:41-51`, fire_1 only) but never the opponent's (CA W3).

**Evidence.** NK:10 — a freshly bought Radi (kill radius 10) killed a Hi on turn 2 **[game]**. NK:11 — a speed-1
Straumr killed a Hi four squares away **[game]**. Archived game Black turn 3 — `BUY fire_1@I6`, walk 6, kill the
H2 Muju, retreat **[game]**. Guide mistakes #3 and #5 (Göls on two-action squares; Kagari in Hi range) **[game]**.
`MCP_TOOL_TAPS.md`: both decisive 2026-09-12 blunders were `proven_possible` kills the analysis tool would have
reported **[doc]**. SU §2.3/§2.5.

**Technique.** ET §5.8 threat maps: `strike[side] = ∪ dilate(reach(u, 3 actions), 1)` and
`strikeIfBought[side]` seeded from every legal enemy spawn square with each affordable tier-1's speed
(Radi radius 10, Hi/Göl 7, Sjor 4); §7.2 strike areas per macro node; the approach classification of SU §2.3
(`server/analysis/tactics.ts:272-291 approachTable` already computes it); promotion-aware attack values
(SD X6). Hanging-unit term = `myOcc ∧ enemyStrike` weighted by value and by whether `minActionsToKill` is
affordable. Replace scalar `mobility` with `|myStrike ∧ enemyOcc|` and `|enemyStrike ∧ myOcc|` (ET §5.2).

**Impact: HIGH.** Reasoning: three of four recorded losses and two of the winner's five admitted mistakes are
this exact blindness; the strategy guide calls approach classification "the decisive habit of this game"; with
bitboards the term costs ~100 ns.

### G3 — Kill combinations and pre-adjacency are computed only for the home corner

**Gap.** The `power[hits][actions]` DP with per-attacker cost `ceil(max(0,d−1)/speed)+1` exists at
`src/game/homeCheckmate.ts:27-49` (corner only, Manhattan distances, 2-hit cap) and as `lab/solver/model.ts:60-84
killFrontier` (catalogue-level, single shared distance, **`ACTIONS = 6` stale**) **[code]**. Nothing in the
evaluator or generator asks "which enemy units can I kill this turn, for how many actions, and which of mine die
next turn" for a general target. `combinedAttackPotential` sums only already-adjacent attackers. The per-enemy
solver sweep (`engine-v2.ts:97-107`) searches existing units only (no purchases: `kernel.ts:75`, `tactics/home.ts:26`).

**Evidence.** NK:13 — "one AP short of killing the enemy Aeg four turns running" **[game]**. F13 — the declined
Sachita promotion kill (promote 0 AP → end place → 3 moves → attack, all legal, verified by GR §2.3) **[game,
code]**. The four-actions probe: three spaced Mujus need six actions, only two fall at four (LH §4.1) **[sim]**.

**Technique.** ET §3.6 / §7.5: promote `enoughPossibleDamage` into a per-target `minActionsToKill(target) →
{actions, attackerSet}` with true BFS distances, ≤ 4 lanes (2 on a corner), computed for all enemy units at each
macro node, plus the symmetric `minActionsAgainstMe`; include affordable purchases (start adjacent at cost 1, as
`server/analysis/tactics.ts:41-69 damageUpperBound` already does) and affordable promotions. Use it as the
MVV-LVA analogue (`cost / actionsToKill`), the quiescence trigger, the hanging-piece term and the generator's
forced-injection list. Fix or bypass `ACTIONS = 6` before reusing `killFrontier` (LH §3.3, ET §12.7).

**Impact: HIGH** (ET step 5 estimates +80–150 together with the within-turn search). Reasoning: this is
simultaneously the move-orderer, the tactical eval and the fix for the most common recorded human-level mistake;
the DP is already written twice.

### G4 — The economic model is a one-turn snapshot with no depletion, relocation or runway

**Gap.** `miningPotential` → `projectedIncome` = `Σ min(Mining, reserve)` for *this turn* (`evaluation.ts:155-157`,
`mining.ts:12-15`) **[code]** — exact now, blind to the fact that a Muju empties a 4 in 2 turns, an 8 in 3, a 16
in 6, and a Sachakuna empties a 16 in 2 (SU §1.2). `placementPlans` sees the reserve for square choice only
(`placement.ts:32`) and scores `take×10 ± dist`, so a 4-stack and a 16-stack differ by 0 for a Muju (both take 3
this turn) **[code]**. `getReachableResources` (`mining.ts:41-43`) returns the whole board's stock and is never
called from `src/ai` (CA §2). No term knows the crystals *left under* each miner, the turns to depletion, or the
AP cost of relocating.

**Evidence.** NK:11 — Mujus bought onto half-mined home cells; income ~1 by turn 6 **[game]**. Guide mistake #4 —
four plants bought onto 4-stacks **[game]**. The archived income cliff: combined 38 → 9 between turns 9 and 13;
the last five turns were decided by 3–4 one-square relocations per turn; 51/64 central crystals never mined
(GR §4.4) **[game]**. `ANALYSIS_TOOLS_PROMPT` problem #1: "income fell from 16 to 0 in three turns with no
warning" **[doc]**. Under v2.8 the effect is sharper: home squares are 8 (not 10) and a Sachakuna drains a 16 in
two turns (SU §1.2).

**Technique.** ET §5.5 discounted income DP with greedy relocation and contested cells (H = 6, γ = 0.9,
≈ 2–5 µs, so staged — §5.11); §5.4 dynamic per-(unit, square) `PST_mine` from *live* reserves (worked values:
on a 16, Hi 6.46 → Sachakuna 13.68; on a 4 every miner ≈ 3.1–3.6); SD features E2/E3/E5/E6 (crystals under
miners, sustained income over H, relocation debt, lifetime yield ≥ cost). `server/analysis/economy.ts
economyForecast` / `minerDetail` are reusable primitives but stay-in-place (GR §6.7).

**Impact: HIGH.** Reasoning: both essays name this the decisive axis of the only game played to a conclusion;
it is invisible to a one-ply engine and to a deep search with a snapshot leaf alike, because the cliff is
4–6 plies out.

### G5 — Upkeep is absent from the evaluation and tier climbing is rewarded unconditionally

**Gap.** `grep upkeep src/ai` finds only the upkeep-*phase* branch, `moves.ts:62`, `simulate.ts:46`, the solvers'
guards and `evaluation.ts:411` inside `shouldResign` (disabled unless `victoryRule === 'elimination'`) **[code]**.
`unitValue` uses raw cost (a plant_3 scores +17), `techTreeProgress` adds +0.4 per tier climbed, and nothing
charges the 1/2-per-turn rent or the forced-release cliff (CA W4). When rent finally bites, the keep-set is chosen
by a static one-ply rank (`engine-v2.ts:61-81`).

**Evidence.** Archived Black: 54 upkeep on 175 gross, 43 upkeep vs 41 harvest over turns 10–17, resignation at
4 crystals / 2 income / 5 upkeep (GR §2.3) **[game]**. NK:13 — units released to upkeep on turn 13 **[game]**.
Depth-economy: the production Medium AI's losses included "the AI's own units being released to upkeep"
(LH §4.5) **[sim]**. Net income per unit: Kagari −1, Umeme −1, Kimubunga −2 per turn (SU §1.5) **[code]**.

**Technique.** ET §5.7 runway: `bank + Σγ^t income_t − Σγ^t upkeep_t` with a hard cliff when
`bank + nextIncome < upkeepDue`; §5.1 material values discounted by the present value of rent (a T3 held
forever ≈ 20 crystals of rent); §3.4 mission-based promotion candidates (kill-enablement, survival threshold,
income, reach, anchor) with the rent-next-turn rule; SD E4 (`turnsToInsolvency`). Condition `techTreeProgress`
on runway or delete it.

**Impact: HIGH.** Reasoning: the single conclusive real game was decided by this term; the current sign is
wrong (climbing is rewarded, rent is free).

### G6 — Spawn geometry is a square count: no zero-spawn cliff, no anchor fragility, no denial pricing

**Gap.** `territoryControl = |getAllSpawnPositions| × 0.3`; `spawnDenialPressure = −1.5` per enemy body inside
our spawn set; `spawnInfiltration = +1.0` per our body inside theirs, with no corner weighting
(`evaluation.ts:147-150, 268-294`) **[code]**. A 27-square rectangle held by a DEF-1 Hi with blocking set 1 scores
the same as a 24-square one that cannot be cut; zero spawn squares with 40 crystals banked is a −0.3 × n dip,
not a catastrophe; an enemy on the corner (all purchases voided) is priced as one body (CA W7). Placement's
sign-flip heuristic (`placement.ts:34`, miners toward home, non-miners to the far edge) is a guess (CA §7.10).

**Evidence.** NK:9 — corner sealed, no purchases for four of ten turns **[game]**; census: corner-sealing lines
−8.53 with 0 spawn squares, best lines 21–27 (LH §4.2) **[sim]**. NK:11 — far Aegirinn anchor blocked by a
3-crystal Hi **[game]**. NK:24 — a Tanka walked into B2 to block every rectangle **[game]**. Archived D9 pivot:
spawn 12 → 30, four Mujus in one Place phase, income 14 → 25 (GR §2.3) **[game]**. Guide mistake #2 — moving the
only anchor left a pocket unspawnable **[game]**.

**Technique.** ET §5.6 / §7.4: `RECT[player][anchorSq]` bitboard masks (one AND per anchor; also removes 58 % of
evaluation cost); terms: spawn area weighted by reserve (SD T2), **zero-spawn penalty when bank ≥ 3**, anchor
depth, anchor fragility (`minActionsToKill(anchor)` for the opponent + "can an enemy step into the rectangle in
≤ 4 actions, buying if needed"), infiltration weighted by how many anchors it voids (corner = all), bank-conversion
`min(bank, 5 × spawnArea)`; `server/analysis/geometry.ts:25-50 blockingSet` (exact min set cover) for the
articulation test (F11) and the blocking-set-≥ 2 invariant.

**Impact: HIGH.** Reasoning: four of the recorded losses and the one recorded pivot are rectangle geometry;
"whoever owns a forward anchor owns the board" is the corpus's most repeated lesson; with bitboards the whole
block costs ~100 ns.

### G7 — Place-phase candidate generation is a hand-written template, not a knapsack

**Gap.** `placementPlans` (`placement.ts:14-59`) emits the top **2** squares per affordable definition, every
legal promotion singly, a fire_1-only summon-and-strike per enemy (first 8 enemies), and nearest water_1/metal_1
blockers **[code]**. In the beam, `incomeMovePriority` gives ATTACK 100 and every purchase, promotion and
`END_PLACE_PHASE` **0**, so a 192-buy node is explored in raw generation order and the beam `break`s mid-list when
the budget runs out (CA W11) **[code, measured]**. `useAI` hardcodes 4 decisions for the whole Place phase, so a
six-purchase turn gets 1000 → 750 → 562 → 421 ms per buy at Medium (CA W15) **[measured]**. No plan evaluates a
multi-unit purchase set against the whole bank, spawn squares and lifetime yields together.

**Evidence.** The turn-9 four-Muju burst (the highest-value turn of the archived game) is a whole-bank knapsack
**[game]**; F4/F12 (wrong squares), F1 (self-block), the 6–8-crystal liquidity floor (SD P3) are all
purchase-set properties. Purchase multisets: 38 at 10 crystals, 402 at 20, 2,117 at 30, 7,713 at 40 (ET §3.3)
**[measured]** — the raw product is unsearchable, so the generator's *recall* is what matters.

**Technique.** ET §3.3 dominance-pruned multiset enumeration (Muju dominates Inyan on live squares; Sjor
dominates Göl on live squares; Radi only when ≥ 3 reach matters) capped at `min(⌊C/3⌋, freeSquares, 4)` bodies,
then scored square assignment (`w_mine·lifetimeYield + w_safe·(∉ enemy strike) + w_block + w_strike −
w_anchor·shrinksOwnRectangle`, hard penalty for `|spawn(next)| = 0`), keeping top-m; §3.4 ≤ 8 mission-based
promotion candidates; §3.5 recall instrumentation (expensive K = 2,000 vs cheap K = 24, target ≥ 90 %).

**Impact: HIGH** (ET step 6 estimates +100–200). Reasoning: the Place phase is where the economy is decided and is
currently the most budget-starved and least-ordered decision in the engine; generator recall caps everything
above it.

### G8 — Speed-1 and multi-action reach are structurally invisible to the generator and evaluator

**Gap.** `generateMoveActions` emits single-action destinations only; multi-action movement exists only by
chaining in the beam, in `raidPlans`' single long MOVE and inside the solvers (CA W8) **[code]**. Legality accepts
multi-action moves (`legality.ts:43-44`); the generator under-generates (safe for completeness via decomposition,
RE §3.1, but blind for *threat* purposes).

**Evidence.** F3 (NK:11) **[game]**; SU §2.2 reach table (speed 1 kill radius 4, speed 3 radius 10).

**Technique.** ET §7.1 BFS by `(occupancyHash, origin)` cached across sibling nodes, bitboard ring expansion
(~40 ops per full distance map), multi-source BFS per side; feeds G2's strike areas and G3's action costs.

**Impact: HIGH as part of G2/G3, LOW alone.**

### G9 — Home safety is a flat prior; no countdown, no plug, no forced-home proof beyond one reply

**Gap.** `homeOccupationPressure` = ±250 × 0.08 = ±20; `strategicValue` adds a raid-proximity prior of up to
±6 per armed unit, a route bonus `max(0, 4 − routeCost) × (defenders ? 0.4 : 2)`, and −200 for an enemy on our
corner (`strategies.ts:11-38`) **[code]**. The prover is invoked for a *single* reply turn (`engine-v2.ts:108-151`);
nothing asks "can I force a home win in ≤ 3 turns" or "can they" (ET §4.10). No term values a plug on the own
corner or the state of the corner's two neighbours (SD C2).

**Evidence.** HOME_VICTORY (v1.3): 399/960 games converted by the home objective, lightning_1 the most common
invader (106/399), a home water unit cut early home wins to 0/160 (LH §4.8) **[sim]**. The four-actions probe:
Tanka on A1 unwinnable at four actions unless the Hi was pre-positioned at D1 (LH §4.1) **[sim]**. Black's
`+Muju@J10` on turn 4 invalidated every assault White could compute (GR §2.3) **[game]**. NK:24's B2 block
**[game]**.

**Technique.** ET §5.3 `homeSafety` (threat-in-4, countdown, rescuers adjacent, plug, occupied), §4.8
home-threat and forced-rescue extensions, §4.10 df-pn for "force a home win in ≤ n turns" invoked when
`minTurnsToCorner ≤ 3` for either side (draw clock and reserves in the key to avoid GHI), §3.7 threat-space
search over home threats.

**Impact: MEDIUM-HIGH** (ET step 11 estimates +40–90; narrow but near-decisive where it fires). Reasoning: home
occupation is the win condition that converts stalled positions, and it has never fired in a real game — a strong
engine that sees 2–3-turn forced invasions will win games the corpus has not yet seen.

### G10 — No draw-clock awareness until the last ply

**Gap.** `inactivityPlies` appears nowhere in `src/ai` except where `simulate.ts:101` sets it; the only reaction
is the terminal `draw → 0` at `scoring.ts:16` / `evaluation.ts:34`, firing at ply 9 → 10 (CA W5) **[code]**.
No gradient from ply 5 to 9; no "who benefits from a draw" reasoning.

**Evidence.** No real game was lost to it (max clock 3 in the archive) **[game]**; but 20–24 % of scripted
four-action games, 59 % of the alternate-map screen and 55–62 % of depth-economy games end in inactivity
draws (LH §5.12) **[sim]**. A losing engine that cannot steer toward a draw forfeits half-points; a winning one
that cannot force a kill forfeits full points. Passing is never free (SU §5.2).

**Technique.** ET §5.10 `drawPressure = (10 − plies)/10 × sign(lead) × W`; "can I force a kill this turn" via
G3 (a fresh Hi vs any undefended plant); `inactivityPlies` in the Zobrist key (§2.3); pentanomial SPRT (§8.4).

**Impact: MEDIUM.** Reasoning: cheap (one integer read); directly converts losses into draws and prevents
draws from eating wins; matters more as both sides get stronger and trade less.

### G11 — Bank vs bodies is mispriced by an uncalibrated 3× premium

**Gap.** Opening + one white plant_3 = 25.64 (unitValue 17.0, territory 3.3, mining 1.6, mobility 1.2, tech 0.8,
step 0.8, centre 0.54, health 0.4); opening + 17 banked = 9.10 (CA §2) **[measured]**. `scorePartialPlan` adds
`projectedIncome × 1.5` on top for plans that keep the turn. Nothing prices liquidity for a spawn-strike reply
or the spawn-capacity ceiling on convertibility.

**Evidence.** Archived banks 57 vs 4; NK:13 (no crystals to answer the raid); SD P3/P16 **[game]**. Countervailing:
scripted bots end with 0.4–0.6 crystals (LH §4.5) **[sim]**. SU §8.4 ruling: the floor and ceiling are defensible,
the ratio is not.

**Technique.** ET §5.6 bank-conversion term; SD E7 liquidity floor `min(bank, 8)` and a penalty below the cheapest
lethal reply; ET §5.12 Texel tuning of all weights on a v2.8 self-play corpus (the evaluation is already a linear
weighted sum); fixed-point centi-crystals before tuning (§8.5).

**Impact: MEDIUM-HIGH.** Reasoning: the sign of the error is known from the recorded games; the magnitude needs a
self-play sweep — do not hand-set it.

### G12 — The turn is searched one action at a time and the plan is thrown away

**Gap.** `useAI.ts:53-61` computes `allowance = remainingCPU / decisionsRemaining` and executes only
`plan.actions[0]`, re-searching for every action point; `lastIntent` (+0.2 nudge) exists to paper over the
wobble, but beam plan ids are `JSON.stringify(actions)` and cannot survive the first action's removal (CA §1.1)
**[code]**. A Hard turn with 3 buys + 4 actions runs 7 independent searches, each clamped to
`min(allowance, 3000)`; iterative deepening across a turn is impossible (ET §9.5).

**Evidence.** Structural; no single game. The engine already computes a whole turn.

**Technique.** ET §9.5 `searchWholeTurn` path returning the full action list, dispatched action-by-action with
`isLegalAction` re-validation (as `useAI.ts:63` already does), per-action loop kept as fallback; §9.4 time
management (`clamp(base × modifiers, 2000, 6000)`, stop on stable best, never start iteration d+1 past 45 %).

**Impact: MEDIUM** (ET step 3 estimates +30–60). Reasoning: a pure win with no strength risk; a prerequisite for
iterative deepening and for meaningful difficulty presets.

### G13 — The evaluator and transition are ~50× too slow for search, and the prover sits inside the transition

**Gap.** `evaluatePosition` 71.9 µs (six `getAllSpawnPositions` ≈ 42 µs, each O(units × area) with `Set<string>`
keys, `spawning.ts:98-118`); `getUnitAt` is an O(units) `Array.find` (`board.ts:66-71`); `applyAction` rebuilds
`units` immutably (0.58 µs); BFS cache is keyed on `BoardState` identity and dies every node (`movement.ts:239-257`);
`upkeepActions` enumerates 2^k keep-sets (≤ 4,096); `resolveHomeCheckmate` (≤ 20,000 nodes, string transposition
keys) runs inside **every** `applyAction` where the mover occupies the enemy corner (`simulate.ts:28-33`)
(RE §7.3, ET §1.4) **[code, measured]**. A 3 s budget buys ~42,000 static evaluations.

**Evidence.** Measured, not game-derived. Every search technique above is gated by it.

**Technique.** ET §2.1–2.4: two-lane bitboards over 100 squares with `RECT[player][sq]`, `ADJ[sq]`; struct-of-arrays
units reusing the WASM kernel's `attackedThisTurn` bitmask (`assembly/tactics.ts:47`); drop `hasMoved` (never
read), `canActThisTurn` (never false), `attackedThisTurn` array (derivable — RE §1.7); two-tier Zobrist
`Kturn`/`Kpos` including the 100 cell reserves (1,700 keys) and the draw clock; make/unmake within a turn,
copy at the boundary; gate the checkmate prover to the root's chosen line and occupied-corner turn boundaries and
prove the gate preserves the canonical result (ET §12.8); §7.4/§7.6 baked tables (18×18 power matrix,
`killsInOne`, `upkeepOf`, corner neighbours). Write it in TypeScript with a WASM-shaped packed state first; port
only the two hot kernels later (§9.2).

**Impact: enabling (0 Elo directly, ~50× multiplier).** Reasoning: without it G1 reaches depth 2; with it, depth
5–7. Also process-global rule knobs (`elements.ts:45`, `combat.ts:62`, `upkeep.ts:8`) must be part of any cached
table's identity (RE §7.5).

### G14 — No transposition table, no canonical ordering; the beam dedups by action-order string

**Gap.** MCTS keys children by plan id (path), the beam by `JSON.stringify(actions)`; `move A then B` and
`move B then A` are separate slots (CA W10) **[code]**. White's turn 1 has 14,959 sequences for 1,053 mid-turn
states and 797 end positions — an 18.8× redundancy on the quietest turn (ET §1.4) **[measured]**. The WASM
kernel has no TT at all (pure DFS with an optimistic bound); the JS home prover has one with string keys.

**Technique.** ET §3.1 canonical ordering (promotion subsets by index — already done twice in-repo; independent
actions in slot order; attacks before independent moves, safe because turns are atomic); §3.2 within-turn TT on
`Kturn` (≥ 14× measured); a 2^18 "already failed at ≥ this budget" table in the WASM kernel (cheapest win in
existing code); §4.3 macro TT with depth-preferred ageing, expected low hit rate because reserves are in the key.

**Impact: MEDIUM as an enabler** (folded into ET step 5). Reasoning: multiplies within-turn search throughput
14×+ and is required for the generator (G7) to be affordable.

### G15 — `centerControl`, `mobility` and `unitHealth` point at the wrong things

**Gap.** `centerControl` = `Σ max(0, 7 − euclid(·,(4.5,4.5)))` × 0.2 (`evaluation.ts:207-223`) pulls toward the
zero-ore corridors D1–F3/E8–G10 and the contested centre regardless of live reserves (CA W16); `mobility` counts
one-action destinations + 1.5 × attacks, over-rewarding speed and option count in a game constrained by action
throughput (SD M5); `unitHealth` uses base DEF ignoring `damageTaken` (CA §2) **[code]**.

**Evidence.** The centre went unmined for 17 turns (GR §2.2) and centre anchors lost 0/37–69 vs Rush (LH §4.4)
**[game, sim]**; centre income rose without centre occupation on the richer map.

**Technique.** ET §5.4 dynamic `PST_mine` from live reserves plus a static combat-geometry PST
(distance-to-corners, corridor squares valuable to lightning only); §5.2 remove raw mobility in favour of strike
intersections; effective defence `DEF − damage` (SD M3).

**Impact: LOW-MEDIUM.** Reasoning: small weights, but systematic and cheap to replace; `PST_mine` doubles as half
of G4.

### G16 — Cleave-chain exposure and the "line of soft miners" are not modelled

**Gap.** No term counts, for each enemy tier-2+ unit and each square it can reach in ≤ 3 moves, how many of our
units fall in a kill-unlocked chain (SD X4) **[code, by absence]**.

**Evidence.** Archived turn 14: Hono at C9 killed B9 then C8 from one square **[game]**; the four-actions probe:
three adjacent Mujus fall in 3 actions to a Kagari, spaced ones only 2 (LH §4.1) **[sim]**.

**Technique.** Extend G3's kill-combo table with chain continuation (kill unlocks one more attack up to tier,
each 1 action; a non-lethal hit closes the chain — `combat.ts:13-17`); ET §4.8 Cleave-chain half-ply extension;
ordering bonus for chain turns (§4.4).

**Impact: MEDIUM.** Reasoning: a tier-3 chain is a 10–15-crystal swing and a draw-clock reset; the corpus
records it once and warns about it twice.

### G17 — Purchases and promotions are outside every proof and outside the opponent model

**Gap.** The kernel/JS prover returns `unknown` for any place-phase query except a home-blocked one and never
emits `BUY_UNIT` (`kernel.ts:40-41,75`; `tactics/home.ts:26`) — correct for its two callers (an occupier blocks
every rectangle), but there is no proof machinery for "can they kill this piece next turn, buying if they need
to" (CA W9). Own-side kill search includes purchases only through the fire_1 summon-and-strike template and
promotions only as isolated single-action plans (G7).

**Evidence.** F2 (bought Radi), F13 (promotion-enabled kill), archived Black turn 3 (bought Hi) **[game]**.
`MCP_TOOL_TAPS`: "a Straumr promoted to 'safe' defence 3 the turn before the enemy promoted to a 3-attack
Aegirinn" **[doc]**.

**Technique.** G2's `strikeIfBought`, G3's DP with purchases at cost 1 from the nearest legal spawn square and
promoted stats, G7's mission promotions; `server/analysis/tactics.ts singleThreats` already enumerates
existing | promotion | purchase categories and can seed a reference implementation (GR §5.4).

**Impact: MEDIUM-HIGH** (subsumed by G2/G3/G7 when they include purchases; listed separately because the current
proof machinery will otherwise be reused with its scope limit intact).

### G18 — Material values are purchase prices, and DEF is treated as a scalar

**Gap.** `unitValue` = Σ cost (3/4/5, 7/8/9, 15/16/17) **[code]**. A plant_3 (MINE 8, DEF 4) and a metal_3
(MINE 4, DEF 5) score identically; a Radi (MINE 0) scores as 3 crystals of value with no positional meaning; DEF
enters only through `unitHealth` × 0.1. The kill threshold is binary: one DEF point changes the set of units that
can remove you (Tanka is one-shot only by Kagari; Aegirinn only by Karanlık) (SU §3.3).

**Evidence.** SU §3 kill table; the design invariant in `docs/BALANCE-2026-09-11` and the static solver's Tanka
frontier (LH §3.2) **[doc, sim]**.

**Technique.** ET §5.1 fitted values (18 parameters by Texel, one fixed for scale), rent-discounted; durability
via G3's kill-combo table, never a linear DEF term; ET §7.6 `killsInOne[18][18]`.

**Impact: MEDIUM** (ET steps 8–9). Reasoning: the prior is adequate; the tuning is what pays, and it requires the
self-play corpus that G13 makes affordable.

### G19 — Nondeterminism and float weights undermine measurement

**Gap.** `Date.now()` in `mcts.ts:46,49`, `performance.now()` in `runtime.ts:17`, `crypto.randomUUID()` game ids,
`Date.now()+Math.random()` starting-unit ids (`board.ts:104`); the seeded RNG is plumbed into `MCTSConfig.rng` and
never read (CA W12) **[code]**. Three identical Medium searches produced 9,247 / 10,415 / 10,640 candidates
**[measured]**. Weights are floats (`types.ts:73-88`), so tuned values will not port across the JS/WASM boundary
(ET §12.9). Tactical DFS nodes are not charged to `maxWork` (CA W14).

**Technique.** ET §8.5: all timing through `SearchBudget`, integer centi-crystal scores, no `Map`/`Set` iteration
keyed on nondeterministic ids, fixed-work mode preserved for SPRT/CI; charge every node class to the budget.

**Impact: LOW on strength, HIGH on the ability to measure strength.**

### G20 — Measurement infrastructure: no ladder, no SPRT, no perft, stale gates, harness cannot express the rules

**Gap** (LH §5) **[code, data]**: no engine-vs-engine match ladder anywhere in `lab/` (`lab/ai/run.ts` league =
one game per opponent per seat at one seed, `fixedWork 1200` where MCTS runs 0 iterations; `compare-production.ts`
= 18 puzzles); no Elo/Bradley–Terry or SPRT; no fixed-work axis in the harness (`FAST_OVERRIDES` are wall-clock);
calibration gates G1–G4 not re-run since four actions / doubled prices / v2.8 / 504 map; no perft(depth) —
the census scripts contain the machinery (2,486,625 and 22,883,316 cross-checked transitions) as one-off code;
`MatchOptions` lacks `blackCrystalHandicap` and `actionsPerTurn`; `WinType` omits `home-checkmate` (already in
committed data, 19/320) and `timeout`; `summarize()` collapses runs differing in upkeep/victory/inactivity/map into
one row; `lab/solver/model.ts:23 ACTIONS = 6`; 14 of 18 `lab/experiments/*.ts` throw on import by design.

**Evidence.** The only modern engine-strength datapoint is 16 games at the fast preset, 0 wins vs Rush **[sim]**;
the last recorded strength numbers (2026-09-07) use pre-v2.1 fixture names (CA §6). No opponent-strength number
exists for the current rules.

**Technique.** ET §8.1 freeze `perftActions(initial,4) = 14,959`, `perftTurns = 797`, `distinctMid = 1,053` plus
5–10 authored mid-game positions; §8.2 three-way differential fuzzer (canonical JS / fast JS / WASM) extending
`tests/game/properties.test.ts`, comparing Zobrist keys after every action; §8.3 four EPD suites (28 home-mate
cases exist; author spawn-strike and economy suites from the logged games; use the 797 census openings as a
"does it choose a Hi sortie / never seal the corner" regression); §8.4 SPRT with pentanomial model, seat-mirrored
paired seeds, fixed nodes, at handicap 0 and 3; promote the census cross-checks into `lab/harness/perft.ts`; add
the two `MatchOptions` fields and the two `WinType` members; fix `ACTIONS`.

**Impact: enabling (0 Elo).** Reasoning: none of the estimates above can be confirmed or refuted without it;
ET's ranked order puts it at steps 1–2 for that reason.

### G21 — Dead, unreachable and stale surfaces that create false confidence

**Gap** (CA W13, §6) **[code, doc]**: `generateTemplatePlans` (immediate_kill / move_then_kill) behind
`templates: false`; `tacticalSharpen` reachable only from the MCTS leaf; `getMinThinkingTime`, `estimateUnitValue`,
`evaluateUnitPosition`, `scoreAction` with zero production callers; `AI_ENGINE_README.md:51` documents a
`queueValue` weight that does not exist and "belief particles" deleted in v2.1; `AI_IMPLEMENTATION_STATUS.md`
claims 30 fixtures (28 exist); `lab/results/ai-wasm-2026-09-07` is three rules revisions old yet still cited
as 18/18; `SPEC_AUDIT.md` says 520 crystals / schema 5.

**Technique.** Wire the templates into the generator's forced-injection list or delete them; delete the dead
symbols; mark the 2026-09-07 results historical; regenerate the docs from code.

**Impact: LOW on strength; MEDIUM on engineering risk** (a reader who trusts the README will design against an
engine that does not exist).

### G22 — The home-checkmate / draw-clock ordering is unmodelled and undocumented

**Gap.** Verified today (SU §8.1): at `inactivityPlies = 9` a proven checkmate wins where the turn would
otherwise have drawn; an unproven occupation draws. The prover ignores the clock; no evaluation term or test
covers the interaction; `SPEC.md:373-374` says the opposite.

**Technique.** Encode the exact ordering in the fast engine's terminal detection (checkmate resolves at the
action, draw at `endTurn`, occupation at `startTurn`); add a vitest fixture; request a J-log ruling.

**Impact: LOW in frequency, HIGH in the positions where it fires** (it decides the game).

---

## 2. Loss-to-gap map

| Recorded loss / lesson | Gaps that would have caught it |
|---|---|
| NK:9 corner sealed, zero spawn squares | G6 (zero-spawn cliff), G7 (placement scoring), G20 (census regression) |
| NK:10 bought Radi killed a Hi on turn 2 | G2, G17, G1 |
| NK:11 speed-1 Straumr reach; half-mined home cells; far anchor blocked by a 3-crystal Hi | G8/G2; G4; G6 |
| NK:13 corner turtle bled to fresh-Hi raids; one AP short four turns running; released to upkeep | G6, G2; G3; G5/G4 |
| Archived Black: 54 upkeep, 13 kills, resigned at 4 crystals | G5, G4, G11, G1 |
| Archived White mistakes #1–#5 (Sachita kill declined; anchor moved; Göls on 2-AP squares; plants on 4s; Kagari in Hi range) | G3/G17; G6; G2; G4/G7; G2 |
| Archived Hono chain kill B9→C8 | G16 |
| Archived: 51/64 central crystals never mined | G4, G15 |
| Scripted: 20–62 % inactivity draws | G10 |
| Scripted: rush mirrors White 15/20, Black 0/20 | G20 (seat-mirrored measurement), G9 (tempo/home) |

---

## 3. Recommended order (mapping to `engine-techniques.md` §11)

1. G20 — SPRT + fixed-node harness, perft fixtures, three-way differential fuzzer (ET steps 1–2; 0 Elo, gates all).
2. G12 — whole-turn search path in `useAI` (ET step 3; +30–60; pure win, validates the harness).
3. G13 + G14 + G19 — packed state, bitboards, `RECT` masks, Zobrist, make/unmake, canonical ordering, turn-TT,
   integer scores (ET steps 4–5; enabler, ~50×).
4. G3 + G16 + G17 — generalized kill-combo table with purchases, promotions and chains (ET step 5; +80–150).
5. G7 — candidate generator with recall instrumentation ≥ 90 % (ET step 6; +100–200).
6. G1 — ID-PVS, macro TT, ordering, quiescence over tactical turns (ET step 7; +200–350).
7. G2 + G6 + G9 + G4 + G5 + G10 + G15 + G18 — evaluation v1: threat maps incl. purchase reach, spawn geometry
   with cliff and fragility, home safety, economy DP + `PST_mine`, runway, draw clock, fitted material
   (ET step 8; +120–220), then Texel (step 9; +60–120).
8. G11 — calibrate bank vs bodies inside the Texel pass, not by hand.
9. G9 df-pn home module, LMR/aspiration/extensions, SPSA, opening book keyed by handicap, AssemblyScript port of
   the two hot kernels (ET steps 10–14).
10. G21, G22 — housekeeping and the J-log ruling, any time.

ET's cumulative estimate for steps 1–9 is +450–700 in the local scale (≈ 90–95 % vs the current Hard preset at
equal wall clock) **[inference]**; the point of item 1 is to replace that guess with a measurement.

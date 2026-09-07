# Muju static value solver

This is a **pre-playtest balance instrument**. It solves small, explicit optimization problems using the actual catalogue and element graph. It does not play scripted games, fit a rating to their results, or collapse every stat into a single power number.

Run from `muju`:

```sh
npm run balance:static                  # current live catalogue
npm run balance:static -- baseline      # frozen v1.2 catalogue
npm run balance:static -- proposed      # the initial seven-stat v1.3 proposal
npm run balance:check                   # fail on duplicate profiles, dominance, or no role witness
npm run balance:types
npm test -- --run tests/ai/static-value.test.ts
```

Outputs are JSON and readable Markdown in `lab/results/static-value-2026-09-07/`. Each records catalogue and model hashes. Baseline values are frozen in `baseline-v1.2.json`; changing production values does not rewrite the comparator. The CLI also supports `lightning`, `plant_t2`, `plant_depth`, and `plant_price` for comparison. Add candidate patches in `run.ts` or edit the production catalogue and use `current`. No output is imported by gameplay.

## What it measures

### 1. Distinctness is three different questions

- **Different profiles:** compare actual stats, prices, build time and both directions of the elemental matchup graph. Renaming an otherwise identical piece does not make it different.
- **Same-tier dominance:** can another unit with identical elemental relationships match every beneficial stat, cost no more and build no slower, with at least one strict advantage? This catches old Sachita versus Mazaska. It deliberately excludes promotion-path value; it is not a declaration that a whole tree is worthless.
- **Cost-efficient roles:** enumerate capability-constrained strike, extraction and anchor-occupation tasks. For each, find the cheapest qualifying single unit across **all** types and tiers. Store an explicit witness, ties and the next-best substitute's price. There is no instruction saying “use unit X” or “must be tier Y.”

All current units have at least one sole-cheapest witness in the declared grid. That proves a limited, auditable claim about these missions. It does **not** establish that those missions occur frequently, survive enemy adaptation, or outweigh stronger alternatives in a complete game. Counts depend on the grid's density and must not become a tier list or a balancing objective.

The mission grid covers all 24 target types, open distances 1–18, budgets 1–6, required fresh-cell extraction 0–5, and survival of one hit from each of the 24 possible guards (plus no guard). Extraction tasks use three finite corridors and quotas 1–20. Occupation tasks use distances 1–18 and budgets 1–3. A strike can require mining first; both activities consume the **same** action budget. Guard survival means surviving one subsequent hit while at full defense; the model does not invent permanent hit points or retaliation during an attack.

Why the full mining thresholds matter: an early implementation omitted the threshold 2 and temporarily failed to find a sole-cheapest Shadow tier-3 role. Adding the missing threshold exposed its existing mine-two-and-strike niche. That was a model defect, not grounds to buff Shadow. The regression test now covers it.

### 2. Attack and speed interact through discrete action thresholds

Effective attack is exactly:

`max(0, ATK + elemental modifier)`

The open-board cost to move into adjacency and attack once is:

`ceil((shortest-path distance − 1) / SPD) + 1 actions`

A one-piece kill requires both enough attack to defeat the target and enough actions to arrive and strike. An additional attack point can be useless until it crosses a defense threshold. An additional speed point can be useless at one distance and save a whole action at another.

**Concrete complementarity:** consider old Radi (ATK 1, SPD 3), Inyan (DEF 3, weak to Lightning), distance 8, and three available actions. ATK +1 alone still needs four actions to arrive and attack. SPD +1 alone arrives in three actions but deals only two damage. **Both changes together kill in three actions.** This is an interaction derived from the rules, not a fitted bonus for `ATK × SPD`.

The report measures the mixed finite difference:

`K(A+1,S+1) − K(A+1,S) − K(A,S+1) + K(A,S)`

where `K` counts successful one-hit kill cells over 24 targets, all 18 distances and budgets 1/2/3. Positive values mean complementary thresholds; negative values can arise from overlapping benefits or saturation. Counts are not percentages of real opponents or map positions. Starting at opposite corners and fighting across an open board is not assumed to be typical play.

### 3. Conditional crystal value and coordinated kills

`killFrontier` uses dynamic programming over damage, actions and distinct attacking bodies. It returns the **cost/actions/bodies Pareto frontier** of legal-within-the-model killing squads. A cheaper swarm can coexist with a more expensive action-efficient finisher.

Each attacker strikes the target once. There are at most four independent approach lanes and six shared actions. Existing attack damage is accumulated inside that one turn. The defender cannot be worn down across turns. Attackers are already available; this module does not silently grant instant construction.

For example, against Inyan at distance 4, old Radi deals two damage and needs two bodies: four total actions and two crystals of bodies. Radi with ATK 2 deals three damage and needs one body: two actions and one crystal. **In that specific task, the attack point saves one crystal of material and two actions.** It is not universally worth one crystal.

For ATK +1, the report gives the mean crystal saving of the cheapest same-type squad over cases feasible both before and after. Newly feasible cases are counted separately; they do not receive a made-up infinite monetary value. The raw result also contains this calculation for other marginal stats. These prices depend on the existing catalogue, action cap and task, and are not an independent “fair price” calibration.

Defense is valued by the cheapest opposing squad able to kill the piece. An extra point sometimes does nothing and sometimes forces an extra attacker or makes a six-action kill infeasible. “Unbreakable” in a cell means infeasible within the stated local bound, not invulnerable in the game.

Formation limits matter: approach lanes ignore traffic, intermediate blocking, enemy reactions and the availability of four open adjacent cells near an edge. Treat these results as tactical bounds and test important witnesses in actual board positions before declaring an exploit or a universal defense.

### 4. Mining and mobility are finite action-budget problems

`miningCurve` exactly maximizes extraction by one unit on a finite ten-cell, unblocked corridor. State is `(position, already-mined mask, actions used)`. Each move travels at most SPD cells for one action. Each mine takes every still-reachable layer from that cell in one action. Stopping early is permitted.

The corridor profiles are fresh wells, wells already stripped to depth 3, and three fresh wells spaced four cells apart. Curves report every budget from zero to six actions, rather than only the final total. There is no regenerating income, free move or repeated harvesting of the same layers.

Plant v1.3 has mining 3/4/5/5. Tier 4 relocates at speed 2 rather than 1. On the scattered corridor, a tier-4 piece can take ten resources in **four** actions instead of **six**. The six-action income total can be unchanged while two actions become available to other pieces. That is precisely why a single “resources per turn” rating misses speed's value.

These corridors are declared examples, not all board shapes. Protection, competing miners, enemy occupation, two-dimensional detours and spawn geometry belong in later positional and gameplay tests.

### 5. Access by own turn

The financing model produces the earliest exemplar of each tier under external income of 3, 6 or 9 crystals per own turn. It respects:

- Free starting Fire 1, Water 1 and Plant 1.
- Zero initial bank; income arrives during action phase, after that turn's placement/promotion opportunity.
- T1 construction delay for non-starting lines.
- At most one promotion per placement phase, and none on the turn a piece is placed.
- Promotion costs the difference in prices and permits action immediately.

Given monotone prices and build times of at least one turn, promoting the maintained exemplar is no more costly or later than replacing it with a freshly built next-tier exemplar. Thus the greedy earliest-affordable promotion schedule is optimal for **this one-exemplar, external-income model**. It does not optimize an entire opening economy. Build times at higher tiers still matter for fresh reinforcements even when the earliest exemplar comes from promotion.

The report shows both per-unit investment/access and turn 1–8 capability frontiers. Different units may achieve different stat maxima; they are not affordable simultaneously. The “distance 7 / three actions” column requires a single accessible unit to supply both speed and attack.

At three external crystals per turn, Fire 2 is available on own turn 2, Lightning 2 on turn 3, Metal 2 on turn 4, and Plant 4 on turn 7. These are financing bounds under the specified conditions, **not predicted in-game arrival times**. Real players spend actions earning income, maintain anchors, defend and choose competing investments. Plant buffs can change actual income, while this comparison intentionally holds the external income schedule fixed.

## Validation and interpretation

The tests compare all 576 elemental power pairs with actual combat and every unit/depth mining case with actual extraction. Independent exhaustive enumerators check short mining paths and small squads against the dynamic programs. Tests cover no repeated target attacks from one body, multiobjective squad tradeoffs, the attack/speed interaction, exact phase-dependent financing examples, the historical domination defect and missing-threshold regression.

`balance:check` rejects duplicate profiles, strict same-tier domination or a unit without a cheapest mission witness. The test suite additionally keeps a sole-cheapest example for each current unit. A failure is a prompt to inspect the model and the catalogue; it is not authorization to blindly change stats until the checkbox turns green.

Use this instrument **before** scripted games: inspect witnesses, price/tempo tradeoffs, attack thresholds and earliest access; then use games to test strategic interactions the static abstractions omit. Never optimize witness counts, average arbitrary scenarios into a universal rating, or price a stat from the very unit prices being justified without acknowledging the circularity. The raw dimensions and assumptions are the useful result.

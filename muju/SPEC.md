# Muju Hono Tanka — Game Specification (Current Rules)

This is the canonical rules specification for Muju Hono Tanka as implemented.
It supersedes the original v1.0 implementation spec (this file's previous
content) and incorporates all v1.1 changes (`docs/v1.1-spec.md`). Where this
document and the code disagree, that is a bug in one of them: see
`lab/docs/SPEC_AUDIT.md` for the clause→code traceability table and the list
of known divergences. The stat tables in §7 are transcriptions of
`src/game/units.ts`, which is the canonical stat source.

**Spec version:** v1.6 (2026-09-08) — Tier upkeep and 20-ply inactivity draw, on the 18-unit catalogue.
Tier 4 is removed. Tanka (Metal III) gains Speed 2; all other v1.3 T1–T3 stats,
costs and build times, v1.4 Cleave, and the Unequal routes board are unchanged.
History: v1.0 (original design), v1.1 (`docs/v1.1-spec.md`, historical playtest
balance pass), v1.2 (2026-06-09 canonical rules rewrite), v1.3 (role balance),
v1.4 (Cleave), v1.5 (tier-3 cap), v1.6 (upkeep and inactivity draw).

---

## 1. Overview

Muju Hono Tanka is a two-player perfect-position / hidden-economy strategy
board game combining territorial control (Go), tactical combat (Chess), and
economic buildup (StarCraft). Players are **White** and **Black**; either seat
may be a human or an AI (`vs-ai`, `pass-play`, and `ai-vs-ai` modes).

- **Six elements, three tiers:** 18 units; tier 3 is terminal.
- **Board:** 10×10 square grid.
- **Start:** White's corner is (0,0); Black's corner is (9,9). Each player
  starts with 3 units adjacent to their corner and 0 resources.
  - White: Hi (fire_1) at (1,0), Sjor (water_1) at (1,1), Muju (plant_1) at (0,1).
  - Black: Hi at (8,9), Sjor at (8,8), Muju at (9,8).
- **Resources:** **Unequal routes (map D)**: fixed 180°-rotational layout, 0, 3, 4, or 5 initial layers per cell, **308 total**. Deep home corners, four-layer shelves and sixteen blank approaches to deep expansion wells (walkable and spawn-eligible as usual). Exact layout: `src/game/resourceMap.ts`. Save schema 3 starts fresh for older unfinished games.
- **White moves first.** The first turn begins directly in the Action phase
  (there is nothing to place or promote at game start).

## 2. Turn structure

A turn has three phases, in order:

1. **Place phase** — place ready units from the build queue; promote units.
   Placement and promotion cost **no actions** (only resources, for
   promotion). The phase is skipped automatically when the player has nothing
   to do in it (no placeable ready units and no affordable promotions).
2. **Action phase** — spend up to **6 actions** (`MAX_ACTIONS_PER_TURN`).
   Each action is one move-step, attack, or mine by one unit. Movement and
   mining may repeat within the shared budget; attacks also obey Cleave (§4.2).
3. **Queue phase** — pay resources to queue new units (hidden from the
   opponent). The phase auto-ends (ending the turn) when the player cannot
   afford anything further.

Turn bookkeeping at the start of a player's turn, in order:

- Check home occupation and existing board elimination (§9).
- If no win resolved and the public inactivity counter is20, draw (§9).
- Pay upkeep from the existing stockpile (§5.5). If a selection is required,
  the place phase pauses here. Removal of the last unit loses by elimination.

- Their build queue advances by one turn; entries reaching 0 become **ready**.
- All their units' action flags reset (`hasMoved`/`hasAttacked`/`hasMined`,
  `attackedThisTurn`, `lastAttackKilled`, `placedThisTurn`).
- **All damage on their units heals** (`damageTaken` resets to 0) — see §4.3.

`turnNumber` increments when the turn passes back to White (a full round).

## 3. Movement

- Orthogonal only; no diagonals.
- A unit's **Speed** is the number of squares per **one action**. Moving
  farther in a single declared move costs multiple actions:
  `cost = ceil(squares_traveled / speed)`, path found by BFS around
  obstructions. The move is legal only if the player has that many actions
  remaining (all consumed at once).
- Units cannot move through or onto occupied squares (either side's).
- There is no zone of control; movement never triggers combat.

## 4. Combat

### 4.1 Attacks
- Melee only: attacker must be orthogonally adjacent to the target.
- An attack costs 1 action.
- **Elemental modifier (±1 ATK):** attacker gets +1 ATK against an element it
  has advantage over, −1 ATK against an element it is disadvantaged against
  (§6). Defense is never modified. Effective ATK floors at 0.

### 4.2 Cleave
- Every unit begins its turn eligible to attack once.
- **Killing the target** unlocks one further attack by that same unit, with a
  maximum of **tier attacks per turn** (I: 1, II: 2, III: 3).
- Each attack still costs **one shared action**. Moving or mining between attacks
  is allowed at the normal cost; neither restores or consumes attack eligibility.
- If a target survives, the attack chain ends for that unit this turn, including
  a zero-damage hit. A later kill by another unit does not reopen that chain.
- A newly placed Tier I can attack immediately but cannot attack twice.
- Combined attacks resolve individually; only the actual killing blow unlocks Cleave.
- History includes eliminated targets (`attackedThisTurn`); `lastAttackKilled`
  records the result of this unit's last attack. Both reset on its owner's turn.
  Completed human and AI actions, plus undo, save the board and attack allowance
  together. v1.6 save schema 4 discards unfinished games from older releases;
  no legacy tier-4 catalogue is loaded.

### 4.3 Damage and elimination
- If effective ATK ≥ effective DEF, the defender is **eliminated**.
- Otherwise the defender takes damage equal to the attack: `damageTaken`
  accumulates and reduces effective DEF (`DEF_eff = max(0, DEF −
  damageTaken)`). Multiple units can therefore bring down a big unit by
  combining attacks **within the defender's exposure window**.
- **Full heal:** `damageTaken` resets to 0 at the start of the **owner's**
  turn. Chip damage does not persist across the defender's own turn — a kill
  must be completed before the defender's turn begins. This is a deliberate
  board-game-ability ruling (state stays trackable by position plus a
  transient damage marker; no persistent per-unit HP).
- There is no retaliation damage; attacking is risk-free except for position.

## 5. Economy

### 5.1 Mining — the Well Metaphor
- Each cell starts with 0, 3, 4, or 5 depth layers, numbered from 1 and worth 1 resource each. A unit's **Mining**
  stat is its rope length: it can reach layers down to depth = Mining.
- A mine action (1 action) extracts **all remaining layers from the current
  top down to the unit's Mining depth**, i.e.
  `yield = max(0, min(Mining − minedDepth, remainingLayers))`.
- If the cell's top remaining layer is deeper than the unit's Mining stat, the
  cell is **dry for that unit** (yield 0; the action is not consumable —
  `canMine` is false). Mining 0 units (Radi, Umeme, Göl) can never mine.
- Mined layers are gone forever; the board economy is finite (308 total on Unequal routes; 500 in legacy uniform games).

### 5.2 Build queue (hidden)
- During the queue phase, the player pays a unit's **Cost** and adds it to
  their **build queue** with `turnsRemaining = BuildTime`.
- **Tech requirement:** a Tier-N unit (N ≥ 2) can be queued only if the player
  has a unit of the **same element at tier ≥ N−1 on the board** at queue time;
  the requirement is re-checked at placement. T1 units are always available.
- The queue is **hidden** from the opponent (§8).
- **Queue persistence:** queue entries are never auto-deleted. A ready unit
  that cannot be placed (no valid spawn) stays ready in the queue indefinitely
  and can be placed later; tech lost after queuing does not destroy the entry
  (but placement re-checks tech).

### 5.3 Placement (spawning)
- Ready units are placed during the place phase at **no action cost**.
- **Spawn rectangle:** choose any friendly unit as an *anchor*; the rectangle
  spans from the player's start corner to the anchor (inclusive, both
  corners). If **no enemy unit is inside the rectangle**, the new unit may be
  placed on any **empty** square within it. Any enemy inside the rectangle
  blocks that anchor entirely (infiltration denies spawn zones).
- Placed units can act immediately — there is **no summoning sickness**.

### 5.4 Promotion
- During the place phase, pay `cost(next tier) − cost(current tier)` to
  upgrade a unit to the next tier of its element, in place.
- Restrictions: cannot skip tiers; T3 cannot promote; a unit may be promoted
  **at most once per place phase**, and **not on a turn it was placed**.
- Promoted units can act immediately. Promotion is public information.

### 5.5 Upkeep

Each turn, before placement, pay 1 crystal for each of your tier-2 units and 2
for each tier-3 (3 for tier4, if present). Any unit you do not pay for is lost.
Tier1 units are free. Payment uses the existing stockpile and no actions.
Queued units owe nothing until the next own turn after placement. A promotion
pays its new tier's rent beginning next own turn, not retroactively.

When the stockpile covers the army, all units are kept and payment is automatic.
Otherwise the place phase opens with a mandatory affordable keep-set choice.
The optional **Review upkeep each turn** menu setting allows voluntary release,
including a free tier1 unit, even when all rent is affordable. Any affordable
subset is legal. The empty set loses if it removes the last on-board unit.
Releases are not attacks: they add no combat history, trigger no Cleave, and
never reset the inactivity clock. Healing and queue advancement follow payment.

Design intent: binary DEF walls require continuing income to sustain their tier.
An income lead can become a tier lead and then a broken wall. Invading armies
and corner garrisons pay the same rent. Tier1 swarms remain free; the shared
six-action pool and Cleave are their counterweights.

## 6. Elements — the Double-Thick Triangle

Six elements form three **pairs**; advantage cycles between pairs:

```
Fire & Lightning  →  Plant & Metal  →  Water & Shadow  →  Fire & Lightning
```

- Each element has advantage (+1 ATK) over **both** elements of the pair it
  beats, and disadvantage (−1 ATK) against both elements of the pair that
  beats it. Elements within the same pair are neutral to each other.
- Defense is never elementally modified.

| Element | Pair | Beats | Loses to | Archetype | Theme |
|---|---|---|---|---|---|
| Fire | Fire-Lightning | Plant, Metal | Water, Shadow | Rush | Japanese / Asia |
| Lightning | Fire-Lightning | Plant, Metal | Water, Shadow | Rush | Swahili / Africa |
| Plant | Plant-Metal | Water, Shadow | Fire, Lightning | Expand | Quechua-Nahuatl / S. America |
| Metal | Plant-Metal | Water, Shadow | Fire, Lightning | Expand | Lakota / N. America |
| Water | Water-Shadow | Fire, Lightning | Plant, Metal | Balanced | Norse / Europe |
| Shadow | Water-Shadow | Fire, Lightning | Plant, Metal | Balanced | Turkish-Slavic / Eurasia |

**Design intent (Ethan ruling, 2026-06-09):** Rush beating Expand elementally
is intended — mass Fire_1 is the zerg rush, and Expand must answer it with
play, not a type-chart veto. The archetype triangle of v1.1 §2.3
(Rush > Balanced > Expand > Rush) was **not** adopted; the Double-Thick
Triangle above is the incumbent.

Note the **"Wind" element of v1.0 no longer exists** — it was renamed and
rethemed to **Shadow** (Turkish names: Göl, Gölge, Karanlık) with
new stats.

## 7. Unit catalog (canonical: `src/game/units.ts`)

Eighteen units, three per element. Stat columns: ATK / DEF / SPD / MINE / Cost / Build time.

Tier 4 was cut because its cost 10–20 and build time 2–3 bought the weakest
stat-per-crystal profiles, while Map D reduced fifth-layer mining work from
100 crystals to 20. Three tiers reduce the learning burden. Metal III’s DEF 6
corner garrison falls to two Karanlık (3 effective damage each); the former
DEF 8 Metal IV required stronger attackers. Losing Wakanwicasa’s invasion role
and Gokamoka’s four-kill sweep is an accepted tradeoff, measured in
`docs/TIER3_CAP-2026-09-08.md`. Tanka gains Speed 2 to reposition and invade
more effectively while retaining the same defensive counterplay.

### Fire (Rush — ATK specialist) — Japanese
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Hi | 2 | 1 | 2 | 1 | 1 | 1 |
| 2 | Hono | 3 | 1 | 2 | 1 | 3 | 1 |
| 3 | Kagari | 4 | 2 | 3 | 1 | 6 | 2 |

### Lightning (Rush — SPD specialist) — Swahili
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Radi | 2 | 1 | 3 | 0 | 1 | 1 |
| 2 | Umeme | 3 | 1 | 4 | 0 | 3 | 1 |
| 3 | Kimubunga | 3 | 1 | 5 | 1 | 6 | 2 |

### Water (Balanced — DEF-leaning) — Norse
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Sjor | 2 | 2 | 1 | 2 | 2 | 1 |
| 2 | Straumr | 2 | 3 | 1 | 2 | 4 | 2 |
| 3 | Aegirinn | 3 | 4 | 2 | 3 | 10 | 2 |

### Shadow (Balanced — ATK/SPD-leaning) — Turkish/Slavic
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Göl | 2 | 2 | 2 | 0 | 2 | 1 |
| 2 | Gölge | 3 | 2 | 2 | 1 | 4 | 2 |
| 3 | Karanlık | 4 | 2 | 3 | 2 | 10 | 2 |

### Plant (Expand — MINE specialist) — Quechua/Nahuatl
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Muju | 0 | 2 | 1 | 3 | 3 | 2 |
| 2 | Sachita | 1 | 3 | 1 | 4 | 6 | 2 |
| 3 | Sachakuna | 2 | 4 | 1 | 5 | 12 | 3 |

### Metal (Expand — DEF specialist) — Lakota
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Inyan | 1 | 3 | 1 | 2 | 3 | 2 |
| 2 | Mazask | 2 | 4 | 1 | 3 | 6 | 2 |
| 3 | Tanka | 2 | 6 | 2 | 3 | 12 | 3 |

The Metal ladder is **Inyan → Mazask → Tanka**. The title names a tier-1, tier-2,
and tier-3 unit: Muju / Hono / Tanka.

Starting units for both players: `fire_1`, `water_1`, `plant_1`.

## 8. Hidden information

Visible to both players at all times:

- The board (all units, positions, tiers, damage markers) and all cell
  resource states.
- Each player's `resourcesGained` (total ever mined).
- Each player's public manifested spending (`resourcesManifested`), updated
  when a unit is placed or promoted and whenever upkeep is paid. Internally,
  `resourcesSpent` counts queue purchases, promotions and paid upkeep; it is private. The opponent
  observation exposes the manifested total in its `resourcesSpent` slot,
  so hidden queue purchases do not leak. `resourcesUpkeep` is the upkeep subtotal,
  already included in both totals, not added twice. Conservation remains
  `stockpile + hidden queue cost = gained − manifested`. Voluntary release does
  not establish that the player was unable to afford the released unit.
- The inactivity counter, pending upkeep step and last upkeep result are public.

Hidden from the opponent:

- Current resource stockpile (derivable only as
  `gained − spent − hidden queue spending`).
- The build queue: contents, count, and readiness.

These rulings come from `AI_ENGINE_QUESTIONS.md` Q1–Q3; the AI must play
through an observation/belief layer (`src/ai/state/observation.ts`) rather
than reading hidden state.

## 9. Victory

- **Home occupation:** at the start of your turn, before healing, queue advancement,
  placement or promotion, if your unit occupies the opponent's home corner, you win.
  White targets (9,9); Black targets (0,0). Entering the corner does not immediately
  win: the opponent has one full turn to remove the invader. Any element or tier
  qualifies; no additional action, countdown or occupation marker is required.
  An enemy on the home corner blocks every reinforcement rectangle under the
  existing spawning rules. Existing units can still move, attack and promote.
  In simultaneous invasion races, the first player's qualifying turn start wins.
  Loading a current-schema mid-turn position does not retroactively resolve an occupation.

- **Elimination:** a player with **zero units on the board** loses, even if
  their build queue is non-empty (no unit ⇒ no anchor ⇒ nothing can ever be
  placed). Deliberate ruling; documented in `src/game/victory.ts`.
- **Inactivity draw:** after20 complete player turns without progress, end the
  game as a draw. A ply means one player's turn, not one action or full round.
  A mine yielding at least1 crystal or an enemy unit eliminated by attack resets
  the counter immediately. That progress turn ends at0. Each other completed
  turn adds1. Zero-yield mining is illegal. Chip attacks, movement, queueing,
  placement, promotion and upkeep removal do not reset it. At the next turn
  boundary, home occupation and existing board elimination take precedence;
  the draw then resolves before upkeep. Saved draws preserve reason `inactivity`.
  The public counter turns amber above14. Both players at zero units is also a
  draw, though normal play cannot reach that position.
- **Resignation:** the current player may resign; opponent wins. The AI plays out current-rule games: material deficits alone do not establish
  defeat when home occupation can win. Historical elimination-only lab games retain
  the older material-based resignation heuristic.

## 10. Architecture (orientation, not contract)

- `src/game/` — pure rules engine, React-free: `board.ts` (state, constants,
  heal/reset), `movement.ts` (BFS, multi-action move costs), `combat.ts`
  (damage model, combined attacks), `mining.ts` (well metaphor), `spawning.ts`
  (anchor rectangles), `building.ts` (costs, tech gating, queue), 
  `promotion.ts`, `turn.ts` (phase machine), `victory.ts`, `units.ts`
  (canonical catalog), `elements.ts` (Double-Thick Triangle).
- `src/ai/` — `engine-v2.ts` (`AIEngineV2`): belief-state MCTS. Observation
  layer (`state/`), public-economy-constrained hidden queue/stockpile samples
  (`belief/`), beam-search plan generation (`planner/`), UCT MCTS over plans
  (`search/`), and tactical sharpener (`eval/`). A dedicated browser worker
  (`worker/`) owns computation. A single-threaded WASM kernel (`assembly/tactics.ts`)
  uses ABI 3 with catalogue-length buffers supplied by the host (no fixed roster size),
  and searches exact current-turn attack/movement/promotion combinations; the canonical
  JS transition independently validates every successful witness. See
  `docs/AI_IMPLEMENTATION_STATUS.md` for scope, difficulty budgets and evidence.
  `src/game/legality.ts` validates actions; `src/ai/simulate.ts` is the
  authoritative transition for human actions, AI actions and search.
- `src/hooks/useGameState.ts` — React reducer delegates gameplay transitions
  to the shared engine; `useAI.ts` drives AI turns with explicit phase ends,
  waits for reducer acknowledgment, and cancels workers across lifecycle changes.
- `tests/` — unit tests per module plus seeded-playout property tests and
  adversarial audit fixtures (`tests/game/properties.test.ts`,
  `tests/game/audit-fixtures.test.ts`).
- `lab/` — balance lab: plan, audit, match harness, bots, experiments.

## 11. Known divergences

Engine/UI/AI divergences from this spec are tracked in
`lab/docs/SPEC_AUDIT.md` (D1–D14) with historical dispositions. The
2026-09-07 correctness repair resolves D1–D6 and D11–D14, retains intentional
rules D7–D8, and documents the remaining planning limitation D10.
The v1.4 release replaces D9 with Cleave. See
`docs/AI_CORRECTNESS-2026-09-07.md` for changes and evidence. Design judgment
calls are in `JUDGMENT_LOG.md`. The initial review in `docs/BALANCE_REVIEW-2026-09-07.md` is historical;
`docs/BALANCE_IMPLEMENTATION-2026-09-07.md` records the subsequently authorized
v1.3 catalogue changes and their validation.

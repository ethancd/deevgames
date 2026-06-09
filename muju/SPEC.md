# Muju Hono Tanka — Game Specification (Current Rules)

This is the canonical rules specification for Muju Hono Tanka as implemented.
It supersedes the original v1.0 implementation spec (this file's previous
content) and incorporates all v1.1 changes (`docs/v1.1-spec.md`). Where this
document and the code disagree, that is a bug in one of them: see
`lab/docs/SPEC_AUDIT.md` for the clause→code traceability table and the list
of known divergences. The stat tables in §7 are transcriptions of
`src/game/units.ts`, which is the canonical stat source.

**Spec version:** v1.2 (2026-06-09) — first spec rewrite to match shipped
rules. History: v1.0 (original design), v1.1 (`docs/v1.1-spec.md`, playtest
balance pass).

---

## 1. Overview

Muju Hono Tanka is a two-player perfect-position / hidden-economy strategy
board game combining territorial control (Go), tactical combat (Chess), and
economic buildup (StarCraft). Players are **White** and **Black**; either seat
may be a human or an AI (`vs-ai`, `pass-play`, and `ai-vs-ai` modes).

- **Board:** 10×10 square grid.
- **Start:** White's corner is (0,0); Black's corner is (9,9). Each player
  starts with 3 units adjacent to their corner and 0 resources.
  - White: Hi (fire_1) at (1,0), Sjor (water_1) at (1,1), Muju (plant_1) at (0,1).
  - Black: Hi at (8,9), Sjor at (8,8), Muju at (9,8).
- **Resources:** every cell starts with 5 resource layers (500 total on board).
- **White moves first.** The first turn begins directly in the Action phase
  (there is nothing to place or promote at game start).

## 2. Turn structure

A turn has three phases, in order:

1. **Place phase** — place ready units from the build queue; promote units.
   Placement and promotion cost **no actions** (only resources, for
   promotion). The phase is skipped automatically when the player has nothing
   to do in it (no placeable ready units and no affordable promotions).
2. **Action phase** — spend up to **6 actions** (`MAX_ACTIONS_PER_TURN`).
   Each action is one move-step, attack, or mine by one unit. There is **no
   per-unit action-type limit**: a unit may act multiple times and repeat
   action types within the budget (exception: same-target attack limit, §4.2).
3. **Queue phase** — pay resources to queue new units (hidden from the
   opponent). The phase auto-ends (ending the turn) when the player cannot
   afford anything further.

Turn bookkeeping at the start of a player's turn:

- Their build queue advances by one turn; entries reaching 0 become **ready**.
- All their units' action flags reset (`hasMoved`/`hasAttacked`/`hasMined`,
  `attackedThisTurn`, `placedThisTurn`).
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

### 4.2 Same-target limit
A unit may attack a given enemy **once per turn** (`attackedThisTurn`), but
may attack different enemies multiple times in one turn, budget permitting.

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
- Each cell has 5 depth layers, worth 1 resource each. A unit's **Mining**
  stat is its rope length: it can reach layers down to depth = Mining.
- A mine action (1 action) extracts **all remaining layers from the current
  top down to the unit's Mining depth**, i.e.
  `yield = max(0, min(Mining − minedDepth, remainingLayers))`.
- If the cell's top remaining layer is deeper than the unit's Mining stat, the
  cell is **dry for that unit** (yield 0; the action is not consumable —
  `canMine` is false). Mining 0 units (Radi, Umeme, Göl) can never mine.
- Mined layers are gone forever; the board economy is finite (500 total).

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
- Restrictions: cannot skip tiers; T4 cannot promote; a unit may be promoted
  **at most once per place phase**, and **not on a turn it was placed**.
- Promoted units can act immediately. Promotion is public information.

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
rethemed to **Shadow** (Turkish names: Göl, Gölge, Karanlık, Karabasan) with
new stats.

## 7. Unit catalog (canonical: `src/game/units.ts`)

Stat columns: ATK / DEF / SPD / MINE / Cost / Build time.

### Fire (Rush — ATK specialist) — Japanese
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Hi | 2 | 1 | 2 | 1 | 1 | 1 |
| 2 | Hono | 3 | 1 | 2 | 1 | 3 | 1 |
| 3 | Kagari | 4 | 2 | 3 | 1 | 6 | 2 |
| 4 | Gokamoka | 6 | 3 | 4 | 1 | 10 | 2 |

### Lightning (Rush — SPD specialist) — Swahili
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Radi | 1 | 1 | 3 | 0 | 1 | 1 |
| 2 | Umeme | 2 | 1 | 4 | 0 | 3 | 1 |
| 3 | Kimubunga | 2 | 1 | 5 | 1 | 6 | 2 |
| 4 | Dhorubakali | 3 | 1 | 6 | 1 | 10 | 2 |

### Water (Balanced — DEF-leaning) — Norse
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Sjor | 2 | 2 | 1 | 2 | 2 | 1 |
| 2 | Straumr | 2 | 3 | 1 | 2 | 4 | 2 |
| 3 | Aegirinn | 3 | 4 | 2 | 3 | 10 | 2 |
| 4 | Hafkafstormur | 4 | 5 | 3 | 3 | 15 | 3 |

### Shadow (Balanced — ATK/SPD-leaning) — Turkish/Slavic
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Göl | 2 | 2 | 2 | 0 | 2 | 1 |
| 2 | Gölge | 3 | 2 | 2 | 1 | 4 | 2 |
| 3 | Karanlık | 4 | 2 | 3 | 2 | 10 | 2 |
| 4 | Karabasan | 5 | 3 | 4 | 2 | 15 | 3 |

### Plant (Expand — MINE specialist) — Quechua/Nahuatl
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Muju | 0 | 2 | 1 | 3 | 3 | 2 |
| 2 | Sachita | 1 | 3 | 1 | 3 | 6 | 2 |
| 3 | Sachakuna | 2 | 4 | 1 | 4 | 12 | 3 |
| 4 | Cuauhtlimallki | 3 | 5 | 1 | 5 | 20 | 3 |

### Metal (Expand — DEF specialist) — Lakota
| Tier | Name | ATK | DEF | SPD | MINE | Cost | Build |
|---|---|---|---|---|---|---|---|
| 1 | Inyan | 1 | 3 | 1 | 2 | 3 | 2 |
| 2 | Mazaska | 2 | 4 | 1 | 3 | 6 | 2 |
| 3 | Tankasila | 2 | 6 | 1 | 3 | 12 | 3 |
| 4 | Wakanwicasa | 3 | 8 | 1 | 4 | 20 | 3 |

Starting units for both players: `fire_1`, `water_1`, `plant_1`.

## 8. Hidden information

Visible to both players at all times:

- The board (all units, positions, tiers, damage markers) and all cell
  resource states.
- Each player's `resourcesGained` (total ever mined).
- Each player's `resourcesSpent` — **intent:** updates when a unit is
  *placed* (and at promotion, which is public), not when queued, so the
  hidden queue does not leak. (Known divergence D3: the human path currently
  updates it at queue time; scheduled fix in lab Phase 4a.)

Hidden from the opponent:

- Current resource stockpile (derivable only as
  `gained − spent − hidden queue spending`).
- The build queue: contents, count, and readiness.

These rulings come from `AI_ENGINE_QUESTIONS.md` Q1–Q3; the AI must play
through an observation/belief layer (`src/ai/state/observation.ts`) rather
than reading hidden state.

## 9. Victory

- **Elimination:** a player with **zero units on the board** loses, even if
  their build queue is non-empty (no unit ⇒ no anchor ⇒ nothing can ever be
  placed). Deliberate ruling; documented in `src/game/victory.ts`.
- **Draw:** both players simultaneously at zero units (effectively unreachable
  through normal play).
- **Resignation:** the current player may resign; opponent wins. The AI may
  resign hopeless positions (v1.1 §5.1).

## 10. Architecture (orientation, not contract)

- `src/game/` — pure rules engine, React-free: `board.ts` (state, constants,
  heal/reset), `movement.ts` (BFS, multi-action move costs), `combat.ts`
  (damage model, combined attacks), `mining.ts` (well metaphor), `spawning.ts`
  (anchor rectangles), `building.ts` (costs, tech gating, queue), 
  `promotion.ts`, `turn.ts` (phase machine), `victory.ts`, `units.ts`
  (canonical catalog), `elements.ts` (Double-Thick Triangle).
- `src/ai/` — `engine-v2.ts` (`AIEngineV2`): belief-state MCTS. Observation
  layer (`state/`), particle-filter belief over hidden queue/stockpile
  (`belief/`), beam-search plan generation (`planner/`), UCT MCTS over plans
  (`search/`), tactical sharpener (`eval/`). Difficulty presets easy/medium/
  hard scale iterations, beam width, particles, tactical depth.
  `src/ai/simulate.ts` applies AI actions to real state (`APPLY_AI_ACTION`).
- `src/hooks/useGameState.ts` — React reducer for the human path (validation
  + dispatch); `useAI.ts` drives AI turns.
- `tests/` — unit tests per module plus seeded-playout property tests and
  adversarial audit fixtures (`tests/game/properties.test.ts`,
  `tests/game/audit-fixtures.test.ts`).
- `lab/` — balance lab: plan, audit, match harness, bots, experiments.

## 11. Known divergences

Engine/UI/AI divergences from this spec are tracked in
`lab/docs/SPEC_AUDIT.md` (D1–D12) with dispositions; the load-bearing ones
(AI legality bypass D1/D2, `resourcesSpent` leak D3) are scheduled for the
lab's Phase 4a. Design judgment calls made autonomously during the lab are in
`JUDGMENT_LOG.md`.

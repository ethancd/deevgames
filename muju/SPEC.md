# Muju Hono Tanka — Game Specification (Current Rules)

This is the canonical rules specification for Muju Hono Tanka as implemented.
It supersedes the original v1.0 implementation spec (this file's previous
content) and incorporates all v1.1 changes (`docs/v1.1-spec.md`). Where this
document and the code disagree, that is a bug in one of them: see
`lab/docs/SPEC_AUDIT.md` for the clause→code traceability table and the list
of known divergences. The stat tables in §7 are transcriptions of
`src/game/units.ts`, which is the canonical stat source.

**Spec version:** v2.1 (2026-09-09) — two-phase turn, tier-1 purchase,
promotion climb, public economy. Includes v2.0 passive end-of-turn mining
and reserves 4/8/10. All 18 v1.9 unit stats and costs are unchanged; build
times are removed. This is the specification of the tested feature branch,
not a claim that production has been deployed.

History: v1.0 (original design), v1.1 (historical playtest balance pass),
v1.2 (canonical rewrite), v1.3 (role balance), v1.4 (Cleave), v1.5 (tier-3 cap),
v1.6 (upkeep and inactivity draw), v1.7 (Lightning/Metal adjustments),
v1.8 (mandatory T1 upkeep retention), v1.9 (ten-turn draw at turn end),
v2.0 (2026-09-09, passive mining and 4/8/10 reserves), v2.1 (2026-09-09,
public tier-1 purchase and promotion climb). The v2.0/v2.1 changes are
implemented together; v2.0 is not a separately deployed release.

---

## 1. Overview

Muju Hono Tanka is a two-player perfect-information strategy
board game combining territorial control (Go), tactical combat (Chess), and
economic buildup (StarCraft). Players are **White** and **Black**; either seat
may be a human or an AI (`vs-ai`, `pass-play`, and `ai-vs-ai` modes).

- **Six elements, three tiers:** 18 units; tier 3 is terminal.
- **Board:** 10×10 square grid.
- **Start:** White's corner is (0,0); Black's corner is (9,9). Each player
  starts with 3 units adjacent to their corner and 0 resources.
  - White: Hi (fire_1) at (1,0), Sjor (water_1) at (1,1), Muju (plant_1) at (0,1).
  - Black: Hi at (8,9), Sjor at (8,8), Muju at (9,8).
- **Resources:** **Unequal routes (map D, passive revision)**: the same fixed
  180°-rotational layout, with 0/4/8/10 crystals per cell and **520 total**.
  Sixteen blank approaches remain walkable and spawn-eligible. Ordinary ground
  holds 4, shelves 8, rich wells and homes 10. Exact layout:
  `src/game/resourceMap.ts`. Save schema 5 discards older unfinished games
  through the existing version-mismatch path; they start fresh.
- **White moves first.** The first turn begins directly in the Action phase
  (there is nothing to place or promote at game start).

## 2. Turn structure

A turn has two phases:

1. **Place phase** — in any order, buy any number of affordable **tier-1**
   units on legal empty spawn squares, and promote units that were on the
   board at the start of this phase. Each unit can promote at most once this
   turn, never on its purchase/placement turn. Both verbs cost crystals and
   **no actions**. Placed and promoted units act immediately. This phase is
   skipped automatically when no legal purchase or promotion exists.
2. **Action phase** — spend up to **6 shared actions**
   (`MAX_ACTIONS_PER_TURN`) on moves and attacks. Movement can repeat; attacks
   obey Cleave (§4.2). The player may end early.

At the end of the Action phase, resolve passive mining for the mover (§5.1),
then update the inactivity counter and check the ten-quiet-turn draw (§9).
Income cannot be undone: undo is confined to the current turn. There is no
queue phase, including when all six actions have been spent.

If the game continues, start the next player's turn in this order:

- Check their home occupation and existing board elimination (§9).
- Pay upkeep (§5.5). A required keep-set choice pauses here; removing the last
  unit loses by elimination.
- Heal all their units and reset their move, attack, Cleave, placement and
  promotion flags.
- Enter Place, or skip to Action when Place has no legal decisions.

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
- Each attack still costs **one shared action**. Moving between attacks
  is allowed at the normal cost; it neither restores nor consumes attack eligibility.
- If a target survives, the attack chain ends for that unit this turn, including
  a zero-damage hit. A later kill by another unit does not reopen that chain.
- A newly placed Tier I can attack immediately but cannot attack twice.
- Combined attacks resolve individually; only the actual killing blow unlocks Cleave.
- History includes eliminated targets (`attackedThisTurn`); `lastAttackKilled`
  records the result of this unit's last attack. Both reset on its owner's turn.
  Completed human and AI actions, plus undo, save the board and attack allowance
  together. Save schema 5 discards unfinished games from older releases;
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

### 5.1 Mining

At the end of your turn, every one of your units takes crystals from the square it stands on: up to its Mining stat, up to what the square holds.
The take is `min(Mining, reserve)`, reduces that square's reserve by the same amount, and enters your public bank and cumulative income.
This applies unconditionally to moved, attacked, placed and promoted units; Mining 0 takes nothing, reserves never replenish, and there is no mine action or depth.

### 5.2 Buying

- During Place, pay a tier-1 unit's catalogue cost and immediately place it
  on an empty square in an unblocked spawn rectangle (§5.3).
- Buy any number, limited only by crystals and legal empty squares. Buying
  costs no actions. Higher tiers cannot be bought.
- There is no build queue, build time, readiness or separate tech requirement.
  Every tier-2 unit was a tier-1 on the board, and every tier-3 was a tier-2:
  this is structural, enforced by the promotion path, not another prerequisite.
- The bank holds unspent purchasing power when spawns are blocked.

### 5.3 Placement (spawning)
- Newly bought tier-1 units are placed during Place at **no action cost**.
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
  **at most once per turn**, and **not on a turn it was placed**.
  It must have been on the board at the start of Place. A purchased tier-1
  can first become tier-2 on its next own turn and tier-3 one own turn later,
  giving the opponent two turns to contest that climb.
- Promoted units can act immediately. Promotion is public information.

### 5.5 Upkeep

Each turn, before placement, pay 1 crystal for each of your tier-2 units and 2
for each tier-3. Any unit you do not pay for is lost.
Tier1 units are free and must always be kept during upkeep. Payment uses the existing stockpile and no actions.
A promotion pays its new tier's rent beginning next own turn, not retroactively.
Passive income arrives at the end of this turn and can fund rent at the start
of the next own turn.

When the stockpile covers the army, all units are kept and payment is automatic.
Otherwise the place phase opens with a mandatory affordable keep-set choice.
The optional **Review upkeep each turn** menu setting allows voluntary release
of tier2 and tier3 units even when all rent is affordable. Tier1 units cannot
be released. Every legal keep-set must include all owned tier1 units and be
affordable. The empty set is legal only when there are no tier1 units; it loses
if it removes the last on-board unit.
Releases are not attacks: they add no combat history, trigger no Cleave, and
never reset the inactivity clock. Healing and flag reset follow payment.

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

Eighteen units, three per element. Stat columns: ATK / DEF / SPD / MINE / Cost.

The catalogue is exactly v1.9 with build times removed. Tier 3 is terminal.
The historical tier-4 cut and its measured tradeoffs are recorded in
`docs/TIER3_CAP-2026-09-08.md`; those well-economy measurements are not v2.1
balance evidence. Tanka retains Speed 2, Mining 4 and DEF 6.

### Fire (Rush — ATK specialist) — Japanese
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Hi | 2 | 1 | 2 | 1 | 1 |
| 2 | Hono | 3 | 1 | 2 | 1 | 3 |
| 3 | Kagari | 4 | 2 | 3 | 1 | 6 |

### Lightning (Rush — SPD specialist) — Swahili
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Radi | 1 | 1 | 3 | 0 | 1 |
| 2 | Umeme | 2 | 1 | 4 | 0 | 3 |
| 3 | Kimubunga | 3 | 1 | 5 | 0 | 6 |

### Water (Balanced — DEF-leaning) — Norse
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Sjor | 2 | 2 | 1 | 2 | 2 |
| 2 | Straumr | 2 | 3 | 1 | 2 | 4 |
| 3 | Aegirinn | 3 | 4 | 2 | 3 | 10 |

### Shadow (Balanced — ATK/SPD-leaning) — Turkish/Slavic
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Göl | 2 | 2 | 2 | 0 | 2 |
| 2 | Gölge | 3 | 2 | 2 | 1 | 4 |
| 3 | Karanlık | 4 | 2 | 3 | 2 | 10 |

### Plant (Expand — MINE specialist) — Quechua/Nahuatl
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Muju | 0 | 2 | 1 | 3 | 3 |
| 2 | Sachita | 1 | 3 | 1 | 4 | 6 |
| 3 | Sachakuna | 2 | 4 | 1 | 5 | 12 |

### Metal (Expand — DEF specialist) — Lakota
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Inyan | 1 | 3 | 1 | 2 | 3 |
| 2 | Mazask | 2 | 4 | 1 | 3 | 6 |
| 3 | Tanka | 2 | 6 | 2 | 4 | 12 |

The Metal ladder is **Inyan → Mazask → Tanka**. The title names a tier-1, tier-2,
and tier-3 unit: Muju / Hono / Tanka.

Starting units for both players: `fire_1`, `water_1`, `plant_1`.

## 8. Public information

The game is perfect-information. Both players see every unit, position,
tier, damage marker, cell reserve, current bank (`resources`) and cumulative
income (`resourcesGained`). Purchases, promotions, upkeep, the inactivity
counter, pending upkeep choice and settled income are public. The upkeep
subtotal (`resourcesUpkeep`) is telemetry, not an additional charge.

There is no hidden production or hidden spending ledger. In an ordinary game,
`board reserves + White gained + Black gained = 520`; spending changes banks
but never cumulative income. The AI receives the real state and searches it
with ordinary MCTS. The former observation, belief, particle-filter and
re-determinization rules in `AI_ENGINE_QUESTIONS.md` Q1–Q3 are superseded.

## 9. Victory

- **Home occupation:** at the start of your turn, before upkeep, healing,
  placement or promotion, if your unit occupies the opponent's home corner, you win.
  White targets (9,9); Black targets (0,0). Entering the corner does not immediately
  win: the opponent has one full turn to remove the invader. Any element or tier
  qualifies; no additional action, countdown or occupation marker is required.
  An enemy on the home corner blocks every reinforcement rectangle under the
  existing spawning rules. Existing units can still move, attack and promote.
  In simultaneous invasion races, the first player's qualifying turn start wins.
  Loading a current-schema mid-turn position does not retroactively resolve an occupation.

- **Elimination:** a player with **zero units on the board** loses, regardless
  of bank. No units means no spawn anchor. There is no queue exception.
- **Inactivity draw:** after 10 consecutive complete player turns without progress, end the
  game as a draw. A ply means one player's turn, not one action or full round.
  An enemy kill by attack resets
  the counter immediately; positive passive income resets it at turn end.
  A turn with either form of progress ends at 0. Each completed turn with no
  enemy attack kill and zero total income adds 1. Chip attacks, movement,
  buying, placement, promotion and upkeep removal do not themselves reset it. The draw resolves
  immediately at the end of the tenth quiet turn. The next turn never begins:
  no home-win check, upkeep or healing can override the draw.
  Eliminating the last enemy during a turn still wins immediately. Saved draws
  preserve reason `inactivity`. Existing unfinished saves already at 10 or more
  quiet turns load as a draw, preserving the board; completed results stay final.
  The public counter turns amber at 7 quiet turns. Both players at zero units is also a
  draw, though normal play cannot reach that position.
- **Resignation:** the current player may resign; opponent wins. The AI plays out current-rule games: material deficits alone do not establish
  defeat when home occupation can win. Historical elimination-only lab games retain
  the older material-based resignation heuristic.

## 10. Architecture (orientation, not contract)

- `src/game/` contains pure rules: orthogonal movement, combat/Cleave, anchor
  rectangles, tier-1 buying, promotion, upkeep, turn boundaries and victory.
  `mining.ts` owns the shared per-unit take and player income settlement;
  reducer, AI simulations, planning and harness all use the same transition.
  `units.ts` is the canonical 18-unit catalogue.
- `src/game/legality.ts` validates every human and AI gameplay action before
  `src/ai/simulate.ts` applies it. Invalid legacy mine/queue actions are rejected.
- `src/ai/` contains public-state MCTS, beam and placement-template planning,
  evaluation and a tactical sharpener. Worker protocol 2 receives the real
  state. WASM ABI 4 covers bounded tactical movement/attacks and constrained
  promotions; general purchasing/placement is outside its proof scope and
  returns unknown. JS independently validates successful tactical witnesses.
  See `docs/AI_IMPLEMENTATION_STATUS.md` for limits.
- `lab/solver/` models passive finite-cell income, buy/promote financing and
  tactical frontiers. Historical map studies stay frozen under `lab/maps/`.
- UI and tutorial use the catalogue/map constants; saves use schema 5.

## 11. Design intent and evidence

Passive mining makes income a consequence of position, alongside combat,
spawn geometry and home defense. The 4/8/10 scale separates Mining thresholds
across terrain: ordinary Mining 1/2/4 empties in 4/2/1 turns; shelf Mining
2/3/4 in 4/3/2; rich Mining 3/4/5 in 4/3/2. Experts must relocate to sustain
their tempo; foragers can collect while serving another positional purpose.
Rent still applies, and a richer extraction stat is not proof of higher net
strategic value.

The queue's hidden information, build delay, blocked-spawn persistence and
third phase are replaced by a public bank and a visible promotion climb.
No promotion on the purchase turn is load-bearing: the tier-3 path remains
contestable over two opponent turns. Haste, six actions, spawn rectangles,
the exact map topology and all catalogue stats/costs remain unchanged.

See `JUDGMENT_LOG.md` J-017/J-018 and the two September 9 simplification
reports for decisions, verification and registered future studies. Existing
opening/rush concerns remain hypotheses; implementation does not establish
fairness or rule out a first-player advantage.

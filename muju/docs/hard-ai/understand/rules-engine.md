# The canonical Muju rules engine and its API

Foundation document for a fast deterministic search engine.
Written 2026-09-14 against the worktree `/Users/ashkie/src/deevgames-muju-hardai`
(branch `claude/muju-hard-ai`, HEAD `44c41c4` = snapshot of the uncommitted v2.8 tree of 2026-09-13/14).

Every claim below is tagged:

- **[code]** — read directly out of the TypeScript in this worktree, with `path:line`.
- **[spec]** — asserted by `muju/SPEC.md` or `muju/lab/docs/SPEC_AUDIT.md`, not independently re-derived.
- **[test]** — pinned by a test under `muju/tests/`.
- **[inference]** — my reasoning from the code; not directly asserted anywhere and not (as far as I found) covered by a test.

All paths are relative to `/Users/ashkie/src/deevgames-muju-hardai/muju/`.

---

## 0. Orientation: where the rules actually live

`src/game/` is 22 files / 2 819 lines of pure rules **[code]**. But the *authoritative transition function is
not in `src/game/`* — it is `applyAction` in `src/ai/simulate.ts:25` **[code]**. `src/game/` supplies the
predicates and the per-mechanic mutators; `simulate.ts` is the only thing that wires them into a legal-move
gate + state machine + checkmate adjudication.

```
src/ai/simulate.ts:25   applyAction(state, action)          <- THE transition. UI, online server, AI, lab all call this.
src/ai/simulate.ts:38   transitionWithoutCheckmate(...)      <- same, minus home-checkmate adjudication (used inside the prover)
src/game/legality.ts:16 isLegalAction(state, action, player) <- THE legality gate
src/ai/moves.ts:72      generateAllActions(state, player)    <- THE move generator
```

Confirmed call sites: `src/hooks/useGameState.ts:10,65-87` (React reducer), `server/rooms.ts:12-13,519-522`
(authoritative online server), `lab/harness/runner.ts` (experiment harness) **[code]**.
`SPEC.md:391-392` says the same thing **[spec]**.

`src/game/homeCheckmate.ts` and `src/ai/simulate.ts` are mutually recursive by dependency injection:
`applyAction` passes `transitionWithoutCheckmate` into `resolveHomeCheckmate` as the `Transition` argument
(`src/ai/simulate.ts:29,33`; type at `src/game/homeCheckmate.ts:11`) **[code]**.

---

## 1. `GameState` shape (`src/game/types.ts`), field by field

### 1.1 `GameState` (`types.ts:120-148`)

| Field | Type | Mutability / role |
|---|---|---|
| `actionsPerTurn?` | `4` | Match-level constant. Only `4` validates (`rules.ts:11-13`). Read through `getActionsPerTurn(state)` (`rules.ts:16-18`), which defaults to 4 when absent. **Never changes during a match.** |
| `blackCrystalHandicap?` | `0..20` | Set once at `createInitialGameState`; survives `RESET_GAME` (`useGameState.ts:90`). Validated by `isBlackCrystalHandicap` (`rules.ts:5-7`, `MAX_BLACK_CRYSTAL_HANDICAP = 20` at `rules.ts:3`). |
| `lastIncome?` | `{player, turnNumber, total, takes: IncomeTake[]}` | **Derived telemetry**, rewritten by `endOfTurnIncome` (`mining.ts:32`). Read by the move-history/analysis layer (`moveHistory.ts:86-95`). Search can drop it. |
| `victoryRule?` | `'elimination' \| 'home-or-elimination'` | Absent ⇒ current rules (home victory ON). Only the literal `'elimination'` disables home rules (`turn.ts:23`, `homeCheckmate.ts:173`, `victory.ts:116`). |
| `victoryReason?` | `VictoryReason` | Written at terminal transitions. Union at `types.ts:116`: `'elimination' \| 'home-occupation' \| 'home-checkmate' \| 'resignation' \| 'inactivity' \| 'upkeep-elimination' \| 'timeout'`. `'timeout'` is produced only by the online clock (`server/rooms.ts:139`), never by `src/game`. |
| `upkeepPending?` | `boolean` | **Hard gate.** While true the only legal actions are `PAY_UPKEEP` and `RESIGN` (`legality.ts:18-19`). |
| `reviewUpkeep?` | `Partial<Record<PlayerId,boolean>>` | Per-player *preference*: when set, upkeep always pauses for a manual keep-set even if affordable (`turn.ts:32`). Persisted; changed only by the UI action `SET_UPKEEP_REVIEW` (`useGameState.ts:63`). |
| `lastUpkeep?` | `{player, paid, released[], turnNumber}` | Derived telemetry from `settleUpkeep` (`upkeep.ts:28`). Also load-bearing for one thing: `automaticUpkeepUndo` (`turn.ts:38-49`) uses it to decide whether the incoming player's automatic upkeep can be undone. |
| `inactivityPlies?` | `number` | The draw clock. Mutated at every `endTurn` (`turn.ts:97`) and zeroed by any attack kill (`simulate.ts:101`). |
| `progressThisTurn?` | `boolean` | True only after an attack killed an enemy **this turn** (`simulate.ts:101`); cleared by `endTurn` (`turn.ts:98`). |
| `inactivityRule?` | `'on' \| 'off'` | Lab knob. `'off'` disables the draw entirely (`inactivity.ts:8`). |
| `phase` | `'setup' \| 'playing' \| 'victory'` | `'setup'` is never produced by `src/game` — `createInitialGameState` starts at `'playing'` (`board.ts:248`). Search only sees `playing`/`victory`. |
| `board` | `BoardState` | See §1.2. |
| `players` | `{white: PlayerState; black: PlayerState}` | See §1.3. |
| `turn` | `TurnState` | See §1.4. |
| `winner` | `PlayerId \| null` | `null` + `phase==='victory'` ⇒ draw (`victory.ts:110`). |
| `selectedUnit` | `string \| null` | **Pure presentation.** Cleared on every successful transition (`simulate.ts:41`). |
| `validMoves` | `Position[]` | Pure presentation, cleared likewise. |
| `validAttacks` | `Position[]` | Pure presentation, cleared likewise. |

`selectedUnit`/`validMoves`/`validAttacks` exist only so the React board can highlight. A search engine should
never carry them; `properties.test.ts:17` proves the reducer and the engine agree once they are cleared **[test]**.

### 1.2 `BoardState` (`types.ts:85-90`)

- `cells: Cell[][]` — indexed `cells[y][x]` (`board.ts:53`), 10×10. `Cell = {position, resourceLayers}` (`types.ts:80-83`); `resourceLayers` is the remaining crystal reserve, `0..16` (`resourceMap.ts:5` `MAX_RESOURCE_RESERVE = 16`).
- `initialResourceLayers?: readonly number[]` — flat length-100 capacity vector, copied at creation (`board.ts:208`). Used only by conservation checks (`lab/harness/invariants.ts:40-59`). Immutable for the life of the game; **this is what makes resumed games keep their old map** (`resource-map.test.ts:23-38`) **[test]**.
- `units: Unit[]` — a flat array, **order is load-bearing in one place only**: `nextUnitId` scans it (`simulate.ts:15`) and the home-checkmate prover indexes it (`homeCheckmate.ts:87`).

Occupancy is *not* indexed. `getUnitAt` is a linear `find` over `board.units` (`board.ts:66-71`). This is the single
biggest performance smell in the engine (§7.3).

### 1.3 `PlayerState` (`types.ts:107-114`)

| Field | Role |
|---|---|
| `id` | `'white' \| 'black'` |
| `resources` | The public bank. Spent by `BUY_UNIT` (`simulate.ts:127`), `PROMOTE_UNIT` (`simulate.ts:169`), `PAY_UPKEEP` (`upkeep.ts:30`). Gained only by mining (`mining.ts:31`). |
| `startCorner` | `{0,0}` for white, `{9,9}` for black (`board.ts:175-177`). Constant. |
| `resourcesGained` | Cumulative income, monotone. Load-bearing for the conservation invariant `gained + remaining === initial total` (`lab/harness/invariants.ts:55-59`). |
| `resourcesUpkeep?` | Cumulative upkeep paid — pure telemetry (`SPEC.md:343-344`) **[spec]**. |

### 1.4 `TurnState` (`types.ts:96-101`) — the turn phase machine

```
currentPlayer : 'white' | 'black'
phase         : 'place' | 'action'      <- only two phases; there is no queue phase (SPEC.md:93-94)
actionsRemaining : number               <- comment says "0-6"; in practice 0..4
turnNumber    : number                  <- a ROUND counter, not a ply counter
```

`turnNumber` increments **only when the turn passes back to White** (`turn.ts:102-103`:
`turnNumber + (next === 'white' ? 1 : 0)`) **[code]**, matching `SPEC.md:135` **[spec]**. So White's turn *n*
and Black's turn *n* share `turnNumber === n`, and ten quiet plies = five rounds (`SPEC.md:369-370`).

### 1.5 `Unit` (`types.ts:57-76`) and the per-unit flags

| Flag | Written where | Read where | Reset where | Verdict for a compact engine |
|---|---|---|---|---|
| `id` | `board.ts:104` (initial) / `simulate.ts:14-20` (bought) | everywhere | — | See §1.6. |
| `definitionId` | changed only by promotion (`simulate.ts:157`, `promotion.ts:97`) | everywhere | — | 5 bits (index 0..17). |
| `owner` | never changes | — | — | 1 bit. |
| `position` | `applyMove` (`simulate.ts:87`) | — | — | 7 bits (0..99). |
| `hasMoved` | `simulate.ts:87`, `movement.ts:60`, `moveHistory.ts:124` | **nowhere** | `board.ts:281` | **Write-only. No rule reads it.** Drop it. **[code]** (grep over `src/`+`server/` finds only writes). |
| `hasAttacked` | `combat.ts:139` | only `getAttackCount` (`combat.ts:9`) as a legacy-save fallback | `board.ts:282` | Subsumed by an attack counter. |
| `canActThisTurn` | `board.ts:111` (ctor, default `true`), `board.ts:284`, `building.ts:13` | `movement.ts:17`, `combat.ts:15`, `legality.ts:39`, `turn.ts:137`, `moves.ts:20,39` | `board.ts:284` | **Never set to `false` anywhere in `src/`.** It is effectively always `true` in a real game. **[code]** **[inference]** — it survives as a hook for a never-shipped summoning-sickness rule (`types.ts:66` comment). |
| `damageTaken` | `combat.ts:158` (`+= attackPower`) | `calculateDefense` (`combat.ts:106-109`) | `board.ts:287` — **at the start of the owner's turn** | 0..4 (see §1.7). |
| `promotedThisPlacement?` | `simulate.ts:157`, `promotion.ts:97` | `canPromote` (`promotion.ts:49-51`) | `board.ts:286` | 1 bit. Despite the name, reset is **per turn**, not per place phase. |
| `placedThisTurn?` | `building.ts:14` (always `true` on purchase) | `canPromote` (`promotion.ts:45-47`), `simulate.ts:135` | `board.ts:285` | 1 bit. |
| `attackedThisTurn?: string[]` | `combat.ts:140` (push target id) | `getAttackCount` (`combat.ts:9`), `getValidAttacks` (`combat.ts:34`), `findAttackApproach` (`movement.ts:69`) | `board.ts:288` (`[]`) | See §1.7 — **redundant with a counter in reachable states**. |
| `lastAttackKilled?` | `combat.ts:142` (`attackPower >= defenseValue`) | `canAttack` (`combat.ts:16`) | `board.ts:283` (`false`) | 1 bit. |

### 1.6 Entity id scheme — **two different schemes, one of them nondeterministic**

- **Starting units** (`board.ts:104`): `` `${owner}_${definitionId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}` `` — e.g. `white_fire_1_1757800000000_k3a9z`. **Wall-clock + RNG.** **[code]**
- **Purchased units** (`simulate.ts:14-20`): `` `unit-${currentPlayer}-${turnNumber}-${n}` `` where `n` is the smallest integer not already in use. Deterministic and reproducible across the reducer, worker and every simulated state (comment at `simulate.ts:13`). **[code]**

Consequence for search: **never hash a position by unit id.** The home-checkmate prover already avoids this — it
builds a positional key from unit *indices* into the root `board.units` array, not ids (`homeCheckmate.ts:87-89`)
**[code]**. The online server's position digest, by contrast, does hash ids indirectly through `attackedThisTurn`
(`server/analysis/core.ts:102`).

### 1.7 Two derivable pieces of state

**(a) `attackedThisTurn` is redundant. [inference]**
`canAttack` (`combat.ts:13-17`) requires `count === 0 || lastAttackKilled === true`. So a unit's attack chain
continues only if *every* attack so far was lethal, which means every id in `attackedThisTurn` names a unit that has
been removed from the board. `getValidAttacks` only ever filters `attackedThisTurn` against *adjacent live enemies*
(`combat.ts:31-36`), so in any reachable state the filter is a no-op. A compact engine can replace the array with
`attackCount: 0..3`. (Caveat: `resolveCombinedCombat` is called directly with a duplicated attacker id in
`cleave.test.ts:96` — but that helper is not reachable from `applyAction`.)

**(b) A live unit's effective DEF is never 0. [inference]**
`resolveCombat` (`combat.ts:148`) eliminates whenever `attackPower >= defenseValue`, so a survivor always has
`damageTaken + attackPower < DEF`, i.e. `damageTaken < DEF` and `DEF_eff >= 1`. Therefore a 0-power attack
(Muju vs anything not water/shadow; Radi vs water/shadow) can *never* kill, only burn an action. `cleave.test.ts:63-69`
pins the zero-damage case: 1 action spent, 0 damage applied, chain closed **[test]**. And `damageTaken` is bounded by
`max DEF − 1 = 4` (Tanka).

---

## 2. The turn lifecycle, in exact order

### 2.1 End of the mover's turn — `endTurn` (`turn.ts:92-104`)

```
endTurn(state):
  0. guard: state.phase !== 'playing' || state.upkeepPending  -> return state unchanged   (turn.ts:93)
  1. endOfTurnIncome(state, mover)                            -> passive mining           (turn.ts:95, mining.ts:18)
  2. inactivityPlies = progressThisTurn ? 0 : plies + 1 ; progressThisTurn = false        (turn.ts:97-98)
  3. resolveInactivityDraw(...)  -> if plies >= 10 and rule not 'off': DRAW, return       (turn.ts:96, inactivity.ts:7-11)
  4. next = opponent(mover); turnNumber += (next === 'white' ? 1 : 0)                     (turn.ts:102-103)
  5. startTurn(nextState, next)
```

`turn.test.ts:35-41` and `upkeep-draw.test.ts:79-86` pin this order: income is settled *before* the draw, and the
draw beats the next player's home-occupation win and upkeep **[test]**.

### 2.2 Start of the incoming player's turn — `startTurn` (`turn.ts:19-34`)

```
startTurn(state, player):
  a. if state.phase === 'victory' -> return unchanged                                     (turn.ts:22)
  b. HOME-OCCUPATION VICTORY: if victoryRule !== 'elimination' and getHomeOccupier(board, player)
        -> phase='victory', winner=player, reason='home-occupation'
           (turn set to {player, phase:'place', actionsRemaining:4})                      (turn.ts:23-27)
  c. ELIMINATION CHECK on the board -> victory / draw, reason='elimination'               (turn.ts:28-29)
  d. pending = {...state, upkeepPending:true, turn:{player, phase:'place', actionsRemaining:4}}  (turn.ts:30)
  e. due = upkeepDue(pending, player)                                                     (turn.ts:31, upkeep.ts:14-16)
     if due > player's resources  OR  reviewUpkeep[player]  -> STOP HERE, return pending  (turn.ts:32)
     else auto-pay by keeping everything: completeUpkeep(pending, all own unit ids)       (turn.ts:33)
```

Note **b before c**: a player who occupies the enemy corner wins at their turn start even before elimination is
looked at. `home-victory.test.ts:41-44` pins the simultaneous-invasion race: whoever's turn starts first wins **[test]**.

`getHomeOccupier(board, invader)` (`victory.ts:103-106`): white's target corner is `(9,9)`, black's is `(0,0)`
(the code computes `corner = invader === 'white' ? cells.length - 1 : 0` and requires `x === y === corner`).

### 2.3 Upkeep settlement — `completeUpkeep` (`turn.ts:53-57`) → `settleUpkeep` (`upkeep.ts:23-31`)

- Schedule: `UPKEEP_BY_TIER = {1:0, 2:1, 3:2, 4:3}` (`upkeep.ts:5`). Tier 4 no longer exists in the catalogue; the
  entry is legacy. `upkeep-draw.test.ts:21` pins `[0,1,2,3]` **[test]**.
- Lab-only variants (`upkeep.ts:9-11`): `'steep'` `{1:0,2:1,3:3,4:5}`, `'off'` `{}`. **Process-global mutable state** (§7.5).
- Keep-set legality (`isUpkeepSelectionLegal`, `upkeep.ts:17-21`): requires `upkeepPending`, `turn.phase === 'place'`,
  no duplicate ids, **every owned tier-1 unit present**, every id owned by the current player, and total rent of the
  kept set `<= resources`.
- `settleUpkeep` releases every owned **tier ≥ 2** unit not in the keep set, charges the rent of the kept set,
  bumps `resourcesUpkeep`, and writes `lastUpkeep`. Tier-1 units are never releasable (`upkeep.ts:25`).
- `completeUpkeep` then re-runs `checkVictory`; an army wiped out by release loses with reason
  `'upkeep-elimination'` (`turn.ts:55`, pinned by `upkeep-draw.test.ts:38-40`) **[test]**.

### 2.4 Heal + flag reset — `finishTurnStart` (`turn.ts:59-64`) → `resetUnitActions` (`board.ts:267-294`)

For **every unit owned by the incoming player**, set:
`hasMoved=false, hasAttacked=false, lastAttackKilled=false, canActThisTurn=true, placedThisTurn=false,
promotedThisPlacement=false, damageTaken=0, attackedThisTurn=[]`.
Enemy units are untouched (`turn.test.ts:14-19` pins object identity for the opponent's units) **[test]**.

**This is the "chip damage heals at the owner's turn start" rule** (`SPEC.md:179-183`). It happens **after** upkeep,
so a pending keep-set choice freezes the damage (`upkeep-draw.test.ts:28-33`) **[test]**.

### 2.5 Place-phase auto-skip

```
finishTurnStart: canActInPlacePhase(next, player) ? next : startActionPhase(next)     (turn.ts:63)
canActInPlacePhase(state, player):                                                    (turn.ts:141-145)
    upkeepPending                                     -> true
 || (getAffordablePurchases(resources).length > 0
      && getAllSpawnPositions(player, board).length > 0)
 || getPromotableUnits(board, player, {crystals: resources}).length > 0
```

`startActionPhase` (`turn.ts:66-69`) refuses while `upkeepPending` or when already in `action`, and **resets
`actionsRemaining` to 4**.

The same test runs again **after every purchase and promotion**: `finishPlacement` (`simulate.ts:118-120`) flips
the state into the action phase the moment nothing affordable remains. So `END_PLACE_PHASE` is frequently *not*
legal — a practical trap recorded in the operator napkin (`docs/hard-ai/understand/napkin-snapshot.md`:
"Send `END_PLACE_PHASE` only when `turn.phase` is `place` AND a purchase/promotion is still affordable") **[code]** **[spec]**.

Corollary for the handicap: Black with 1–2 crystals skips Place on turn 1 (cheapest tier-1 costs 3); with 3–20 it
enters Place. `crystal-handicap.test.ts:16` pins exactly that **[test]**, matching `SPEC.md:70-72` **[spec]**.

### 2.6 Action phase

4 shared actions (`rules.ts:9`, `board.ts:19`). `useAction` decrements by one with a floor at 0 (`turn.ts:74-81`).
A multi-action move charges its cost by calling `useAction` in a loop (`simulate.ts:94`).
`canCurrentPlayerAct` (`turn.ts:130-138`) additionally requires `phase === 'action'`, `actionsRemaining > 0`, and at
least one own unit with `canActThisTurn`.

### 2.7 Game start

`createInitialGameState` (`board.ts:203-261`): White `resources = 0`, Black `resources = blackCrystalHandicap`,
`turn = {currentPlayer:'white', phase:'action', actionsRemaining:4, turnNumber:1}`, `inactivityPlies = 0`,
`progressThisTurn = false`, `phase = 'playing'`. **The first turn starts directly in the Action phase**
(`board.ts:240` comment; White has nothing to buy) **[code]**, matching `SPEC.md:74-75` **[spec]**.

Starting units (`units.ts:288`, `board.ts:184-198`): `fire_1, water_1, plant_1` for both sides.
White: Hi (1,0), Sjor (1,1), Muju (0,1). Black: Hi (8,9), Sjor (8,8), Muju (9,8).
First-turn income is therefore `1 + 2 + 3 = 6` on the 8-crystal home cluster — pinned at `turn.test.ts:10` **[test]**.

---

## 3. Every action type and its legality predicate

`AIAction` (`src/ai/types.ts:13-21`) is the complete engine vocabulary — **8 variants**:
`MOVE, ATTACK, END_PLACE_PHASE, END_ACTION_PHASE, BUY_UNIT, PROMOTE_UNIT, PAY_UPKEEP, RESIGN`.

`GameAction` (`types.ts:152-166`) adds UI-only wrappers (`SELECT_UNIT`, `DESELECT`, `SET_UPKEEP_REVIEW`,
`APPLY_AI_ACTION`, `RESET_GAME`, `RESTORE_STATE`) that never reach the engine.

### 3.0 Global gates — `isLegalAction` (`legality.ts:16-47`)

```
if (state.phase !== 'playing' || state.turn.currentPlayer !== player) return false;      // :17
if (action.type === 'PAY_UPKEEP') return isUpkeepSelectionLegal(state, keepUnitIds);     // :18
if (state.upkeepPending) return action.type === 'RESIGN';                                // :19
```

So during a pending upkeep choice, **only `PAY_UPKEEP` and `RESIGN` are legal** — `upkeep-draw.test.ts:31` pins
that `END_PLACE_PHASE`, `PROMOTE_UNIT` and `END_ACTION_PHASE` are all rejected **[test]**.

`applyAction` returns the **identical object** (`===`) on rejection, charging nothing (`simulate.ts:26`,
comment at `simulate.ts:23-24`). That reference-equality contract is used as the rejection signal throughout
(`simulate.ts:30,33,41,182`; `homeCheckmate.ts:104,114`) **[code]**.

### 3.1 `MOVE {unitId, to}`

Legality (`legality.ts:36-45`):
- `phase === 'action'` and `actionsRemaining > 0`
- unit exists, is owned by `player`, and `canActThisTurn`
- `to` is an integral in-bounds position
- `cost = getMoveCost(unit.position, to, speed, board)` is non-null, `> 0`, and `<= actionsRemaining`

`getMoveCost` (`movement.ts:226-234`) = `ceil(bfsDistance / speed)`; returns `null` when the BFS distance is `-1`
(unreachable) or `0` (own square). BFS (`movement.ts:240-257`) is 4-neighbour orthogonal over **unoccupied**
squares only — **both sides' units block movement and block the destination**; there is no capture-by-move and
no zone of control (`SPEC.md:145-146`) **[spec]**, pinned by `movement.test.ts:109-135` **[test]**.

Neighbour expansion order is fixed: **up, down, left, right** (`movement.ts:251`, and again at `movement.ts:119-124`
for `findPath`) — this is what makes "equal-length routes use stable orthogonal neighbor order" deterministic
(`SPEC.md:101-102`) **[spec]**.

Execution (`applyMove`, `simulate.ts:83-96`): sets `position` and `hasMoved`, then charges `cost` actions one at a
time. Note the cost is recomputed on the **pre-move** board, and `useAction` floors at zero — legality already
guarantees it fits.

**Important asymmetry:** `getValidMoves` (`movement.ts:29-32`) returns only squares within **one** action
(`distance <= speed`), while `isLegalAction` permits moves costing up to `actionsRemaining`. So the shipped move
generator under-generates. `SPEC_AUDIT.md:11` calls this out as D10: "exact movement is legal even when a planner
emits short steps" **[spec]**. **[inference]** This is safe for completeness: a *k*-action move along a BFS shortest
path can always be split into *k* hops of at most `speed` squares each, every intermediate square is on the free
path and therefore a legal one-action destination, and the total cost is identical (`ceil(d/s)` hops). Decomposition
is in fact *strictly more expressive*, because you may attack between hops. The home-checkmate prover relies on
exactly this argument (`homeCheckmate.ts:108-109` comment) **[code]**.

### 3.2 `ATTACK {unitId, targetPosition}`

Legality (`legality.ts:40-41` + `combat.ts:23-41`):
- action-phase gates as above (`actionsRemaining > 0`, owned, `canActThisTurn`)
- `targetPosition` is **orthogonally adjacent** (`getAdjacentPositions`, `board.ts:313-324`; Manhattan distance 1). No diagonals (`combat.test.ts:113-123`) **[test]**.
- the target square holds an **enemy** unit
- `canAttack(unit)` (`combat.ts:13-17`): `canActThisTurn && attackCount < tier && (attackCount === 0 || lastAttackKilled === true)`
- the target is not already in `attackedThisTurn`

Resolution (`resolveCombat`, `combat.ts:117-164`):

```
attackPower  = max(0, ATK(attacker) + elementModifier(attackerElem, defenderElem) + combatHandicap[owner])   (combat.ts:80-91)
defenseValue = max(0, DEF(defender) - defender.damageTaken)                                                  (combat.ts:106-109)
attacker.hasAttacked = true; attacker.attackedThisTurn.push(defender.id);
attacker.lastAttackKilled = (attackPower >= defenseValue);
if (attackPower >= defenseValue)  -> defender removed from board
else                              -> defender.damageTaken += attackPower
```

Element modifier: **±1 on ATK only, never on DEF** (`elements.ts:103-114`, `SPEC.md:154-155`).
**DEF floor is 0** and **ATK floor is 0** (`combat.ts:90,108`), but see §1.7(b): a live unit's `DEF_eff >= 1`.

Post-attack bookkeeping in `applyAttack` (`simulate.ts:98-116`):
- a kill sets `inactivityPlies = 0` and `progressThisTurn = true` (`simulate.ts:101`)
- 1 action is charged regardless of damage (`simulate.ts:101`; `cleave.test.ts:66` pins the 0-damage case) **[test]**
- `checkVictory(newBoard)` → immediate `'elimination'` victory if the defender ran out of units (`simulate.ts:104-113`)

**Cleave chain rules by tier** (`SPEC.md:157-171`, verified against `combat.ts:13-17`):

| Tier | Max attacks/turn | Unlock condition |
|---|---|---|
| I | 1 | — |
| II | 2 | previous attack killed |
| III | 3 | every previous attack killed |

Each attack costs one shared action (so a Tier III can spend at most 3 of the turn's 4). Moving between attacks
neither restores nor consumes eligibility (`cleave.test.ts:70-80`) **[test]**. A non-lethal hit — **including a
0-damage hit** — permanently ends that unit's chain for the turn; another unit finishing the target does **not**
reopen it (`cleave.test.ts:53-62`) **[test]**. `tier3-cap.test.ts:17-25` pins the 1/2/3 cap for all 18 catalogue
entries **[test]**.

### 3.3 `BUY_UNIT {definitionId, position}`

Legality (`legality.ts:26-30`):
- `phase === 'place'`
- the definition exists and **`def.tier === 1`** (higher tiers can never be purchased — `building.ts:8`, `SPEC.md:198-199`)
- `resources >= def.cost`
- `position` is integral/in-bounds and `isValidSpawnPosition(position, player, board)`

**Spawn rectangle** (`spawning.ts:8-29`): the axis-aligned rectangle spanning `[min..max]` in x and y between the
player's **start corner** and **any friendly unit used as anchor**, inclusive of both corners. Area for a white
anchor at `(a,b)` is `(a+1)(b+1)`; for a black anchor, `(10−a)(10−b)`.

**Blocking** (`spawning.ts:34-46`): if **any enemy unit** stands anywhere inside a rectangle, that anchor is dead —
the whole rectangle, not just the occupied square (`spawning.ts:74-75`). `isValidSpawnPosition` (`spawning.ts:123-153`)
succeeds if the square is **empty** and **at least one** of the player's units yields an unblocked rectangle
containing it. `getSpawnInvalidReason` (`spawning.ts:159-201`) distinguishes `'occupied' | 'enemy_blocking' | 'outside_control'`.

Crucial consequence: **an enemy on your home corner blocks every rectangle you own**, because every rectangle
contains the corner (`SPEC.md:360-361`) **[spec]**, verified by `home-victory.test.ts:19` and
`home-checkmate.test.ts:27` (`getAllSpawnPositions(defender, board)` is empty) **[test]**. The home-checkmate prover
depends on this to justify ignoring purchases (`homeCheckmate.ts:52-53`).

Blank (0-crystal) squares are ordinary ground: **walkable and spawn-eligible** — nothing in `spawning.ts` or
`movement.ts` reads `resourceLayers` (`SPEC.md:53-54`) **[spec]** **[code]**.

Execution (`applyBuyUnit`, `simulate.ts:122-128` + `createUnitFromDefinition`, `building.ts:11-14`): pays the cost,
appends a unit with `placedThisTurn: true`, `canActThisTurn: true`, `damageTaken: 0`, id from `nextUnitId`.
**Costs no actions**, and the unit can move/attack immediately (`cleave.test.ts:38-52`) **[test]**.
Then `finishPlacement` may auto-advance the phase (§2.5).

### 3.4 `PROMOTE_UNIT {unitId}`

Legality (`legality.ts:31-35` + `canPromote`, `promotion.ts:44-58`):
- `phase === 'place'`; unit exists and is owned by `player`
- `!unit.placedThisTurn` — **never on the turn it was bought**
- `!unit.promotedThisPlacement` — **at most once per turn**
- a next-tier definition exists (T3 is terminal)
- `resources >= cost`, where `cost = nextDef.cost − currentDef.cost`

Because `getPromotionCost` is a cost *difference* (`units.ts:278-283`, `promotion.ts:9-23`) and tier-1 costs are
3/4/5 with +4/+12 steps, the ladder is uniformly **4 crystals T1→T2 and 8 crystals T2→T3** for all six elements
(`SPEC.md:216-217`; `promotion.test.ts:34-54`) **[test]**.

Execution (`applyPromoteUnit`, `simulate.ts:130-173`): rewrites `definitionId`, sets `promotedThisPlacement`,
deducts the cost. **No action cost**; the promoted unit acts immediately.
`expansion-economy.test.ts:18` pins `actionsRemaining === 4` after a promotion **[test]**.

Rent timing: `upkeepDue` is evaluated at the *start* of a turn, so a unit promoted during turn *n*'s Place phase
first pays its new tier's rent at the start of turn *n+1* (`turn.test.ts:20-25`: promote Hi→Hono for 4, bank 0,
collect 6, pay 1, bank 5) **[test]**, matching `SPEC.md:230` **[spec]**.

### 3.5 `PAY_UPKEEP {keepUnitIds}`

See §2.3. Legality is `isUpkeepSelectionLegal` (`upkeep.ts:17-21`) and is checked *before* the `upkeepPending`
gate (`legality.ts:18`), so it is the only way out of a pending upkeep other than resigning.
`upkeep-draw.test.ts:34-37` pins rejection of foreign / missing / duplicated / unaffordable id sets **[test]**.

### 3.6 `END_PLACE_PHASE` / `END_ACTION_PHASE`

- `END_PLACE_PHASE` — legal iff `phase === 'place'` (`legality.ts:24`); applies `startActionPhase` (`simulate.ts:54`), which resets `actionsRemaining` to 4.
- `END_ACTION_PHASE` — legal iff `phase === 'action'` (`legality.ts:25`); applies `endTurn` (`simulate.ts:57`). **Always legal in the action phase**, including with 0 actions left — there is no queue phase.

`applyAction` gives `END_ACTION_PHASE` special treatment: it adjudicates home checkmate on the **pre-endTurn**
state first, and returns immediately if that produces a win (`simulate.ts:28-31`).

### 3.7 `RESIGN`

Legal in any `phase === 'playing'` state for the current player, including during a pending upkeep
(`legality.ts:19,23`). `applyResign` (`simulate.ts:73-81`) hands the win to the opponent with reason `'resignation'`.

### 3.8 The "move-and-attack" combined action — **not an engine action**

There is no combined action in `AIAction`. It exists in exactly two places, both as a *pair* of ordinary actions:

- Local UI: `LocalAction` variant `MOVE_AND_ATTACK` in `src/hooks/useGameState.ts:14`, handled at `:68-74`, which
  calls `applyAIAction(MOVE)` then `applyAIAction(ATTACK)` and **rolls the whole thing back to the original state
  object if the attack is rejected** (`useGameState.ts:73`; pinned by `attack-approach.test.ts:27-31`) **[test]**.
  It is one undo step (`useGameState.ts:17-25,139-145`).
- Online: `moveAndAttack` dispatches the two-element array `[{MOVE},{ATTACK}]` as one atomic request
  (`src/online/useOnlineGame.ts:92-94`); the server applies them in order through the same `applyAction`
  (`server/rooms.ts:504-522`).

The UI-side *preview* helper is `findAttackApproach` (`movement.ts:68-79`): the shortest unblocked path to a square
adjacent to the target that leaves one action for the attack — `findPath(..., (actions−1) * speed)`. It returns `[]`
when already adjacent and `null` when impossible, and respects Cleave state (`attack-approach.test.ts`) **[test]**.

**A search engine should ignore it entirely** and search `MOVE` then `ATTACK` as separate plies.

---

## 4. The unit catalogue (`src/game/units.ts`)

### 4.1 The 18 units

18 entries, 3 per element (`units.ts:5-233`). `tier3-cap.test.ts:13-16` pins the whole table against
`lab/solver/baseline-v1.3.json` **[test]**. Upkeep column from `upkeep.ts:5`.
The last three columns are the effective ATK against a defender the attacker beats / is neutral to / loses to.

| Unit | Element | Tier | Cost | ATK | DEF | SPD | MINE | Upkeep | ATK vs weak (+1) | vs neutral | vs strong (−1) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Hi | fire | 1 | 3 | 2 | 1 | 2 | 1 | 0 | 3 | 2 | 1 |
| Hono | fire | 2 | 7 | 3 | 1 | 2 | 1 | 1 | 4 | 3 | 2 |
| Kagari | fire | 3 | 15 | 4 | 2 | 3 | 1 | 2 | 5 | 4 | 3 |
| Radi | lightning | 1 | 3 | 1 | 1 | 3 | 0 | 0 | 2 | 1 | 0 |
| Umeme | lightning | 2 | 7 | 2 | 1 | 4 | 0 | 1 | 3 | 2 | 1 |
| Kimubunga | lightning | 3 | 15 | 3 | 1 | 5 | 0 | 2 | 4 | 3 | 2 |
| Sjor | water | 1 | 4 | 2 | 2 | 1 | 2 | 0 | 3 | 2 | 1 |
| Straumr | water | 2 | 8 | 2 | 3 | 1 | 2 | 1 | 3 | 2 | 1 |
| Aegirinn | water | 3 | 16 | 3 | 4 | 2 | 3 | 2 | 4 | 3 | 2 |
| Göl | shadow | 1 | 4 | 2 | 2 | 2 | 0 | 0 | 3 | 2 | 1 |
| Gölge | shadow | 2 | 8 | 3 | 2 | 2 | 1 | 1 | 4 | 3 | 2 |
| Karanlık | shadow | 3 | 16 | 4 | 2 | 3 | 2 | 2 | 5 | 4 | 3 |
| Muju | plant | 1 | 5 | 0 | 3 | 1 | 3 | 0 | 1 | 0 | 0 |
| Sachita | plant | 2 | 9 | 1 | 3 | 1 | 5 | 1 | 2 | 1 | 0 |
| Sachakuna | plant | 3 | 17 | 2 | 4 | 1 | 8 | 2 | 3 | 2 | 1 |
| Inyan | metal | 1 | 5 | 1 | 3 | 1 | 2 | 0 | 2 | 1 | 0 |
| Mazask | metal | 2 | 9 | 2 | 4 | 1 | 3 | 1 | 3 | 2 | 1 |
| Tanka | metal | 3 | 17 | 2 | 5 | 2 | 4 | 2 | 3 | 2 | 1 |

Archetypes (`units.ts`): fire & lightning = `rush`; water & shadow = `balanced`; plant & metal = `expand`.

### 4.2 Promotion ladders, with names

| Element | T1 | → 4 ◆ → | T2 | → 8 ◆ → | T3 |
|---|---|---|---|---|---|
| fire | **Hi** | | **Hono** | | **Kagari** |
| lightning | **Radi** | | **Umeme** | | **Kimubunga** |
| water | **Sjor** | | **Straumr** | | **Aegirinn** |
| shadow | **Göl** | | **Gölge** | | **Karanlık** |
| plant | **Muju** | | **Sachita** | | **Sachakuna** |
| metal | **Inyan** | | **Mazask** | | **Tanka** |

(The question prompt's blanks: Muju→Sachita→**Sachakuna**; Radi→**Umeme**→**Kimubunga**; Göl→**Gölge**→Karanlık.)
`getNextTierDefinition` returns `null` at tier 3 (`units.ts:262-273`); T3 is terminal (`tier3-cap.test.ts:26-42`) **[test]**.

### 4.3 The element advantage cycle

Double-Thick Triangle (`elements.ts:12-29`): three pairs, each beating the next pair, neutral inside a pair.

```
Fire & Lightning  →  Plant & Metal  →  Water & Shadow  →  Fire & Lightning
```

`hasAdvantage` → `+1 ATK`; the reverse relation → `−1 ATK`; otherwise `0` (`elements.ts:103-114`).
Defense is never modified. The graph is **injectable** (`elements.ts:43-53`) with lab alternatives
`'dual-triangle' | 'rush-edge-only' | 'none'`; the shipped default is `'double-thick'` (`elements.ts:45`).

### 4.4 The full kill table

**How to read:** cell = number of *separate* attacks needed to kill the column unit, starting from full health,
**within one exposure window** (see §4.5). `**K**` = one attack kills outright (`ATK_eff >= DEF`).
`—` = `ATK_eff` is 0, so this attacker can *never* kill this defender. Derived mechanically from
`units.ts` + `elements.ts` + `combat.ts:80-109,148`.

| Attacker (ATK) ╲ Defender | Hi | Hono | Kagari | Radi | Umeme | Kimub | Sjor | Straumr | Aegir | Göl | Gölge | Karan | Muju | Sachita | Sachak | Inyan | Mazask | Tanka |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Hi** (2) | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 3 | 4 | 2 | 2 | 2 | **K** | **K** | 2 | **K** | 2 | 2 |
| **Hono** (3) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 2 | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 |
| **Kagari** (4) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** |
| **Radi** (1) | **K** | **K** | 2 | **K** | **K** | **K** | — | — | — | — | — | — | 2 | 2 | 2 | 2 | 2 | 3 |
| **Umeme** (2) | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 3 | 4 | 2 | 2 | 2 | **K** | **K** | 2 | **K** | 2 | 2 |
| **Kimubunga** (3) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 2 | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 |
| **Sjor** (2) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 2 | **K** | **K** | **K** | 3 | 3 | 4 | 3 | 4 | 5 |
| **Straumr** (2) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 2 | **K** | **K** | **K** | 3 | 3 | 4 | 3 | 4 | 5 |
| **Aegirinn** (3) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | **K** | **K** | **K** | 2 | 2 | 2 | 2 | 2 | 3 |
| **Göl** (2) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | 2 | **K** | **K** | **K** | 3 | 3 | 4 | 3 | 4 | 5 |
| **Gölge** (3) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | **K** | **K** | **K** | 2 | 2 | 2 | 2 | 2 | 3 |
| **Karanlık** (4) | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | **K** | 2 | **K** | 2 | 2 |
| **Muju** (0) | — | — | — | — | — | — | 2 | 3 | 4 | 2 | 2 | 2 | — | — | — | — | — | — |
| **Sachita** (1) | — | — | — | — | — | — | **K** | 2 | 2 | **K** | **K** | **K** | 3 | 3 | 4 | 3 | 4 | 5 |
| **Sachakuna** (2) | **K** | **K** | 2 | **K** | **K** | **K** | **K** | **K** | 2 | **K** | **K** | **K** | 2 | 2 | 2 | 2 | 2 | 3 |
| **Inyan** (1) | — | — | — | — | — | — | **K** | 2 | 2 | **K** | **K** | **K** | 3 | 3 | 4 | 3 | 4 | 5 |
| **Mazask** (2) | **K** | **K** | 2 | **K** | **K** | **K** | **K** | **K** | 2 | **K** | **K** | **K** | 2 | 2 | 2 | 2 | 2 | 3 |
| **Tanka** (2) | **K** | **K** | 2 | **K** | **K** | **K** | **K** | **K** | 2 | **K** | **K** | **K** | 2 | 2 | 2 | 2 | 2 | 3 |

Headline facts falling out of the table:

- **DEF 1 is free.** Every attacker whose effective ATK is at least 1 one-shots **Hi, Hono, Radi, Umeme and
  Kimubunga**. Only the `—` attackers (Muju against non-water/shadow; Radi, Inyan and Sachita against fire/lightning)
  cannot.
- **Tanka (DEF 5) is one-shot by Kagari alone** (fire beats metal: 4+1 = 5). Hono and Kimubunga need 2
  (effective 4, then 4 ≥ 5−4); Karanlık needs 2 (shadow loses to metal: 4−1 = 3); Sjor, Straumr, Göl and Sachita
  need **5**, which cannot happen in a 4-action turn.
- **Aegirinn (DEF 4) is one-shot by Karanlık alone** (shadow and water are the same pair, so neutral 4 ≥ 4).
  Kagari is *disadvantaged* into water and only manages 3, needing 2 hits.
- **Kagari (DEF 2) is the only durable rush unit**; the rest of the fire/lightning ladder dies to anything.
- **Muju (ATK 0) can damage only water and shadow** (0+1 = 1) and can never kill a full-health unit on its own;
  two Mujus do kill a Sjor or a Göl.
- The Plant/Metal wall (Muju 3, Sachita 3, Sachakuna 4, Inyan 3, Mazask 4, Tanka 5) is what water/shadow units
  cannot break: Sjor/Straumr/Göl need 3–5 hits against every one of them.

### 4.5 Two-attack (and n-attack) combos — the exposure-window rule

**[inference]**, from `combat.ts:13-17` + `board.ts:287`:

1. A unit that lands a **non-lethal** hit has `lastAttackKilled = false`, so `canAttack` is false for the rest of the
   turn. **One attacker can contribute at most one chip.**
2. `damageTaken` is zeroed at the start of the **defender's** turn (`board.ts:287`).

Therefore the table's numbers are literally **"how many distinct friendly attackers must hit this target in one
single turn"**, and every combo is bounded by three simultaneous limits:

- **4 shared actions** (including the actions spent getting each attacker adjacent);
- **adjacency count** — at most 4 attackers on an interior square, 3 on an edge, **2 on a corner**;
- combos of ≥3 attackers on a corner are impossible in 4 actions (rotation costs ≥5 — `homeCheckmate.ts:29-30`,
  `home-victory.test.ts:50-55`, `server/observation.ts:140`) **[code]** **[test]**.

Two-attack combos worth hard-coding (both attackers must already be adjacent, or the move cost eats the budget):

| Target (DEF) | Pair that kills in 2 | Effective ATK each | Arithmetic |
|---|---|---|---|
| Sjor / Göl (2) | Hi + Hi, Umeme + Umeme, Muju + Muju | 1 | 1 chip → DEF_eff 1 → 1 ≥ 1 |
| Straumr (3) | Hono + Hono, Kimubunga + Kimubunga, Sjor + Sjor | 2 | 2 chip → 1 → kill |
| Aegirinn (4) | Aegirinn + Aegirinn, Gölge + Gölge, Kagari + Kagari | 3 | 3 chip → 1 → kill |
| Tanka (5) | Hono + Hono, Kimubunga + Kimubunga | 4 | 4 chip → 1 → kill (Kagari one-shots it alone) |
| Mazask / Sachakuna (4) | Sachakuna/Mazask/Tanka/Aegirinn/Gölge ×2 | 2 | 2 chip → 2 → kill |

Three- and four-attacker kills are legal but rarely affordable: 4 pre-adjacent Hi do kill an Aegirinn
(1 × 4 = 4 actions, needs all four orthogonal neighbours of an interior square). The
authoritative helpers are `calculateCombinedAttackPower` (`combat.ts:232-239`) and `canBeEliminatedByCombined`
(`combat.ts:244-251`); they apply each attacker's element modifier individually before summing (`SPEC.md:166`).

---

## 5. The resource map (`src/game/resourceMap.ts`, `src/game/board.ts`)

### 5.1 The v2.8 "Unequal routes" layout

`UNEQUAL_ROUTES_MAP` (`resourceMap.ts:6-17`) is a frozen flat length-100 array, index `y*10 + x`:

```
y=0:  8  8  8  0  0  0  4  4  4  4
y=1:  8  8  4  0  0  0  4 16 16  4
y=2:  8  4  4  0  0  0  4 16 16  4
y=3:  4  4  4  4  4  8  4  4  4  4
y=4:  4  4  4  8  8  8  4  4  4  4
y=5:  4  4  4  4  8  8  8  4  4  4
y=6:  4  4  4  4  8  4  4  4  4  4
y=7:  4 16 16  4  0  0  0  4  4  8
y=8:  4 16 16  4  0  0  0  4  8  8
y=9:  4  4  4  4  0  0  0  8  8  8
```

Verified numerically (my own recount of the literal): **total = 504**, histogram `{0: 18, 4: 54, 8: 20, 16: 8}`,
and the array is exactly 180°-rotationally symmetric (`M[i] === M[99−i]` for all i) **[code]**.
`resource-map.test.ts:10-22` pins all of that plus the square names **[test]**.
`INITIAL_MAP_RESOURCES = 504` (`resourceMap.ts:18`); `MAX_RESOURCE_RESERVE = 16` (`resourceMap.ts:5`).

Named breakdown (A–J = x 0–9, 1–10 = y 0–9; helper `historySquare` at `moveHistory.ts:16`):

| Group | Squares | Reserve | Subtotal |
|---|---|---|---|
| Blank corridors (18) | D1 E1 F1 D2 E2 F2 D3 E3 F3 · E8 F8 G8 E9 F9 G9 E10 F10 G10 | 0 | 0 |
| White home cluster (6) | A1 B1 C1 A2 B2 A3 | 8 | 48 |
| Black home cluster (6) | J8 I9 J9 H10 I10 J10 | 8 | 48 |
| Central cluster (8) | F4 D5 E5 F5 E6 F6 G6 E7 | 8 | 64 |
| Rich patch near white's diagonal (4) | H2 I2 H3 I3 | 16 | 64 |
| Rich patch near black's diagonal (4) | B8 C8 B9 C9 | 16 | 64 |
| Ordinary ground (54) | everything else | 4 | 216 |
| | | **Total** | **504** |

**Home corners:** White `(0,0)` = A1, Black `(9,9)` = J10 (`board.ts:175-177`). Both hold 8 crystals.
**Blank squares** hold 0 crystals but are fully walkable and spawn-eligible — nothing in `movement.ts` or
`spawning.ts` consults `resourceLayers` **[code]**.

`createInitialGameState` accepts any 100-length integer vector in `[0,16]` and throws otherwise
(`board.ts:206`; `expansion-economy.test.ts:47-54`) **[test]**. Existing games keep their stored map through
`board.initialResourceLayers` (`resource-map.test.ts:23-38`) **[test]**.

### 5.2 The mining rule

```
reserveTake(mining, reserve)        = min(mining, reserve)                       (mining.ts:5)
unitEndOfTurnTake(unit, cell)       = min(MINE(def), cell.resourceLayers)        (mining.ts:8-10)
endOfTurnIncome(state, player)      = for EVERY unit of `player`, simultaneously (mining.ts:18-34)
```

Properties, all **[code]**:
- Fires **once per turn, for the mover only**, at `endTurn` (`turn.ts:95`) — before the draw clock and before the opponent's turn start.
- **Unconditional**: moved, attacked, just-placed and just-promoted units all mine (`SPEC.md:192`). There is no mine action, no depth, and reserves never replenish.
- **Simultaneous**: takes are computed against the *pre-income* board, then applied (`mining.ts:19-28`). Two units can never share a square, so there is no contention.
- Adds to both `resources` and `resourcesGained` (`mining.ts:31`), preserving `gained + remaining === initial total` (`lab/harness/invariants.ts:55-59`).
- `projectedIncome` (`mining.ts:12-15`) is the same computation without mutation — useful as an eval feature.

`expansion-economy.test.ts:30-45` pins the depletion schedules: plant_1 drains a fresh 16 in `3,3,3,3,3,1`;
plant_2 in `5,5,5,1`; plant_3 in `8,8` **[test]**.

---

## 6. Victory conditions

### 6.1 The five terminal outcomes

| Reason | Where produced | Trigger |
|---|---|---|
| `'elimination'` | `simulate.ts:111` (mid-turn), `turn.ts:29` (turn start) | a side reaches **0 units on the board**; both at 0 ⇒ draw (`victory.ts:38-40`) |
| `'upkeep-elimination'` | `turn.ts:55` | a keep-set release removes the player's last unit |
| `'home-occupation'` | `turn.ts:24` | at **the start of your turn**, one of your units stands on the enemy home corner |
| `'home-checkmate'` | `homeCheckmate.ts:178` | an occupation with **no legal rescue** anywhere in the defender's full reply turn |
| `'inactivity'` | `inactivity.ts:9` | 10 consecutive completed player turns with no attack kill ⇒ **draw** (`winner: null`) |
| `'resignation'` | `simulate.ts:79` | the current player resigns |

`victory.ts:33-54` `checkVictory(board)` is board-only (elimination); `victory.ts:109-112` `getGameResult(state)` is
the state-aware version that reports draws.

### 6.2 Home occupation

Checked **first thing** in `startTurn` for the incoming player, *before* the elimination check, upkeep, healing,
placement and promotion (`turn.ts:23-27`). Any element or tier qualifies, including ATK-0 Muju
(`home-victory.test.ts:31-35`) **[test]**. Occupying your **own** corner does nothing. Loading a saved mid-turn
position does not retroactively resolve an occupation (`home-victory.test.ts:36-39`) **[test]**.

### 6.3 Proven home checkmate — the algorithm (`src/game/homeCheckmate.ts`)

`resolveHomeCheckmate(state, transition)` (`homeCheckmate.ts:171-180`) short-circuits unless:
`phase === 'playing'` ∧ `!upkeepPending` ∧ `victoryRule !== 'elimination'` ∧ the **current player** occupies the enemy
corner ∧ the **opponent does not** occupy the current player's corner (an earlier invasion keeps priority —
`homeCheckmate.ts:176`, pinned by `home-checkmate.test.ts:101-103`) **[test]**.

It is invoked from `applyAction` after **every** successful transition, and additionally *before* `endTurn` on an
`END_ACTION_PHASE` (`simulate.ts:28-33`).

`analyzeHomeDefense(state, invader, transition, maxNodes = 20000)` (`homeCheckmate.ts:57-59`, `PROOF_NODES` at
`:22`) returns `'rescue' | 'mate' | 'unknown'`:

**Step 0 — construct the hypothetical reply turn** (`homeCheckmate.ts:72-74`):
```
ready = { ...state,
          board: resetUnitActions(board, defender),   // heal + clear all the defender's flags
          upkeepPending: false,
          turn: { currentPlayer: defender, phase: 'action', actionsRemaining: 4 } }
```
The defender's bank is whatever it is **now** — the reply turn's own income arrives at its *end* and cannot fund it.

**Step 1 — admissible damage bound** `enoughPossibleDamage(ready, target, preparing=true)` (`homeCheckmate.ts:27-49`).
A DP over `power[hits][actionsUsed]`, `hits ∈ {1,2}`:
- each candidate attacker costs `ceil(max(0, manhattan(u, target) − 1) / speed) + 1` actions (move to adjacency + one attack);
- blockers are ignored; each unit may optimistically promote if `rent + promotionCost <= cash`; promotion/upkeep money is **not** shared across units in this bound;
- **capped at 2 hits** because the corner has only two orthogonal neighbours and a third distinct attacker needs an exit move *and* an entry move, so three corner attacks cost ≥5 actions (`homeCheckmate.ts:29-30`) — the `> 4` action budget makes this exact.
If the bound cannot reach `calculateDefense(target)`, return `'mate'` with `method: 'damage_bound'`, 0 nodes.

**Step 2 — enumerate the defender's preparation** `prepare(index, cash, kept, promotions)` (`homeCheckmate.ts:127-156`).
Units sorted by Manhattan distance to the target (`:122-123`). For each unit in turn:
- keep it (pay `rent`), or
- keep it **and** promote it (pay `rent + (nextCost − cost)`), or
- **release** it — allowed only if `tier > 1` (`homeCheckmate.ts:154-155`: "Tier 1 is mandatory, even when it blocks a rescuing attacker").
Upkeep is charged at the **old** tier, then promotion; the comment at `:125-126` argues these commute so visiting each
unit once covers every affordable set without permutation duplicates.

**Step 3 — search the four actions** `act(s, line)` (`homeCheckmate.ts:91-120`), depth-first:
- success ⇔ the occupier is no longer on the board (`:92-93`);
- prune with `enoughPossibleDamage(s, occupier, false)` (now respecting `canAttack` / `attackedThisTurn`);
- transposition table `failed: Set<string>` keyed on `` `${actionsRemaining}:` `` + per-unit `index,definitionId,square,damageTaken,attackCount,lastAttackKilled,attackedIndices` (`:88-89`) — **unit indices, not ids**;
- try **all attacks by all of the defender's units** (not just attacks on the occupier — blocker-clearing is in scope), sorted by the target square's Manhattan distance to the occupier (`:100-101`);
- then, only while `actionsRemaining > 1`, try **all one-action moves of all friendly units** (`:107-116`), sorted the same way. Moving a *blocker* is explicitly in scope.
- `spend()` (`:80-85`) charges a node and aborts with `exhausted = true` at `maxNodes` or on the optional interrupt.

**Result mapping** (`homeCheckmate.ts:167`): `rescued ? 'rescue' : exhausted ? 'unknown' : 'mate'`.
**Exhaustion never wins** — `'unknown'` leaves the reply turn intact (`home-checkmate.test.ts:91-94`) **[test]**.

**Scope of the proof — what it deliberately does *not* consider:**

1. **No purchases.** Justified because the occupier on the corner blocks every spawn rectangle (`:52-53`).
2. **No multi-action MOVE commands** — only one-action hops, argued equivalent (`:108-109`); see §3.1.
3. **No recursive checkmate adjudication** inside the proof — `applyAction` passes `transitionWithoutCheckmate` (`simulate.ts:29,33`, `homeCheckmate.ts:55-56`).
4. **No draw-clock awareness** — see §8.1.
5. Only the *immediate* reply turn. That is the correct horizon: an unremoved occupier wins at the invader's next turn start.

`analyzeHomeDefenseEvidence` (`homeCheckmate.ts:63-66`) is the same prover with a witness line and
`categories` (`existing`, `promotion`, `upkeep_choice`, `blocker_clearing`) — used by the analysis server, not by play.

### 6.4 The ten-quiet-turn draw

`INACTIVITY_LIMIT = 10`, `INACTIVITY_WARNING = 7` (`inactivity.ts:3-4`).
A "ply" is one player's completed turn, so 10 plies = 5 rounds (`SPEC.md:369-370`).
**Only an attack kill resets it** (`simulate.ts:101`). Chip damage, movement, purchases, promotions, income and
upkeep releases do not (`upkeep-draw.test.ts:101-109`) **[test]**.
Resolution order in `endTurn` puts the draw **after** income and **before** the next `startTurn`, so it beats the
opponent's home-occupation win and their upkeep (`turn.ts:96-101`; `upkeep-draw.test.ts:79-86`) **[test]**.
An attack that eliminates the last enemy during the tenth quiet turn still wins (`upkeep-draw.test.ts:87-91`) **[test]**.

---

## 7. The public API a search engine should call

### 7.1 The four functions that matter

```ts
// src/ai/simulate.ts:25   — THE transition. Immutable. Returns the SAME object on rejection.
export function applyAction(state: GameState, action: AIAction): GameState

// src/ai/simulate.ts:38   — same, minus home-checkmate adjudication (for target-removal solvers only)
export function transitionWithoutCheckmate(state: GameState, action: AIAction): GameState

// src/game/legality.ts:16 — THE legality gate
export function isLegalAction(state: GameState, action: AIAction, player?: PlayerId): boolean

// src/ai/moves.ts:72      — THE move generator (already filtered through isLegalAction at :75)
export function generateAllActions(state: GameState, player: PlayerId): AIAction[]
```

Supporting generators (`src/ai/moves.ts`):
```ts
generateMoveActions(state, player): AIAction[]          // :15  — ONE-action moves only (getValidMoves)
generateAttackActions(state, player): AIAction[]        // :34
generatePlaceActions(state, player): AIAction[]         // :50  — BUY_UNIT × every spawn square
generatePromoteActions(state, player): AIAction[]       // :56
generatePlacePhaseActions(state, player): AIAction[]    // :61  — upkeepActions() when upkeepPending, else buys+promos+END_PLACE_PHASE
generateActionPhaseActions(state, player): AIAction[]   // :67  — attacks+moves+END_ACTION_PHASE
hasActionsAvailable(state, player): boolean             // :78
getSortedActions(actions): AIAction[]                   // :82  — ATTACK, BUY_UNIT, PROMOTE_UNIT, MOVE ordering
applyActions(state, actions): GameState                 // simulate.ts:178 — stops at the first illegal action or turn change
isTerminal(state): boolean                              // simulate.ts:191
```

### 7.2 Per-mechanic API (exact names and signatures)

**Cloning** — *there is none.* The engine is purely structural-sharing immutable; tests use `structuredClone`
(`turn.test.ts:27`, `home-checkmate.test.ts:36`) **[code]**. `properties.test.ts:15` asserts the input state is
byte-identical after every transition **[test]**.

**State construction / board (`src/game/board.ts`)**
```ts
BOARD_SIZE = 10                                                            // :16
INITIAL_RESOURCE_LAYERS = 10   // uniform-board legacy fallback only        // :18
MAX_ACTIONS_PER_TURN = 4                                                   // :19
createEmptyBoard(): BoardState                                             // :34
createInitialGameState(resourceLayout = UNEQUAL_ROUTES_MAP,
                       actionsPerTurn: 4 = 4,
                       blackCrystalHandicap = 0): GameState                // :203
getCell(board, pos): Cell | null                                           // :51
isValidPosition(pos): boolean                                              // :59
getUnitAt(board, pos): Unit | null              // O(units) linear find    // :66
getUnitById(board, unitId): Unit | null         // O(units) linear find    // :76
isOccupied(board, pos): boolean                                            // :83
getPlayerUnits(board, player): Unit[]           // allocates               // :90
createUnit(definitionId, owner, position, canAct = true): Unit             // :97  (NONDETERMINISTIC id)
addUnit / placeUnit(board, unit): BoardState                               // :120 / :130
removeUnit(board, unitId): BoardState                                      // :135
updateUnit(board, unitId, updates): BoardState                             // :145
updateCell(board, pos, updates): BoardState                                // :159
getStartCorner(player): Position                                           // :175
getStartingPositions(player): Position[]                                   // :184
resetUnitActions(board, player): BoardState                                // :267
manhattanDistance(a, b) / isAdjacent(a, b) / getAdjacentPositions(pos)     // :299 / :306 / :313
```

**BFS reach / movement (`src/game/movement.ts`)**
```ts
canMove(unit): boolean                                                     // :16  (=== unit.canActThisTurn)
getValidMoves(unit, board): Position[]          // ONE action's worth only // :29
isValidMove(unit, destination, board): boolean                             // :37
executeMove(board, unitId, destination): BoardState                        // :49
findAttackApproach(unit, target, board, actions): Position[] | null        // :68
findPath(from, to, board, maxDistance): Position[] | null                  // :86  (O(n^2)-ish, see 7.3)
getMovementRange(startPosition, speed, totalActions, board)
      : { position: Position; actionsRemaining: number }[]                 // :184
getAttackFrontier(unit, board, moveActions = 3): Position[]                // :200  (UI "show reach")
getMoveCost(startPosition, targetPosition, speed, board): number | null    // :226  = ceil(dist/speed)
```

**Combat (`src/game/combat.ts`)**
```ts
getAttackCount(unit): number                                               // :8
canAttack(unit): boolean                                                   // :13
getValidAttacks(unit, board): Position[]                                   // :23
isValidAttack(unit, targetPosition, board): boolean                        // :46
calculateAttackPower(attacker, defender): number                           // :80
getBaseDefense(defender) / calculateDefense(defender): number              // :96 / :106
resolveCombat(board, attackerId, defenderPosition)
      : { board: BoardState; eliminated: boolean }                         // :117
executeAttack(...)  // alias of resolveCombat                              // :169
getThreatsTo(unit, board): Unit[]                                          // :180
getAttackersFor(targetPosition, board, attackerOwner): Unit[]              // :197
canBeEliminated(target, attacker): boolean                                 // :219
calculateCombinedAttackPower(attackers, defender): number                  // :232
canBeEliminatedByCombined(target, attackers): boolean                      // :244
resolveCombinedCombat(board, attackerIds, defenderPosition)                // :258
setCombatHandicap(player, bonus) / resetCombatHandicap()   // LAB GLOBAL    // :64 / :68
```

**Spawn rectangles (`src/game/spawning.ts`)**
```ts
getSpawnRectangle(startCorner, anchorPosition): Position[]                 // :8
hasEnemyInRectangle(rectangle, board, player): boolean                     // :34
isSpawnBlocked(anchor, player, board): boolean                             // :51
getSpawnZone(anchor, player, board): Position[]                            // :65
getValidAnchors(player, board): Unit[]                                     // :85
getAllSpawnPositions(player, board): Position[]                            // :98
isValidSpawnPosition(position, player, board): boolean                     // :123
getSpawnInvalidReason(position, player, board)
      : 'occupied' | 'enemy_blocking' | 'outside_control' | null           // :159
getLargestSpawnZone(player, board): { anchor: Unit | null; zone: Position[] }  // :207
```

**Buy / promote (`src/game/building.ts`, `src/game/promotion.ts`, `src/game/units.ts`)**
```ts
getAffordablePurchases(resources): UnitDefinition[]   // tier 1 only       // building.ts:7
createUnitFromDefinition(definitionId, owner, position, id): Unit          // building.ts:11
getPromotionCost(unit): number | null                                      // promotion.ts:9
getPromotedDefinitionId(unit): string | null                               // promotion.ts:28
canPromote(unit, buildState: {crystals:number}): boolean                   // promotion.ts:44
isMaxTier(unit): boolean                                                   // promotion.ts:63
promoteUnit(board, unitId, buildState): {board, buildState} | null         // promotion.ts:72
getPromotableUnits(board, player, buildState): Unit[]                      // promotion.ts:112
getPromotionInfo(unit)                                                     // promotion.ts:127
UNIT_DEFINITIONS: UnitDefinition[]                                         // units.ts:5
getUnitDefinition(id): UnitDefinition      // THROWS on unknown id         // units.ts:243
getUnitsByElement(element) / getNextTierDefinition(defId)                  // units.ts:254 / :262
getPromotionCost(currentDefId): number     // 0 at tier 3 (NB: differs from promotion.ts's null)  // units.ts:278
STARTING_UNITS = ['fire_1','water_1','plant_1']                            // units.ts:288
```

**Upkeep (`src/game/upkeep.ts`)**
```ts
UPKEEP_BY_TIER = {1:0, 2:1, 3:2, 4:3}                                      // :5
setUpkeepVariant('shipped'|'steep'|'off')     // LAB GLOBAL                // :9
upkeepForTier(tier) / unitUpkeep(unit) / upkeepDue(state, player)          // :12 / :13 / :14
isUpkeepSelectionLegal(state, ids): boolean                                // :17
settleUpkeep(state, ids): GameState                                        // :23
upkeepActions(state): AIAction[]   // exhaustive for <=12 rent-bearing units  // :34
defaultUpkeepAction(state, homeFirst = false): AIAction                     // :56
```

**Turn boundaries (`src/game/turn.ts`)**
```ts
startTurn(state, player): GameState                                        // :19
completeUpkeep(state, keepUnitIds): GameState                              // :53
automaticUpkeepUndo(before, after): GameState | null                       // :38
startActionPhase(state) / skipPlacePhase                                   // :66 / :147
useAction(state) / hasActionsRemaining(state)                              // :74 / :87
endTurn(state): GameState                                                  // :92
getOpponent(player) / isPlayerTurn(state, player) / isPhase(state, phase)  // :109 / :116 / :123
canCurrentPlayerAct(state) / canActInPlacePhase(state, player)             // :130 / :141
```

**Mining (`src/game/mining.ts`)**, **victory (`src/game/victory.ts`)**, **checkmate (`src/game/homeCheckmate.ts`)**,
**draw (`src/game/inactivity.ts`)**, **rules (`src/game/rules.ts`)** — all listed in §2, §5.2, §6.

### 7.3 Performance characteristics (all **[code]**, cost estimates **[inference]**)

| Hot spot | Cost | Note |
|---|---|---|
| `applyAction` | allocates a new `GameState`, a new `BoardState`, and a **full `units.map()`** for every MOVE/ATTACK/PROMOTE | `simulate.ts:85-89,133-145,153-160` |
| `endOfTurnIncome` | allocates 10 row arrays + new `Cell` objects for every mining unit; builds a `Map` keyed on `y*10+x` | `mining.ts:24-28` |
| `getUnitAt` / `getUnitById` | **O(units) `Array.find`** | `board.ts:66-78` — called inside `getValidAttacks`, `getSpawnZone`, `isValidSpawnPosition`, `hasEnemyInRectangle` |
| `isValidSpawnPosition` | O(units × rect area) ≤ O(u × 100) with an allocated `Position[]` per anchor | `spawning.ts:123-153` |
| `getAllSpawnPositions` | O(units² × 100) plus a `Set<string>` of `"x,y"` keys | `spawning.ts:98-118` |
| `generatePlaceActions` | **calls `getAllSpawnPositions` once per affordable definition** (up to 6×) inside the `flatMap` | `moves.ts:52-53` — trivially hoistable |
| `findPath` | `queue.shift()` on an `Array` (O(n) dequeue) and `reconstructPathLength` walks the parent chain **per expanded node** → roughly O(n²) | `movement.ts:99-147` — only used for animation/history, not for legality |
| `distancesFrom` | typed-array BFS (`Uint8Array(100)`, `Int16Array(100)`), memoised in a `WeakMap<BoardState, Map<originIndex, …>>` | `movement.ts:239-257` — **the good path**. `getMoveCost`/`getValidMoves` go through it. |
| movement cache | keyed on **board object identity**, so it is cold after every transition | `movement.ts:237-244`. Within one position it pays for itself across many origins. The code comment mentions a "100-entry FIFO" — the only 100-entry FIFO in sight is the BFS `queue` array, not a cache eviction policy. |
| `upkeepActions` | enumerates **2^k subsets** for k ≤ 12 rent-bearing units (up to 4 096 candidate actions); a 4-heuristic fallback above 12 | `upkeep.ts:38-52` |
| `resolveHomeCheckmate` | runs **on every `applyAction`** where the mover occupies the enemy corner; up to **20 000 nodes**, each node building a transposition string via `units.map().join(';')` | `simulate.ts:33`, `homeCheckmate.ts:88-89` — the single most expensive thing in the engine |
| string keys | `` `${p.x},${p.y}` `` in `findPath`/`getAllSpawnPositions`; long joined strings in the prover | high GC pressure |

**Branching factor** **[inference]**: in the action phase, ≈ (#own units × ≤ (4·speed) reachable squares) + adjacency
attacks + 1, so ~30–120. In the place phase, `generatePlaceActions` is (#affordable T1 definitions ≤ 6) ×
(#spawn squares, up to ~100) ⇒ **up to ~600 `BUY_UNIT` actions in one node**, plus promotions.

### 7.4 What a fast engine must reimplement

1. **Flat board + occupancy index.** `Uint8Array(100)` of `unitIndex+1`, so `getUnitAt` is O(1). This alone removes
   most of the linear scans.
2. **Struct-of-arrays units.** Per unit: `square:u8`, `owner:u1`, `defIndex:u5`, `damageTaken:u3` (0..4),
   `attackCount:u2` (0..3), `lastAttackKilled:u1`, `placedThisTurn:u1`, `promotedThisTurn:u1`.
   **Drop** `hasMoved` (never read), `canActThisTurn` (never false), `attackedThisTurn` (derivable — §1.7a),
   `hasAttacked` (legacy fallback). That is ~3 bytes per unit.
3. **Precompute the catalogue.** An 18×18 `effAtk[a][d]` table and a `defense[d]` vector make combat one compare
   (`combat.ts:80-109` is pure function of two `definitionId`s). Likewise `promotionCost[d]`, `nextTier[d]`,
   `upkeep[tier]`, `mining[d]`, `speed[d]`, `tier[d]`.
4. **Incremental BFS.** Movement blocking depends only on the occupancy bitboard; a 100-bit occupancy mask +
   per-unit multi-source BFS with a ring-buffer queue replaces `movement.ts:240-257` and its `WeakMap`.
5. **Undo instead of clone.** The engine's immutability is convenient but allocation-heavy; a make/unmake with a
   small delta record (moved unit's old square, damage delta, removed unit, action counter, resources) is far
   cheaper than `{...state, board:{...}, units: units.map(...)}`.
6. **Zobrist hashing over indices, not ids** (§1.6), including `turn.phase`, `actionsRemaining`, `currentPlayer`,
   both banks, and cell reserves.
7. **Special-case the checkmate prover.** Either hoist it out of the per-node transition (run it only at the turn
   boundary and on a move that lands on the enemy corner) or reimplement it on the compact representation. It is
   a bounded 4-action, ≤2-attacker problem with a tiny state space (§6.3).
8. **Hoist `getAllSpawnPositions`** out of `generatePlaceActions` and represent a spawn zone as a 100-bit mask:
   union over anchors of `rect(corner, anchor)` where `rect ∩ enemyMask === 0`, minus the occupancy mask.
9. **Bound the `PAY_UPKEEP` branching.** 2^12 candidate keep-sets per node is search-killing; in practice the
   optimal keep-set is "keep everything" whenever affordable, and only becomes interesting when `due > resources`
   or `reviewUpkeep` is on.

### 7.5 Determinism hazards — **process-global mutable rule state**

Three module-level variables change the rules for the whole process:

```ts
src/game/elements.ts:45   let activeGraph = 'double-thick'   // setElementGraph()
src/game/combat.ts:62     const combatHandicap = {white:0, black:0}   // setCombatHandicap()
src/game/upkeep.ts:8      let schedule = UPKEEP_BY_TIER      // setUpkeepVariant()
```

They are lab knobs, never touched by real games (`lab-knobs.test.ts:19-29` resets them in `afterEach`) **[test]** —
but a search engine that shares a process with the lab harness, or that caches an `effAtk` table, must treat them as
part of the position. Note `src/ai/wasm/kernel.ts:47-53` rebuilds its power matrix on **every solver call** for
exactly this reason **[code]**.

### 7.6 Reference: the existing compact encoding

`src/ai/wasm/kernel.ts:54-64` already packs a position into an `Int32Array(1016)` for the AssemblyScript tactical
kernel (`assembly/tactics.ts`, ABI 6 checked at `kernel.ts:31`): 7 header words
`[abi, unitCount, playerBit, actionsRemaining, phaseBit, resources, actionsPerTurn]` then 10 words per unit
`[square, ownerBit, defIndex, damageTaken, flagBits, attackedMask×4, attackCount]` — with `flagBits =
canAct|promoted<<1|placed<<2|lastKilled<<3`. Its declared scope is *"current-turn target removal; all moves/attacks;
home-blocked promotions"* (`kernel.ts:13`); purchasing and general placement are out of scope and return `unknown`.
JS re-validates every witness through `isLegalAction` and throws on an illegal one (`kernel.ts:78`) **[code]**.
This is the closest existing model for a new compact engine.

---

## 8. Divergences and easy-to-get-wrong rules

### 8.1 Spec-vs-code divergences

**(a) Home checkmate can pre-empt the ten-quiet-turn draw. [inference] — not covered by any test I found.**
`SPEC.md:373-374` says the draw "resolves immediately at the end of the tenth quiet turn. The next turn never
begins: no home-win check, upkeep or healing can override the draw." But `resolveHomeCheckmate`
(`homeCheckmate.ts:173`) does **not** consult `inactivityPlies`, and `applyAction` adjudicates it **before**
`endTurn` on an `END_ACTION_PHASE` (`simulate.ts:28-31`) and immediately after any mid-turn move
(`simulate.ts:33`). So with `inactivityPlies === 9`, an invader who steps onto an unanswerable corner is awarded
`'home-checkmate'` at that instant, whereas ending the turn without the checkmate rule would have produced an
`'inactivity'` draw at `turn.ts:96`. The checkmate rule is newer (commit `ab4435a`, 2026-09-12) than the draw
ordering rule (v1.9/v2.6) and the interaction looks unconsidered.

**(b) `lab/docs/SPEC_AUDIT.md` is stale.** It is headed "current v2.2 (2026-09-10)" and its §1 row still says
"0/4/8/10 and 520" (`SPEC_AUDIT.md:15`) and "Save 5 round-trip" (`:32`). The shipped map is v2.8 0/4/8/16 with
**504** (`resourceMap.ts:1-18`) and `SCHEMA_VERSION` is **6** (`tier3-cap.test.ts:51`) **[test]**. Its clause→code
table is still broadly right; only the numbers have rotted.

**(c) `SPEC.md:99` "reserving one action for a legal attack (including Cleave limits)"** describes the *preview*,
`findAttackApproach`. It is a UI affordance only; the engine has no combined action (§3.8).

**(d) `types.ts:99` comments `actionsRemaining` as "0-6"**, a leftover from the six-action variant that
`rules.ts:11-13` now rejects outright. Harmless, but misleading.

**(e) `UPKEEP_BY_TIER` still carries a tier-4 entry** (`upkeep.ts:5`) and `upkeep-draw.test.ts:21` pins it, while
the catalogue is capped at tier 3 and `getUnitDefinition('fire_4')` throws (`tier3-cap.test.ts:36`) **[test]**.
Dead but pinned.

**(f) Two different `getPromotionCost` functions with different null contracts.**
`units.ts:278` returns **`0`** at max tier; `promotion.ts:9` returns **`null`**. `canPromote` uses the `null` one
(`promotion.ts:53-56`), so a tier-3 unit is correctly unpromotable — but anything reaching for the `units.ts`
version gets a silent `0`.

**(g) `movement.ts:238` comment mentions a "100-entry FIFO"** cache policy that does not exist; the `WeakMap`
cache has no eviction (relying on board objects being garbage-collected instead).

**(h) `canActThisTurn` is documented as a real flag** (`types.ts:66`, `SPEC.md:212` "no summoning sickness") but is
never set to `false` anywhere in `src/` **[code]**. It is load-bearing only for hand-constructed test/lab states.

### 8.2 Rules that are easy to get subtly wrong

1. **Purchases resolve before moves, so a fresh unit blocks your own paths.** Place phase strictly precedes the
   Action phase (`turn.ts:63`, `simulate.ts:54`), and BFS treats *all* units as blockers including your own
   (`movement.ts:246`, `movement.test.ts:109-123`) **[test]**. Buying into the corner can strand your own army.
   Recorded as a live loss in `docs/hard-ai/understand/napkin-snapshot.md`: *"A just-bought unit blocks your own
   MOVE paths (buys resolve first)."*

2. **Income cannot fund the same turn's placement or promotion.** Mining fires at `endTurn` (`turn.ts:95`), i.e.
   *after* the Place phase is long gone. The sequence is: upkeep → Place → Action → income. So crystals earned on
   turn *n* first become spendable at turn *n+1*'s upkeep, then its Place phase (`SPEC.md:230-232`) **[spec]**,
   `turn.test.ts:20-25` **[test]**.

3. **Chip damage heals at the *owner's* turn start, not at the attacker's.** `board.ts:287` inside
   `resetUnitActions(board, incomingPlayer)`. So the exposure window for a multi-attacker kill is exactly **one
   attacking turn**; you can never carry damage over (§4.5).

4. **A non-lethal attack — including a 0-damage attack — permanently closes that unit's Cleave chain for the turn**
   (`combat.ts:142` writes `lastAttackKilled = false`; `combat.ts:16` reads it). A later kill by a *different* unit
   does not reopen it (`cleave.test.ts:53-62`) **[test]**.

5. **Attacking is free of risk but not of action** — no retaliation (`SPEC.md:184`), but a 0-damage swing still
   burns 1 of your 4 actions (`cleave.test.ts:66`) **[test]**.

6. **`END_PLACE_PHASE` is often illegal** because the place phase auto-advances after your last affordable
   purchase/promotion (`simulate.ts:118-120`). Emitting it unconditionally rejects the whole online batch.

7. **One enemy anywhere inside a rectangle kills the entire anchor**, not just the square it stands on
   (`spawning.ts:74-75`). An enemy on your corner kills *every* anchor. Conversely, three of your own units packed
   into your corner leave zero empty spawn squares — also a recorded loss in the napkin.

8. **Promotion is "once per turn", not "once per place phase"**, despite the field name
   `promotedThisPlacement`: the reset happens in `resetUnitActions` at turn start (`board.ts:286`), and there is
   only one place phase per turn anyway.

9. **Upkeep must keep every tier-1 unit** (`upkeep.ts:20,25`) — you cannot cheaply shed a blocking Muju during
   upkeep. The home-checkmate prover encodes this explicitly (`homeCheckmate.ts:154-155`).

10. **A promotion's new rent starts next own turn**, because `upkeepDue` is read at turn start (`turn.ts:31`), not
    at promotion time.

11. **`turnNumber` is a round, not a ply.** Both players share it (`turn.ts:102-103`). Anything keyed on
    `(player, turnNumber)` — including `nextUnitId` (`simulate.ts:16`) — needs the player component.

12. **Rejection is signalled by reference equality**, not an exception or a boolean (`simulate.ts:26`). A caller
    that compares by value will silently treat a rejected action as applied.

13. **The move generator under-generates moves** (one action each) while legality accepts multi-action moves
    (§3.1). Any engine that mixes `generateAllActions` output with hand-built actions must keep the cost model
    (`ceil(distance/speed)`, all actions charged at once) consistent.

14. **`applyAction` can change `turn.currentPlayer`.** `END_ACTION_PHASE` runs income, the draw check, the
    opponent's home/elimination checks, their upkeep, their heal and possibly their place-phase skip — all inside
    one call (`turn.ts:92-104`). A search that assumes one ply per `applyAction` will mis-attribute the result.

15. **`getUnitDefinition` throws** on an unknown id (`units.ts:246`). Deserialising an untrusted or legacy state
    can crash the engine rather than returning an error.

---

## 9. Files read

`src/game/`: `types.ts`, `units.ts`, `elements.ts`, `resourceMap.ts`, `rules.ts`, `building.ts`, `inactivity.ts`,
`migrate.ts`, `analysis.ts`, `legality.ts`, `mining.ts`, `board.ts`, `movement.ts`, `combat.ts`, `spawning.ts`,
`promotion.ts`, `turn.ts`, `upkeep.ts`, `victory.ts`, `homeCheckmate.ts`, `moveHistory.ts`, `replay.ts` (all 22, in full).
`src/ai/`: `simulate.ts`, `types.ts`, `moves.ts`, `wasm/kernel.ts`. `src/hooks/useGameState.ts` (1-160).
`src/online/useOnlineGame.ts` (80-115). `lab/harness/invariants.ts` (1-60).
`SPEC.md` (full), `lab/docs/SPEC_AUDIT.md` (full).
`tests/game/`: `turn.test.ts`, `action-budget.test.ts`, `cleave.test.ts`, `spawning.test.ts`, `upkeep-draw.test.ts`,
`home-victory.test.ts`, `home-checkmate.test.ts`, `movement.test.ts`, `properties.test.ts`, `resource-map.test.ts`,
`expansion-economy.test.ts`, `tier3-cap.test.ts`, `crystal-handicap.test.ts`, `attack-approach.test.ts`,
`promotion.test.ts` (1-140), `combat.test.ts` (index), `lab-knobs.test.ts` (1-40).

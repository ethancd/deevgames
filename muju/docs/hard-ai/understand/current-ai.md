# The current Muju AI: architecture, computation, budgets, weaknesses

Snapshot of worktree `/Users/ashkie/src/deevgames-muju-hardai` (branch `claude/muju-hard-ai`,
HEAD `44c41c4`, 2026-09-14 "Snapshot uncommitted muju working tree (v2.8)").
All paths are relative to `/Users/ashkie/src/deevgames-muju-hardai/muju/`.

**Evidence labels used throughout**

- **[CODE]** — read directly in source, line-cited.
- **[MEASURED]** — I ran it in this worktree today (2026-09-14, Node v24.11.1,
  Apple M2 Max) and am quoting the observed numbers. Probe scripts lived in the
  session scratchpad; nothing in the repo was modified.
- **[DOC]** — claimed in a checked-in document; may be stale.
- **[INFER]** — my reading/judgement, not directly executed.

**Sanity check run first:** `./node_modules/.bin/vitest run tests/ai` →
**14 files, 159 tests, all passing, 9.17 s**. Everything below describes a green tree.

---

## 0. Headline finding (read this first)

**The shipped "MCTS" search essentially never runs.** Under every realistic budget —
the UI presets, the lab's `fast` preset, and the lab's fixed-work screening — the
root candidate generator consumes the entire search budget before MCTS completes a
single iteration, so `runMCTS` returns its first-expanded root child, which is
`candidates[0]`, the top-scoring beam plan. **[MEASURED]**

A 10-turn Medium-vs-Medium self-play game (140 decisions, real per-decision
allowances from `useAI`'s formula):

| completed MCTS iterations | decisions |
|---|---|
| 0 | 138 |
| 1 | 2 |

Stop reason was `deadline` on all 140. **[MEASURED]**

Fixed-work mode from a fresh opening, Medium:

| `fixedWork` | MCTS iterations | beam candidates | wall ms |
|---:|---:|---:|---:|
| 1,200 (the lab league default, `lab/ai/run.ts:52`) | **0** | 1,200 | 110 |
| 4,000 (used by `tests/ai/wasm-tactics.test.ts:89`) | **0** | 4,000 | 356 |
| 20,000 | 1 | 20,000 | 1,453 |
| 100,000 | 5 | 100,000 | 7,599 |

**[MEASURED]**

Wall-clock mode from a fresh opening (one decision, allowance = `TURN_BUDGET_MS/4`):

| preset | reported ms | iterations | beam candidates | simulations | tactical DFS nodes |
|---|---:|---:|---:|---:|---:|
| easy (450 ms) | 450 | 1 | 5,554 | 5,597 | 12 |
| medium (1000 ms) | 1000 | 1 | 13,983 | 14,017 | 12 |
| hard (2000 ms) | 2001 | 1 | 29,926 | 29,970 | 12 |

All three chose the identical move list. **[MEASURED]**

Mechanism **[CODE]**: the MCTS rollout at `src/ai/search/mcts.ts:83-90` calls
`planGenerator` for non-root states. The engine's generator
(`src/ai/engine-v2.ts:123-128`) only applies the `until` time fence and the
`maxCandidates` cap when `sim === observed` — i.e. only at the root. For any
rollout state the inner `beamSearchPlans` is bounded solely by the shared
`SearchBudget`, so the first rollout's first beam expansion drains everything that
is left. `budget.stats.iterations` is incremented only *after* the rollout
(`mcts.ts:92-94`), hence 0.

Consequence for the widening: root capacity is
`floor((visits+1)^0.5)` (`mcts.ts:60`), so a root needs ≥ 3 visits before it opens a
*second* child. With 0–5 iterations the root has exactly one child and
`bestPlanFromRoot` (`mcts.ts:110-131`) returns it. **[INFER, from CODE + MEASURED]**

**So the production engine is, in practice: tactical overrides → a bounded
candidate set → one-ply greedy static ranking.** Everything written below about
MCTS, progressive widening, opponent UCT sign-flipping and the quiescence
sharpener is *implemented and tested* but *not reached* at shipped budgets.

---

## 1. The decision pipeline for one AI turn

### 1.1 Entry points and per-action loop

- UI: `src/components/GameScreen.tsx:218-274` instantiates one `useAI` per seat and
  fires `executeAITurn` once per turn number. **[CODE]**
- `src/hooks/useAI.ts:35-86` is the turn driver. It loops **one action at a time**:
  - `useAI.ts:41` — `remainingCPU = TURN_BUDGET_MS[difficulty]` per turn.
  - `useAI.ts:53-54` — `decisionsRemaining = actionsRemaining` in the action phase,
    **hardcoded 4** in the place phase; `allowance = remainingCPU / decisionsRemaining`.
  - `useAI.ts:55-56` — one worker round trip per action; `remainingCPU` is decremented
    by the *reported* `result.timeMs`.
  - `useAI.ts:61-65` — **only `result.plan.actions[0]` is ever executed.** An empty
    plan becomes `phaseEndAction`; an illegal proposal throws a user-visible error
    rather than silently passing.
  - `useAI.ts:69-78` — waits for an explicit React commit and compares a JSON
    projection of the gameplay fields; a mismatch aborts the turn.
  - `useAI.ts:58` — a cosmetic 400 ms `thinkingDelay` per action (GameScreen passes 400).
- Lab: `lab/harness/bots/engine.ts:66-91` mirrors the same "search, take `[0]`,
  re-search" loop, adds a `shouldResign` check at turn start (`engine.ts:72`) and
  uses `fraction = homeInvader ? 1 : phase==='action' ? 1/max(1, actionsRemaining/2) : 0.25`
  with a floor of 80 ms (`engine.ts:85-86`). **[CODE]**

The practical effect: **the multi-action plan is thrown away after its first action**,
and a fresh full search runs for every single action point. `lastIntent`
(`engine-v2.ts:46,155,185`) gives the previous choice a +0.2 score nudge, but plan
ids for beam plans are `JSON.stringify(actions)` (`beam.ts:15`), which cannot survive
the removal of the first action — so the nudge only ever applies to the stable ids
`raid:<unitId>`, `combination:<targetId>`, `home-rescue`, `immediate-victory`,
`upkeep-N`. **[INFER, from CODE]**

### 1.2 `AIEngineV2.findBestAction` in order (`src/ai/engine-v2.ts:57-189`)

**Inputs:** the full real `GameState` (perfect information since v2.1 — the
observation/belief layer was deleted; `docs/PLACEMENT_SIMPLIFICATION-2026-09-09.md`
lists 500 deleted lines), plus `decisionMs`.

**0. Budget** (`engine-v2.ts:58`):
```
new SearchBudget(fixedWork ? Infinity : min(decisionMs, config.mctsTimeLimit),
                 fixedWork || Infinity)
```
`SearchBudget` (`src/ai/runtime.ts:13-24`) counts *work units* (`spend()` = 1 per
beam candidate and per sharpener node) and wall time via `performance.now()`.
Tactical DFS nodes are counted separately in `stats.tacticalNodes` and are **not**
charged against `maxWork`. **[CODE]**

**1. Upkeep branch** (`engine-v2.ts:61-81`). If `state.upkeepPending`, it enumerates
keep-sets from `upkeepActions` (`src/game/upkeep.ts:34-55`: exact subset enumeration
for ≤ 12 rent-bearing units, otherwise 4 greedy orderings by cost/defense/attack/mining
plus the empty set), scores each by a *static* `evaluatePosition` of the post-payment
state, then — if an enemy sits on our home corner and the victory rule is not
`elimination` — replays the top 32 paid boards through the tactical solver with a
3,000-node cap looking for a proved rescue; the first such plan gets `+100000`
(`engine-v2.ts:70-75`). Returns immediately. No MCTS, no beam.

**2. Placement candidates** (`engine-v2.ts:84` → `src/ai/planner/placement.ts:14-59`).
Bounded, hand-written purchase plans, only in the `place` phase:
- For each distinct affordable tier-1 definition, the **top 2** spawn squares by
  `positionScore = min(def.mining, cell.resourceLayers)*10 + (def.mining >= 2 ? -dist : dist)`
  (`placement.ts:31-37`). Note the sign flip: miners (Water/Plant, mining ≥ 2) are
  pulled *toward* home, non-miners (Fire/Lightning/Shadow/Metal-1 has mining 2 so it
  is a miner) are pushed to the *far* edge of the rectangle — a crude forward-anchor
  / spawn-strike heuristic.
- Every legal `PROMOTE_UNIT` as its own single-action plan (`placement.ts:40`).
- For each of the **first 8** enemy units (`placement.ts:41`): buy up to
  `min(4, resources)` `fire_1` on squares adjacent to it, end placement, then attack
  with each fresh Hi — the "summon-and-strike" template (`placement.ts:42-51`).
- For each of those 8 enemies, the nearest legal `water_1` and `metal_1` purchase as
  a blocker (`placement.ts:53-57`).

**3. Immediate elimination win** (`engine-v2.ts:85-88`). Generates all `ATTACK`
actions, filters by `isLegalAction`, and if any single attack produces
`winner === player`, that becomes the plan at score 1,000,000.

**4. Home rescue override** (`engine-v2.ts:89-94`). `homeInvader` (`src/ai/tactics/home.ts:12-15`)
finds an enemy standing on our own start corner. If present, run the solver with the
**full** `tacticalNodes` cap. `proved` → plan `home-rescue`, score 100,000. The
solver's status is recorded in `budget.stats.tacticalStatus`.

**5. Combination-kill candidates** (`engine-v2.ts:97-107`). For **every** enemy unit
on the board, call the solver with `min(tacticalNodes, 3000)` nodes. A `proved`
removal becomes a root plan; if applying it wins outright it short-circuits at
1,000,000, otherwise it is scored by `scorePartialPlan + strategicValue`.
This is an O(enemy units) sequence of DFS calls *before* any planning; in my
self-play probe a single Black decision on turn 3 burned 158 tactical nodes here,
and late positions had 20+ enemy units. **[CODE + MEASURED]**

**6. Raid candidates** (`engine-v2.ts:108-121` → `src/ai/planner/strategies.ts:50-57`).
Any own unit whose BFS move cost to the enemy corner is ≤ `actionsRemaining` gets a
single-`MOVE` raid plan. For each: apply, then `endTurn(next)` to build the real
defender reply position, then solve whether the defender can remove our raider
(cap `min(tacticalNodes, 20000)`):
- `disproved` → **immediately chosen as best plan** (`engine-v2.ts:119`),
- `proved` → `-100`, `unknown` → `-10` (`engine-v2.ts:118`).

This proof is *sound and complete* for its scope, because an invader on the home
corner blocks every spawn rectangle, so the defender genuinely cannot purchase.
**[CODE + INFER]**

**7. Beam root generation** (`engine-v2.ts:123-131` → `src/ai/planner/beam.ts:17-48`).
`reserveStrategies([...rootPlans, ...beamSearchPlans(...)], outputPlans=20)`.

`beamSearchPlans` is a plain forward beam over *action sequences within one turn*:
- `maxSteps` = `actionsRemaining + 1` in the action phase, **8** in the place phase
  (`beam.ts:22`).
- At each step, for each prefix, enumerate `generateAllActions` sorted by
  `incomeMovePriority` (`beam.ts:33`; `placement.ts:63-67`: `ATTACK`=100, everything
  non-MOVE = 0, MOVE = destination take − current take).
- Each expansion costs one budget unit (`beam.ts:34`) and is scored by
  `scorePartialPlan(...) + strategicValue(...)` (`beam.ts:39`) and tagged
  (`scoring.ts:37-74`).
- Keep `beamWidth` prefixes via `reserveStrategies` (`beam.ts:44`), which reserves one
  slot each for the tags `defensive, kill, raid, mining, promotion_play, expansion`
  before filling by score (`strategies.ts:41-49`).
- **Root-only fences** (`engine-v2.ts:126-127`): stop at 45 % of the wall-clock budget
  (`budget.started + budget.milliseconds * 0.45`), or at `floor(fixedWork/3)` candidates
  in fixed-work mode.
- `templates: false` is passed unconditionally by the engine (`engine-v2.ts:125`), so
  **`generateTemplatePlans` (`src/ai/planner/templates.ts:80-91`, the `immediate_kill`
  and `move_then_kill` patterns) is dead code in production** — only
  `tests/ai/search-correctness.test.ts:12` reaches it. **[CODE]**

**8. Home-safety pass over candidates** (`engine-v2.ts:135-151`). For each of the ≤ 20
candidates, apply it and check whether *we* end up occupying the opponent's home
(`homeInvader(next, opponent)`). If so, build the reply state and solve:
`disproved` → `+5000`, `proved` → `−150`, `unknown` → `−50`; if the reply state is
already a victory for them, `−1000000`. If the budget is spent, a blanket `−100` is
applied to any plan that moved onto the enemy corner (`engine-v2.ts:136-139`).

**9. MCTS** (`engine-v2.ts:156-159` → `src/ai/search/mcts.ts:26-104`). Described in
§1.4. **In practice it returns `candidates[0]`** (§0).

**10. Deadline fallbacks** (`engine-v2.ts:161-178`). If nothing produced a plan: pick
the highest-value *lethal* adjacent attack, valuing a home invader at
`+100000` over its unit cost (`engine-v2.ts:166-176`, `budget-capture`); otherwise
emit `phaseEndAction` (`budget-fallback`). `tests/ai/deadline.test.ts` covers all
six preset×seat combinations at `decisionMs = 0` and the four "don't invent a
capture" negatives.

**11. Execution prefix** (`engine-v2.ts:179-184`). The chosen plan is truncated to its
legal prefix in the real position, re-checking `isLegalAction` and the acting seat
before each step. An empty result in `phase === 'playing'` becomes `phaseEndAction`.

### 1.3 The WASM tactical DFS

**ABI and wiring.** `src/ai/wasm/kernel.ts:31` hard-requires `abiVersion() === 6`;
`assembly/tactics.ts:34` returns 6 and `solve()` rejects any input whose header word
is not 6 (`assembly/tactics.ts:164`). Built by `asconfig.json`:
`optimizeLevel 3, shrinkLevel 1, runtime "incremental", maximumMemory 256`,
output `src/ai/wasm/tactics.wasm` (8,056 bytes in this worktree; the 2026-09-07
recorded binary was 7,645 bytes / 3,490 gzip). **[CODE]**

**Interface** (`kernel.ts:17-21, 42-68`): no managed objects cross the boundary. The
host writes a 6-int-per-definition catalogue (attack, defense, speed, next-tier index,
promotion price, tier), a `defs×defs` elemental attack-power matrix computed from the
canonical `calculateAttackPower` (so lab element/handicap knobs are respected), and a
1,016-int packed position: header `[6, unitCount, playerIndex, actionsRemaining,
phaseFlag, resources, actionsPerTurn]` then 10 ints per unit at offset `16 + i*10`
(packed position `y*10+x`, owner, definition index, damageTaken, a flag bitfield
`canAct|promotedThisPlacement|placedThisTurn|lastAttackKilled`, four 32-bit words of
"already attacked" bitmask, and the attack count). `env.shouldStop` is polled from
the live `SearchBudget` every 128 nodes (`assembly/tactics.ts:64`).

**What it proves.** `solve()` (`assembly/tactics.ts:163-179`) iteratively deepens on
*action cost* (`for cost = 1..actions`) and returns:
- `1` = **proved**: a concrete witness action list that removes the target this turn.
- `0` = **disproved**: exhaustive failure *within the declared scope*.
- `-1` = **unknown**: node cap hit, host stop, or an out-of-scope query.

`TacticalResult.scope` is the literal string
`'current-turn target removal; all moves/attacks; home-blocked promotions'`
(`kernel.ts:13,16`). **[CODE]**

**Scope limits** (all **[CODE]**):
- `kernel.ts:38` — `unknown` if `upkeepPending`, not `playing`, target missing, or
  `units.length > 100` (`MAX_UNITS` at `assembly/tactics.ts:5`).
- `kernel.ts:40-41` — in the `place` phase, `unknown` **unless** the target is an enemy
  standing on the current player's own start corner. Rationale (`assembly/tactics.ts:141-142`,
  `docs/AI_IMPLEMENTATION_STATUS.md`): home occupation blocks every spawn rectangle, so
  the promotion-subset enumeration at `assembly/tactics.ts:143-159` really is complete.
- **Purchases are never searched.** The DFS emits only `MOVE`(1), `ATTACK`(2),
  `PROMOTE_UNIT`(3), `END_PLACE_PHASE`(4) (`kernel.ts:75`).
- `assembly/tactics.ts:81` — depth cap 107; `path`/`output` buffers are `3*108` ints.
- `assembly/tactics.ts:69-78` `possible()` — an admissible optimistic bound (empty
  board, each still-eligible attacker once) that prunes; over-estimating rescue ability
  keeps `disproved` sound.
- Move ordering inside the DFS: attacks on the target first, then blocker-clearing
  attacks (`assembly/tactics.ts:83-105`), then BFS moves ordered approach-first,
  retreat/rotation second (`assembly/tactics.ts:123-127`). Each DFS level owns its own
  100-int BFS scratch row (`assembly/tactics.ts:21-22`).

**Witness validation.** Every returned action is re-checked with the canonical
`isLegalAction` and replayed through `transitionWithoutCheckmate`; an illegal witness or
a witness that fails to remove the target **throws** (`kernel.ts:78,81`). A redundant
`END_PLACE_PHASE` arriving when already in the action phase is dropped (`kernel.ts:77`).

**JS reference / fallback.** `src/ai/tactics/home.ts:21-58` `referenceTactics` implements
the same contract in TypeScript (iterative deepening on cost, `canPossiblyRemove`
bound from `kernel.ts:87-98`, `getMovementRange` for exact multi-action moves). It is
the engine's default solver (`engine-v2.ts:45`) and the worker's fallback when the
`.wasm` fetch fails (`src/ai/worker/entry.ts:12-13`, surfaced to the player as
`warning`). Differential tests: `tests/ai/wasm-tactics.test.ts:65-85` (150 seeded
reachable positions, > 50 compared statuses), `:111-121` (all 18×18 catalogue pairings
× every damage level), `:122-134` (attack-count/kill-eligibility packing).

### 1.4 MCTS as written (reached only at ≥ ~20k work units)

`src/ai/search/mcts.ts:26-104`:
- Tree descent is capped at `treeDepth < 4` (`mcts.ts:57`); a *"move"* in this tree is a
  whole `TurnPlan`, and `applyPlan` (`mcts.ts:33-44`) stops at the first action that
  would hand the turn over — so a plan may end with `END_ACTION_PHASE` and cross
  exactly one turn boundary. Root children come from `config.rootPlans`; deeper nodes
  re-run the full beam for whoever is to move (`mcts.ts:58`).
- Progressive widening: `capacity = max(1, floor((visits+1)^alpha))`, `alpha = 0.5`
  for all presets (`mcts.ts:60`, `engine-v2.ts:31`).
- Priors: `Math.tanh(plan.score / 100)`, decayed as `prior/(1+visits)` in UCT
  (`mcts.ts:64`, `src/ai/search/uct.ts:14`).
- UCT (`uct.ts:3-23`): `exploit = valueSign * totalValue/visits`, `explore = 1.4 * sqrt(ln(N)/n)`,
  plus the decayed prior. `valueSign = -1` at opponent nodes (`mcts.ts:73-74`) — the
  adversarial fix from `docs/AI_CORRECTNESS-2026-09-07.md`. `uct.ts:5-6` additionally
  truncates the considered children to `floor(visits^alpha)` in insertion order.
- Rollout: up to 4 more plies, always taking `plans[0]` — the *greedy* beam plan, not a
  sampled one (`mcts.ts:83-90`).
- Leaf value: `Math.tanh(evaluator(state, rootPlayer) / 100)` (`mcts.ts:93`), where the
  evaluator is `tacticalSharpen(...) + strategicValue(...)` (`engine-v2.ts:159`).
  Because of the `/100` + `tanh`, **any evaluation above roughly ±300 is
  indistinguishable from a win** (tanh 3 = 0.995) — material swings of 30+ crystals
  already saturate to ~0.99. **[INFER, from CODE]**
- Root choice: most-visited child (`mcts.ts:124-129`).
- `MCTSConfig.rng` is declared (`mcts.ts:14`) and passed (`engine-v2.ts:158`) but
  **never read anywhere in the file** — `grep -rn rng src/ai` shows only the
  declaration, the assignment, and `engine-v2.ts`. The seeded RNG plumbing is dead.
  MCTS has no stochastic element at all. **[CODE]**

### 1.5 Sharpener (quiescence)

`src/ai/eval/sharpener.ts:10-40`: stand-pat at `evaluatePosition`, then expand only
legal `ATTACK` actions of the side to move, max if that is the root player and min
otherwise (correct: actions do not alternate seats). Depth = `tacticalDepth`
(0/1/2). `isHotPosition` (`sharpener.ts:42-50`) returns true if **any** unit on the
board — either side's — has a legal attack, so the gate is very loose.
It is only called from the MCTS evaluator, so **in production it is effectively
unreachable too** (§0). **[CODE + INFER]**

### 1.6 Worker protocol

`src/ai/worker/protocol.ts:4` — `AI_PROTOCOL = 2`. Request identity is
`{version, gameId, requestId, revision, player}` plus the whole `GameState`,
`difficulty`, `seed`, `decisionMs`, optional `fixedWork`.
- `src/ai/worker/client.ts:19,24` — `gameId = crypto.randomUUID()`, regenerated on
  `restart()`; **`seed` defaults to 1 and is never varied by the UI.**
- `client.ts:43` — watchdog `setTimeout(max(2000, decisionMs + 2000))` that terminates
  the worker and rejects; search deadlines themselves are enforced internally.
- `client.ts:34-39` — stale responses are dropped via `sameRequest`.
- `src/ai/worker/handler.ts:12-23` — rejects `version !== 2` or a request whose
  `state.turn.currentPlayer !== player`; keeps at most 2 engine contexts keyed
  `gameId:player`, clearing when a third appears.
- `src/ai/worker/entry.ts:16-21` — requests are serialised through a promise chain so
  two searches can never interleave on the shared WASM buffers.

---

## 2. The evaluation function in full

`src/ai/evaluation.ts`. `evaluatePosition(state, forPlayer, weights)`:

1. `evaluation.ts:33-37` — terminal check via `getGameResult`: draw → **0**,
   victory → ±`VICTORY_SCORE` (**100000**, `evaluation.ts:21`). This is the *only*
   place the inactivity draw enters the evaluation.
2. `evaluation.ts:43` — `0.08 * homeOccupationPressure(state, forPlayer)`.
   `src/game/victory.ts:115-118` returns `250 * (ourHomeOccupiedByEnemy? ... )` — read
   carefully: it is `250 * (occupier-on-**player's**-home − occupier-on-opponent's-home)`,
   i.e. **+20 when an enemy sits on our own corner**, −20 when we sit on theirs. Scaled
   by 0.08 the term is ±20. Verified sign-wise only by reading; it is intentionally a
   "visible threat" prior per the comment at `evaluation.ts:41-42`.
3. Every remaining feature is a **symmetric difference** `f(us) − f(them)` times a weight.

### `DEFAULT_WEIGHTS` (`src/ai/types.ts:73-88`) — verbatim

| feature | weight | computed by | what it actually is |
|---|---:|---|---|
| `unitValue` | **1.0** | `evaluation.ts:136-142` | Σ `def.cost` of on-board units |
| `resourceAdvantage` | **0.5** | inline `evaluation.ts:52-55` | banked crystals |
| `territoryControl` | **0.3** | `evaluation.ts:147-150` | `getAllSpawnPositions().length` — unblocked spawn squares |
| `miningPotential` | **0.2** | `evaluation.ts:155-157` → `src/game/mining.ts:12-15` | Σ `min(def.mining, cell.resourceLayers)` = **this turn's** income only |
| `threatLevel` | **0.4** | `evaluation.ts:162-179` | Σ cost of **adjacent** enemies we can kill outright now |
| `mobility` | **0.3** | `evaluation.ts:185-201` | Σ (legal 1-action move destinations + 1.5 × legal attacks) |
| `centerControl` | **0.2** | `evaluation.ts:207-223` | Σ `max(0, 7 − euclidean distance to (4.5,4.5))` |
| `unitHealth` | **0.1** | `evaluation.ts:228-234` | Σ `def.defense` (**base**, ignores `damageTaken`) |
| `killThreatsReceived` | **−2.0** | `evaluation.ts:236-251` | Σ cost of our units with an **adjacent** enemy that kills them |
| `combinedAttackPotential` | **0.8** | `evaluation.ts:253-266` | Σ cost of enemies killable by ≥ 2 **already-adjacent** attackers |
| `spawnDenialPressure` | **−1.5** | `evaluation.ts:268-280` | count of enemy units standing on our spawn squares |
| `spawnInfiltration` | **1.0** | `evaluation.ts:282-294` | count of our units standing on their spawn squares |
| `stepEfficiency` | **0.2** | `evaluation.ts:296-304` | `min(activeUnits, actionsRemaining)`, **0 unless it is our action phase** |
| `techTreeProgress` | **0.4** | `evaluation.ts:306-313` | Σ over elements of (highest on-board tier − 1) |

`AI_ENGINE_README.md:51` still documents a `queueValue` weight. **It does not exist**
(`grep queueValue src/` → no hits outside that README line). **[DOC vs CODE]**
The same README's difficulty section still mentions "belief particles" for each
preset, which were deleted in v2.1.

### Measured decomposition **[MEASURED]**

Opening position (`createInitialGameState`, 3v3 mirror, both banks 0):
`evaluatePosition(s,'white') = 0.600`, and zeroing every weight in turn moves the
score by 0.000 **except `stepEfficiency` (0.600)** — i.e. the whole opening evaluation
is the side-to-move's step bonus. `strategicValue(s,'white') = 0.000`.

Same position plus one extra white `plant_3` at (1,7) → `25.640`. Ablation:

| zeroed weight | Δ |
|---|---:|
| `unitValue` | 17.000 |
| `territoryControl` | 3.300 |
| `miningPotential` | 1.600 |
| `mobility` | 1.200 |
| `techTreeProgress` | 0.800 |
| `stepEfficiency` | 0.800 |
| `centerControl` | 0.540 |
| `unitHealth` | 0.400 |
| everything else | 0.000 |

Opening position with 17 crystals banked instead → `9.100`.

**So the eval prices a 17-crystal unit at ~25.6 and 17 banked crystals at ~8.5: a
3× premium on converting cash into bodies, before `scorePartialPlan` adds its own
income bonus.** That is the exact opposite of `docs/STRATEGY_GUIDE-2026-09-12.md` §1
("Bank early, spend late") and §6 ("they bankrupt the owner"). **[MEASURED + DOC]**

### Perspective handling

`forPlayer` is threaded through every call and is never flipped by a turn boundary —
this was the explicit repair in `docs/AI_CORRECTNESS-2026-09-07.md` ("Tactical negamax
changes sides after every action"), regression-tested at
`tests/ai/search-correctness.test.ts:16-22`. Note the one asymmetry it creates:
`stepEfficiency` is 0 for a player who is not to move (`evaluation.ts:297`), so any
plan that ends the turn takes a systematic −0.2 × (their active units, ≤ 4) hit.
**[CODE + INFER]**

### Income projection and tier tracking

- `projectedIncome` (`src/game/mining.ts:12-15`) is the exact canonical one-turn take
  (`min(mining, resourceLayers)` per unit) — it is **ground truth for this turn**, and
  correctly gives 0 credit to a plant on a mined-out cell.
- It carries **no horizon**: a `plant_3` (mining 8) on a fresh 16-stack and on a
  2-stack-plus-14-elsewhere board score 8 vs 2 this turn but the model has no notion
  that the 16-stack is a two-turn asset. `getReachableResources` (`mining.ts:41-43`)
  exists but is never called from `src/ai`.
- `techTreeProgress` is a pure "highest tier per element" ladder with no cost or
  upkeep counterweight.

### Features that are proxies, not ground truth

- `territoryControl` — square count, not anchor safety. A 32-square rectangle anchored
  by one 3-crystal Hi that dies next turn scores the same as a defended one.
- `mobility` — counts single-action destinations only (`getValidMoves` returns squares
  within `speed`, `src/game/movement.ts:29-32`), so it systematically over-rewards
  high-speed units and under-counts a slow unit's real 4-AP reach.
- `centerControl` — pure geometry on the 10×10 with hardcoded `(4.5,4.5)` and the magic
  `7`. The live map (`src/game/resourceMap.ts:6-16`) has **zeros in the centre columns
  D–F rows 1–3 and 8–10** and 16-stacks at B8–C9 / H2–I3, so "centre" is where the ore
  is *not*. **[CODE + INFER]**
- `unitHealth` — base defense, ignoring accumulated `damageTaken` (which `scorePartialPlan`
  does count separately at `scoring.ts:21`).
- `threatLevel` / `killThreatsReceived` / `combinedAttackPotential` — all strictly
  **adjacency-now**. No approach cost, no next-turn reach, no fresh purchases.
- `homeOccupationPressure` — a flat ±20 prior explicitly *not* a win claim.
- `shouldResign` (`evaluation.ts:397-438`) is disabled outside `victoryRule === 'elimination'`
  (line 399), so in normal games it never fires; only `lab/harness/bots/engine.ts:72` calls it.

### `strategicValue` — the second half of the ranking signal

`src/ai/planner/strategies.ts:11-38`, added to every plan score in the beam
(`beam.ts:39`) and to the MCTS leaf (`engine-v2.ts:159`):
- For every armed unit of either side: `±max(0, actionsPerTurn + 1 − ceil(manhattan/speed)) * 1.2`
  toward the *opposing* home corner — a raid proximity prior. With 4 actions this pays
  up to 6.0 per unit that is already on the corner.
- If a real BFS route to the enemy corner costs ≤ 4 actions, add
  `±max(0, 4 − routeCost) * (defendersWithin2OfThatCorner ? 0.4 : 2)`.
- `strategies.ts:36` — a flat **−200** if an enemy occupies our own home.

### `scorePartialPlan` — what actually ranks the candidates

`src/ai/planner/scoring.ts:10-35`:
```
evaluatePosition(simState, forPlayer)          // full static eval, DEFAULT_WEIGHTS
+ killCount * 20
+ (Σ damageTaken on surviving enemies) * 0.5
+ (incomeDelta + (still our turn ? projectedIncome : 0)) * 1.5
- plan.actions.length * 0.1
```
plus `strategicValue`. `getGameResult(simState).status === 'draw'` short-circuits to
**0** (`scoring.ts:16`) — this is the mechanism behind
`tests/ai/upkeep-clock.test.ts:10-18`: at `inactivityPlies = 9`, any plan that ends the
turn without a kill scores exactly 0, so a killing plan wins. It is **terminal-state
detection, not clock-distance awareness** — at plies 0–8 the clock is invisible.
**[CODE + INFER]**

---

## 3. Difficulty presets, budgets, modes

### The literal table (`src/ai/engine-v2.ts:29-39`)

```
DEFAULT_CONFIG = { mctsIterations: 500, mctsTimeLimit: 1500, beamWidth: 30,
                   outputPlans: 20, progressiveWideningAlpha: 0.5,
                   tacticalDepth: 1, tacticalNodes: 100000, fixedWork: 0 }
```

| | Easy | Medium | Hard |
|---|---:|---:|---:|
| `mctsIterations` | 100 | 500 | 1,200 |
| `mctsTimeLimit` (per-decision ceiling, ms) | 800 | 1,500 | 3,000 |
| `beamWidth` | 10 | 30 | 50 |
| `tacticalDepth` (sharpener plies) | 0 | 1 | 2 |
| `tacticalNodes` (DFS visit cap) | 5,000 | 100,000 | 600,000 |
| `TURN_BUDGET_MS` (whole turn, `engine-v2.ts:39`) | 1,800 | 4,000 | 8,000 |
| `outputPlans` | 20 | 20 | 20 | ← **not** varied by preset |
| `progressiveWideningAlpha` | 0.5 | 0.5 | 0.5 | ← **not** varied |

This matches the table in `docs/AI_IMPLEMENTATION_STATUS.md` exactly. **[CODE + DOC]**
That doc is explicit: *"These are explicit effort presets, **not a statistically
calibrated difficulty ladder**."*

Effective per-decision allowance in the UI:
`min(TURN_BUDGET_MS / decisionsRemaining, mctsTimeLimit)`. For a fresh action phase
that is Easy 450 ms, Medium 1,000 ms, Hard 2,000 ms; `mctsTimeLimit` only binds once
earlier actions returned quickly. **[CODE + MEASURED]**

Since the three presets differ only in beam width, sharpener depth and DFS caps — and
the sharpener is unreachable and the beam already exceeds width at every setting —
**the practical difference between Easy and Hard is "how many beam candidates were
scored before the clock ran out"**. In my opening probe all three chose the identical
action. **[MEASURED + INFER]**

### Fixed-work vs wall-clock

- Wall-clock (`fixedWork = 0`, the shipped UI path): `budget.milliseconds =
  min(decisionMs, mctsTimeLimit)`, `maxWork = Infinity`. Time is read with
  `performance.now()` (`runtime.ts:17`) and, separately inside MCTS, with `Date.now()`
  (`mcts.ts:46,49`) against `decisionMs` (uncapped). Results are **not reproducible**:
  three identical Medium searches on the same position produced 9,247 / 10,415 / 10,640
  candidates (the chosen first action happened to agree). **[MEASURED]**
- Fixed-work (`fixedWork > 0`): `budget.milliseconds = Infinity`, `maxWork = fixedWork`,
  MCTS `timeLimitMs = Infinity`, root beam capped at `floor(fixedWork/3)` candidates.
  This *is* deterministic (the header comment at `runtime.ts:1` and the equality assertion
  at `tests/ai/worker.test.ts:18-26`). Lab league default 1,200 (`lab/ai/run.ts:52`).
- The lab's `fast` bot preset (`lab/harness/bots/engine.ts:39-43`) overrides
  `mctsTimeLimit: 120, mctsIterations: 60` — 120 ms per decision, which is the default
  for every mass run (`DEFAULT_OPTIONS.speed = 'fast'`, `engine.ts:36`).

### JS fallback

`src/ai/worker/entry.ts:7-15`: fetch + `WebAssembly.instantiate` of
`../wasm/tactics.wasm`; on any failure the handler is built with `solver = undefined`
and a `warning` string, so `AIEngineV2` keeps its default `referenceTactics`
(`engine-v2.ts:45`). The warning propagates to `client.warning` → `useAI.warning`.
`budget.stats.backend` is `'javascript'` unless the WASM path runs (`kernel.ts:68`).
**[CODE]**

---

## 4. `simulate.ts` vs the canonical `src/game` transition

**They are the same code.** `src/ai/simulate.ts` *is* the canonical transition:
`src/hooks/useGameState.ts:10` imports `applyAction as applyAIAction` and routes
`MOVE / ATTACK / BUY_UNIT / PROMOTE_UNIT / PAY_UPKEEP / END_PLACE_PHASE /
END_ACTION_PHASE / RESIGN / APPLY_AI_ACTION` through it (`useGameState.ts:64-87`).
There is no second reducer. **[CODE]**

- Shared legality: `simulate.ts:26` calls `isLegalAction` (`src/game/legality.ts:16-47`)
  first and returns the **identical object** on rejection, so no action/resource is
  charged. `tests/ai/correctness.test.ts:25-29` asserts
  `applyAction(s,a) === s && gameReducer(s,a) === s` for 12 malformed actions.
- Shared sub-transitions: `completeUpkeep`, `useAction`, `endTurn`, `startActionPhase`,
  `canActInPlacePhase` from `src/game/turn.ts`; `resolveCombat` from `src/game/combat.ts`;
  `checkVictory` from `src/game/victory.ts`; `resolveHomeCheckmate` from
  `src/game/homeCheckmate.ts`.
- **The one deliberate divergence**: `transitionWithoutCheckmate` (`simulate.ts:38-42`)
  skips the home-checkmate adjudication so that a *hypothetical* target-removal witness
  can be finished inside a proof. It is used only by the two solvers
  (`tactics/home.ts:9`, `wasm/kernel.ts:5`). Real play and game search always use
  `applyAction`, which wraps every non-rejected transition in `resolveHomeCheckmate`
  (`simulate.ts:32-33`) and also adjudicates a pre-existing occupation on
  `END_ACTION_PHASE` (`simulate.ts:28-31`).
- Deterministic IDs: `nextUnitId` (`simulate.ts:14-20`) yields
  `unit-<player>-<turnNumber>-<n>`, identical in the reducer and in search
  (`tests/ai/simulate-ids.test.ts`). Contrast `src/game/board.ts:104`, where
  `createUnit` still builds ids from `Date.now()` + `Math.random()` — that path is only
  used for the initial six units and lab/test fixtures, not for AI purchases.
- Movement cost: `applyMove` (`simulate.ts:83-96`) charges the **full** BFS cost by
  looping `useAction` (`tests/ai/correctness.test.ts:30-34` asserts a 3-action move
  leaves 1 action and is rejected at 2).
- `applyActions` (`simulate.ts:178-186`) stops at the first illegal action **or** at a
  change of acting seat, so no plan can silently play the opponent's turn.

**Cost per node.** Cloning is structural sharing — every transition is a spread of
`{...state}` with fresh `board.units` / `cells` arrays. There is no dedicated compact
search state. The expensive parts are:
- `board.units.map(...)` per move/attack (O(units) allocation per node),
- `endTurn` rebuilding all 100 cells (`src/game/mining.ts:25-28`),
- `getAllSpawnPositions` (`src/game/spawning.ts:98-118`) — O(units × rectangle) and
  called **four times per `evaluatePosition`** (territoryControl ×2, spawnDenial,
  spawnInfiltration),
- `getValidMoves` / `getValidAttacks` per unit inside `mobility`, `threatLevel`.
BFS is the one thing that is cached: `src/game/movement.ts:239-257` memoises distances
per `(board identity, origin)` in a `WeakMap` keyed by the immutable `BoardState`.
**[CODE + INFER]**

Measured throughput: ~13–14 k beam candidates/second at Medium wall-clock and
~13 k candidates/second in fixed-work (1,200 candidates in 110 ms; 100,000 in 7.6 s).
**[MEASURED]**

---

## 5. Concrete weaknesses, with evidence

### W1 — MCTS never runs; the engine is one-ply greedy *(severity: defining)*
See §0. 138/140 decisions at 0 iterations **[MEASURED]**; root cause at
`mcts.ts:83-90` + `engine-v2.ts:126-127` (the `until`/`maxCandidates` fences are
root-only) **[CODE]**. Every claim in `AI_ENGINE_README.md`/`docs/AI_IMPLEMENTATION_STATUS.md`
about "MCTS widens root alternatives and models adversarial choices" is true of the code
and false of the running system at shipped budgets.

### W2 — The search horizon stops before the opponent's reply
A beam plan is scored by a **static evaluation of the position immediately after our
own turn** (`scoring.ts:26`). The opponent's reply is searched in exactly three places
**[CODE]**:
1. our raider standing on their home corner (`engine-v2.ts:117`),
2. any candidate that ends with us occupying their home (`engine-v2.ts:147`),
3. an enemy occupying **our** home (`engine-v2.ts:91`).
For every other decision — every trade, every miner placement, every retreat — the
only "what can they do to me" signal is `killThreatsReceived`, i.e. *enemies already
standing adjacent*. There is no "can they reach and kill this piece next turn" search
at all.

Cross-check: `docs/hard-ai/understand/napkin-snapshot.md:11` — *"Compute reach for EVERY
enemy unit incl. speed-1 ones (moves+attack ≤ 4 AP)"*; `docs/STRATEGY_GUIDE-2026-09-12.md`
§5 makes approach-cost classification "the decisive habit of this game". The engine
implements none of it.

### W3 — Spawn-strike threats from fresh purchases are invisible
The engine models its *own* summon-and-strike (`placement.ts:41-51`) but never the
opponent's. `killThreatsReceived` (`evaluation.ts:236-251`) iterates
`getAttackersFor(unit.position, board, opponent)` — existing units only. No term
anywhere reads the opponent's bank against their spawn rectangle.
Napkin `:10` is exactly this loss: *"a freshly BOUGHT Radi (speed 3) from a
forward-anchored rectangle killed my Hi turn 2 … Threat check must include purchases."*
Strategy guide §4: *"Keep 6–8 crystals in reserve for this at all times."* **[CODE + DOC]**

### W4 — Upkeep is not in the evaluation at all
`grep -rn "upkeep" src/ai/` → only `engine-v2.ts` (the upkeep *phase* branch),
`moves.ts:62`, `simulate.ts:46`, the solvers' `upkeepPending` guards, and
`evaluation.ts:411` inside the dead `shouldResign`. **[CODE]**
`UPKEEP_BY_TIER = {1:0, 2:1, 3:2, 4:3}` (`src/game/upkeep.ts:5`). So the eval scores a
`plant_3` at `+17 (unitValue) + 0.4 (techTree) + mining` and charges **nothing** for
its 2-per-turn rent stream, while `techTreeProgress = 0.4` actively rewards climbing.
Strategy guide §6 (*"Codex ended with 6 upkeep on 4 income … its bank went 22 → 4 and
it resigned"*) and napkin `:13` (*"released units to upkeep on turn 13"*) describe the
exact failure mode. When rent finally bites, the response is a one-ply greedy
keep-set choice ranked by static material (`engine-v2.ts:61-81`).

### W5 — No draw-clock awareness until the last ply
`inactivityPlies` appears nowhere in `src/ai` except `simulate.ts:101` (setting it).
`INACTIVITY_LIMIT = 10`, `INACTIVITY_WARNING = 7` (`src/game/inactivity.ts:3-4`). The
only reaction is the terminal `draw → 0` at `scoring.ts:16` / `evaluation.ts:34`, which
fires at ply 9→10. There is no gradient from ply 5 to ply 9, no "am I the one who
benefits from a draw" reasoning, and the whole concept is absent for a position the
engine reaches three turns deep in a rollout.

### W6 — Crystals left under miners are not tracked
`miningPotential` is a single-turn take (`mining.ts:12-15`). `placementPlans` sees the
reserve (`placement.ts:32`) for *purchase-square choice only*. Nothing models depletion
runway or the value of relocating a plant before a stack empties.
Napkin `:11`: *"bought Mujus on home 10-cells that were already half-mined, so income
collapsed to ~1 by turn 6 … Track crystals LEFT under each miner … relocate/buy onto
fresh 10s before depletion."* With the v2.8 map (`src/game/resourceMap.ts`: 0/4/8/16,
504 total, `MAX_RESOURCE_RESERVE = 16`) and Plant mining 3/5/8, a `plant_3` empties a
16-stack in two turns — squarely in the horizon the engine lacks.

### W7 — Anchor value is a square count, not a survivability model
`territoryControl` = `getAllSpawnPositions().length × 0.3`. A far-forward anchor and a
home-hugging one are interchangeable at equal rectangle size, and losing an anchor is
priced only as the drop in square count *after* it dies — never anticipated.
Napkin `:11`: *"A far anchor is worthless if one cheap enemy unit can step into the
rectangle"*; `:13`: *"Whoever owns a forward anchor owns the board."* Conversely
`spawnDenialPressure = −1.5` per enemy body in our rectangle badly under-prices a total
purchase shutdown (strategy guide §4: *"one unit of yours inside all of the opponent's
rectangles shuts off their purchases"*). **[CODE + DOC]**

### W8 — Speed-1 reach and multi-action reach are structurally invisible
`generateMoveActions` (`moves.ts:15-29`) emits only single-action destinations
(`getValidMoves` → `reachable(pos, speed, board)`, `movement.ts:29-32`). Multi-action
movement exists only via chaining in the beam, via `raidPlans`' single long `MOVE`
(`strategies.ts:54-56`), and inside the solvers. `mobility` therefore reports a
`water_1` (speed 1) as nearly immobile and a `lightning_1` (speed 3) as very mobile,
when both have a 4-AP budget. Napkin `:11`: *"Ignored slow units' reach (Straumr spd1 =
4 squares/turn killed my Hi at D3)."* **[CODE + DOC]**

### W9 — Purchases are outside every proof
`kernel.ts:41` and `tactics/home.ts:26` return `unknown` for any place-phase query
except a home-blocked one; the DFS emits no `BUY_UNIT` (`kernel.ts:75`).
This is *correct and deliberate* for the two cases it is used in — a home invader
blocks all spawn rectangles, so the defender genuinely cannot buy — but it means the
engine has **no** proof machinery for the ordinary question "can they kill this piece
next turn, buying if they need to". Combined with W3 this is the largest tactical
blind spot. **[CODE]**

### W10 — No transposition table, no iterative deepening above the kernel
- `grep` shows no hash/TT anywhere in `src/ai`. MCTS keys children by plan id
  (`mcts.ts:61`) — a *path* key, not a position key — so two action orders reaching the
  same board are two distinct subtrees. The beam dedups by
  `planId = JSON.stringify(actions)` (`beam.ts:15,37`), which is again action-order
  sensitive: `move A then B` and `move B then A` are separate beam slots consuming
  separate width.
- Iterative deepening exists **only** inside the kernel (`assembly/tactics.ts:173`) and
  its JS twin (`tactics/home.ts:52`), on action cost. The beam has a fixed
  `maxSteps` and MCTS a fixed `treeDepth < 4` / `rolloutDepth < 4`.
- The one transposition structure in the repo is `failed`/`key` in
  `src/game/homeCheckmate.ts:86-89` — that is the *rules* prover, not the AI.
  **[CODE]**

### W11 — Move ordering is thin and the beam truncates mid-list
`incomeMovePriority` (`placement.ts:63-67`) is the only ordering: `ATTACK = 100`,
everything else non-MOVE = **0**, MOVE = destination take − current take. In the place
phase that means **every purchase, every promotion and `END_PLACE_PHASE` all tie at 0**
and are explored in raw generation order — `getAffordablePurchases × getAllSpawnPositions`
(`moves.ts:50-54`). Measured: with 40 crystals and one forward anchor at (5,5), a single
place-phase node has **192 `BUY_UNIT` actions / 197 total**, and the action-phase opening
has 9. **[MEASURED]** When the budget runs out mid-expansion the beam does
`break outer` (`beam.ts:34`), so the tail of that ordered list is never seen at all —
which is why the place phase is the most budget-starved decision in the game.

### W12 — Nondeterminism sources
- `src/ai/search/mcts.ts:46,49` uses `Date.now()`; `src/ai/runtime.ts:17` uses
  `performance.now()`. In wall-clock mode the amount of work done — and therefore which
  candidate is `[0]` — depends on machine speed and load. Measured spread on three
  identical Medium searches: 9,247 / 10,415 / 10,640 candidates. **[MEASURED]**
- `src/game/board.ts:104` — `createUnit` ids embed `Date.now()` and `Math.random()`.
  Harmless for decisions (ids never enter a sort key) but they do make plan-id strings
  non-reproducible across sessions, which further neuters `lastIntent`.
- `src/ai/worker/client.ts:19,24` — `crypto.randomUUID()` for `gameId`.
- The *seeded* RNG (`runtime.ts:3-6`) is plumbed to MCTS and then **never read**
  (`mcts.ts` has no `config.rng` use). Fixed-work mode is deterministic not because of
  the seed but because nothing in the search is stochastic. **[CODE]**

### W13 — Dead / unreachable code that the docs treat as live
- `generateTemplatePlans` (`templates.ts:80-91`) — `templates: false` at
  `engine-v2.ts:125`, unreachable in production.
- `tacticalSharpen` (`sharpener.ts`) — only called from the MCTS evaluator (§0),
  effectively unreachable.
- `AIEngineV2.getMinThinkingTime()` (`engine-v2.ts:55`) — zero callers.
- `estimateUnitValue` (`scoring.ts:80`), `evaluateUnitPosition` / `scoreAction`
  (`evaluation.ts:338,364`) — tests only (the greedy lab bot has its own local
  `scoreAction`, `lab/harness/bots/greedy.ts:38`).
- `MCTSConfig.rng` — see W12. **[CODE]**

### W14 — Budget accounting understates the real cost
Tactical DFS nodes are charged to `stats.tacticalNodes`, **not** to `maxWork`
(`kernel.ts:68`, `tactics/home.ts:54,57`). In fixed-work mode the per-enemy combination
sweep (`engine-v2.ts:98-107`) is therefore unbounded by the work budget — only by its
own 3,000-node cap **per enemy unit** and by the wall clock, which is `Infinity` in
fixed-work mode. With 20+ enemy units that is up to 60,000 uncounted DFS nodes before
planning starts. **[CODE + INFER]**

### W15 — The upkeep decision and the place phase both get a flat 1/4 of the turn
`useAI.ts:53` hardcodes `decisionsRemaining = 4` for the whole place phase, so an AI
that wants to buy six units gets `TURN_BUDGET_MS/4` for the first purchase and then
progressively less; at Medium my self-play showed place-phase allowances decaying
1000 → 750 → 562 → 421 ms within a single turn. **[CODE + MEASURED]**

### W16 — `centerControl` points at the wrong squares for the current map
See §2. The weight (0.2) is small, but it is a *systematic* pull toward the zero-ore
centre on the v2.8 "Unequal routes" map. **[CODE + INFER]**

---

## 6. How the lab measures AI strength today

### The three entry points

**`lab/ai/run.ts`** — two modes, both refusing to overwrite an existing output dir
(`run.ts:18`), both writing a `metadata.json` with source SHA-256, catalogue SHA-256,
WASM SHA-256/bytes/gzip, cold instantiation ms, Node version, device and seed
(`run.ts:24-28`).
- `tactics` (`run.ts:29-48`): for each fixture, assert the solver's status matches
  `expected`, then drive all three presets through a real decision loop (≤ 16 decisions,
  `TURN_BUDGET_MS` allowance) and record whether the target was actually cleared.
- `league` (`run.ts:49-66`): the engine as `EngineBot` with
  `fixedWork = AI_WORK ?? 1200, mctsIterations: 30`, versus 8 scripted bots, both seats,
  20-round cap, one seed block (20260907). The file itself says
  *"Explicit screening override; never label these results as the UI ladder"*
  (`run.ts:50`) and the summary note says *"Caps are not victories; not a measured
  difficulty ladder"* (`run.ts:66`).

**`lab/ai/compare-production.ts`** — loads an independently archived production tree's
`engine-v2.ts` and races it against the candidate on the `proved` fixtures at Medium
with a 4,000 ms allowance and a 50 ms late tolerance (`compare-production.ts:23-26`).
Its own `method.json` disclaims: *"Production RNG was not seedable … not a
representative league or throughput comparison."*

**`lab/ai/fixtures.ts`** — **14 authored rescue puzzles × 2 orientations = 28 cases**
(`fixtures.ts:32-33`). 9 of the 14 are `proved`, 5 are `disproved`. Coverage:
one-attack, two-attacker, three-attacker rotation, promotion-dependent, no-money,
blocker-clearing, multi-action approach, zero-attack occupier, same-target limit,
prior damage, `placedThisTurn`, ineligible defender, one-promotion-per-phase.
`rotate()` (`fixtures.ts:35-41`) mirrors positions and swaps seats, which is the
seat-bias check.

Note: `docs/AI_IMPLEMENTATION_STATUS.md` says *"15 authored positions … (30 cases).
Nine per orientation are rescuable and six are not."* The file today has 14/28.
**[DOC vs CODE — stale by one fixture.]**

### The last measured results (`lab/results/ai-wasm-2026-09-07/`)

`final-tactics/` — 30 fixture names × 3 presets = **90 rows**. All 18 `proved` rows
per preset cleared the target (18/18 at easy, medium and hard). Max DFS nodes on any
fixture **4,393**; max solver time **3.21 ms**; max whole-decision time
800.5 / 1500.6 / 3000.5 ms for easy/medium/hard — i.e. the fixtures are trivial for
the kernel and the time is spent in the planner. **[MEASURED from the JSON]**

`final-production-puzzles/` — 18 feasible cases × 2 versions:

| version | cleared | total solver+decision ms across 18 |
|---|---:|---:|
| `production-e70a057` | **12 / 18** | 37,762 |
| `candidate` (this engine) | **18 / 18** | **14.8** |

The six the old engine missed: three-attacker rotation (×2), promotion-dependent
rescue (×2), multi-action approach (×2) — exactly the cases the WASM DFS adds.
**[MEASURED from the JSON]**

`final-screen/` — 16 games (8 opponents × 2 seats), `fixedWork = 1200`, one seed block:
`{games: 16, naturalGames: 12, caps: 4, candidateWins: 12, illegalActions: 0}`.
Per-game: 11 home-occupation wins, 1 elimination win, 4 adjudicated caps
(Balanced ×1, Tier1Spam ×1, AntiRush ×2). Fastest wins are 4-turn home occupations
against Expand, Balanced, Turtle and Random. **[MEASURED from the JSON]**

### What these results do *not* establish

- **They are stale.** `final-production-puzzles/outcomes.json` fixture names are
  `"Metal IV / two Fire II"`, `"mine loses the last saving action"`,
  `"hidden budget / no promotion money"` — pre-v2.1 rules (a 4th tier, an explicit mine
  action, a hidden bank). Today's `fixtures.ts` has `"Metal III / two Shadow III"` and
  `"public bank / no promotion money"`, and the map/catalogue changed twice since
  (v2.1 placement, v2.8 economy). Base commit is `e70a057`; HEAD is `44c41c4`. **[CODE]**
- **No opponent-strength measurement exists for the current rules.** The 8 scripted bots
  (`lab/harness/bots/index.ts:16-39`) are hand-written policies; the ladder comment
  calls the engine "L3" above Rush/Expand/Balanced at "L2". There is no self-play Elo,
  no paired league, no confidence interval anywhere in `lab/results/`.
- The only games in the record were played at `fixedWork = 1200`, where MCTS runs **0**
  iterations (§0) — so even that screen measures the greedy planner, not the search.
- The two newest result dirs, `lab/results/opening-census-2026-09-14/` and
  `handicap-census-2026-09-14/` (2026-09-14, 635,203 four-ply opening states), use their
  **own** hand-rolled scorer — `census.ts` imports only `board/movement/turn/spawning/
  units/elements/simulate/legality`, never `evaluatePosition` or `AIEngineV2`. They are
  opening/handicap theory, not AI-strength measurements. **[CODE]**

---

## 7. Keep / wrap / replace

### Keep as-is (load-bearing and correct)

1. **`src/ai/simulate.ts` + `src/game/legality.ts`** — one authoritative immutable
   transition shared by UI, AI and lab, with reject-returns-identity semantics and
   deterministic ids. This is the foundation any new engine should build on.
2. **The WASM kernel + its JS twin** (`assembly/tactics.ts`, `src/ai/wasm/kernel.ts`,
   `src/ai/tactics/home.ts`). It is fast (max 4,393 nodes / 3.2 ms on the fixture set),
   sound (witnesses are re-validated against canonical legality and *throw* on
   violation), honest about its scope, and it is the only reason the engine beat the
   pre-WASM production engine 18/18 vs 12/18. Its 3-valued
   `proved/disproved/unknown` contract is exactly the right primitive for a stronger
   engine to call more often.
3. **`SearchBudget` / fixed-work mode** (`src/ai/runtime.ts`) — the reproducibility
   mechanism. Any replacement search should keep `spend()`/`exhausted()` and the
   fixed-work escape hatch.
4. **Worker boundary** (`protocol.ts`/`client.ts`/`entry.ts`/`handler.ts`) — identity
   checking, stale-response dropping, watchdog, serialised requests, graceful JS
   fallback with a user-visible warning. Nothing here needs to change for a new search.
5. **`useAI`'s commit-acknowledgement loop** (`useAI.ts:69-78`) — hard-won (see the
   "zero-delay timer preceded React's commit" note in `docs/AI_IMPLEMENTATION_STATUS.md`).
6. **`lab/ai/run.ts` metadata discipline** — SHA-pinned sources/catalogue/binary,
   refuse-to-overwrite, natural wins separated from caps.

### Wrap (keep the code, change how it is driven)

7. **The beam planner** (`beam.ts` + `scoring.ts` + `placement.ts`). The machinery —
   prefix states reused for scoring, tag reservation, income-aware move priority — is
   sound; what is broken is that it is the *whole* engine. Wrap it as a **root move
   generator with a hard candidate cap** (it should never consume more than ~20 % of a
   decision) and let a real search do the choosing. Concretely: move the `until` /
   `maxCandidates` fences out of the `sim === observed` special case at
   `engine-v2.ts:126-127` and apply them to **every** invocation.
8. **`evaluatePosition`** — keep the feature set as a *baseline* but re-price it. The
   three changes with the most evidence behind them: add an upkeep-liability term
   (W4), replace `unitValue`-vs-`resourceAdvantage`'s 2:1 spend premium with something
   calibrated (§2 measurement), and drop or re-target `centerControl` for the v2.8 map
   (W16). It is cheap enough to keep as a leaf evaluator once the search actually runs.
9. **`useAI`'s per-action re-search** — correct behaviour (it prevents stale plan
   suffixes), but it currently re-pays the full root-generation cost 4–6 times per turn.
   Wrap it with a per-turn cache keyed on the position so the second-through-fifth
   decisions reuse the turn's root analysis instead of rebuilding it.
10. **`placementPlans`' bounded purchase templates** — keep the *idea* (the raw
    Cartesian product is unsearchable, W11), but the current top-2-per-definition rule
    and the `mining >= 2 ? -dist : dist` sign flip are guesses. Wrap them behind an
    explicit, testable "candidate purchase squares" function.

### Replace

11. **`src/ai/search/mcts.ts` + `uct.ts`.** As measured it contributes nothing, and the
    design is a poor fit anyway: Muju is a perfect-information, low-branching-at-the-
    action-level, deep-at-the-turn-level game with a *very* strong tactical oracle
    available. The natural replacement is a **depth-limited alpha-beta / PVS over
    whole-turn plans** with a transposition table keyed on the board+turn state,
    iterative deepening, and the WASM kernel used as both a move generator and an
    extension at the leaves. That directly fixes W1, W2, W10 and makes the difficulty
    presets mean something (depth, not "how much beam fit in the clock").
12. **The threat model.** `threatLevel` / `killThreatsReceived` /
    `combinedAttackPotential` are adjacency-only and must be replaced by a real
    **reach-and-kill** computation: for every enemy unit (and every square the opponent
    could *buy* onto), which of my units can be killed within 4 AP. The pieces already
    exist — `getMovementRange`, `getAttackFrontier` (`movement.ts:200-214`),
    `getAllSpawnPositions`, `calculateAttackPower` — they have simply never been wired
    into the evaluation. This is W2/W3/W8 in one change and is the single item the
    napkin and the strategy guide agree on most loudly.
13. **The economic model.** Replace the per-turn `projectedIncome` snapshot with a
    short-horizon projection that knows (a) how many turns of ore remain under each
    miner, (b) the upkeep liability of the current army, and (c) the draw clock. That
    is W4/W5/W6 together.
14. **The seeded-RNG plumbing** — either make the search actually stochastic and use the
    seed, or delete `RNG`/`seededRandom`/`MCTSConfig.rng` so "deterministic under a
    seed" stops being a claim nobody can check.
15. **Dead code in W13** — delete `getMinThinkingTime`, `estimateUnitValue`, and either
    wire `generateTemplatePlans` in (its two patterns are genuinely useful root
    candidates) or remove it; leaving it behind `templates: false` is worse than either.
16. **The stale doc surface** — `AI_ENGINE_README.md` (`queueValue`, "belief particles"),
    the fixture count in `docs/AI_IMPLEMENTATION_STATUS.md`, and the
    `lab/results/ai-wasm-2026-09-07/` result set, which is now three rules revisions old
    and should be explicitly marked historical before anyone cites its 18/18.

---

## Appendix: reference numbers used above

- Catalogue (`src/game/units.ts:5-233`), v2.8 — Plant mining 3/5/8:
  `fire_1` 2/1/2 mine 1 cost 3 · `fire_2` 3/1/2 m1 c7 · `fire_3` 4/2/3 m1 c15 ·
  `lightning_1` 1/1/3 m0 c3 · `lightning_2` 2/1/4 m0 c7 · `lightning_3` 3/1/5 m0 c15 ·
  `water_1` 2/2/1 m2 c4 · `water_2` 2/3/1 m2 c8 · `water_3` 3/4/2 m3 c16 ·
  `shadow_1` 2/2/2 m0 c4 · `shadow_2` 3/2/2 m1 c8 · `shadow_3` 4/2/3 m2 c16 ·
  `plant_1` 0/3/1 m3 c5 · `plant_2` 1/3/1 m5 c9 · `plant_3` 2/4/1 m8 c17 ·
  `metal_1` 1/3/1 m2 c5 · `metal_2` 2/4/1 m3 c9 · `metal_3` 2/5/2 m4 c17
  (attack/defense/speed, mining, cost).
- Map (`src/game/resourceMap.ts:1-17`): "Unequal routes", 0/4/8/16,
  `MAX_RESOURCE_RESERVE = 16`, 504 crystals total, 180°-symmetric.
- Rules: `DEFAULT_ACTIONS_PER_TURN = 4` and `isActionsPerTurn` accepts **only** 4
  (`src/game/rules.ts:9-13`); `MAX_BLACK_CRYSTAL_HANDICAP = 20` (`rules.ts:3`);
  upkeep 0/1/2 by tier (`src/game/upkeep.ts:5`); draw at 10 quiet plies, warning at 7
  (`src/game/inactivity.ts:3-4`); home-checkmate prover cap `PROOF_NODES = 20000`
  (`src/game/homeCheckmate.ts:22`); elemental modifier ±1, floor 0
  (`src/game/elements.ts:103-114`, `src/game/combat.ts:80-89`).
- Starting position: White Hi(1,0) Sjor(1,1) Muju(0,1), Black mirrored at (8,9)/(8,8)/(9,8),
  both banks 0 (plus Black's handicap), turn 1 starts in the **action** phase
  (`src/game/board.ts:184-260`, `createInitialGameState` at `:203`).

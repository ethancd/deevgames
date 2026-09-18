# P7 — a memoised canonical home verdict: design and price

E4 lane 6, opened 2026-09-17 23:53:46Z, written 2026-09-18 00:14Z, at the E4
plan commit `437ee40f` on `claude/hard-ai-e4-lane6`.

DESIGN ONLY. No file under `src/game` or `src/ai` is changed in this lane. The
change this document specifies is a CANONICAL rules-engine change and runs under
its own preregistration (§7), after E4's lane 4 (the `injectRescue` cap), per
`E4-PLAN.md` lanes table row "P7 canonical home verdict" and
`../e3/P8-SLOW-TURNS.md` §6 ("sequence the two").

Everything numbered below was measured in this lane, one process at a time, each
invocation under five minutes, no heavy slot, on an otherwise idle box, node
v24.11.1. The scripts are `lab/results/hard-ai-e4/p7/verdict-cost.ts` and
`lab/results/hard-ai-e4/p7/key-sensitivity.ts`; the artifacts are the JSON files
beside them. Neither script patches `src/`: the instrumentation is a copy of
`searchHomeDefense`/`enoughPossibleDamage` inside the lab script whose verdict is
compared against the unmodified canonical verdict on every single call, and a
disagreement aborts the run (none occurred in any run reported here).

---

## 1. What the canonical home adjudication costs

### 1.1 What is being timed

`src/ai/simulate.ts applyAction` calls `src/game/homeCheckmate.ts
resolveHomeCheckmate` on the post-transition state of EVERY action, and on the
PRE-transition state as well when the action is `END_ACTION_PHASE`
(simulate.ts:29-34). `resolveHomeCheckmate` runs six cheap gate tests
(homeCheckmate.ts:175-181) and then `analyzeHomeDefense`, the full prover, whose
node limit is `PROOF_NODES = 20000`.

A "verdict call" below means one call that passed the gate and reached the
prover. The lab script reproduces the gate exactly (homeCheckmate.ts:173-181)
and times the prover call the engine would make on the same state.

### 1.2 The P8 positions

Source: `lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/`
`e1-g2-s40_3_3-A-white.json`, game seed 2399710895, the game P8 diagnosed.
Artifacts: `p8-white24.json`, `p8-neighbours.json`, `p8-black22.json`,
`p8-game.json`, `p8-white24-wall3000.json`.

Canonical replay of each recorded turn, action by action:

| position (side, seat turn, game turn) | bodies | recorded turnMs | applyAction total | verdict calls | distinct keys |
| --- | ---: | ---: | ---: | ---: | ---: |
| white seat turn 24, game turn 25 | 32 | 2,641,138 | **12,846.71 ms** | 4 | 3 |
| white seat turn 23, game turn 24 | 32 | 529,023 | 0.185 ms | 0 | 0 |
| black seat turn 23, game turn 24 | 30 | 927,996 | 0.191 ms | 0 | 0 |
| black seat turn 22, game turn 23 | 32 | 83,023 | 0.089 ms | 0 | 0 |
| white seat turn 22, game turn 23 | 34 | 1,184 | 0.073 ms | 0 | 0 |
| black seat turn 21, game turn 22 | 32 | 1,184 | 0.207 ms | 0 | 0 |

- Only ONE of the four P8 slow turns pays the canonical side at all.
- The other three slow turns are the P6/P8 generation and replica-prover cost
  inside `searchTurn`; the canonical engine charges them 0.2 ms.
- That reproduces P8 §1 ("canonical `applyAction` adjudication on the returned
  plan: 0 ms on this turn") and P8 §3 (the canonical cost appears only where a
  body actually stands on a home corner).

White seat turn 24, per action (the recorded turn, 6 actions):

| # | action | applyAction ms | verdict calls |
| ---: | --- | ---: | ---: |
| 0 | `BUY_UNIT` | 0.073 | 0 |
| 1 | `END_PLACE_PHASE` | 0.001 | 0 |
| 2 | `MOVE` (white `water_3` (8,9) → (9,9)) | **3,260.248** | 1 |
| 3 | `MOVE` | **3,398.345** | 1 |
| 4 | `ATTACK` | **3,106.022** | 1 |
| 5 | `END_ACTION_PHASE` | **3,082.021** | 1 |

- The first two actions are free because no white body stands on (9,9) yet.
- From the corner-entering `MOVE` onwards every action pays one full prover run.
- All four verdicts are `unknown`: each exhausts the 20,000-node limit.
- `unknown` is not a mate, so `resolveHomeCheckmate` returns the state unchanged
  and the game continues — the 12.8 s buys no decision at all.
- Per verdict: 3,142.411, 3,226.092, 3,231.772, 3,444.473 ms (mean 3,261.2 ms).
- 3 distinct cache keys for 4 calls (§1.4).

### 1.3 Inside one verdict

Instrumented copy, white seat turn 24, the verdict after action index 2,
3,226.092 ms total (`p8-white24.json`, call 0):

| component | calls | ms | share |
| --- | ---: | ---: | ---: |
| `enoughPossibleDamage` at `act` nodes (homeCheckmate.ts:96) | 646,215 | **2,521.157** | 78.1% |
| `transitionWithoutCheckmate` (ATTACK and MOVE children) | 639,552 | 443.953 | 13.8% |
| `getValidMoves` + sort | 20,000 | 255.452 | 7.9% |
| `getValidAttacks` + sort | 20,000 | 34.158 | 1.1% |
| `key(s)` failed-set signature (homeCheckmate.ts:90) | 20,000 | 33.512 | 1.0% |
| `enoughPossibleDamage` at the top (homeCheckmate.ts:77) | 1 | 0.176 | 0.0% |

- Spent nodes: 20,000 (the cap), of which `prepare` nodes 13,338.
- Failed-set hits: **0**. The transposition set inside the prover never fires on
  this position; the damage bound does all the pruning.
- 646,215 bound evaluations for 20,000 spent nodes: the bound is evaluated on
  every CHILD before the child is spent, so 97% of bound calls are on children
  the bound then rejects.
- Mean bound evaluation 3.90 µs; the bound allocates a fresh 3 × 5 DP table and
  copies it once per defender body (homeCheckmate.ts:31, 38).
- This is why the verdict costs seconds and not milliseconds: 18 defender bodies
  × 4 actions × a 20,000-node cap, at ~160 µs per node.
- The component shares are the reason a memo is the only canonical lever short
  of rewriting the prover: no single component is a slow accident.

### 1.4 The duplicate that is free to remove

- `applyAction` adjudicates the POST state of action k, then, when action k+1 is
  `END_ACTION_PHASE`, adjudicates its PRE state — the same object
  (simulate.ts:30 and 34).
- Measured on white seat turn 24: call 3 (`ATTACK`, post) and call 4
  (`END_ACTION_PHASE`, pre) carry the same key `1f4e4efb81e9cd6b`, the same
  verdict `unknown`, the same 20,000 nodes and the same 619,659 bound calls.
- Cost of that repeat: **3,142.411 ms**, 24.5% of the turn's 12,846.71 ms.
- It is structural, not positional: every turn that ends with an action phase
  while the mover occupies the enemy corner pays it.

### 1.5 The same position under the engine, at the wall

One `searchTurn` in a fresh process, `hard@desktop`, `wall:3000`, white seat
turn 24 (`p8-white24-wall3000.json`, 2026-09-18 00:05:42Z–00:07:07Z):

- `searchTurnMs` **26,120.647**, `stopReason` abort, depth 0, nodes 0,
  turnNodes 5, work 69, source `search` — P8 §3 measured 24,808 ms for the same
  run; this box is 5.3% slower today, the shape is identical.
- Plan returned (6 actions): `END_PLACE_PHASE`, `ATTACK`, `MOVE`, `ATTACK`,
  `MOVE`, `END_ACTION_PHASE`.
- Canonical cost of applying that plan: **15,018.557 ms**, per action 0.002,
  0.003, 3,027.834, 3,991.380, 3,869.232, 4,130.106 ms.
- P8 §3 measured the same four actions at 2,802 / 3,808 / 3,732 / 3,667 ms and
  attributed 16,008 ms to `pickUnsearched → verifyTurn`; the 15,018.557 ms here
  is that same work, timed directly rather than from a profile.
- 4 verdict calls, all `unknown` at 20,000 nodes, 2,934.404 / 3,881.048 /
  3,852.759 / 3,941.956 ms.
- 3 distinct keys: calls 3 and 4 share `96e7ebdaf2bc2c4a` (§1.4's structural
  repeat), worth **3,941.956 ms**.
- `lab/harness/runner.ts:266` then applies the very same plan through
  `applyAction` again, from the very same state: a second 15,018.557 ms, every
  verdict of it a recomputation of a verdict `verifyTurn` already computed.

### 1.6 Sixteen ordinary mid-game positions, for contrast

Source: four `lab/results/hard-ai-e1/baseline/replays` games
(`e1-g4-s430_3_37-A-white`, `g4-s30_3_3-A-white`, `e1-g5-s915_0_96-B-white`,
`e1-g5-s315_0_86-A-white`), seat turn indices 6 and 10 on both sides, game turns
7–12, 14–22 bodies (`ordinary16.json`).

- 16 turns, 99 actions, **0.768 ms** of `applyAction` in total.
- **0** verdict calls: the gate rejects every state, because no body stands on a
  home corner.
- Per turn: min 0.025 ms, max 0.097 ms, mean 0.048 ms.
- Per action: mean 0.0078 ms, against 3,211 ms per adjudicated action on the P8
  turn — a factor of 4.1 × 10^5.
- The canonical home adjudication is free everywhere except in a home race. A
  memo must therefore cost nothing on the gate-rejected path (§3.3).

Eight whole baseline games, ply by ply (`baseline8.json`, 292 turns, 1,713
plies): 27 verdict calls, 17 distinct keys, **10 duplicates (37.0%)**, 4.85 ms
of prover time inside 27.74 ms of `applyAction`. The duplicate RATE in ordinary
games is the same structural repeat of §1.4; the SAVING there is microseconds.

Sixteen stored `home-mate` suite positions whose state already carries an
occupation (`occupied-suites.json`, of 56 in
`lab/hard-ai/suites/home-mate.positions.jsonl`): 1.505 ms total, median
0.015 ms, max 0.675 ms (`promotion-dependent-rescue-mate`), verdicts 10 mate /
6 rescue, 10 distinct keys. `lab/hard-ai/positions/authored.jsonl`: 11
positions, 0 reach the prover.

### 1.7 The one-paragraph answer

The canonical home verdict costs nothing in 99.9% of the game and 3.0–4.1 s per
action in a mutual home race with 30+ bodies, because in that position every
call exhausts the 20,000-node cap and 78% of the time inside the cap is the
optimistic damage bound re-evaluated at 646,215 child states. It is not a
mis-scaled constant and it cannot be tuned away without changing verdicts. What
CAN be removed without changing a verdict is recomputation: 24.5% of one P8
turn's canonical cost, and the entire second replay of every plan the engine has
already verified.

---

## 2. What the verdict depends on

Read out of the code (`src/game/homeCheckmate.ts` 27-171 and everything it
calls), not guessed. `S` is the state handed to `resolveHomeCheckmate`, `I` the
invader (`S.turn.currentPlayer`), `D = getOpponent(I)`.

### 2.1 Fields the gate reads (homeCheckmate.ts:175-181)

- `S.phase` — must be `playing`.
- `S.upkeepPending` — must be false.
- `S.victoryRule` — must not be `elimination`.
- `S.board.units` and `S.board.cells.length` — through `getHomeOccupier`
  (victory.ts:103-106): a body of `I` on `(n-1,n-1)` for white, `(0,0)` for
  black; and the mirrored test for `D`, which must be empty.
- `S.ruleset` — `isPhasing` (rules.ts:4).
- `S.turn.phase` — in Phasing only, must be `place`.

These decide only WHETHER the prover runs. They are not part of the cache key,
because the cache is consulted downstream of the gate (§3.2).

### 2.2 Fields the prover reads (homeCheckmate.ts:68-171)

`searchHomeDefense` builds `ready` by overwriting four things:
`board = resetUnitActions(S.board, D)`, `upkeepPending = false`,
`turn.currentPlayer = D`, `turn.phase = 'action'`,
`turn.actionsRemaining = getActionsPerTurn(S)`. Everything overwritten is
therefore irrelevant to the verdict, whatever it held in `S`.

READ, and part of the key:

- `S.turn.currentPlayer` — as `I`; it fixes which corner is the target and which
  army rescues.
- `S.board.cells.length` — the grid dimension, through `getHomeOccupier` and
  `isValidPosition`.
- `S.actionsPerTurn` — `getActionsPerTurn` (rules.ts:20), the defender's budget.
- `S.ruleset` — `isPhasing` twice: line 77 chooses the damage bound's
  `preparing` flag, line 159 chooses `act(ready)` over `prepare(...)`.
- `S.players[D].resources` — the defender's bank, spent on upkeep and promotions
  in `prepare` (lines 146-157) and read by the bound (line 28).
- For every unit of `D`: `position` and `definitionId`. Through
  `getUnitDefinition`: `tier`, `speed`, `attack`, `element`, `cost`; through
  `getNextTierDefinition` and `unitUpkeep`: the promotion target and the rent.
- For every unit of `I`: `position`, `definitionId` and `damageTaken`. They are
  blockers for `getMoveCost`, targets for `getValidAttacks`, and — for the
  occupier — `calculateDefense` reads `damageTaken` directly (line 48).

READ but NOT part of the key, with the reason:

- Every other `Unit` field OF THE DEFENDER — `hasMoved`, `hasAttacked`,
  `canActThisTurn`, `damageTaken`, `placedThisTurn`, `promotedThisPlacement`,
  `attackedThisTurn`, `lastAttackKilled` — is overwritten by `resetUnitActions`
  (board.ts:271-298) before the prover looks at it.
- Every action-tracking field OF THE INVADER: the invader never acts inside the
  proof, so `canAttack`, `getAttackCount` and `attackedThisTurn` are only ever
  consulted for units owned by the current player of the search state, which is
  always `D`.
- `Unit.id`: ids appear only inside the search, in `attackedThisTurn` and in the
  failed-set signature, and only relative to one another. Two states that differ
  by a renaming have identical search trees (§2.4).
- The ORDER of `S.board.units`: `enoughPossibleDamage` accumulates a maximum,
  `prepare` sorts `owned` by distance, `act` sorts its actions by distance. The
  sorts are by value, not by index. (Ties inside a sort fall back to array
  order, which is why the key's unit tokens are SORTED rather than taken in
  board order; a tie could otherwise reorder two equal-distance candidates and
  change which rescue is found FIRST — never which verdict is returned, but the
  key must not depend on it either way.)

NOT READ AT ALL, below the gate:

- `S.players[I].resources` — the invader's bank. The bound's `cash` is always
  the DEFENDER's (line 28 reads `state.players[state.turn.currentPlayer]`, and
  the search state's current player is `D`); `isLegalAction` reads a bank only
  for `BUY_UNIT` and `PROMOTE_UNIT`, and the proof's transitions are only
  `ATTACK` and `MOVE` (lines 102-118).
- `S.turn.actionsRemaining`, `S.turn.turnNumber`, `S.turn.phase` (outside
  Phasing's gate), `S.upkeepPending`, `S.phase` (beyond the gate's `playing`).
- `S.pendingSummons` — an occupied home invalidates every pending summon
  (homeCheckmate.ts:75-76) and the prover never adds one to the board;
  `hasPendingSummon` is reached only from `BUY_UNIT` legality, which the proof
  never attempts.
- `S.blackCrystalHandicap`, `S.lastIncome`, `S.lastUpkeep`, `S.lastSummoning`,
  `S.inactivityPlies`, `S.progressThisTurn`, `S.inactivityRule`,
  `S.reviewUpkeep`, `S.victoryReason`, `S.winner`, `S.selectedUnit`,
  `S.validMoves`, `S.validAttacks`.
- `S.board.cells[y][x].resourceLayers` and `S.board.initialResourceLayers` — no
  purchase and no mining happens inside the proof.

NOT IN `GameState` AT ALL, and the reason the key needs a rules epoch (§3.4):

- `combatHandicap` (combat.ts:62), set by `setCombatHandicap`, read by
  `calculateAttackPower` (combat.ts:90). It has setters and no getter.
- The upkeep schedule (upkeep.ts:8), set by `setUpkeepVariant`, read by
  `unitUpkeep`.
- The element graph (elements.ts:47), set by `setElementGraph`, read by
  `getAttackModifier` inside `calculateAttackPower`.
- `UNIT_DEFINITIONS` (units.ts:5) is an exported mutable array; nothing in
  `src/` or `lab/` mutates it today, and `src/ai/hard/core/catalog.ts`
  `catalogSignature()` already hashes it together with the three knobs above for
  exactly this reason.
- `maxNodes`: `resolveHomeCheckmate` always passes the default `PROOF_NODES`
  (20,000). A caller that passes anything else must bypass the cache (§3.5).

### 2.3 The key

```
key(S, I) = I / cells.length / actionsPerTurn / ruleset / rulesEpoch
            / players[D].resources
            / A: sorted[ square . definitionId . damageTaken  for units of I ]
            / D: sorted[ square . definitionId               for units of D ]
```

with `square = x + cells.length * y`.

- Measured length on the P8 32-body position: 381–391 characters
  (`p8-white24.json`, `keyLength`).
- The invader's `damageTaken` is in the key although no perturbation in §2.4
  moved a verdict through it: it is genuinely read (`calculateDefense` at line
  48 and inside `resolveCombat` for blocker-clearing attacks), so keeping it
  costs missed hits and dropping it would cost correctness.
- The defender's `damageTaken` is NOT in the key because `resetUnitActions`
  zeroes it before the prover runs.

### 2.4 The read set, checked empirically

`key-sensitivity.ts`, run 2026-09-18 00:08:24Z–00:10:22Z
(`key-sensitivity.json`): 17 probe states — the P8 white seat turn 24 position
after its corner-entering `MOVE`, and the 16 gated `home-mate` positions under
their own rules blocks — × 24 single-field perturbations = 408 perturbed
verdicts, each run through the UNMODIFIED `analyzeHomeDefense`.

The rule tested is one-directional: a perturbation that moves the verdict MUST
move the key. A perturbation that moves the key without moving the verdict is a
missed hit, not a bug.

- **Unsafe cases: 0 of 408.**
- `players[D].resources` +25 moved the verdict in 6 of 17 probes and the key in
  17 of 17; setting it to 0 moved the verdict in 7 of 17 and the key in 7 of 17.
- `invader.damageTaken` = 1 moved the key in 17 of 17 and the verdict in 0 —
  the deliberate over-keying of §2.3.
- The other 22 perturbations moved neither the verdict nor the key in any probe:
  `turn.actionsRemaining`, `turn.turnNumber`, `players[I].resources`,
  `actionsPerTurn` (dropped to the default), `pendingSummons`,
  `inactivityPlies`, `progressThisTurn`, `blackCrystalHandicap`, `lastUpkeep`,
  `selectedUnit`+`validMoves`+`validAttacks`, `board.cells.resourceLayers` → 0,
  defender `damageTaken`, defender `hasMoved`+`hasAttacked`, defender
  `canActThisTurn` = false, defender `attackedThisTurn` = every enemy id,
  defender `placedThisTurn`, defender `promotedThisPlacement`, invader
  `canActThisTurn` = false, invader `attackedThisTurn` cleared, a full renaming
  of every unit id, and reversing the unit array.
- `actionsPerTurn` moved nothing because every probe already carried the only
  legal value, 4 (`isActionsPerTurn`, rules.ts:15); it stays in the key as the
  field the prover actually reads.
- The P8 probe's verdict is `unknown` under every perturbation (the node cap
  bites in all of them), so its evidence is weak on the verdict and strong on
  cost: the same 24 perturbations ranged from 0.604 ms to 8,945.265 ms.

---

## 3. The memoisation design

### 3.1 What is cached

- The tri-state `HomeDefense` verdict (`rescue` | `mate` | `unknown`) of
  `analyzeHomeDefense(S, I, transitionWithoutCheckmate, PROOF_NODES)`.
- Nothing else. No witness, no node count, no evidence.

### 3.2 Where the lookup sits

- A module-private `Map<string, HomeDefense>` inside
  `src/game/homeCheckmate.ts`.
- Consulted by `resolveHomeCheckmate` ONLY, between the gate (line 181) and the
  prover call (line 182). The gate-rejected path — 99.9% of all actions,
  0.0078 ms per action on the §1.6 sample — does not compute a key, does not
  touch the map, and is byte-for-byte the code it is today.
- `analyzeHomeDefense` and `analyzeHomeDefenseEvidence` stay uncached and stay
  exported. They remain the reference the differential test (§4.3) and the M10
  gate compare against, and they are what the lab suites call.
- Consequence: the engine's replica (`src/ai/hard/tactics/prover.ts
  homeVerdict`) is unaffected, its node counts are unaffected, and M10's
  `nodeMismatch === 0` criterion compares the same two things it compares today.

### 3.3 Lifetime, capacity and cost on the cheap path

- Per process, not per turn and not per game: the duplication the memo exists to
  remove crosses turn boundaries (the engine's `verifyTurn` and the harness's
  re-application of the same plan are separate turns' worth of `applyAction`
  calls on identical states, `lab/harness/runner.ts:266`).
- Capacity 1,024 entries, insertion-ordered eviction (delete the oldest key when
  the map exceeds capacity). At the measured 391-byte key that is under 1 MB
  including `Map` overhead, and 1,024 entries is 256 turns of a home race at the
  4 verdicts per turn measured in §1.2.
- Key construction is O(bodies log bodies): 32 bodies, one sort, measured
  reference point 33.5 ms for 20,000 much longer signatures inside the prover
  (§1.3), i.e. ~1.7 µs each. Against a 3,261 ms verdict that is 5 × 10^-7 of the
  call; against the 0.015 ms median suite verdict it is 11%.
- The 11% on a cheap verdict is the honest cost of the design. It is paid only
  on states that reach the prover, never on the 0-call path of §1.6.

### 3.4 Invalidation

- There is no invalidation by state mutation, because there is no state
  mutation: `applyAction` and every `src/game` transition return new objects,
  and no code outside `src/ai/hard` (which uses its own packed arrays) assigns
  to a `Unit` or `BoardState` field in place — checked by grep over `src/`.
- The ONLY invalidation is the process-global rules epoch of §2.2: a counter in
  `src/game`, incremented by `setCombatHandicap`, `resetCombatHandicap`,
  `setUpkeepVariant` and `setElementGraph`. The epoch is both a key component
  and a clear trigger: the map is emptied when the epoch moves, and the epoch is
  in the key so that an entry surviving a clear is still unusable.
- Belt and braces, because the setters are three files away from the cache and a
  fourth knob could be added later: this mirrors `src/ai/hard/core/catalog.ts
  catalogSignature()`, which hashes the same three knobs plus the definition
  table, so the precedent and the failure mode are already understood in this
  codebase.
- A `__resetHomeVerdictCache()` test hook, exported and called by the suites'
  and the lab's rules prologues alongside the setters.
- If bumping the three setters is judged too wide a change for a rules-engine
  preregistration, the fallback is to derive the epoch instead of bumping it:
  `getElementGraph()`, `upkeepForTier(1..4)` and two `calculateAttackPower`
  probes (one per side) recover all three knobs without a getter, at a cost of
  about 1 µs per verdict. This is exactly `catalogSignature`'s trick and it
  changes no file but `homeCheckmate.ts`.

### 3.5 Bypass rules

- A `maxNodes` other than `PROOF_NODES`: no read, no write.
- `analyzeHomeDefenseEvidence`: no read, no write. Its `interrupted` callback is
  analysis-only and non-deterministic by construction (homeCheckmate.ts:62), so
  its `unknown` verdicts are not reproducible and must never enter a cache that
  an adjudication reads.
- A state whose gate does not pass: never reaches the cache.

### 3.6 Phasing

- `state.ruleset === 'phasing'` is in the key, so a Phasing verdict and a
  Standard verdict on the same board are different entries.
- Phasing changes the prover's shape, not its inputs: line 159 runs `act(ready)`
  instead of `prepare(...)`, and line 77 passes `preparing = false` to the
  bound, so the defender's upkeep and promotions are not searched.
- `pendingSummons` is NOT in the key: an occupied home invalidates every pending
  summon (homeCheckmate.ts:75-76), the prover never adds one to the board, and
  the only reader of `pendingSummons` below the gate would be `BUY_UNIT`
  legality, which the proof never attempts. §2.4 perturbed it on all 17 probes
  and moved nothing.
- The Phasing gate reads `S.turn.phase` (must be `place`), which is a gate
  field, not a key field: two Phasing states that both pass the gate both have
  `turn.phase === 'place'`.
- `tests/game/phasing.test.ts` already pins both sides of that gate
  (`analyzeHomeDefense` = `mate` while `resolveHomeCheckmate` leaves the game
  `playing`, then the same position prepared) and must keep passing unchanged.

### 3.7 Rejected alternatives

- A memo INSIDE the prover, on `enoughPossibleDamage` (78% of the time, §1.3):
  the bound is called on 646,215 child states per verdict at 3.90 µs each, and
  the cheapest complete signature for such a state measured 1.7 µs — building
  646,215 signatures to save 646,215 bound evaluations trades 2.5 s for 1.1 s at
  best, and needs an incremental (Zobrist-style) key to do better. That is a
  prover rewrite, not a memo, and it changes the canonical engine's hot loop.
- Reordering line 96 and line 98, so the failed-set is consulted before the
  bound: verdict-preserving and node-count-preserving, but worth 0 on the
  measured position — the failed set took 0 hits in 20,000 nodes (§1.3).
- A per-`applyAction` or per-turn cache: it cannot see the duplication between
  `verifyTurn` and the harness's re-application, which is the larger half (§5).

---

## 4. The parity proof plan

Everything in this section was RUN at `437ee40f` in this lane, so the "must not
move" numbers are measured, not quoted.

### 4.1 Frozen perft (`npm run hard:perft -- --check`)

Run 2026-09-18 00:12:07Z, artifact `lab/results/hard-ai-e4/p7/perft-baseline.json`:

- `perftActions_initial_4` = **14,959**
- `perftMidStates_initial` = **1,053**
- `perftTurns_initial` = **797**
- `fixturesChecked` = 11, `fixturesMismatch` = 0, `mismatches` = 0,
  `openings` = 797, engine `canonical`, git `437ee40f`, node v24.11.1.
- The 11 fixture rows in `lab/hard-ai/perft/fixtures.json` (for example
  `occupied-corner` 1,146 / 285 / 226 at depth 3) must be identical.
- `--engine replica` must also still reproduce the same frozen file (the M5
  gate's differential).
- Why it binds: `perftActions` enumerates through `applyAction`, so a memo that
  ever returned a different verdict would change a legal-action count or an end
  position, and `occupied-corner` is a fixture whose states reach the prover.

### 4.2 Frozen fuzz (`npm run hard:fuzz`)

Prover surface, run 2026-09-18 00:12:45Z, artifact `fuzz-prover-baseline.json`,
`--surfaces prover --cases 20000 --seed 5`:

- `fixtureCases` 28, `fixtureMismatch` 0.
- `fuzzCases` 20,000, `fuzzVerdictMismatch` 0, `nodeMismatch` 0.
- `witnessChecked` 12,858, `witnessIllegal` 0, `witnessNotRemoved` 0.
- verdicts: rescue 12,844, mate 6,001, unknown 1,155.
- `cappedCases` 6,708, `cutoffCases` 1,155, `boundCases` 5,528,
  `clockFixtureOk` true, elapsed 34,763 ms.
- Every one of these must be identical after the change. The verdict histogram
  is the sharp one: it is 20,000 independent canonical verdicts.

Gate preservation, run 2026-09-18 00:12:53Z, artifact `fuzz-gate-baseline.json`,
`--surfaces gate-preservation --actions 100000 --seed 6`:

- games 1,721, `mismatches` 0, `proofsCompared` 1,703, `proofsSuppressed` 9,946,
  `homeCheckmates` 365, elapsed 1,227 ms.
- terminals: `home-checkmate:white` 184, `home-checkmate:black` 181,
  `home-occupation:black` 329, `home-occupation:white` 305,
  `upkeep-elimination:white` 122, `upkeep-elimination:black` 108,
  `inactivity:draw` 436, `elimination:white` 39, `elimination:black` 15,
  `unfinished` 2.
- The terminal histogram is the end-to-end parity statement: a stale verdict
  would move `home-checkmate` counts and the games' lengths.

Transition and legality surfaces (M5): `--actions 1000000 --seed 20260914
--surfaces transition,legality --legality-every 8`, `divergences` 0,
`legalitySetMismatches` 0, `unmakeMismatches` 0, `rehashMismatches` 0,
`invariantViolations` 0. Not re-run in this lane (it is the M5 gate's own
five-minute-plus row); the preregistration funds it once, before and after.

### 4.3 The differential test the change owns

New test file, `tests/game/home-verdict-cache.test.ts`, to be written WITH the
change:

- Generate N = 20,000 occupier positions with the same generator the prover
  surface uses (`lab/hard-ai/fuzz/prover-surface.ts`, seed 5 and a second seed
  fixed in the preregistration) — the same population that produced §4.2's
  histogram.
- For each: compute `resolveHomeCheckmate` twice in a row (a cold miss, then a
  guaranteed hit) and assert the two results are the same object-valued verdict
  AND equal to an uncached `analyzeHomeDefense` on the same state.
- For each: assert that a state built from the same board with every field
  §2.2 lists as NOT read perturbed — the 22 perturbations of §2.4 — yields the
  SAME key, and that the cached answer for it equals a fresh uncached verdict.
  This is the test that fails if a future field starts being read.
- For each pair of positions sharing a key within the sample, assert the
  uncached verdicts agree. Over 20,000 cases this is the collision check.
- Run the whole sample with the cache capacity forced to 1 (eviction every call)
  and again at 1,024, and assert the verdict stream is identical: the memo must
  be observationally invisible to capacity.
- A rules-epoch test: adjudicate a position, change `setUpkeepVariant` /
  `setCombatHandicap` / `setElementGraph` so the verdict flips, adjudicate
  again, assert the new verdict — the test that fails if the epoch is not wired.

### 4.4 The fixed-work golden

- `npm run hard:cross-commit` (24 positions × {100,000, 400,000}, compared on
  `scoreCc`, `depth`, `work`, `nodes`, `endKey`, `source`) must be row-for-row
  identical before and after, because the engine's canonical verification
  (`src/ai/hard/verify/replay.ts verifyTurn`, called from `mustAnswer`,
  `pickUnsearched` and the root's final check, `search/root.ts` 286, 341, 453,
  480, 534) sits INSIDE `searchTurn`. A memo that changed a verdict would change
  a `verified` flag, hence a candidate, hence `endKey`.
- `npm run hard:determinism` must re-pin unchanged.
- `hard@desktop`'s config hash `4e7afdf76b32fad…` is untouched: this change is
  in `src/game`, behind no `HardConfig` key, and it changes no search parameter.
- E4-PLAN's rule that every `src/ai/hard` change sits behind a `searchFix` key
  does not apply, because nothing under `src/ai/hard` changes. That is precisely
  why this lane is gated and preregistered separately.

### 4.5 Unit tests that must pass unchanged

- `tests/game/home-checkmate.test.ts`, `tests/game/phasing.test.ts`,
  `tests/ai/hard/prover.test.ts`: 41 tests, all passing at `437ee40f`
  (run 2026-09-18 00:13:00Z, 576 ms).
- `tests/server/analysis.test.ts` and `tests/server/history.test.ts` exercise
  `analyzeHomeDefenseEvidence`, which the design leaves uncached.

---

## 5. Expected effect on the P8 wall-mode residue

All numbers from §1.5, the `wall:3000` run of white seat turn 24 of
`e1-g2-s40_3_3-A-white.json` measured in this lane at 26,120.647 ms (P8 recorded
24,808 ms for the same run on a less loaded box).

Inside `searchTurn`:

- Canonical verification of the plan `pickUnsearched` salvages: 15,018.557 ms of
  the 26,120.647 ms (57.5%).
- The memo removes exactly one of that plan's four verdicts, the structural
  `END_ACTION_PHASE` repeat: **−3,941.956 ms**.
- Remaining canonical verification: 11,076.601 ms — three distinct verdicts of
  2,934.404, 3,881.048 and 3,852.759 ms (10,668.211 ms together, each an
  exhausted 20,000-node proof) plus 408.390 ms of the plan's other work.
- `searchTurn` falls from 26,120.647 ms to ~22,178.691 ms, **−15.1%**.
- Against P8's recorded 24,808 ms the same subtraction gives ~20.9 s.
- The P6 flag threshold is 20,000 ms. The memo alone does NOT bring this turn
  under it.

Outside `searchTurn`:

- `lab/harness/runner.ts:266` re-applies the returned plan through
  `applyAction`, from the same start state, after `verifyTurn` already did:
  15,018.557 ms today, of which all four verdicts are cache hits after the
  search has run. **−15,018.557 ms**, to within the cost of four key
  constructions.
- The seat's total canonical spend on this turn falls from 41,139.204 ms
  (26,120.647 + 15,018.557) to ~22,178.691 ms, **−46.1%**.

What the memo does NOT remove, and who owns it:

- 10,668.211 ms of canonical verification inside the search: three genuinely
  distinct positions, each costing a full 20,000-node proof that returns
  `unknown`. No cache can remove a first computation. Reaching this position
  less often is lane 4's `injectRescue` cap (E4.3 candidate A); making the
  verification itself deadline-aware is neither lane's and is not proposed here,
  because `verifyTurn` is the engine's correctness boundary.
- ~11,102.090 ms of engine-side generation and replica prover
  (26,120.647 − 15,018.557): P6/P8 §6, lane 4.
- Cross-candidate hits: `pickUnsearched` tries up to 8 candidates
  (`SALVAGE_ATTEMPTS`, root.ts:302) and `mustAnswer` verifies every candidate it
  proves terminal; candidates that share a prefix or reach the same position
  would hit the cache. On the measured run only one candidate verified, so this
  lane measured no cross-candidate saving and claims none.

In ordinary play the memo is worth microseconds: 10 duplicate calls out of 27
across 8 baseline games (1,713 plies), 4.85 ms of prover time in total (§1.6).
The change is not a speedup for the ladder; it is a removal of the largest
single recomputation in the one position class that overruns a wall allowance.

---

## 6. Risks, and why a stale verdict is impossible rather than unlikely

The failure this change could cause is the worst kind in this codebase: a
`home-checkmate` awarded (or withheld) on a verdict computed for a different
position, which makes an illegal or losing turn look legal. Four properties make
it impossible rather than unlikely.

1. **The key is a superset of the read set, established by reading the code.**
   §2.2 enumerates every field `searchHomeDefense` and everything it calls
   touches, with the line numbers. Two fields that ARE read are deliberately
   over-keyed (invader `damageTaken`, `actionsPerTurn`), costing hits, never
   correctness. Nothing read is omitted.
2. **The overwrite argument is structural, not statistical.** Every field the
   key omits from the DEFENDER's units is overwritten by `resetUnitActions` on
   the line before the prover starts (homeCheckmate.ts:73), and every turn field
   the key omits is overwritten in the same object literal. A future edit that
   stops overwriting one of them breaks the perturbation assertions of §4.3 in
   the same commit that makes the omission wrong.
3. **The cached function is deterministic.** The adjudication path passes
   `() => false` as the interrupt and the constant `PROOF_NODES` as the limit
   (homeCheckmate.ts:58), so the verdict is a pure function of the key's inputs;
   the non-deterministic evidence path is excluded from the cache by §3.5.
   Exhaustion returns `unknown`, `unknown` is not a mate, and a cached `unknown`
   therefore preserves the reply turn exactly as a fresh one does.
4. **The cache is observationally invisible to three independent suites.** The
   frozen perft numbers (§4.1) are an exhaustive enumeration through
   `applyAction`; the 20,000-case prover surface (§4.2) compares verdicts AND
   node counts against the replica; the gate-preservation surface replays
   100,000 actions and compares adjudicated results over 1,721 games. A stale
   verdict of any kind moves at least one number in at least one of them.

Residual risks, named:

- **A future in-place mutation of a `GameState`.** Today nothing outside
  `src/ai/hard` assigns to a unit or board field (grep over `src/`). If some
  future code mutates a state in place, the memo could answer for the pre-
  mutation board. The mitigation is the invariant, not the cache: the
  preregistration adds the assertion to the differential test, and the change
  should land with a comment in `homeCheckmate.ts` stating the dependency.
- **A fourth process-global rules knob.** `setElementGraph`,
  `setUpkeepVariant` and `setCombatHandicap` are the three that exist. A fourth
  added without bumping the epoch would be a stale-verdict bug. The mitigation
  is to bump the epoch inside a single `src/game` module that all rules setters
  already have to import, and the rules-epoch test of §4.3.
- **Memory in a long-lived process.** Bounded at 1,024 entries; a home race
  generates 4 verdicts per turn (§1.2), so the bound is roughly 60 such turns of
  history, and eviction is proven invisible by the capacity-1 run of §4.3.
- **A wrong hit that no suite samples.** The differential test of §4.3 is run on
  the same 20,000-case population the M10 gate uses, plus a second seed, so the
  sample is the largest one this codebase has for this function.

---

## 7. Preregistration draft (its own row set, not an E4 ledger row)

Proposed as a separate preregistration document,
`docs/hard-ai/e4/P7-PREREG.md`, opened before any code is written.

**Claim.** Memoising the canonical home verdict removes, at zero change to any
verdict, 3,941.96 ms of the 26,120.65 ms a `wall:3000` search spends on the P8
position and the whole 15,018.56 ms the harness spends re-applying the plan the
search already verified.

**Scope.** One file changed: `src/game/homeCheckmate.ts`, plus a rules-epoch
bump in `src/game/combat.ts`, `src/game/upkeep.ts` and `src/game/elements.ts`
(or the derived-signature fallback of §3.4, which changes no other file), plus
one new test file. No file under `src/ai/hard` changes. No `HardConfig` key.
`hard@desktop`'s config hash is unchanged by construction.

**Rows.**

| # | row | command | what must hold |
| --- | --- | --- | --- |
| P7-1 | perft parity | `npm run hard:perft -- --check` and `--check --engine replica` | identical to §4.1, `fixturesMismatch` 0 |
| P7-2 | prover surface parity | `npm run hard:fuzz -- --surfaces prover --cases 20000 --seed 5` | every field identical to §4.2, including the verdict histogram 12,844 / 6,001 / 1,155 and `nodeMismatch` 0 |
| P7-3 | gate preservation | `npm run hard:fuzz -- --surfaces gate-preservation --actions 100000 --seed 6` | `mismatches` 0, terminal histogram identical to §4.2 |
| P7-4 | transition/legality | `npm run hard:fuzz -- --actions 1000000 --seed 20260914 --surfaces transition,legality --legality-every 8` | `divergences` 0 and the other four M5 counters 0 |
| P7-5 | cache differential | `npx vitest run tests/game/home-verdict-cache.test.ts` | §4.3, all assertions, at capacities 1 and 1,024 |
| P7-6 | unit tests | `npx vitest run tests/game tests/ai/hard tests/server` | no new failure; the 41 tests of §4.5 unchanged |
| P7-7 | fixed-work golden | `npm run hard:cross-commit` | all 24 × 2 rows identical on `scoreCc`, `depth`, `work`, `nodes`, `endKey`, `source` |
| P7-8 | determinism re-pin | `npm run hard:determinism` | unchanged; no re-pin is expected or permitted |
| P7-9 | the P8 price | `lab/results/hard-ai-e4/p7/verdict-cost.ts --turns …#white#24 --wall 3000` | `searchTurnMs` falls by 3.0–4.5 s and the plan's canonical apply falls by one verdict; the plan itself is unchanged |
| P7-10 | the ordinary price | `verdict-cost.ts --games <8 baseline replays>` and `--turns <the 16 of §1.6>` | `applyAction` totals within noise of 27.74 ms and 0.768 ms; no regression on the gate-rejected path |

**Stopping rule.** Any single mismatch in P7-1 through P7-8 reverts the change;
a failed improvement is reverted, not stacked (EPIC-PLAN E4.3). P7-9 is
descriptive: the change is justified by parity plus a measured reduction, and a
reduction smaller than 3.0 s on the P8 position means the duplicate of §1.4 was
not the duplicate measured and the design is wrong.

**Not claimed.** No strength claim, no ladder row, no arm. The change cannot
move a game's moves; if it ever did, P7-7 would fail and the change would be
reverted.

---

## 8. Artifacts

`lab/results/hard-ai-e4/p7/`:

- `verdict-cost.ts` — the measurement script: `--turns` (per recorded turn),
  `--games` (a whole reconstructed replay), `--positions` (a stored corpus),
  `--wall` (one `searchTurn`, then the returned plan's canonical cost and keys).
  Diagnostic; imported by nothing.
- `key-sensitivity.ts` — the 24 single-field perturbations of §2.4.
- `p8-white24.json` — §1.2 and §1.3, the recorded turn.
- `p8-neighbours.json`, `p8-black22.json` — the other five P8 turns.
- `p8-game.json` — the whole 276-ply game.
- `p8-white24-wall3000.json` — §1.5, the engine run and the salvaged plan.
- `ordinary16.json` — §1.6, the sixteen ordinary mid-game turns.
- `baseline8.json` — §1.6, eight whole baseline games.
- `occupied-suites.json` — §1.6, the gated `home-mate` and `authored` positions.
- `key-sensitivity.json` — §2.4, 408 perturbed verdicts, 0 unsafe.
- `perft-baseline.json`, `fuzz-prover-baseline.json`, `fuzz-gate-baseline.json`
  — §4.1 and §4.2, the frozen numbers at `437ee40f`.

Engine invocations in this lane: one (§1.5, `wall:3000`, 85 s). Every other run
is canonical-engine or lab-only, the longest 58 s. One process at a time, no
heavy slot, no ladder.

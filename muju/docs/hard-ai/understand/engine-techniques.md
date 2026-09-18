# Engine techniques for a strong Muju Hard AI

**Author:** research agent, 2026-09-14.
**Worktree:** `/Users/ashkie/src/deevgames-muju-hardai` (branch `claude/muju-hard-ai`),
HEAD `44c41c4` — a snapshot of the uncommitted v2.8 working tree.
**Scope:** engineering techniques for strong deterministic perfect-information game
engines, mapped onto Muju's actual structure as implemented in this tree.

## 0. How to read this document

Every claim carries one of three labels.

| Label | Meaning |
|---|---|
| **[V]** verified in code | I read the cited `path:line` in this worktree and the statement is what the code does. |
| **[M]** measured here | I ran a script against this worktree's engine and report the number. Environment: Node v24.11.1, Apple M2 Max, macOS 15.1.1, `node --import tsx`. Scripts lived in the session scratchpad and are reproduced inline where they matter. |
| **[D]** claimed in docs | Asserted by a repo document (SPEC, `docs/…`, `.claude/napkin.md`). I did not independently verify it. |
| **[I]** my inference | My engineering judgement — estimates, Elo guesses, design recommendations. Not measured. |

Unlabelled prose inside a technique entry (the "what it is" and "reference
implementation" parts) is standard computer-game-playing background from my own
knowledge; it is not a claim about this repository.

No source file was modified. Everything below is a proposal.

---

## 1. Muju as an engine problem: the structural facts that matter

### 1.1 Board, pieces, economy

- 10×10 grid, `BOARD_SIZE = 10`, addressed `cells[y][x]`, flat index `y*10 + x`
  used throughout the hot paths. **[V]** `src/game/board.ts:16`, `src/game/movement.ts:232`.
- 18 unit definitions = 6 elements × 3 tiers, a flat array with a `Map` index.
  **[V]** `src/game/units.ts:5-249`.
- Tier-1 costs by pair: fire/lightning 3, water/shadow 4, plant/metal 5. Promotion
  is always `next.cost - current.cost` = **4** for T1→T2 and **8** for T2→T3 for every
  element. **[V]** `src/game/units.ts:5-233`, `src/game/promotion.ts:9-23`.
- Upkeep per tier: `{1:0, 2:1, 3:2, 4:3}`, paid at the owner's turn start, before
  Place. Unaffordable units are released; tier-1 units are mandatory keeps.
  **[V]** `src/game/upkeep.ts:5, 17-31`.
- Crystal map `UNEQUAL_ROUTES_MAP`, cap `MAX_RESOURCE_RESERVE = 16`.
  **[V]** `src/game/resourceMap.ts:5-17`.
- **[M]** Map census: 100 cells, total **504**; value histogram `{0: 18 cells, 4: 54, 8: 20, 16: 8}`;
  the layout is **exactly 180°-rotationally symmetric** (`m[i] === m[99-i]` for all i);
  each half-board (indices 0–49 vs 50–99) holds exactly **252**. It is *not*
  symmetric under transpose or anti-transpose, so 180° rotation is the **only**
  board symmetry.
- Mining is passive and unconditional at turn end: every unit takes
  `min(Mining, cell.reserve)` from the square it stands on. Reserves never
  replenish. **[V]** `src/game/mining.ts:5-34`.
- Purchases are tier-1 only, cost no actions, and must land on an empty square of
  some *unblocked* spawn rectangle. **[V]** `src/game/building.ts:7-9`,
  `src/game/spawning.ts:8-80`, `src/game/legality.ts:26-30`.
- A spawn rectangle is `[start corner .. anchor]` inclusive for any friendly
  anchor; **a single enemy unit anywhere inside kills that anchor's entire
  rectangle**. **[V]** `src/game/spawning.ts:34-80`.

### 1.2 The macro-turn

A turn is: (upkeep) → Place (any number of buys + at most one promotion per unit,
zero actions) → Action (4 shared actions) → passive income → draw-clock update.
**[V]** `src/game/turn.ts:19-104`, `src/game/rules.ts:9-17`.

- Move cost is `ceil(BFS_distance / speed)`, all actions consumed at once; the BFS
  routes around *both* sides' units. **[V]** `src/game/movement.ts:226-234, 240-257`;
  `src/ai/simulate.ts:92-95` charges the cost one `useAction` at a time.
- Attack costs 1 action, melee-only (orthogonal adjacency), `ATK_eff ≥ DEF_eff`
  kills, otherwise chip damage accumulates into `damageTaken`.
  **[V]** `src/game/combat.ts:80-164`.
- **Cleave**: a unit may attack once; each *kill it personally lands* unlocks one
  more, capped at its tier (I:1, II:2, III:3). A surviving target ends that unit's
  chain for the turn. **[V]** `src/game/combat.ts:8-17`.
- Chip damage heals completely at the *defender's* turn start, along with all
  action flags. **[V]** `src/game/board.ts:267-294`.
- Elemental modifier ±1 ATK on a 3-pair cycle; defence never modified.
  **[V]** `src/game/elements.ts`, `src/game/combat.ts:80-91`.

### 1.3 Terminal conditions

- **Home occupation**: checked at the start of *your* turn, before upkeep/heal/place.
  **[V]** `src/game/turn.ts:23-27`, `src/game/victory.ts:101-105`.
- **Home checkmate**: an early resolution. When you end your turn occupying the
  enemy corner, the engine proves whether the defender's *entire* next turn
  (upkeep keep-sets × promotion subsets × 4 actions) can remove the invader. If
  not, you win immediately with reason `home-checkmate`. Node cap
  `PROOF_NODES = 20000`. **[V]** `src/game/homeCheckmate.ts:22, 57-180`,
  `src/ai/simulate.ts:28-33`.
- **Elimination**: zero units. **[V]** `src/game/victory.ts:33-53`.
- **Inactivity draw**: `INACTIVITY_LIMIT = 10` consecutive plies (one player-turn
  = one ply) with no *attack kill*; amber warning at 7. Only a kill resets it.
  **[V]** `src/game/inactivity.ts:3-10`, `src/ai/simulate.ts:98-101`, `src/game/turn.ts:96-99`.

### 1.4 The three facts that dominate engine design

1. **The macro-branching factor is astronomically larger than chess.**
   **[M]** From the initial position, White's turn-1 action phase (3 units, 0 crystals,
   no Place phase, 4 actions) has **14,959 distinct complete action sequences** but
   only **1,053 distinct mid-turn states** and **797 distinct end-of-turn positions**.
   Sequence enumeration is 18.8× more work than state enumeration *on the very
   quietest turn in the game*.

   **[M]** Three turns later it is hopeless. Sampling White turn-starts from a
   seeded random game (`seededRandom(7)`):

   | Turn | Cash | White units | Spawn squares | Complete sequences | Distinct end positions |
   |---|---:|---:|---:|---:|---:|
   | 3 | 8 | 4 | 5 | > 4,000,000 (capped) | > 287,000 (capped at 400k nodes) |
   | 4 | 6 | 5 | 13 | > 4,000,000 (capped) | > 325,000 (capped) |
   | 5 | 9 | 5 | 6 | > 4,000,000 (capped) | > 331,000 (capped) |

   Neither enumeration completed. **A macro-turn is not a move you can generate.**
   Any Hard AI must do *candidate generation* — a bounded search inside the turn
   that emits O(10–100) turns — and every ply of the outer search pays for one such
   inner search.

2. **The canonical evaluator is ~5,000× too slow.**
   **[M]** At a live 16-unit mid-game position (turn 5, action phase, 29 legal actions):

   | Operation | Throughput | Per call |
   |---|---:|---:|
   | `generateAllActions` | 193,909 /s | 5.16 µs |
   | `applyAction` | 1,716,741 /s | 0.58 µs |
   | `evaluatePosition` | **13,904 /s** | **71.9 µs** |
   | `getAllSpawnPositions` (one player) | 144,145 /s | 6.94 µs |

   A 3-second browser budget therefore buys roughly **42,000 static evaluations**
   with today's evaluator. A tuned alpha-beta needs 10^6–10^7. **[V]** The cause is
   structural: `evaluatePosition` calls `getAllSpawnPositions` at three sites
   (`src/ai/evaluation.ts:148, 269, 283`), each invoked once per player = **6 calls
   ≈ 42 µs ≈ 58% of the total**, and `getAllSpawnPositions` itself is
   O(units × rect_area) with a `Set<string>` of `"x,y"` keys
   (`src/game/spawning.ts:98-118`). Mobility adds a BFS per unit per player
   (`src/ai/evaluation.ts:185-201`).

3. **Passing is never free, and the draw clock is a real evaluation term.**
   Income arrives unconditionally at turn end; a wasted turn still mines, still pays
   upkeep next turn, and still advances the 10-ply kill clock. This breaks the
   standard null-move assumption in both directions (see §4.8).

### 1.5 What already exists (the baseline to beat)

- **[V]** `src/ai/engine-v2.ts` — a hybrid: bounded placement templates
  (`planner/placement.ts`), beam search over action prefixes (`planner/beam.ts`),
  a WASM/JS tactical target-removal prover (`wasm/kernel.ts`, `tactics/home.ts`),
  and an MCTS over whole-turn plans (`search/mcts.ts`).
- **[V]** Hard preset: `mctsIterations: 1200, beamWidth: 50, tacticalDepth: 2,
  mctsTimeLimit: 3000, tacticalNodes: 600000` (`src/ai/engine-v2.ts:37`),
  whole-turn allowance `TURN_BUDGET_MS.hard = 8000` (`src/ai/engine-v2.ts:39`).
- **[V]** The MCTS tree is capped at **depth 4 macro-plies** with a **depth-4 greedy
  rollout** (`src/ai/search/mcts.ts:57, 83`), progressive widening
  `capacity = floor((visits+1)^0.5)` (`mcts.ts:60`, alpha from `engine-v2.ts:31`),
  UCT exploration 1.4 (`mcts.ts:73`), values squashed by `tanh(score/100)`
  (`mcts.ts:64, 93`).
- **[V]** The WASM kernel is a complete current-turn *target-removal* DFS with
  exact BFS movement, Cleave bookkeeping, blocker clearing and promotion subsets.
  ABI 6, `MAX_UNITS = 100`, per-depth BFS scratch (`assembly/tactics.ts:5-34, 79-179`);
  the host validates every witness through canonical `isLegalAction`
  (`src/ai/wasm/kernel.ts:78-82`). **[D]** 7,645 bytes / 3,490 gzip
  (`docs/AI_IMPLEMENTATION_STATUS.md`).
- **[V]** Search budget accounting with a deterministic fixed-work mode and a
  wall-clock mode (`src/ai/runtime.ts:13-25`); worker protocol 2 with
  game/request/revision/player identity and a `max(2000, decisionMs + 2000)`
  watchdog (`src/ai/worker/protocol.ts:4-15`, `src/ai/worker/client.ts:20-46`).
- **[V]** A useful static-value library already exists in the lab:
  `killFrontier` (an exact cost/actions/bodies Pareto knapsack for "what squad
  kills X"), `strikeActions`, `power`, `passiveCurve`, `accessTimeline`
  (`lab/solver/model.ts:28-113`). **Caveat [V]:** `lab/solver/model.ts:23` still
  says `export const ACTIONS = 6`, which predates the four-action ruleset
  (`src/game/rules.ts:9`). Callers that rely on the default budget are stale.

---

## 2. State representation

### 2.1 Bitboards over 100 squares

**What it is.** Represent square-sets as fixed-width integer words so that
set-union / intersection / "any enemy in this rectangle?" / "adjacent squares of
this set" become 2–4 machine instructions instead of array scans.

**Reference implementation.** Chess uses one 64-bit word per piece-type-and-colour
plus derived occupancy masks. Attack sets come from precomputed tables; sliding
pieces use magic bitboards or kindergarten multiplication. On a 100-square board
there is no native word, so the standard choices are: (a) two 64-bit lanes
(64 + 36), (b) four `Uint32` lanes, (c) `BigInt`. In JavaScript, `BigInt` is a
heap object with allocation on every operation and is 30–100× slower than
`Uint32Array` arithmetic — **do not use `BigInt` in a hot loop**. In
AssemblyScript/WASM you have native `i64`, so two `i64` lanes is the natural
representation.

**Muju adaptation.**
- Layout: flat index `sq = y*10 + x`, which the codebase already uses
  (**[V]** `src/game/movement.ts:232`, `src/game/mining.ts:24`, `src/ai/wasm/kernel.ts:59`).
- Use `lo = squares 0..63`, `hi = squares 64..99` as two `u64` in WASM, or a
  `Uint32Array(4)` in JS. Precompute, as static tables: `FILE[x]`, `RANK[y]`,
  `ADJ[sq]` (the ≤4 orthogonal neighbours — **[V]** `src/game/board.ts:313-324`),
  and `RECT[corner][anchor]` for spawn rectangles.
- **The single highest-leverage bitboard in this game is the spawn rectangle.**
  `RECT_WHITE[sq]` = the mask of `[0,0]..[sq]`, `RECT_BLACK[sq]` = `[sq]..[9,9]`.
  Then "is anchor `a` unblocked for White?" is `(RECT_WHITE[a] & blackOcc) === 0`,
  and the whole legal-spawn set is
  `union over friendly a with (RECT[a] & enemyOcc)==0 of (RECT[a] & ~occ)`.
  That replaces `getAllSpawnPositions`'s O(units × area) loop with `Set<string>`
  keys (**[V]** `src/game/spawning.ts:98-118`) — the 6.94 µs call **[M]** becomes
  ~20 ns. Since that call is 58% of `evaluatePosition` **[M]**, this one table is
  worth more than every other representation change combined. **[I]**
- Per-element/per-tier occupancy masks (`occ[owner]`, `occ[owner][element]`,
  `occ[owner][tier]`) make threat maps, elemental-advantage counts and
  "is a plant on a rich cell" one AND each.
- Movement still needs BFS because speed is a step budget around blockers, not a
  ray. But BFS on a bitboard is frontier expansion:
  `next = (shift4(frontier) & ~occ & ~visited)` — four shifts, three ANDs, one OR
  per ply, ≤ 9 plies. That is ~40 ops for a *complete* distance-ring set versus
  the current queue-and-`Int16Array` BFS (**[V]** `src/game/movement.ts:240-257`).
  Note the shifts must be masked at file boundaries (`x=0`, `x=9`) — standard
  wrap-avoidance.

**Expected benefit.** 20–100× on move generation and evaluation primitives. **[I]**
This is the difference between ~14k evals/s **[M]** and ~1M evals/s, i.e. between
depth 2 and depth 6 in the outer search.

**Cost.** ~400–700 lines of new code plus table generation. Medium risk: bit
layout bugs are silent. Mitigated entirely by differential testing against the
canonical engine (§8.2).

**Priority: P0.** Nothing else in this document pays off without it.

### 2.2 Compact per-unit arrays (struct-of-arrays)

**What it is.** Replace an array of heap objects with parallel typed arrays
indexed by a dense unit slot.

**Reference implementation.** Engines keep `piece[sq]`, `color[sq]`, and a
piece-list with `squareOf[pieceIndex]`; everything is `Int8`/`Uint8`.

**Muju adaptation.** The current `Unit` is a heap object with a **string** `id`,
a **string** `definitionId`, a `{x,y}` object position and a
`string[] attackedThisTurn` (**[V]** `src/game/types.ts:57-76`). Every
`applyAction` rebuilds the whole `units` array immutably
(**[V]** `src/ai/simulate.ts:83-96, 153-160`), and `getUnitAt` is an O(n) linear
scan (**[V]** `src/game/board.ts:66-71`).

Proposed engine-side layout, with a slot cap of 64 units per side (the board only
has 100 squares, so 100 is a hard ceiling; the WASM kernel already caps at 100 —
**[V]** `assembly/tactics.ts:5`):

```
sq        : Uint8Array(N)    // 0..99, 255 = dead
defId     : Uint8Array(N)    // 0..17 index into the 18-entry catalogue
owner     : Uint8Array(N)    // 0/1  (or a bitboard, and drop this)
damage    : Uint8Array(N)    // 0..5 (max DEF is 5, metal_3 — units.ts:229)
flags     : Uint8Array(N)    // canAct | promotedThisPlace | placedThisTurn | lastAttackKilled
atkCount  : Uint8Array(N)    // 0..3, Cleave counter
attacked  : Uint32Array(N*4) // 128-bit "targets I already hit this turn" mask
pieceAt   : Uint8Array(100)  // reverse index, 255 = empty
```

`attackedThisTurn` as a bitmask of *slot indices* is exactly what the WASM kernel
already does (**[V]** `assembly/tactics.ts:47, 89-93` — four `i32` words at
`at(u)+5`). Reuse that encoding verbatim so the JS and WASM kernels share a format.

Note the catalogue is small enough to bake as one `Int8Array(18*5)` of
`[atk, def, spd, mine, tier]` plus an `Int8Array(18*18)` elemental power matrix —
the kernel already builds precisely this (**[V]** `src/ai/wasm/kernel.ts:42-53`).

**Expected benefit.** Removes all string hashing and object allocation from the
hot loop; `getUnitAt` becomes one array read. 5–20× on the transition. **[I]**

**Cost.** A bidirectional adapter between `GameState` and the packed form. ~200
lines, plus a round-trip property test.

**Priority: P0.**

### 2.3 Zobrist hashing

**What it is.** A random 64-bit key per (feature, value) pair, XOR-combined; state
identity becomes one integer, updated incrementally on each change.

**Reference implementation.** `zobrist[piece][square]`, plus keys for side-to-move,
castling rights and en-passant file. Kept as two 32-bit halves in JS (or a
`BigInt64Array` if you can tolerate the cost — you can't in the inner loop; use
two `Uint32` lanes and XOR them independently).

**Muju adaptation — what must be in the key.** This game has far more state than
chess, and getting the key wrong produces wrong-but-plausible search results.
The complete list, derived from what `applyAction` can change
(**[V]** `src/ai/simulate.ts:44-173`, `src/game/turn.ts:19-104`):

| Component | Domain | Keys needed | Notes |
|---|---|---|---|
| piece on square | 100 sq × 18 defs × 2 owners | 3,600 | tier is part of `defId`, so promotion is 2 XORs |
| cell reserve | 100 cells × 0..16 | 1,700 | **must be hashed**: reserves monotonically deplete (**[V]** `src/game/mining.ts:25-28`) and two positions with identical pieces but different remaining ore are *not* the same node |
| side to move | 2 | 2 | |
| phase | place / action | 2 | |
| actions remaining | 0..4 | 5 | |
| bank, White & Black | unbounded | hash as 2×(value mod 2^k) with a mixing key, or 2×64 keys for `min(bank, 63)` | banks matter: they gate purchases and upkeep |
| draw clock `inactivityPlies` | 0..10 | 11 | **must be hashed**: a position at clock 9 is a different game than the same board at clock 0 |
| `upkeepPending` | 2 | 2 | |
| per-unit turn flags | `canAct`, `atkCount`, `lastAttackKilled`, `promotedThisPlacement`, `placedThisTurn`, `damageTaken` | 100 sq × small domains | needed *within* a turn; see below |

**Two-tier keying — the important trick for this game. [I]**
Maintain **two** hashes:
- `Kturn` — the full key including per-unit turn flags, `actionsRemaining`,
  `damageTaken`, Cleave counters. Used by the **within-turn** transposition table
  (§3.2). This is what collapses 14,959 sequences to 1,053 states **[M]**.
- `Kpos` — the boundary key: pieces, reserves, banks, side to move, draw clock,
  `upkeepPending`. All turn-transient flags are excluded because
  `resetUnitActions` zeroes them at the owner's turn start
  (**[V]** `src/game/board.ts:267-294`). Used by the **macro** transposition table
  in the outer alpha-beta.

Hashing the 100 cell reserves naively costs 100 XORs on a full rebuild, but
incrementally it is only the mined cells: **[V]** `endOfTurnIncome` touches at most
one cell per unit (`src/game/mining.ts:19-28`), so an incremental update is
≤ `unitCount` XOR pairs at the turn boundary and zero during the action phase.

**Reserve-key compression [I]:** instead of 1,700 keys, store `reserveKey[cell]`
for *each value* but note only 4 distinct starting values exist
(`{0,4,8,16}` **[M]**) and reserves only decrease. A simpler scheme:
`hash ^= zCell[cell] * reserve` is *not* safe (multiplication is not XOR-mixing);
use the full 100×17 table — it is 1,700 × 8 bytes = 13.6 KB, trivial.

**Expected benefit.** Enables every transposition table in §3. Without it, the
within-turn TT cannot exist, and that TT alone is an ~14× node reduction on the
quietest turn in the game **[M]**.

**Cost.** ~150 lines plus a seeded RNG for key generation (reuse
`seededRandom` — **[V]** `src/ai/runtime.ts:3-6`) so keys are identical across
clients, which matters because the engine must be deterministic
(**[V]** the fixed-work mode contract, `src/ai/runtime.ts:17-24`).
**Risk:** an incremental-update bug is the classic silent engine killer. Ship a
debug assertion that recomputes the key from scratch every N nodes and compares.

**Priority: P0.**

### 2.4 Incremental updates and make/unmake vs copy

**What it is.** `make(move)` mutates the state in place and pushes an undo record;
`unmake(move)` pops it. The alternative is copying the state at every node.

**Reference implementation.** Chess engines make/unmake because a position is
~200 bytes and the undo record is ~16 bytes. Go engines often copy because
captures are unbounded.

**Muju adaptation.** Today the engine copies: `applyAction` is a pure immutable
transition that rebuilds `board.units`, `players` and (on income) all 10 rows of
`cells` (**[V]** `src/ai/simulate.ts:25-186`, `src/game/mining.ts:25-33`).
**[M]** That costs 0.58 µs per action. It is also *load-bearing for correctness*:
`tests/game/properties.test.ts:18` asserts `before` is untouched after
`applyAction`, and that the reducer and the search agree exactly.

What an action can change, and therefore the undo record:

| Action | Mutations | Undo record |
|---|---|---|
| `MOVE` | `sq[u]`, `pieceAt`, `flags[u].hasMoved`, `actionsRemaining -= cost` | from-square, cost |
| `ATTACK` | `atkCount[u]`, `attacked[u]` bit, `lastAttackKilled`, then either `damage[v] += p` or kill (`sq[v]=255`, `pieceAt` clear) **plus** `inactivityPlies = 0, progressThisTurn = true` on a kill (**[V]** `src/ai/simulate.ts:101`) | victim slot, old damage, old clock, old flags/count (the WASM kernel saves exactly these six fields — **[V]** `assembly/tactics.ts:88-100`) |
| `BUY_UNIT` | new slot, bank −= cost | slot index, cost |
| `PROMOTE_UNIT` | `defId[u]`, `promotedThisPlacement`, bank −= 4 or 8 | old defId, cost |
| `END_ACTION_PHASE` | income (≤ one cell per unit), banks, `inactivityPlies`, side, upkeep, heal + flag reset for the incoming player | the per-unit take list (≤ N entries) + the *whole* flag/damage vector of the incoming player |

The turn boundary is the only heavy undo (it resets every flag and all damage for
one side — **[V]** `src/game/board.ts:267-294`). **[I]** Recommended hybrid:
**make/unmake inside a turn, copy-on-turn-boundary.** Within-turn nodes are 99% of
the tree, and their undo records are 4–16 bytes. At the boundary, snapshot the
16-byte-per-unit flag block for the incoming side (≤ 1.6 KB) — cheaper than a full
copy, simpler than per-field undo.

**Careful: `applyAction` is not a pure transition.** **[V]** `src/ai/simulate.ts:28-33`
runs `resolveHomeCheckmate` after *every* action and before every
`END_ACTION_PHASE`, and that prover can burn up to `PROOF_NODES = 20000` nodes
(**[V]** `src/game/homeCheckmate.ts:22, 177`). It short-circuits when nobody
occupies a home corner (`homeCheckmate.ts:173`), so it is free in the common case —
but a search line that parks a unit on the enemy corner pays a 20,000-node prover
call *per node* thereafter. The fast engine must gate this: run the checkmate
prover **only at the root's chosen line and at leaf turn-boundaries where an
occupier exists**, never inside quiescence.

**Expected benefit.** 3–10× over copying, and it is what makes the within-turn TT
practical (you need a stable mutable state to key). **[I]**

**Cost.** ~300 lines. The dangerous failure mode is an unmake that does not
perfectly restore state; catch it with a per-node hash assertion in debug builds
and with the differential fuzzer (§8.2).

**Priority: P0** (for the within-turn kernel), **P2** for the macro level (copying a
packed state is ~1 KB `.set()`, which is fine at macro nodes).

---

## 3. Move generation for macro-turns

This is the section where Muju differs most from every classical engine, and where
the design decisions actually determine strength.

### 3.0 The shape of the problem

A legal macro-turn is:

```
turn := keepSet? , { buy(defId, square) | promote(unitId) }* , END_PLACE ,
        { move(unitId, dest) | attack(unitId, target) }*  (total action cost ≤ 4) , END_ACTION
```

with these interactions, all **[V]**:
- buys and promotions are order-free *in cost* but **not** order-free in effect: a
  bought unit occupies a square and can block a later buy, a later move path, or
  the spawn rectangle itself (`src/ai/simulate.ts:122-128`; napkin 2026-09-13
  "a just-bought unit blocks your own MOVE paths").
- a promotion changes speed/attack/defence and so changes the legal action set
  (`src/ai/simulate.ts:130-173`).
- promotions cannot be applied to a unit placed this turn
  (`src/game/promotion.ts:44-58`), so buy-then-promote in one turn is illegal.
- attacks change occupancy and therefore movement BFS distances.
- Cleave means attack order matters: kill-then-attack-again is legal, but a
  non-lethal hit ends that unit's chain (`src/game/combat.ts:13-17`).
- income at turn end depends only on the *final* square of each unit
  (`src/game/mining.ts:19-23`), so within-turn ordering is irrelevant to income —
  a useful independence.

**[M]** Measured legal-action counts per decision point over 691 random plies:
overall mean 27, median 20, max 241; place-phase mean 44.3, max 241;
action-phase mean 22.1, max 92. The *sequence* count is the product of these over
4–8 decisions, hence the 10^6+ figures in §1.4.

### 3.1 Canonical ordering to kill within-turn transpositions

**What it is.** When several action orders reach the same state, allow only one
order. Standard in games with multi-part moves (Arimaa's 4-step turns, Hive,
Diplomacy-order search, Blokus); the same idea as "insert-only-in-increasing-index
order" in subset enumeration.

**Reference implementation.** Arimaa engines canonicalise a 4-step turn by
requiring the step sequence to be non-decreasing in a total order over
*independent* steps, and they hash the *post-turn position* rather than the step
sequence. Set-enumerators canonicalise by index (`for i = first; i < n; i++`) —
exactly the pattern the Muju WASM kernel already uses for promotion subsets
(**[V]** `assembly/tactics.ts:143-159`, "Promotions commute. Enumerate each subset
once").

**Muju adaptation.** Three distinct canonicalisations, in increasing value:

1. **Promotion subsets by slot index.** Already solved and proven in this repo:
   enumerate `promotions(first, …)` with `for (u = first; u < count; u++)`
   (**[V]** `assembly/tactics.ts:147`). Reduces `k!` orderings to 1. Also used by
   the JS home prover's `prepare()` (**[V]** `src/game/homeCheckmate.ts:125-156`,
   "These choices commute … Visiting each unit once covers all affordable sets
   without permutation duplicates").
2. **Independent actions in slot order.** Two actions are *independent* if the
   mover/target squares, the BFS corridor and the Cleave state do not intersect.
   For independent actions, require increasing `(unitSlot, actionKind, dest)`.
   Conservative and cheap test **[I]**: two actions by *different units* whose
   from/to/adjacency square sets are disjoint and neither is an attack on the
   other's target. This is a pure pruning rule — it never removes a reachable
   state, only duplicate orders.
3. **Attacks before moves when independent.** The task brief names this and it is
   right, but the *reason* matters: attacking first can only help, because a kill
   frees a square (widening later BFS) and unlocks Cleave, while a move never
   enables an attack that was already legal. **[I]** Formally: if unit `u` can
   legally attack `v` now and the move `m` by unit `w ≠ u` does not pass through or
   land on `u`'s or `v`'s square, then `attack;move` and `move;attack` reach the
   same state, so keep only `attack;move`. Counter-cases exist (a move that blocks
   an enemy escape is irrelevant here since there is no enemy reply mid-turn — turns
   are atomic), so this rule is safe in Muju in a way it would not be in a
   simultaneous game.

**Expected benefit.** **[M]** On turn 1 the measured collapse from 14,959 sequences
to 1,053 distinct states is a **14.2× node reduction** — and that is the *cheapest*
turn. Mid-game the ratio is at least as large (I could not exhaust it to measure).
Canonical ordering captures most of that without needing a TT probe.

**Cost.** ~120 lines of independence testing. Moderate subtlety; must be validated
by asserting that canonical enumeration and naive enumeration produce identical
*sets* of end positions on small positions (a perft-style equality test, §8.1).

**Priority: P0.**

### 3.2 Within-turn transposition table

**What it is.** A hash table keyed on the mid-turn state (§2.3 `Kturn`), storing
"already searched, best value / already expanded" so that a repeated mid-turn state
is not re-expanded.

**Reference implementation.** Identical to a normal TT but with a *turn-local*
lifetime and a much smaller table (an `open-addressing Uint32Array` of 2^16–2^18
entries, cleared per macro-node by generation counter rather than by memset).

**Muju adaptation.** Two uses:
- **Inside candidate generation** (a DFS/BFS over action sequences): dedupe.
  **[M]** 14,959 → 1,053 on turn 1.
- **Inside the tactical prover**: the JS home-defence prover already does exactly
  this with a string key and a `Set<string>` of failed states
  (**[V]** `src/game/homeCheckmate.ts:86-89, 118` — `failed.add(signature)`).
  Replace the string key with the Zobrist `Kturn` and you get the same pruning at
  1/50th the cost. **[I]**

Note the WASM kernel currently has **no** transposition table at all
(**[V]** `assembly/tactics.ts:79-140` is a pure DFS with an optimistic-bound cut).
Adding a 2^18-entry `Uint32Array` "already failed at ≥ this action budget" table
to it is probably the single cheapest win available in the existing code. **[I]**

**Expected benefit.** 5–20× on within-turn enumeration. **[I]** (Lower bound 14×
measured on the easiest case **[M]**.)

**Cost.** ~80 lines. Low risk once Zobrist is correct.

**Priority: P0.**

### 3.3 Purchase-set enumeration as a bounded knapsack

**What it is.** Choosing *which* tier-1 units to buy and *where* is a
multiple-choice knapsack: crystals are the capacity, unit types are the item
classes, legal empty spawn squares are the placement dimension.

**Reference implementation.** There is no board-game canon here; the closest
analogues are RTS build-order planners (branch-and-bound over build queues with
dominance pruning) and deck-building/drafting engines. The right frame is:
enumerate the **multiset of purchases** first (a small integer partition problem),
then assign squares by a *scored* assignment rather than by enumeration.

**Muju adaptation.** Concrete arithmetic, all **[V]** from `src/game/units.ts`:
tier-1 prices are `{fire:3, lightning:3, water:4, shadow:4, plant:5, metal:5}`.
With `C` crystals the number of affordable purchase multisets is the number of
non-negative solutions to `3a + 3b + 4c + 4d + 5e + 5f ≤ C`. **[M]** Enumerated:
`C=10 → 38`, `C=20 → 402`, `C=30 → 2,117`, `C=40 → 7,713`. Multiply by
`P(spawnSquares, k)` placements and the space is hopeless — hence the current
code's bounded templates (**[V]** `src/ai/planner/placement.ts:14-59`, which takes
only the top 2 squares per unit type and a few hand-written patterns).

**Recommended generator [I]** — three stages:

1. **Reduce to a small item set by dominance.** For the *current* position, most of
   the 6 tier-1 units are dominated. Concrete dominance tests derived from the
   catalogue:
   - `lightning_1` (ATK 1, DEF 1, SPD 3, MINE 0, cost 3) vs `fire_1`
     (ATK 2, DEF 1, SPD 2, MINE 1, cost 3): same price; Radi is strictly better only
     if the mission needs ≥ 3 reach this turn. If no enemy unit and no target square
     is at distance `d` with `⌈(d−1)/2⌉ > ⌈(d−1)/3⌉` relevance, **drop Radi**.
   - `metal_1` (ATK 1, DEF 3, SPD 1, MINE 2, cost 5) vs `plant_1`
     (ATK 0, DEF 3, SPD 1, MINE 3, cost 5): same price and defence. Inyan is bought
     only when its ATK 1 matters (chip damage to reach a kill threshold, or a
     3-damage wall that can also finish a damaged unit). Otherwise **Muju dominates**
     for any square with reserve ≥ 3.
   - `shadow_1` (ATK 2, DEF 2, SPD 2, MINE 0, cost 4) vs `water_1`
     (ATK 2, DEF 2, SPD 1, MINE 2, cost 4): Göl only for the extra speed. Off a
     crystal square with reserve 0 they are near-identical; on any live square
     **Sjor dominates**.
     **[M]** 54 of 100 cells hold 4 and 20 hold 8, so "on a live square" is the
     normal case; only the 18 empty cells make Göl/Radi competitive as pure bodies.
   This typically cuts 6 item classes to 2–3. **[I]**
2. **Enumerate multisets over the reduced set**, capped at `min(⌊C/3⌋, freeSpawnSquares, 4)`
   bodies. With 2–3 classes and ≤ 4 bodies that is ≤ 35 multisets.
3. **Assign squares greedily per multiset, then keep the top-`m` assignments.**
   Score a square for a unit as
   `w_mine * min(mine, reserve[sq]) + w_safe * (not in enemy reach) + w_block * blocksEnemySpawn + w_strike * adjacentToKillTarget − w_anchor * shrinksOwnRectangle`.
   Assign by descending score (or a 4×K Hungarian assignment if you want exactness —
   it is 4 bodies, so exact assignment costs nothing).
   **Critical term, from bitter experience [D]:** `.claude/napkin.md` 2026-09-12
   records a lost game caused by filling the corner so completely that *zero* legal
   spawn squares remained the following turn. Any placement score must include a
   hard penalty for driving `|legalSpawnSquares(next turn)|` to 0.

**Expected benefit.** This is where "buy correctly" strength lives. The existing
generator emits at most ~2 squares per unit type plus a few templates
(**[V]** `src/ai/planner/placement.ts:37, 41-57`); a dominance-pruned knapsack with
scored assignment will emit 10–30 genuinely different economic plans. **[I]**
I estimate this is worth more than one ply of outer search in the opening and
mid-game.

**Cost.** ~250 lines, plus weights that need tuning (§5.9).

**Priority: P1.**

### 3.4 Promotion subsets

**What it is.** Choose a subset of on-board units to promote, subject to a shared
crystal budget.

**Reference implementation.** Index-ordered subset DFS with budget pruning — which
is already implemented twice in this repo (**[V]** `assembly/tactics.ts:143-159`
and `src/game/homeCheckmate.ts:127-156`) and once for upkeep keep-sets
(**[V]** `src/game/upkeep.ts:34-55`, exact up to 12 rent-bearing units, heuristic
beyond).

**Muju adaptation.** Prices are uniform (4 and 8), so the subset problem is: pick
`p` T1→T2 promotions and `q` T2→T3 promotions with `4p + 8q ≤ C`, then choose
*which* units. **[I]** The choice of *which* is almost always determined by one of
five missions, so enumerate by mission rather than by subset:
- **kill-enablement**: promote the unit whose ATK crosses a target's DEF threshold
  this turn (computable exactly from the 18×18 power matrix, **[V]**
  `src/ai/wasm/kernel.ts:47-53`);
- **survival**: promote the unit whose DEF crosses out of an enemy one-shot band
  (e.g. `water_1` DEF 2 → `water_2` DEF 3 dodges every ATK-2 attacker; `metal_2`
  DEF 4 → `metal_3` DEF 5 dodges Kagari's ATK 4);
- **income**: promote a plant on a live cell — `plant_1→2` is +2 mine/turn for 4
  crystals and +1 upkeep, `plant_2→3` is +3 for 8 and +1 upkeep
  (**[V]** `src/game/units.ts:159-194`, `src/game/upkeep.ts:5`);
- **reach**: `lightning_2→3` gives SPD 5 (20 squares in 4 actions);
  `metal_3` SPD 2 makes a DEF-5 wall mobile;
- **anchor**: promote whichever unit currently defines the forward spawn rectangle
  so it survives being contested **[D]** (napkin 2026-09-13: "Whoever owns a
  forward anchor owns the board").

Emit ≤ 8 promotion candidates rather than `2^n` subsets.

**Important rule interaction [V]:** upkeep is charged at the *next* turn start at
the *new* tier (`src/game/upkeep.ts:14-16` sums current definitions), and income
arrives only at turn end (`src/game/turn.ts:95`). So a promotion is financed by
*this* turn's bank and rented from *next* turn's income. An evaluator that ignores
the rent step will over-promote; see §5.7 (runway).

**Expected benefit.** Moderate. Promotion choice is high-variance: a single
mistimed `plant_2→3` (8 crystals + 2/turn rent) can lose the economy.

**Cost.** ~150 lines.

**Priority: P1.**

### 3.5 Candidate generation: the central design decision

**What it is.** Because macro-turns cannot be enumerated **[M]**, the outer search
consumes a *generator* that returns K plausible complete turns. Everything about
Hard AI strength is determined by (a) the recall of this generator — does the best
turn appear in its K? — and (b) its cost.

**Reference implementation.** The closest well-studied analogues:
- **Arimaa**: full 4-step turn generation with canonical ordering plus static
  step-ordering heuristics; strong engines search the step tree directly with a
  step-level TT rather than generating whole turns.
- **Amazons / Lines of Action**: huge branching handled by a static-eval-ranked
  move list truncated per depth (a form of forward pruning) with verification search.
- **RTS / real-time strategy planners**: portfolio / script-based candidate
  generation ("Portfolio Greedy Search", "NaïveMCTS", "Adversarial Hierarchical
  Task Networks") — generate turns by composing per-unit scripted intents.

**Muju adaptation — recommended hybrid [I].** Search the turn at the *action level*
with a step-level TT (the Arimaa answer), but bound it by a portfolio of intents
(the RTS answer):

```
generateTurns(state, K):
  1. purchases/promotions: §3.3 + §3.4  →  P place-plans (P ≈ 8..24)
  2. for each place-plan:
       actionSearch(4 actions) with:
         - canonical ordering (§3.1) + within-turn TT (§3.2)
         - action ordering: proven kills > Cleave continuations > threats >
           income-improving moves > anchor/blocking moves > everything else
         - iterative widening: expand only the top-w actions at each step,
           w = 6 at step 1, 4, 3, 2
       → keep the best A action-lines by within-turn score (A ≈ 4)
  3. always inject, regardless of score:
       - every proven kill combination (from §3.6)
       - every legal home-corner entry with a verified defender reply (§4.10)
       - the "do nothing but mine" turn (the income baseline)
       - the best pure-defence turn (retreat the most-threatened unit)
  4. dedupe by end-position Kpos, return top K
```

`6*4*3*2 = 144` leaf action-lines per place-plan before the TT, a few hundred
states — i.e. **~0.2–0.5 ms per place-plan** with a bitboard kernel **[I]**, and
`P × A` candidate turns.

**Recall is the metric to instrument.** **[I]** Build an offline check: on a corpus
of positions, run an expensive generator (K = 2,000, wide widening) and a cheap one
(K = 24); measure how often the expensive generator's best-by-deep-search turn is
inside the cheap generator's K. Target ≥ 90%. This is the single most useful
diagnostic you can build, because a search on top of a 60%-recall generator is
capped no matter how deep it goes.

**Expected benefit.** Decisive. **[I]**

**Cost.** ~500 lines and most of the tuning effort.

**Priority: P0.**

### 3.6 Static-exchange-style "kill combo" solver

**What it is.** The chess SEE answers "what does this capture net?" in O(attackers)
without search. Muju's analogue answers "**which enemy units can I kill this turn,
for how many actions, and which of my units die next turn as a result?**"

**Reference implementation.** SEE swaps attackers/defenders on one square by
ascending value. Muju has no recapture-on-the-square mechanic, so the right
analogue is a **min-cost covering problem**: choose a set of my units and their
approach costs such that summed elemental attack ≥ the target's effective defence,
within the 4-action budget and ≤ 4 adjacency lanes (a non-corner square has 4
neighbours; a corner has 2 — **[V]** `src/game/homeCheckmate.ts:29-30` notes exactly
this).

**Muju adaptation.** This already exists, twice, in usable form:
- `lab/solver/model.ts:60-84` `killFrontier(target, attackers, distance, actionBudget, maxBodies)` —
  an exact damage/action/cost DP returning the Pareto frontier, validated against
  brute force by `tests/ai/static-value.test.ts:21-36`. **[V]** It is catalogue-level
  (takes `UnitDefinition[]`, one shared `distance`), not board-level.
- `src/game/homeCheckmate.ts:27-49` `enoughPossibleDamage` — a board-level
  `power[hits][actionsUsed]` DP over real units with real Manhattan distances and
  real per-attacker costs `⌈max(0, md−1)/speed⌉ + 1`, capped at 3 attackers because
  a corner has 2 lanes. **[V]**

**Recommendation [I]:** promote `enoughPossibleDamage` into a general, per-target
routine `minActionsToKill(target) → {actions, attackerSet} | ∞`, computed for all
enemy units at once at each macro node, with **true BFS distances** (not Manhattan)
so it respects blockers. Use it for:
- **move ordering**: order candidate turns by `Σ value(killable targets)` — the
  MVV-LVA analogue is "most valuable victim per action spent"
  (`def.cost / actionsToKill`);
- **futility/quiescence gating**: a turn is "tactical" iff some
  `minActionsToKill ≤ actionsRemaining` for either side;
- **evaluation**: the hanging-piece term (§5.10);
- **the generator's forced-injection list** (§3.5 step 3).

**Napkin corroboration [D]:** 2026-09-13 — "Kill combos need attackers
PRE-ADJACENT — every mover costs move+attack AP; I was one AP short of killing the
enemy Aeg four turns running." That is exactly the `⌈(d−1)/speed⌉ + 1` term, and it
is the most common human-level mistake this table prevents.

**Expected benefit.** Large: it is simultaneously the move-orderer, the quiescence
trigger and the main tactical eval term. **[I]**

**Cost.** ~200 lines; the DP is already written twice, so this is mostly
generalisation + BFS distances + caching.

**Priority: P0.**

### 3.7 Threat-space search

**What it is.** Search only *threatening* moves, ignoring quiet ones, to find
forced wins much deeper than full-width search can. Invented for Go-Moku / Renju
(Allis), standard for connection games and for "can I force a mate" questions.

**Reference implementation.** Generate only moves that create a threat of a
specific class; the opponent's replies are restricted to threat answers; iterate
until a win is proven or no threat remains. Combined with dependency-based search
to avoid re-searching independent threat sequences.

**Muju adaptation.** Muju has three natural threat classes:
1. **Kill threats** — `minActionsToKill(target) ≤ 4` after my next turn's moves.
2. **Home threats** — a unit within `⌈BFS_dist / speed⌉ ≤ 4` of the enemy corner.
   The existing `strategicValue` already computes exactly this reachability with
   `getMoveCost(u.position, target, speed, board)` (**[V]** `src/ai/planner/strategies.ts:24-34`).
3. **Spawn-denial threats** — a unit that can step into the enemy's rectangle and
   blank their entire purchase phase (**[V]** `src/game/spawning.ts:34-46`;
   **[D]** napkin 2026-09-12 game 2: Codex "walked INTO my cluster (B2) to block all
   spawn rectangles").

A threat-space search over class (2) is exactly the "can I force a home win in ≤ n
turns" question, and is where df-pn (§4.11) belongs.

**Expected benefit.** High for the endgame and for raid evaluation; it is how you
find 3-turn forced invasions that a depth-4 alpha-beta misses. **[I]**

**Cost.** ~250 lines on top of §3.6 and §4.11.

**Priority: P2** (after the main search works).

---

## 4. Search

### 4.0 The budget arithmetic that constrains every choice

**[I]** Two-level cost model. Let
`C_gen` = cost of generating K candidate turns at a node,
`C_eval` = cost of one leaf evaluation, `K` = candidates kept, `d` = macro-plies.
Alpha-beta with good ordering visits ≈ `K^(d/2)` interior nodes; each pays `C_gen`.

With the bitboard kernel I estimate **[I]** `C_gen ≈ 150 µs` for K = 24 (a few
hundred within-turn states at ~0.3 µs each, plus place-plan scoring) and
`C_eval ≈ 1 µs`. A 3-second worker budget then allows ≈ 20,000 interior macro-nodes:

| K | effective branch `√K` | macro-plies reachable in 3 s |
|---:|---:|---:|
| 16 | 4 | 7.2 |
| 24 | 4.9 | 6.2 |
| 48 | 6.9 | 5.1 |
| 96 | 9.8 | 4.3 |

So the realistic Hard-AI target is **5–7 macro-plies = 2.5–3.5 full rounds**,
with K ≈ 20–30. For comparison, the current engine reaches a **4-macro-ply MCTS
tree with a greedy depth-4 rollout** (**[V]** `src/ai/search/mcts.ts:57, 83`) and
a *72 µs* evaluator **[M]**, i.e. ~40k evaluations total in 3 s. The proposed
architecture is roughly a 20–50× work increase at the same wall clock. **[I]**

### 4.1 Iterative deepening + negamax alpha-beta / PVS

**What it is.** Search depth 1, then 2, then 3… reusing the previous iteration's
best move for ordering. PVS (principal variation search) searches the first move
with a full window and the rest with null windows `(α, α+1)`, re-searching only on
a fail-high.

**Reference implementation.** Standard: `negamax(α, β, depth)`, TT probe, null-move,
move loop with LMR, `if (score > α) { α = score; if (α ≥ β) break; }`. PVS saves
~10–20% over plain alpha-beta when ordering is good.

**Muju adaptation.**
- **Negamax works** because Muju is strictly zero-sum and alternating *at the turn
  level* — the four actions all belong to one player (**[V]** `src/game/turn.ts:87-89`;
  `src/ai/eval/sharpener.ts:29` makes the same observation: "Actions do not
  alternate players: four actions belong to the same turn"). Do **not** alternate
  the sign inside a turn.
- **Draws are 0 and reachable**: `resolveInactivityDraw` fires at the end of the
  tenth quiet ply (**[V]** `src/game/inactivity.ts:7-10`). Score draws as exactly 0
  and make sure the draw clock is in the TT key (§2.3) or you will get
  search instability from clock-dependent transpositions.
- **Mate scores**: use `±(WIN − plyFromRoot)` so shorter wins are preferred, and
  adjust stored mate scores by ply on TT store/probe (the classic bug). The current
  code uses a flat `VICTORY_SCORE = 100000` (**[V]** `src/ai/evaluation.ts:21`) with
  no ply adjustment — fine for MCTS, wrong for alpha-beta.
- Iterative deepening is also the **time-management mechanism** (§9.4): you always
  have a complete best-move from depth `d−1`.

**Expected benefit.** This *is* the engine. Versus the present MCTS-over-plans,
I expect alpha-beta to be substantially stronger here because the game is
deterministic, tactical, has a cheap accurate-ish evaluation, and has a modest
effective branching *after* candidate generation. **[I]** MCTS's advantage —
handling huge branching without an evaluation function — is neutralised the moment
you have a candidate generator and a decent eval.

**Cost.** ~400 lines for the search driver.

**Priority: P0.**

### 4.2 Aspiration windows

**What it is.** Start iteration `d` with a narrow window around the previous score,
`(s−δ, s+δ)`, widening on fail-high/low.

**Reference implementation.** δ ≈ 25–50 centipawns, widened geometrically (×4) on
failure, falling back to `(−∞, +∞)` after 2–3 failures.

**Muju adaptation.** Pick δ from the game's value quantum. **[V]** Material is
measured in crystals (tier-1 costs 3–5, tier-3 costs 15–17), and the current
evaluator uses raw cost as unit value (`src/ai/evaluation.ts:136-142`). If you
normalise to "one crystal = 100 internal points", δ = 150–250 (half a Hi) is the
right first window. **[I]**

**Expected benefit.** 5–15% node reduction. Small but free.
**Cost.** ~30 lines. **Priority: P2.**

### 4.3 Transposition table with a replacement scheme

**What it is.** A large hash table of `{key, depth, score, bound, bestMove, age}`
storing search results, probed at every node.

**Reference implementation.** Bucketed (2 or 4 entries per cache line);
replacement by **depth-preferred with ageing**: always replace an entry from an
older search generation; otherwise replace the shallowest. Store an exact/lower/upper
bound flag. Lockless XOR-key trick for multithreaded engines (not needed here —
one worker).

**Muju adaptation.**
- Key: `Kpos` from §2.3. **Transpositions are real in this game** — different
  action orders across *different turns* reach the same board+bank+reserves.
  But note a subtlety: **reserves make positions much less likely to transpose than
  in chess**, because any mining changes the key. **[I]** Expect a lower TT hit rate
  than a chess engine; do not over-size the table. 2^20 entries × 16 bytes = 16 MB
  is already generous for a browser tab; 2^18 (4 MB) is a safer default for mobile.
- Store the **candidate-turn identity**, not an action list: a turn is up to 8
  actions and you cannot cheaply store it. Store a 32-bit hash of the turn's
  end-position and re-derive the turn by matching the generator's output — or store
  the first action plus a small index. **[I]** Simplest workable scheme: store
  `bestChildKpos` (32 bits) and, on a TT hit, order the generator's candidates by
  whether their end-position hash matches.
- **Do not store the checkmate prover's verdict in the main TT.** It depends on the
  *defender's* full reply turn including bank (**[V]** `src/game/homeCheckmate.ts:127-156`);
  give it its own small cache keyed by `Kpos`.

**Expected benefit.** 1.5–3× effective depth in the endgame, less in the opening. **[I]**
**Cost.** ~200 lines. **Priority: P0.**

### 4.4 Move ordering

**What it is.** The single biggest determinant of alpha-beta efficiency. Perfect
ordering gives `b^(d/2)` nodes; random ordering gives `b^d`.

**Reference implementation.** In order: (1) TT move, (2) winning captures by
MVV-LVA / SEE ≥ 0, (3) two killer moves per ply, (4) counter-move heuristic,
(5) history heuristic (butterfly boards indexed by from-square × to-square),
(6) losing captures, (7) quiet moves by history/PST.

**Muju adaptation** — every heuristic needs a re-definition because a "move" is a
whole turn:

| Chess heuristic | Muju analogue |
|---|---|
| TT move | the candidate turn whose end-position hash matches the TT entry |
| MVV-LVA | **value-per-action**: `Σ def.cost(killed) / actionsSpentKilling`. **[V]** Costs run 3→17 (`src/game/units.ts`), so killing a `plant_3` (17) with 2 actions outranks killing a `fire_1` (3) with 1. |
| SEE ≥ 0 | "do my killers survive the reply?" — run `minActionsToKill` (§3.6) *for the opponent* against my post-turn position, and demote turns that hang more value than they take. This is the closest true SEE analogue. |
| killers | per-ply "turn signatures" that caused a beta cutoff: store an abstract signature (e.g. `{firstActionKind, unitElement, targetElementOrRegion}`) rather than the exact turn, since exact turns rarely repeat. **[I]** |
| counter-move | "after the opponent invades my rectangle, the turn that killed the invader" — keyed by `(opponentTurnSignature) → myTurnSignature`. |
| history | **two butterfly tables**: `histMove[unitSlotKind][fromSq][toSq]` and `histBuy[defId][sq]`. The buy table is genuinely useful here — it learns, within a search, which spawn squares are good. **[I]** |
| PST-ordered quiets | order quiet turns by `Δ(projected income) + Δ(spawn area) − Δ(exposure)` (§5) |

**Additional Muju-specific first-class orderings [I]:**
- **home entry** and **home rescue** turns first, always (they are win/lose in one ply);
- **spawn-denial** turns high (they zero the opponent's whole economy phase);
- **Cleave chains** high — a turn that kills 2–3 units with one unit is both
  material and tempo, and the draw clock reset is worth something.

**Expected benefit.** 3–10× node reduction. Nothing else in the search section
matters as much. **[I]**
**Cost.** ~250 lines. **Priority: P0.**

### 4.5 Quiescence search over "tactical" turns

**What it is.** At the horizon, keep searching *only* forcing moves until the
position is quiet, to avoid the horizon effect (stopping right before a recapture).

**Reference implementation.** Captures (and checks at the first ply) only, with
stand-pat: `if (standPat ≥ β) return β; if (standPat > α) α = standPat;` then
search captures. Delta-pruning skips captures that cannot raise α.

**Muju adaptation.** Define a **tactical turn** as one containing at least one of:
1. an attack that kills (`minActionsToKill(target) ≤ actionsRemaining`, §3.6);
2. a move that enters or vacates the enemy/own home corner;
3. a move that enters or vacates a spawn rectangle (a spawn-strike);
4. a promotion that crosses a kill or survival threshold (§3.4).

Then quiescence = alternating macro-plies restricted to tactical turns, with
stand-pat = static eval. **[V]** The existing `tacticalSharpen`
(`src/ai/eval/sharpener.ts:10-40`) is a primitive version of exactly this: it
recurses on attack actions only, gated by `isHotPosition`, with depth 2 on Hard.
It has two flaws to fix: it recurses on *actions* not turns (so it never sees the
opponent's reply), and `isHotPosition` returns true if *any* unit on either side
has a legal attack (`sharpener.ts:42-50`), which is nearly always true mid-game.

**Danger unique to Muju [I]:** quiescence must have a depth cap and must not
include income. If a "tactical" turn is allowed to run to a turn boundary, you
collect income inside quiescence and the search will hallucinate economic gains.
Recommended: quiescence evaluates the *position after the tactical turn's actions
but before income settlement*, or simply caps at 4 quiescence plies.

**Expected benefit.** Large — without it, the engine will systematically hang units
at the horizon, which is the most visible weakness of the current AI. **[I]**
**Cost.** ~200 lines. **Priority: P0.**

### 4.6 Null-move pruning — and why it is dangerous here

**What it is.** Give the opponent a free move; if the position is still ≥ β, prune.
Relies on the *zugzwang-free* assumption: having the move is (almost) never a
disadvantage.

**Reference implementation.** `R = 2..3` reduction, disabled in pawn endings and
when the side to move has only king+pawns.

**Muju adaptation — I recommend NOT using classical null-move. [I]** Three reasons,
all grounded in the rules:
1. **Passing is not free, it is *positive*.** Income is unconditional at turn end
   (**[V]** `src/game/mining.ts:18-33`); a null move that skips income makes the
   "free move" worth *less* than a real pass, so a null-move fail-high is not
   evidence about the real move.
2. **Passing is also negative**: upkeep is charged next turn regardless
   (**[V]** `src/game/upkeep.ts:14-16`), and the draw clock advances
   (**[V]** `src/game/turn.ts:96-99`) — 10 quiet plies is a forced draw. A position
   where the leader wants to stall and the trailer wants to force is exactly
   zugzwang-shaped.
3. **There is real zugzwang in this game.** With no legal spawn square and no
   affordable promotion, a player *must* move units, and every unit move off a live
   crystal square costs income. **[V]** `canActInPlacePhase`
   (`src/game/turn.ts:141-145`) skips Place entirely in that case.

**Safer substitute — "quiet-turn pruning" [I]:** instead of a null move, search the
*cheapest real quiet turn* (mine in place, spend zero actions) at reduced depth
`d − 1 − R`. That is a legal move with correct income/upkeep/clock semantics and
serves the same ordering purpose. `END_ACTION_PHASE` with no actions is always
legal (**[V]** `src/game/legality.ts:25`), so this costs nothing to generate.

**Expected benefit.** Modest (10–25% nodes) with the safe variant; potentially
*negative* with classical null move. **[I]**
**Cost.** ~60 lines. **Priority: P3**, and only after SPRT verification (§8.4).

### 4.7 Late move reductions (LMR)

**What it is.** Search moves late in the ordered list at reduced depth; re-search
at full depth if they fail high.

**Reference implementation.** `R = 0.75 + log(depth)·log(moveNumber)/2.25`,
disabled for captures, checks, killers and when in check.

**Muju adaptation.** With K ≈ 24 candidates and an ordering that is good at the top
(kills, home, spawn-denial) and weak at the bottom (quiet income shuffles), LMR is
a natural fit: reduce candidates ranked > 6 by 1 ply, > 12 by 2. **Never reduce**:
proven kill combos, home entries, home rescues, spawn-denial turns, or any turn the
generator force-injected (§3.5 step 3). **[I]**

**Expected benefit.** 1.3–2× effective depth. **[I]**
**Cost.** ~50 lines. **Priority: P1** (but verify with SPRT — LMR is easy to
mis-tune into blindness).

### 4.8 Extensions: singular, forced-kill, recapture

**What it is.** Search deeper on lines where one move is clearly best (singular) or
where the reply is forced.

**Reference implementation.** Singular extension: if the TT move fails high on a
reduced-depth search with window `(s−margin, s−margin+1)` while all siblings fail
low, extend by 1 ply. Check extensions and recapture extensions are simpler.

**Muju adaptations, in priority order [I]:**
1. **Home-threat extension.** Any position where either side has a unit within
   `⌈BFS/speed⌉ ≤ 4` of the enemy corner gets +1 ply. This is the "in check"
   analogue and is cheap to detect — `strategicValue` already computes the
   reachability (**[V]** `src/ai/planner/strategies.ts:24-29`).
2. **Forced-rescue extension.** If a corner is occupied, the defender's reply is
   near-forced (the checkmate prover restricts it to upkeep × promotions × 4 actions —
   **[V]** `src/game/homeCheckmate.ts:57-168`). Extend and let the prover answer
   instead of the general search.
3. **Singular extension** on the generator's top candidate, with a margin of
   ~1 crystal (100 points). Standard, moderate gain.
4. **Cleave-chain extension**: a turn that killed with its last action and still has
   Cleave eligibility left is unfinished business. Half-ply.

**Expected benefit.** Home-threat extension is worth a lot (it is the win condition);
singular extension is worth 10–20 Elo in chess engines and probably similar here. **[I]**
**Cost.** ~120 lines. **Priority: P1** for home-threat, **P3** for singular.

### 4.9 MCTS vs alpha-beta for this game

**What it is.** The architecture choice. The repo currently uses MCTS over whole-turn
plans (**[V]** `src/ai/search/mcts.ts`), with progressive widening and a static
evaluator instead of random rollouts.

**Assessment [I].** MCTS is the right tool when (a) branching is huge, (b) there is
no good evaluation function, (c) the game is smooth/positional, (d) there is
stochasticity or hidden information. Muju is (a) yes, (b) **no** — material +
income + home distance is a strong signal, (c) **no** — it is sharply tactical
(one kill swings 3–17 crystals and Cleave can take three units in a turn), (d) **no** —
it is fully deterministic and public (**[V]** SPEC §8, `src/game/types.ts:120-148`).

Three of four criteria point to alpha-beta. Specific failure modes of the current
MCTS setup that alpha-beta would not have:
- **[V]** the tree is capped at depth 4 and the rollout is *greedy-best-plan* for 4
  more plies (`src/ai/search/mcts.ts:57, 83-90`), i.e. the value of a leaf is the
  static eval after 8 plies of *one specific greedy line* — not a minimax value;
- **[V]** `bestPlanFromRoot` returns the **most-visited** child (`mcts.ts:124-129`),
  which with only 1,200 iterations and progressive widening `√visits` (`mcts.ts:60`)
  means the root may have expanded only `√1200 ≈ 34` children and visited the best
  one a few dozen times — far too few for a tactical game;
- **[V]** values are squashed through `tanh(score/100)` (`mcts.ts:64, 93`), which
  compresses a 17-crystal blunder and a 3-crystal blunder into nearly the same
  number once the position is already ±100.

**Recommendation.** Alpha-beta/PVS as the primary search. **Keep MCTS as an
optional root-level portfolio blender** if you later want stylistic variety or a
"Medium" difficulty that is not simply a weakened Hard.

**Priority: P0** (adopt alpha-beta), and explicitly **do not** invest further in the
MCTS layer.

### 4.10 Proof-number search / df-pn for home-checkmate and forced kills

**What it is.** A best-first AND/OR-tree search that always expands the node most
likely to flip the proof, using proof numbers (min work to prove) and disproof
numbers (min work to disprove). `df-pn` is the depth-first, memory-bounded
reformulation with thresholds.

**Reference implementation.** Used for checkers (Chinook endgame proofs), Go-Moku,
Shogi tsume solvers (df-pn is *the* standard tsume-shogi algorithm), and Hex.
Key details: `pn/dn` initialisation from a heuristic, a TT keyed by position storing
`(pn, dn)`, and the "1 + ε trick" to avoid thrashing between siblings.

**Muju adaptation.** There are two natural AND/OR questions, and the repo already
solves the shallow version of both with plain DFS:
1. **"Can the defender rescue their home?"** — currently a DFS with an optimistic
   damage bound, node cap 20,000, and a `failed` set for transposition
   (**[V]** `src/game/homeCheckmate.ts:57-168`). This is a **single-player** (OR-only)
   problem for one turn, so df-pn buys little; the existing DFS + the bound is
   already near-optimal. The win here is just replacing the string key with Zobrist.
2. **"Can I force a home win within n turns?"** — this *is* an AND/OR tree
   (my turns are OR, opponent turns are AND) and is a perfect df-pn target. It is
   currently not attempted at all: the engine only checks a *single* reply turn
   (**[V]** `src/ai/engine-v2.ts:108-121, 135-151`).
3. **"Can I force the elimination of unit X within n turns?"** — same shape.

**[I]** A df-pn module answering (2) with n ≤ 3 turns, invoked when
`minTurnsToCorner ≤ 3` for either side, would be a genuine strength jump: it finds
forced invasions and, symmetrically, refutes the engine's own losing raids. This is
the highest-value *specialised* solver after the kill-combo table.

**Expected benefit.** Large but narrow: only fires in maybe 10–20% of positions,
where it is close to decisive. **[I]**
**Cost.** ~400 lines plus a `(pn, dn)` TT. df-pn is notoriously fiddly (the GHI
problem — graph-history interaction — is real here because the **draw clock** and
**reserves** are history-dependent; keep them in the key, §2.3).
**Priority: P2.**

### 4.11 Endgame retrograde analysis (tablebases)

**What it is.** Enumerate all positions with ≤ k pieces backwards from terminal
positions, storing the exact game-theoretic value.

**Reference implementation.** Chess Syzygy/Nalimov; checkers 10-piece DB.
Feasible when the state space is `positions ≈ C(squares, pieces) × piece-type
assignments × side-to-move` and fits in memory/disk.

**Muju feasibility — I assess this as NOT feasible. [I]** Count the state
dimensions for even a 2v2 endgame:
- placements: `100 × 99 × 98 × 97 ≈ 9.4 × 10^7` ordered, `≈ 3.9 × 10^6` unordered;
- unit types: `18^4 = 104,976` (though realistically the relevant subsets are small);
- **banks**: unbounded integers, and they matter (they gate purchases and upkeep);
- **reserves**: `17^100` in principle — the crystal map is part of the state and
  never resets **[V]** `src/game/mining.ts:25-28`;
- **draw clock**: 11 values;
- per-unit damage and Cleave flags.

The reserve vector alone destroys any tablebase. The *only* tractable variant is a
**stripped endgame**: all reserves 0, both banks 0, no purchases possible (no legal
spawn square). Then a 2v2 table is `3.9e6 × (small type set) × 2 × 11` ≈ 10^8–10^9
entries — borderline, and the payoff is tiny because that position class is rare
(reserves total 504 and games end long before the board is mined out **[M]**).

**Recommendation: skip.** Spend the effort on §4.10 df-pn instead, which answers
the same "is this won" questions where they actually arise.
**Priority: P4 (do not build).**

### 4.12 Multi-cut / ProbCut / futility pruning

**What it is.** Forward-pruning heuristics. ProbCut: a shallow search with a widened
window predicts the deep result statistically. Futility: at depth 1, skip quiet
moves whose static eval + margin < α.

**Muju adaptation.** Futility is directly applicable and cheap: at the last ply,
skip candidate turns whose `staticEval + maxPlausibleGain < α`, where
`maxPlausibleGain` = value of the most valuable killable enemy unit + projected
income delta. **[I]** ProbCut needs a calibrated shallow-vs-deep correlation, which
requires the self-play corpus you build for tuning anyway (§5.12).

**Priority: P2** (futility), **P3** (ProbCut).

---

## 5. Static evaluation

The evaluation is where Muju-specific knowledge lives, and it is where the current
engine is weakest relative to its potential: **[M]** 71.9 µs per call for a feature
set that is mostly proxies (`mobility`, `centerControl`, `unitHealth`).

### 5.1 Material with tuned values

**What it is.** The base term: `Σ value(myUnits) − Σ value(theirUnits)`.

**Reference implementation.** Chess values are *not* the "cost" of a piece; they are
fitted from game outcomes (P=100, N=320, B=330, R=500, Q=900), and modern engines
make them phase-dependent and mobility-coupled.

**Muju adaptation.** **[V]** The current evaluator uses the raw catalogue cost
(`src/ai/evaluation.ts:136-142`): 3/3/4/4/5/5 for T1, 7/7/8/8/9/9 for T2,
15/15/16/16/17/17 for T3. **This is almost certainly wrong**, because cost measures
*purchase price*, not *board value*, and the two diverge badly here:
- a T3 costs 15–17 but carries **2 crystals/turn of rent** (**[V]** `src/game/upkeep.ts:5`),
  so its board value should be discounted by the present value of its rent
  (≈ 2/(1−γ) ≈ 20 at γ = 0.9 if held forever — i.e. rent can exceed the purchase
  price over a long game);
- `plant_3` (cost 17, ATK 2, DEF 4, MINE 8) and `metal_3` (cost 17, ATK 2, DEF 5,
  MINE 4) are not remotely equal in combat or economy;
- `lightning_1` (cost 3, MINE 0) is worth ~0 as a miner and a lot as a raider;
  its value is entirely positional.
- **Defence is a hard threshold, not a scalar.** **[V]** `ATK_eff ≥ DEF_eff` kills
  outright (`src/game/combat.ts:148`). So DEF 5 (`metal_3`) is qualitatively
  different from DEF 4: with the ±1 elemental modifier, the highest single attack
  in the game is `fire_3` ATK 4 +1 = 5 vs Plant/Metal, so `metal_3` (DEF 5) is
  killed in one hit only by `fire_3` (ATK 4, +1 because Fire beats Metal = **5 ≥ 5**),
  and by nothing else in the catalogue. `water_3` (DEF 4) is killed in one hit by
  `shadow_3` (ATK 4, neutral inside the Water-Shadow pair = 4 ≥ 4) but *not* by
  `fire_3` (Water beats Fire, so 4 − 1 = 3 < 4). One point of DEF therefore changes
  the entire set of units that can remove you. These threshold effects must be
  evaluated by the **kill-combo table** (§3.6), never by a linear DEF term.

**Recommendation [I]:** start with `value = cost` as a prior, then fit 18 free
parameters by logistic regression on self-play outcomes (§5.12). Fix one value
(e.g. `fire_1 = 300`) to remove the scale degree of freedom.

**Priority: P1** (the initial values are adequate; the *tuning* is what pays).

### 5.2 Mobility

**What it is.** Count of legal moves, usually per piece and weighted.

**Reference implementation.** "Safe mobility": squares attacked that are not
defended by an enemy pawn; computed from the same attack bitboards the move
generator already built, so it is nearly free.

**Muju adaptation.** **[V]** The current mobility term runs a BFS per unit per
player and adds `attacks × 1.5` (`src/ai/evaluation.ts:185-201`) — this is a large
share of the 71.9 µs **[M]**. In a game with no zone of control and no
sliding pieces, raw mobility is a weak signal. What actually matters is
**reach**: the set of squares a unit can *strike* this turn, which is
`dilate(reachable(speed × 3), 1)` — the existing `getAttackFrontier`
(**[V]** `src/game/movement.ts:200-214`) computes exactly the perimeter of this.

**Recommendation [I]:** replace scalar mobility with two bitboard terms:
`|myStrikeArea ∩ enemyOccupancy|` (targets I threaten) and
`|enemyStrikeArea ∩ myOccupancy|` (units I hang), both of which the threat map
(§5.8) produces for free. Drop the raw move count entirely.

**Priority: P1** (as a *removal* — it is costing more than it earns).

### 5.3 "King safety" analogue: home-square safety

**What it is.** In chess, a weighted count of attackers/defenders around the king,
with an escalating attack-weight table.

**Muju adaptation.** The home corner is the king, except it cannot move and cannot
be captured — it must simply not be *stood on* at your turn start
(**[V]** `src/game/turn.ts:23-27`). Corners have only **two** orthogonal neighbours
(`(1,0)` and `(0,1)` for White), which the checkmate prover explicitly relies on
(**[V]** `src/game/homeCheckmate.ts:29-30`). That makes home safety unusually
tractable:

```
homeSafety(me) =
    −A · [enemy can reach my corner in ≤ 4 actions]           (a threat)
    −B · minOverEnemyUnits( turnsToCorner )                    (a countdown)
    +C · |friendly units adjacent to my corner with ATK > 0|   (rescuers)
    +D · [my corner square is occupied by my own unit]         (a plug: an enemy
                                                                cannot move onto
                                                                an occupied square
                                                                — src/game/movement.ts:29-32)
    −E · [enemy occupies my corner]                            (already lost unless rescued)
```

Term **D** is a genuine Muju-specific insight **[I]**: parking any unit on your own
corner makes home occupation *impossible* while it lives, because movement can
never end on an occupied square (**[V]** `src/game/movement.ts:258-261` via
`distancesFrom`, which never expands into occupied squares). The cost is that the
corner cell and its rectangle are then partly consumed — and **[D]** the napkin
(2026-09-12) records losing a game precisely by over-filling the corner.
So D must be traded off against the spawn-area term (§5.6).

**[V]** The current code has a crude version: `homeOccupationPressure` returns
`±250` scaled by `0.08` = ±20 points (`src/game/victory.ts:113-116`,
`src/ai/evaluation.ts:43`), plus a `−200` invader penalty in `strategicValue`
(`src/ai/planner/strategies.ts:36`) and a reachability bonus of
`max(0, actions − closest) × (defenders ? 0.4 : 2)` (`strategies.ts:29-34`).
Those are the right shapes; they need tuning and a proper countdown term.

**Priority: P0.** This is the win condition. **[D]** Three of the three logged
losses in `.claude/napkin.md` involve home/anchor geometry, not material.

### 5.4 Piece-square tables derived from the crystal map

**What it is.** A per-piece-type, per-square bonus table baked into the evaluation,
updated incrementally on every move.

**Reference implementation.** PSTs in chess are hand-tuned or fitted; they are
phase-interpolated (midgame/endgame) and updated in `make/unmake` as a running sum.

**Muju adaptation — PSTs must be *dynamic*, because the crystal map depletes.**
**[V]** `cell.resourceLayers` only decreases (`src/game/mining.ts:25-28`), so a
static table computed from `UNEQUAL_ROUTES_MAP` is wrong by mid-game. The right
object is a **per-(unit-type, square) discounted extraction value** recomputed from
the *live* reserves:

```
PST_mine[def][sq] = Σ_{t≥1} γ^t · min(mine(def), reserve_after_t−1(sq))
```

**[M/I]** Worked values at γ = 0.9 (my computation from the catalogue and the three
live reserve levels):

| Reserve | `plant_1` (m3) | `plant_2` (m5) | `plant_3` (m8) | `water_1` (m2) | `metal_3` (m4) | `fire_1` (m1) | `lightning_*` (m0) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 3.51 | 3.60 | 3.60 | 3.42 | 3.60 | 3.10 | 0 |
| 8 | 6.59 | 6.93 | 7.20 | 6.19 | 6.84 | 5.13 | 0 |
| 16 | 11.59 | 12.85 | **13.68** | 10.25 | 12.38 | 6.46 | 0 |

Two readings matter. (i) On a 4-cell every miner is nearly equal — the ore runs out
before rate matters, so **a Muju on a 4-cell is wasting 2 points of mining per turn**.
(ii) On a 16-cell the spread is 6.46 → 13.68, so **rich-patch assignment is the whole
economic game**. **[M]** There are only **8 sixteen-cells** on the board (four per
side, `src/game/resourceMap.ts:8-9, 14-15`) and **20 eight-cells**; that is the
entire high-value real estate.

Add a second, static PST for **combat geometry**: distance-to-enemy-corner
(the raid ladder), distance-to-own-corner (the defence ladder), and the
18-blank-square approaches (**[V]** the 0-cells at D1–F3 and E8–G10,
`src/game/resourceMap.ts:6-16`) which are pure movement corridors — worthless to
miners, valuable to `lightning_*`.

**Expected benefit.** High. This replaces `centerControl`
(**[V]** `src/ai/evaluation.ts:207-223`, a Euclidean-distance-to-(4.5,4.5) term that
has no rules basis) with something the game actually rewards.
**Cost.** ~150 lines; the table is `18 × 100` floats = 1,800 entries, recomputable in
O(100 × 18) ≈ 1,800 ops at each macro node, or incrementally at each mining event.
**Priority: P1.**

### 5.5 Economic evaluation: discounted future income as a small DP

**What it is.** Estimate each side's future crystal stream given current miner
placement and remaining reserves — the "material count" of the economy.

**Reference implementation.** No board-game canon; this is a resource-allocation
problem. The right model is a **min-cost assignment / greedy matching** between
miners and cells, horizon-truncated and discounted.

**Muju adaptation [I].** Per side:

```
economy(me, H = 6 turns, γ = 0.9):
  1. current rate:  Σ_u min(mine(u), reserve(sq_u))            // exact, this turn
  2. depletion:     simulate H turns of that assignment,
                    decrementing each cell            → stream_0
  3. relocation:    for each miner whose cell empties at turn t,
                    greedily reassign it to the best free cell within
                    ⌈BFS/speed⌉ actions, charging the travel turns
                    → stream_1 (an upper bound on real income)
  4. subtract upkeep: Σ_u upkeep(tier(u)) per turn for H turns
  5. value = Σ_t γ^t (stream_1[t] − upkeep[t])
```

Step 3 is where the DP lives, and it should be *contested*: a cell is only yours if
the opponent cannot take or deny it. **[D]** The napkin's 2026-09-12 lesson — "bought
Mujus on home cells that were already half-mined, so income collapsed to ~1 by turn 6
while Codex moved Mujus onto fresh cells" — is exactly the failure this term
prevents. The current `miningPotential` term is only step 1
(**[V]** `src/ai/evaluation.ts:155-157` → `projectedIncome`, `src/game/mining.ts:12-15`),
which is blind to depletion: it scores a Muju on a 1-crystal cell the same as on a
16-crystal cell for the first turn and then discovers the difference.

**[M]** Cost check: `projectedIncome` is 0.15 µs, so even a 6-turn, 20-unit DP
(~120 cell updates) is ≈ 2–5 µs — affordable at macro nodes, too expensive per leaf.
Use it in a **two-tier evaluation** (§5.11): cheap terms at every leaf, the economy
DP only when the cheap eval is within a margin of the window.

**Priority: P1.**

### 5.6 Spawn-rectangle area, anchor safety, and infiltration

**What it is.** Muju's most distinctive positional feature and, judging by the
logged games, the most decisive one.

**Muju facts [V]:** the legal spawn set is the union over *unblocked* friendly
anchors of `rect(corner, anchor) \ occupied` (`src/game/spawning.ts:65-118`); one
enemy unit anywhere inside a rectangle blanks that anchor entirely
(`src/game/spawning.ts:34-46`); an enemy on your corner blanks **every** rectangle
(SPEC §9; **[V]** every rectangle contains the corner by construction,
`src/game/spawning.ts:8-29`).

**Evaluation terms [I]:**

| Term | Formula (bitboard) | Why |
|---|---|---|
| spawn area | `popcount(legalSpawnMask)` | capacity to convert bank → bodies |
| **spawn-zero penalty** | large negative if `popcount == 0` while bank ≥ 3 | **[D]** napkin 2026-09-12: a lost game from exactly this |
| anchor depth | `max over unblocked anchors of (anchor.x + anchor.y)` for White | a forward anchor lets you spawn next to the fight. **[D]** napkin 2026-09-13: "Whoever owns a forward anchor owns the board" |
| anchor fragility | for each anchor, `minActionsToKill(anchor)` for the opponent, and `[enemy can step into rect in ≤ 4 actions]` | **[D]** napkin 2026-09-12 game 2: "a far anchor is worthless if one cheap enemy unit can step into the rectangle" |
| infiltration | `popcount(myOcc & enemyLegalSpawnMaskIfIWereAbsent)` | the value of *my* units denying *their* spawn |
| bank-conversion | `min(bank, 3 × spawnArea)` vs `bank` | unspendable crystals are worth less than spendable ones |

**[V]** The current evaluator has crude versions of three of these
(`territoryControl` = raw spawn count at `src/ai/evaluation.ts:147-150`,
`spawnDenialPressure` at `:268-280`, `spawnInfiltration` at `:282-294`) with weights
`0.3 / −1.5 / 1.0` (**[V]** `src/ai/types.ts:76, 83-84`). They are the right ideas
with no anchor-depth or fragility notion and no zero-spawn cliff.

**Priority: P0.** With bitboards (§2.1) this whole block costs ~100 ns.

### 5.7 Upkeep-vs-income runway

**What it is.** Solvency. A player whose rent exceeds income must release units
(**[V]** `src/game/upkeep.ts:23-31`; tier-1 units cannot be released, so a T3-heavy
army is the fragile one).

**Muju arithmetic [V]:** net income per unit per turn on a live cell =
`mine − upkeep(tier)`. Concretely: `plant_1` 3−0 = **+3**, `plant_2` 5−1 = **+4**,
`plant_3` 8−2 = **+6** (SPEC §11 states exactly this: "Full-rate income after
ongoing upkeep is 3/4/6"). But `lightning_3` is 0−2 = **−2/turn**, `fire_3` is
1−2 = **−1/turn**, `shadow_3` is 2−2 = **0**. So the rush elements are *pure
liabilities* economically and must be paid for by kills.

**Evaluation term [I]:**
`runway = (bank + Σ_{t<H} γ^t income_t) − Σ_{t<H} γ^t upkeep_t`, plus a hard cliff
term: `−P` if `bank + nextIncome < upkeepDue` (a forced release next turn).
**[V]** `upkeepDue` already exists (`src/game/upkeep.ts:14-16`) and is O(units).

**Priority: P1.** This is the term that prevents the engine from over-promoting —
a failure mode the napkin records **[D]** ("income 11→0 by turn 12, released units to
upkeep on turn 13").

### 5.8 Threat maps, including purchasable-unit reach

**What it is.** Per-square bitboards of "who can strike here next turn".

**Reference implementation.** Chess builds attack maps from the move generator's
tables; they are the basis of king safety, mobility, SEE and hanging-piece detection.

**Muju adaptation.** Two maps per side:
- `strike[side]` = squares that side can attack within its 4 actions =
  `dilate(reachSet(u, 3 actions), 1)` unioned over units. **[V]**
  `getAttackFrontier` computes the perimeter of exactly this with `moveActions = 3`
  (`src/game/movement.ts:200-214`) and it is already what the UI's "Show reach"
  displays (SPEC §2).
- `strikeIfBought[side]` = the same thing **for units the side could buy this turn**,
  seeded from every legal spawn square with each affordable tier-1's speed.

**The purchase-reach map is not optional. [D]** The napkin records losing a unit on
turn 2 to "a freshly BOUGHT Radi (speed 3) from a forward-anchored rectangle"
(2026-09-12), with the explicit correction: "Threat check must include purchases:
opponent's spawn squares + reach of Radi (9+attack) and Hi (6+attack) from those
squares." **[V, arithmetic]** From a spawn square, a bought `lightning_1` (SPD 3)
can move 3 actions × 3 = 9 squares and attack on the 4th → strike radius 10 in BFS
distance; a bought `fire_1` (SPD 2) → radius 7. Any unit within that radius of any
legal enemy spawn square is *not* safe, no matter where the enemy's current units
are.

**Derived terms:** hanging units (`myOcc & enemyStrike` weighted by value and by
whether `minActionsToKill` is actually affordable), safe squares for miners,
and safe anchor placement.

**[V]** The current evaluator's `killThreatsReceived` (`src/ai/evaluation.ts:236-251`)
only looks at *currently adjacent* enemies — it sees a one-square horizon where the
real horizon is 7–10. This is, in my judgement, the single largest evaluation gap in
the existing engine. **[I]**

**Priority: P0.**

### 5.9 Tempo (actions) and the action-efficiency term

**What it is.** In Muju the 4 shared actions are the scarcest resource, and the
engine must value *action efficiency*, not just outcomes.

**Muju adaptation [I]:** at a leaf reached mid-turn, unspent actions have positive
value (they are optionality). The existing `stepEfficiency` term
(**[V]** `src/ai/evaluation.ts:296-304`: `min(activeUnits, actionsRemaining)`,
weight 0.2) is a crude version. Better: value an unspent action at
`≈ 0.3 × (best available kill value per action)`, i.e. tempo is worth what you can
buy with it. Also: moves that cost 2+ actions (slow units travelling far) should be
penalised by their action cost, since `ceil(dist/speed)` makes a SPD-1 `plant_3`
cost 4 actions to travel 4 squares (**[V]** `src/game/movement.ts:190-193`).

**Priority: P2.**

### 5.10 Draw-clock term

**What it is.** The 10-quiet-ply draw is a real terminal state
(**[V]** `src/game/inactivity.ts:3-10`), and its value depends entirely on who is
ahead.

**Muju adaptation [I]:**
`drawPressure = (10 − inactivityPlies)/10 × sign(staticEvalWithoutThisTerm) × W`.
If I am winning, an advancing clock is *bad* (it converts my win into a draw);
if I am losing, it is *good*. **[V]** The current evaluator has **no draw-clock term
at all** (grep of `src/ai/evaluation.ts` shows no `inactivityPlies` reference), and
`scorePartialPlan` returns a flat 0 for a drawn simulated state
(`src/ai/planner/scoring.ts:16`) — which means the engine cannot deliberately steer
toward or away from a draw. For a losing engine this is a pure loss of half-points.

**Priority: P1.** Cheap (one integer read) and directly converts losses into draws.

### 5.11 Lazy / staged evaluation

**What it is.** Compute the cheap terms first; if the result is far outside the
`(α, β)` window by more than the maximum possible contribution of the remaining
terms, return early.

**Reference implementation.** Two or three stages with conservative margins;
mis-estimating the margin causes search instability, so margins are set generously.

**Muju adaptation [I]:** three stages —
1. **Stage 0 (≈ 50 ns):** material + bank + home-occupation flag. Incrementally
   maintained in make/unmake, so it is free.
2. **Stage 1 (≈ 300 ns):** + PST_mine + spawn-area popcounts + threat-map popcounts
   (all bitboard).
3. **Stage 2 (≈ 3 µs):** + economy DP (§5.5) + kill-combo table (§3.6) + runway.

Margin for stage 0→1 ≈ 8 crystals; stage 1→2 ≈ 3 crystals. **[I]**

**Priority: P1.**

### 5.12 Tuning: Texel, SPSA, CLOP

**Texel tuning (logistic regression on outcomes).** Collect N positions from
self-play games labelled with the final result `r ∈ {0, 0.5, 1}`; minimise
`Σ (r − σ(k·eval(p)))²` over the weight vector by coordinate descent or gradient
descent, fitting the scaling constant `k` first. This is the standard, and it is the
right first tool here because the evaluation is linear in its weights
(**[V]** `src/ai/evaluation.ts:44-129` is literally a weighted sum of 14 features —
a perfectly shaped Texel target).

**Muju specifics [I]:**
- **Source positions from real self-play**, not random play. **[M]** Random games in
  this engine end almost immediately by the inactivity draw (my random playouts
  averaged ~58 actions ≈ 10 plies per game), so a random corpus would be
  pathologically quiet.
- **Filter out positions within 2 plies of a forced tactical resolution** (the usual
  "quiet positions only" rule), using the kill-combo table as the quietness test.
- **Label with the game result, not with a deep search score** to start; you have no
  trustworthy oracle yet.
- Target corpus: 200k–1M positions. **[M]** At the current engine's speed
  (~661 random games/s but far slower with real search) you will want the fast
  bitboard engine before generating the corpus — another reason §2 comes first.

**SPSA (simultaneous perturbation stochastic approximation).** For parameters that
are *not* linear in the evaluation — LMR reduction constants, futility margins,
aspiration δ, candidate count K, widening schedule. Perturb all parameters at once
with random ±, play a match batch, step along the measured gradient. This is how
Stockfish tunes its search constants.

**CLOP / Bayesian optimisation.** Better than SPSA for ≤ 10 noisy parameters with
expensive evaluations; worth it for the candidate-generator widths.

**Pipeline recommendation [I].**
```
1. bitboard engine + eval scaffolding
2. self-play 20k games at fixed low nodes  → 500k quiet positions
3. Texel-fit the 20-40 evaluation weights  → eval v1
4. SPRT eval v1 vs eval v0 (§8.4)
5. SPSA the 8-12 search constants, 2k games per batch
6. repeat 2-5 with the stronger engine as the position source
```
**[V]** The infrastructure for step 4 partly exists: `lab/harness/` has a match
runner, seeded RNG, invariants and Wilson intervals (`lab/harness/stats.ts:1-14`,
`lab/harness/summary.ts:95`). It does **not** have SPRT — that is ~40 lines to add.

**Priority: P1** (Texel), **P2** (SPSA), **P3** (CLOP).

---

## 6. Opening books

### 6.1 Building a book by self-play + minimax backup

**What it is.** Search a tree of the first N turns exhaustively-ish, back up
minimax values from deep searches at the leaves, and store the best reply per
position.

**Reference implementation.** The standard "book learning" loop: (1) pick the
current book leaf with the highest priority (best value × lowest visit count),
(2) expand it by generating its K best moves, (3) run a deep search on each child
and store the value, (4) minimax-back-up to the root, (5) repeat. Chess engines
additionally *prune* book lines that self-play refutes ("book-off" lines). This is
also how AlphaZero-style openings are curated, and how Chinook built its opening DB.

**Muju adaptation.**
- **The opening is deterministic and identical every game.** **[V]**
  `createInitialGameState` always produces the same board, same 6 units, same map,
  White to move in the *action* phase with 4 actions and 0 crystals
  (`src/game/board.ts:203-261`). So the first several turns are a fixed, small,
  high-value tree. **[M]** White's turn 1 has exactly **797 distinct end-of-turn
  positions** — every one of them can be deeply searched offline.
- **Depth budget.** A 5-turn (10-ply) book with K = 12 candidates per node is
  `12^10 ≈ 6 × 10^10` — too many for exhaustion, so use best-first expansion with a
  node budget (say 200k book nodes, each getting a 2-second search offline
  ≈ 110 CPU-hours, or far less with a nodes-limited search).
- **Handicap games break the book.** **[V]** `blackCrystalHandicap` (0–20,
  `src/game/rules.ts:3-7`, `src/game/board.ts:230-236`) changes Black's turn-1
  options entirely, so the book must be keyed by handicap value or restricted to
  handicap 0.

### 6.2 Canonicalisation under the 180° rotational symmetry

**What it is.** Two positions that differ only by a symmetry share a value; storing
one saves half the book and doubles hit rate.

**Muju adaptation — the symmetry is exact and unique. [M]**
- The crystal map satisfies `m[i] === m[99 − i]` for all `i` (verified by
  enumeration), and it is **not** symmetric under transpose or anti-transpose.
- **[V]** Start corners are `(0,0)` / `(9,9)` (`src/game/board.ts:175-177`) and
  starting unit placements are exact 180° images: White Hi `(1,0)`, Sjor `(1,1)`,
  Muju `(0,1)`; Black Hi `(8,9)`, Sjor `(8,8)`, Muju `(9,8)`
  (`src/game/board.ts:184-198`). `rot180(1,0) = (8,9)` ✓, `rot180(1,1) = (8,8)` ✓,
  `rot180(0,1) = (9,8)` ✓.

So the canonical transform is
`σ: (sq, owner, banks, clock) ↦ (99 − sq, ¬owner, swap(banks), clock)`,
and `eval(σ(p)) = −eval(p)`, `value(σ(p)) = −value(p)`.

**Canonical form:** compute both `Kpos(p)` and `Kpos(σ(p))`; store under the
numerically smaller key with a flag saying whether the stored value was negated.
This halves the book and — more importantly — **lets White's analysis answer
Black's questions**. **[I]**

**Caveat [V]:** the symmetry is broken by (a) a non-zero `blackCrystalHandicap`,
(b) any game loaded from a stored map with different `initialResourceLayers`
(`src/game/types.ts:86-87`, `src/game/board.ts:203-209` — schema-5 saves keep their
own layout), and (c) the move-order tiebreak in `findAttackApproach`, which uses a
fixed orthogonal neighbour order (**[V]** `src/game/movement.ts:68-79`,
`src/game/board.ts:313-324`) and is therefore *not* rotation-equivariant. (c) only
affects UI path previews, not legality, so it does not affect the book.

### 6.3 Book format and lookup

**[I] Recommended format** — a flat binary blob, fetched once and kept in the worker:

```
header: magic "MUJUBK01", entryCount u32, handicap u8, mapHash u32
entries (sorted by key, 16 bytes each):
  key      u32   // low 32 bits of canonical Kpos
  keyHi    u16   // next 16 bits, for collision safety (48-bit key)
  flags    u8    // negated | exact | depth-bucket
  turnHash u32   // end-position hash of the recommended turn
  score    i16   // centi-crystals
  count    u8    // self-play visits
```

Lookup: binary search on `(key, keyHi)`; on a hit, ask the candidate generator for
its turns and pick the one whose end-position hash equals `turnHash` — if none
matches (generator drift), fall through to search. That makes the book robust to
generator changes, which is the usual maintenance problem with move-encoded books.

**Size:** 200k entries × 16 B = **3.2 MB**, gzip ≈ 1.5 MB. For a browser game
shipped as a static asset that is acceptable but not free; 50k entries (800 KB) is
the sensible first target. **[I]**

**Expected benefit.** Large *per byte of effort* in the opening (the engine
currently reasons from scratch about a fixed position every game), and it removes
the most embarrassing class of loss: a bad turn-1/turn-2 economy that is
mechanically refutable. **[D]** The napkin records exactly such recipes, e.g.
2026-09-12: "Codex's winning recipe = Hi to a central 8 turn 1, Muju+Radi
hit-and-run early, then promote metal to Mazask/Tanka once ahead."
**Cost.** Offline compute + ~200 lines of runtime.
**Priority: P2** (after the engine is strong enough that its book is worth trusting —
a book built by a weak engine bakes in weak play).

---

## 7. Dynamic programming and precomputed tables

### 7.1 BFS distance tables per unit with blockers

**What it is.** `dist[from][to]` under the current occupancy, and `cost = ⌈dist/speed⌉`.

**[V] Current implementation.** `distancesFrom(start, board)` runs a 100-cell BFS
into an `Int16Array`, memoised in a `WeakMap` keyed by `BoardState` identity with a
per-origin `Map` (`src/game/movement.ts:239-257`). This is a good design — but every
`applyAction` creates a new `BoardState` object (`src/ai/simulate.ts:83-96`), so the
cache lives exactly one node and is thrown away.

**Recommendation [I]:** in the fast engine, cache BFS by `(occupancyHash, origin)`
in a small direct-mapped table (2^14 entries). Occupancy changes only on
move/kill/buy — perhaps 2–4 times per turn — so within a turn most BFS results are
reusable across sibling nodes. Better still: compute a **multi-source BFS** once per
occupancy, seeded from *all* friendly units simultaneously with per-source labels,
when you only need "which unit reaches this square cheapest".

Bitboard BFS (§2.1) makes each ring one shift-and-mask; a full 100-cell distance
map is ~40 ops instead of a queue loop. **[I]**

**Priority: P0** (it is inside every other table).

### 7.2 All-pairs reach caches / strike areas

`strike[u]` = `dilate(reach(u, 3 actions), 1)` — the squares `u` can attack this
turn. **[V]** `getAttackFrontier` (`src/game/movement.ts:200-214`) computes the
*perimeter* of this with `moveActions = 3`; the fast engine wants the full area as a
bitboard, unioned per side, plus the `strikeIfBought` variant (§5.8).
Recompute per macro node, not per leaf. **Priority: P0.**

### 7.3 Income projection DP over remaining stacks

Described in §5.5. Note the exact conservation identity that lets you sanity-check
it: **[V]** SPEC §8 and the invariant that
`board reserves + White gained + Black gained = initial total` (504 for new games),
which `lab/harness/invariants.ts` is presumably already checking (it is called from
`tests/game/properties.test.ts:18`). **Priority: P1.**

### 7.4 Spawn-rectangle computation as prefix sums / masks

**What it is.** Answering "is rectangle `[corner..anchor]` enemy-free?" in O(1).

**Two implementations, pick one [I]:**
- **Bitboard:** `RECT[player][anchorSq] & enemyOcc`, one AND + one test. Table is
  `2 × 100 × 16 bytes = 3.2 KB`. Best.
- **2-D prefix sums:** `P[y][x] = Σ enemy units in [0..y][0..x]`; then White's
  rectangle to anchor `(ax, ay)` is enemy-free iff `P[ay][ax] == 0`, and Black's iff
  `S[ay][ax] == 0` for the complementary suffix sum. Rebuilt in 100 adds whenever
  occupancy changes. Equally good and easier to debug.

Either replaces the current `O(anchors × area)` scan with `Set<string>` keys
(**[V]** `src/game/spawning.ts:98-118`, **[M]** 6.94 µs). Given that this function is
called 6× per evaluation **[M/V]**, this is the highest-ratio single optimisation
in the codebase. **Priority: P0.**

### 7.5 "Minimum actions to kill target X" tables

Described in §3.6. Concretely, per macro node compute for every enemy unit `v`:
`minActions[v]`, `cheapestAttackerSet[v]`, and the symmetric `minActionsAgainstMe[u]`.
The DP is `power[hits][actionsUsed]` exactly as in
**[V]** `src/game/homeCheckmate.ts:31-48`, extended from the corner's 2 lanes to the
general `≤ 4` adjacency lanes and using BFS distances instead of Manhattan.
Cost: O(units × 4 lanes × 5 actions) ≈ 400 ops per side. **Priority: P0.**

### 7.6 Other cheap tables worth baking

- **Elemental power matrix** `power[18][18]` — already built once per search in the
  WASM host (**[V]** `src/ai/wasm/kernel.ts:47-53`). Make it a module constant.
- **`killsInOne[attackerDef][defenderDef]`** — a 18×18 bit matrix of
  `power ≥ defense`. One lookup replaces `canBeEliminated`
  (**[V]** `src/game/combat.ts:219-226`).
- **`upkeepOf[def]`**, **`mineOf[def]`**, **`speedOf[def]`**, **`promoCost[def]`**,
  **`nextTier[def]`** — flat `Int8Array(18)`s. **[V]** The WASM kernel already packs
  these into a 6-wide catalogue row (`src/ai/wasm/kernel.ts:42-46`,
  `assembly/tactics.ts:9`).
- **`cornerNeighbours`** — 2 squares per corner (**[V]** `src/game/homeCheckmate.ts:29-30`).

---

## 8. Testing and verification

The fast engine will be a second, independent implementation of the rules. The
*only* thing that makes that safe is aggressive differential testing against the
canonical engine. This repo is already unusually well set up for it.

### 8.1 Perft-style enumeration counts

**What it is.** `perft(d)` counts leaf nodes at depth `d`; any move-generation bug
changes the count. Chess engines publish perft numbers for standard positions and
diff them across implementations.

**Muju adaptation — define two perfts, because there are two move concepts [I]:**
- **`perftActions(pos, n)`** = number of distinct legal *action sequences* of length
  ≤ `n` from `pos`. **[M]** Seed value for the initial position with n = 4 (a full
  White turn): **14,959**.
- **`perftTurns(pos, d)`** = number of distinct *end-of-turn positions* after `d`
  macro-plies. **[M]** Seed value: `perftTurns(initial, 1) = 797`,
  and the count of distinct mid-turn states is **1,053**.

Freeze these three numbers as a regression fixture right now — they are cheap to
recompute (**[M]** 21–49 ms with the canonical engine) and they will catch any
canonical-ordering or bitboard bug instantly. Add 5–10 authored mid-game positions
(including one with a home occupier, one with a blocked spawn rectangle, one with
Cleave chains available, one at `inactivityPlies = 9`) and record their perft
numbers from the canonical engine.

**Reproduce the seed values with:**
```ts
// enumerate White's turn-1 action sequences and distinct end positions
import { createInitialGameState } from './src/game/board';
import { generateAllActions } from './src/ai/moves';
import { applyAction } from './src/ai/simulate';
// DFS over generateAllActions; count END_ACTION_PHASE leaves for sequences,
// and a Set of sorted unit-placement strings for distinct end positions.
```

**Priority: P0.**

### 8.2 Differential fuzzing: fast engine vs canonical transition

**What it is.** Run both engines on the same random action stream and assert state
equality after every action.

**[V] The pattern already exists** in `tests/game/properties.test.ts:10-23`: 20
seeded random games, 500 plies each, asserting (a) `generateAllActions` is non-empty,
(b) `applyAction` returns a new object and does not mutate the input,
(c) **the React reducer and the search transition agree exactly**
(`expect(gameReducer(gameReducer(before, action), {type:'DESELECT'})).toEqual(state)`),
(d) reserves never increase, (e) buy/promote invariants, plus
`checkInvariants` from `lab/harness/invariants.ts`.

**Extend it to three engines [I]:** canonical JS, fast JS/bitboard, WASM kernel.
For each random action: apply to all three, compare
`(unit placements, defIds, damage, flags, banks, reserves, clock, phase, actions)`
and the Zobrist keys. Run 10^7 actions in CI-nightly, 10^5 in the normal test run.
This is the single most valuable test you can write, and it is where the WASM
kernel's existing discipline should be extended: **[V]** the host already replays
every WASM witness through canonical `isLegalAction`/`applyAction` and throws on
divergence (`src/ai/wasm/kernel.ts:78-82`).

**Priority: P0.**

### 8.3 EPD-style position suites

**What it is.** A file of positions with a best-move annotation and a search-time
budget; the engine's hit rate is a strength proxy (WAC, ECM, Arasan test suites).

**Muju adaptation [I]** — four suites, and the fixtures for the third already exist:
1. **Tactics** — "there is a kill combination worth ≥ X this turn". Generate by
   running the kill-combo solver (§3.6) over self-play positions and keeping ones
   where the best turn kills ≥ 8 crystals of material.
2. **Home-mate** — "there is a forced home win in ≤ 2 turns" / "the invader is
   rescuable". **[V]** `lab/ai/fixtures.ts` already holds 15 authored positions
   ×2 orientations = 30 cases, 9 rescuable + 6 not per orientation
   (**[D]** `docs/AI_IMPLEMENTATION_STATUS.md`), covering "cheap/zero-attack invaders,
   two Fire II versus Metal IV, three-attacker rotation, promotion-dependent saving,
   insufficient/hidden budgets, unnecessary mining, blocked approaches, multi-action
   movement, existing damage, already-attacked targets, placed/promoted restrictions
   and ineligible defenders".
3. **Spawn-strike** — "the winning turn is stepping into the enemy rectangle".
   No fixtures exist; author ~20 from the logged Codex games **[D]**.
4. **Economy** — "the winning turn is relocating a miner to a fresh rich cell".
   Author from positions where `PST_mine` differences exceed 4 crystals.

**Format:** reuse the repo's `GameState` JSON plus `{bestTurnEndHash, tags, maxMs}`.
Store under `lab/ai/suites/`.

**Priority: P1.**

### 8.4 Regression Elo via SPRT

**What it is.** The sequential probability ratio test: play a match, stop as soon as
the log-likelihood ratio crosses a bound for `H0: elo ≤ elo0` vs `H1: elo ≥ elo1`.
Standard settings: `elo0 = 0, elo1 = 5, α = β = 0.05`, which typically resolves in
2k–40k games. Every serious engine gates every commit on this.

**Muju adaptation.**
- **[V]** The match infrastructure exists: `lab/harness/runner.ts` `playGame`,
  `lab/harness/bots/` (Random, Greedy, Rush, Expand, Balanced, Turtle, Tier1Spam,
  MiningDenial, AntiRush), seeded RNG (`lab/harness/rng.ts`), Wilson intervals
  (`lab/harness/stats.ts:1-14`), CSV summaries (`lab/harness/summary.ts`).
- **What is missing:** SPRT itself (~40 lines), an Elo-with-draws model, and
  **paired/mirrored seeds** — critical here because the game may have a first-player
  advantage (**[D]** SPEC §11: "Existing opening/rush concerns remain hypotheses;
  implementation does not establish fairness or rule out a first-player advantage").
  Always play each position from both seats with the same seed
  (`lab/ai/run.ts:55` already loops both seats).
- **Draws are frequent here** (**[M]** random play draws by inactivity in ~10 plies),
  so use the trinomial/pentanomial SPRT, not the win-loss model.
- **Fixed-nodes, not fixed-time, for regression testing.** **[V]** The engine already
  supports this: `SearchBudget(Infinity, maxWork)` with "Search work is deterministic
  when maxWork is used without a deadline" (`src/ai/runtime.ts:1, 13-24`,
  `src/ai/engine-v2.ts:58`). Preserve that property in the new engine.

**Priority: P0** (you cannot tell whether any of this document's advice worked
without it).

### 8.5 Fixed-node determinism tests

**[V]** Already a contract in this codebase (`src/ai/runtime.ts:1`,
`engine-v2.ts:58, 157`, and `tests/ai/` includes `simulate-ids.test.ts` asserting
"mass purchases use unique deterministic IDs identical in reducer and search").
Keep it: the new engine must produce byte-identical move choices for a given
`(position, seed, fixedWork)` on every machine. That means **no `Date.now()` in the
search path**, **no `Math.random()`**, **no iteration over `Map`/`Set` whose
insertion order depends on string hashing of non-deterministic ids**, and **no
floating-point reduction order changes** (keep the evaluation in integers —
centi-crystals — to make this trivially true). **[I]** Note the current MCTS *does*
consult `Date.now()` (`src/ai/search/mcts.ts:46, 49`) and only avoids it in
fixed-work mode via `timeLimitMs: Infinity`; the new engine should route all timing
through `SearchBudget`.

**Priority: P0.**

### 8.6 Invariant checks worth keeping in the fast engine (debug build)

- crystal conservation: `Σ reserves + whiteGained + blackGained == initialTotal`
  (**[V]** SPEC §8; **[M]** 504 for new games);
- `Σ damage < DEF` for every living unit;
- `atkCount[u] ≤ tier(u)` and `atkCount > 0 ⟹ lastAttackKilled` on the previous hit
  (**[V]** `src/game/combat.ts:13-17`);
- a unit is at `pieceAt[sq[u]]` and vice versa;
- Zobrist recomputed-from-scratch equals incrementally-maintained;
- `actionsRemaining ∈ [0, 4]`.

---

## 9. Engineering

### 9.1 TypeScript performance idioms

**[I] Rules for the hot path, in rough order of impact:**
1. **Typed arrays only.** `Uint8Array`/`Int32Array`/`Float64Array`. No object
   literals, no `{x, y}` positions — the current code allocates a `Position` object
   per reachable square (**[V]** `src/game/movement.ts:260`).
2. **Zero allocation in the inner loop.** Preallocate every buffer at engine
   construction; reuse per-depth scratch indexed by ply. **[V]** The WASM kernel is
   already written this way: `const distances = new Int32Array(108 * 100)` with
   "Each DFS level owns its BFS scratch" (`assembly/tactics.ts:20-22`).
3. **No `Map`/`Set` in the hot path.** String keys like `` `${p.x},${p.y}` ``
   (**[V]** `src/game/movement.ts:94`, `src/game/spawning.ts:109`) and
   `JSON.stringify(actions)` as a plan id (**[V]** `src/ai/planner/beam.ts:15`) are
   pure poison — each is an allocation plus a hash. Replace with integer keys in
   open-addressed `Int32Array` tables.
4. **No closures created per node.** The current BFS creates
   `const posKey = (p) => ...` inside `findPath` on every call
   (**[V]** `src/game/movement.ts:94, 156`).
5. **Monomorphic call sites.** Never pass two different object shapes to the same
   function; V8 deoptimises. This is a real risk when adapting between `GameState`
   and the packed form — keep the boundary in one place.
6. **Integers, not floats, for scores.** Avoids NaN/-0 hazards and keeps
   determinism (§8.5). Use centi-crystals (`fire_1 = 300`).
7. **Avoid `array.map/filter/reduce` in the hot path** — they allocate. The
   canonical engine uses them everywhere (**[V]** `src/game/board.ts:135-154`,
   `src/ai/simulate.ts:85-89`), which is correct for the canonical engine and wrong
   for the search engine.
8. **`Math.imul`** for 32-bit multiply in the hash (already used in
   **[V]** `src/ai/runtime.ts:5`).
9. **`>>> 0`** to keep hash lanes unsigned.

**[M] Evidence this matters:** `applyAction` is 0.58 µs with immutable rebuilds;
`evaluatePosition` is 71.9 µs largely because of `Set<string>` spawn scans and
per-unit BFS. A packed engine should hit 30–80 ns per action and 0.5–2 µs per full
evaluation. **[I]**

### 9.2 AssemblyScript / WASM tradeoffs

**What exists [V].** `assembly/tactics.ts` (179 lines), compiled by
`npm run ai:wasm` → `asc --config asconfig.json`, pinned AssemblyScript 0.28.9
(**[V]** `package.json` devDependencies), loaded in the worker by `fetch` +
`WebAssembly.instantiate` with a JS fallback
(**[V]** `src/ai/worker/entry.ts:7-15`). ABI version is asserted at load
(`src/ai/wasm/kernel.ts:31`). No COOP/COEP headers, no threads, no shared memory —
a deliberate choice (**[D]** `docs/AI_IMPLEMENTATION_STATUS.md`: "Single threaded
WASM + a dedicated browser worker. No server or isolation headers").

**Tradeoffs [I].**

| | AssemblyScript/WASM | Optimised TypeScript |
|---|---|---|
| speed | 1.5–4× faster than good TS for integer/array code; native `i64` (real 2-lane bitboards); no GC pauses | good TS with typed arrays gets within 2–3× |
| determinism | total — no JIT tiering, no float reassociation | good if you use integers |
| iteration speed | slow: `asc` build step, no source maps into the DFS, painful debugging | instant |
| ABI cost | marshalling `GameState` → `Int32Array` per call (**[V]** `src/ai/wasm/kernel.ts:54-64`, 1,016 ints) | none |
| risk | a trap kills the worker (**[V]** `kernel.ts:28` throws on `abort`) | contained |

**Recommendation [I]:** **write the whole fast engine in TypeScript first**, with a
packed typed-array state that is *already WASM-shaped* (no objects, no strings, flat
arrays, integer scores). Then, if profiling says so, port only the two hottest
kernels — the within-turn action search and the evaluation — to AssemblyScript,
reusing the existing ABI pattern (one packed input buffer, one packed output buffer,
`shouldStop` imported from the host: **[V]** `assembly/tactics.ts:32-33`,
`src/ai/wasm/kernel.ts:26-29`). Do **not** port the outer alpha-beta or the
candidate generator early: they change constantly during tuning, and the marshalling
boundary would then be crossed per node instead of per search.

Also note the ABI marshalling is currently O(units²) in `attackedThisTurn`
resolution (**[V]** `src/ai/wasm/kernel.ts:63` does `units.findIndex` inside a loop
over `u.attackedThisTurn`) — fine at 100 units called once per search, unacceptable
if called per node.

### 9.3 Worker lifecycle and cancellation

**[V] What exists and should be kept unchanged:**
- versioned identity `{version, gameId, requestId, revision, player}` with
  `sameRequest` filtering of stale responses (`src/ai/worker/protocol.ts:4-15`);
- `cancel()` terminates the worker outright, which interrupts even a wedged native
  call (`src/ai/worker/client.ts:20-23`);
- a watchdog `setTimeout(max(2000, decisionMs + 2000))` that rejects with a
  retryable error rather than resigning (`client.ts:43`);
- request serialisation inside the worker so two searches never interleave on the
  same mutable WASM buffers (`src/ai/worker/entry.ts:16-21`);
- per-`(gameId, player)` engine contexts, cleared when more than 2 accumulate
  (`src/ai/worker/handler.ts:15-20`).

**[I] Additions needed for a deep-searching engine:**
- **Cooperative cancellation inside the search**, not just `terminate()`: the search
  must poll a stop flag so it can return its best-so-far line instead of being killed.
  **[V]** The WASM kernel already does this via an imported `shouldStop()` polled
  every 128 nodes (`assembly/tactics.ts:64`). Mirror it in the TS search
  (poll `budget.exhausted()` every 1,024 nodes — `performance.now()` is a syscall-ish
  cost, do not call it per node).
- **Progressive results**: post an intermediate `{type:'progress', depth, bestTurn}`
  after each completed iteration so the UI can show thinking and so a cancel still
  yields a legal move.
- Keep the **JS fallback path** (`src/ai/worker/entry.ts:11-14`).

### 9.4 Time management under a 2–6 s budget

**[V] Current contract:** `TURN_BUDGET_MS = {easy: 1800, medium: 4000, hard: 8000}`
(`src/ai/engine-v2.ts:39`) as a whole-turn allowance, and per-decision
`mctsTimeLimit = {800, 1500, 3000}` (`engine-v2.ts:35-37`), with
`getMinThinkingTime() = 300` (`engine-v2.ts:55`). The engine is called once per
*action* today, so the whole-turn allowance is divided across many calls.

**[I] Recommended change for the Hard AI: search the whole turn once.** Because the
new engine's unit of decision is a complete macro-turn, it should be invoked once per
turn with the full 2–6 s and then *dispatch the whole action list*. That removes the
current architecture's biggest inefficiency (re-searching from scratch after each of
its own actions — see `engine-v2.ts:153-155`, which keeps `lastIntent` as a prior
precisely to paper over this) and it makes iterative deepening meaningful.

**Allocation policy [I]:**
```
budget = clamp(base, 2000, 6000)
base   = 3000
  × (1.5 if any home threat within 4 actions, either side)
  × (1.3 if a kill combo ≥ 8 crystals exists for either side)
  × (0.5 if only one candidate turn survives generation)
  × (0.4 if the book hit)
stop early when: depth ≥ 8, or the best turn has been stable for 3 iterations
                 and the score moved < 50 centi-crystals
never start iteration d+1 if elapsed > 0.45 × budget   // the classic ID heuristic
```
**[V]** `SearchBudget` already supports both modes and records `stopReason` as
`'complete' | 'deadline' | 'work'` (`src/ai/runtime.ts:7-24`) — keep that telemetry.

**Fixed-work accounting for reproducibility [V]:** `fixedWork` disables the wall
clock entirely (`src/ai/engine-v2.ts:58`). Preserve this: SPRT runs and CI must use
it, or results are machine-dependent.

### 9.5 The current turn-execution loop is an architectural bottleneck

**[V]** `src/hooks/useAI.ts:49-81`. The UI runs a loop that calls
`findBestAction` **once per action**, dispatches only `result.plan.actions[0]`
(line 61), and splits the turn budget as
`allowance = remainingCPU / decisionsRemaining` where
`decisionsRemaining = actionsRemaining` in the action phase and a flat `4` in the
place phase (lines 52-54). The in-code comment is explicit: *"Every action is
searched again, including the last attack in a combination or home rescue."*

Consequences, all **[V]** or **[I, arithmetic]**:
- A Hard turn with 3 purchases + 4 actions performs **7 independent searches**, each
  re-deriving the whole plan; the engine keeps `lastIntent` as a tie-break prior
  specifically to stop the plan from wobbling between them
  (**[V]** `src/ai/engine-v2.ts:153-155`).
- Each search is additionally clamped to `min(decisionMs, mctsTimeLimit)` — for Hard,
  `min(allowance, 3000)` (**[V]** `src/ai/engine-v2.ts:58`). With
  `TURN_BUDGET_MS.hard = 8000` and 4 decisions, the first search gets 2,000 ms, and a
  place-heavy turn can consume most of the budget before any action is searched.
- Iterative deepening across a turn is impossible, because every search starts from
  scratch at a different state.

**[I] Recommendation:** for the Hard AI, add a `searchWholeTurn` path that returns the
complete action list and have `useAI` dispatch it action-by-action for animation
without re-searching (re-validating each action with `isLegalAction` before dispatch,
exactly as it does now at line 63). Keep the per-action loop for Easy/Medium and as
the fallback when the returned plan diverges from the committed state. This is a
prerequisite for §4.1 iterative deepening and for the whole-turn time management of
§9.4 — and it is a **pure win with no strength risk**, since the engine already
computes a whole turn and then throws away all but the first action.

---

## 10. Recommended architecture for the Hard AI (2–6 s per turn, browser worker)

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI  (src/hooks/useAI.ts)                                             │
│   one request per TURN (new path), dispatch the returned action list │
│   revalidating each action; animation delay is outside the budget    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  worker protocol 3 (extends protocol 2:
                             │  + wholeTurn, + progress messages)
┌────────────────────────────▼─────────────────────────────────────────┐
│ Worker                                                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 0. adapt GameState → PackedState  (typed arrays, §2.2)          │  │
│  │    verified by a round-trip property test                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 1. OPENING BOOK probe (canonical 180° key, §6)      [P2, later] │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 2. IMMEDIATE-WIN / MUST-ANSWER LAYER                            │  │
│  │    - elimination-in-one                                         │  │
│  │    - home rescue: existing prover (homeCheckmate.ts / WASM)     │  │
│  │    - home-mate-in-1: existing prover from the attacker's side   │  │
│  │    (this layer already exists: engine-v2.ts:85-121 — keep it)   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 3. ITERATIVE-DEEPENING PVS over MACRO-TURNS            (§4.1)   │  │
│  │    for depth = 1,2,3,... until budget or depth 8:               │  │
│  │      aspiration window (§4.2)                                   │  │
│  │      TT probe on Kpos (§4.3)                                    │  │
│  │      candidates = GENERATE_TURNS(pos, K≈24)          (§3.5)     │  │
│  │      order: TT | book | kill-value-per-action | home | denial   │  │
│  │             | killer | history | quiet-by-PST        (§4.4)     │  │
│  │      LMR on rank > 6 (§4.7); home-threat extension (§4.8)       │  │
│  │      leaf → QUIESCENCE over tactical turns (§4.5)               │  │
│  │      leaf eval → staged/lazy eval (§5.11)                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 4. df-pn HOME-FORCE MODULE (invoked when minTurnsToCorner ≤ 3)  │  │
│  │    proves/refutes forced home wins in ≤ 3 turns      (§4.10)    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Shared tables (§7): bitboards, RECT masks, BFS cache, power matrix, │
│  minActionsToKill, PST_mine (live reserves), threat + purchase-reach │
└──────────────────────────────────────────────────────────────────────┘
```

**Non-negotiables [I]:**
- The canonical `src/game/` engine stays the authority. The fast engine is a
  *replica*, continuously differential-tested (§8.2), and every dispatched action is
  revalidated by `isLegalAction` (as the WASM host already does —
  **[V]** `src/ai/wasm/kernel.ts:78`).
- Scores are integers (centi-crystals). Determinism under fixed work is preserved.
- Nothing is deleted from the existing engine until the new one wins an SPRT.
  Keep `AIEngineV2` as `easy`/`medium` and as the fallback.

**Realistic target [I]:** 5–7 macro-plies (2.5–3.5 rounds) of PVS with quiescence at
K ≈ 24, in 3 s, on a mid-range laptop; 3–5 plies on a phone. That is roughly
**8–20× more effective search than today's depth-4 MCTS with a 72 µs evaluator**
**[M/V]**, plus a materially better evaluation.

---

## 11. Ranked implementation order

Elo figures are **[I] my estimates**, expressed against the *current* Hard preset as
a 0 baseline, assuming each step is SPRT-verified before the next is started. They
are not measurements and should be treated as a prioritisation signal only.

| # | Step | Sections | Effort | Est. Elo | Why it is here |
|---:|---|---|---|---:|---|
| 1 | **SPRT + fixed-node match harness** | §8.4, §8.5 | 1 day | 0 | You cannot measure anything without it. `lab/harness/` gets you 80% there **[V]**. |
| 2 | **Perft fixtures + 3-way differential fuzzer** | §8.1, §8.2 | 1–2 days | 0 | Freeze `perftActions(initial,4)=14,959`, `perftTurns=797`, `distinctMid=1,053` **[M]** before touching anything. |
| 3 | **Whole-turn search path in `useAI`** | §9.5 | 1 day | **+30…60** | Stops re-searching 4–8× per turn and restores the full budget to one search. Pure win, no strength risk. **[V]** `src/hooks/useAI.ts:49-64`. |
| 4 | **Bitboards + packed state + Zobrist + make/unmake** | §2.1–2.4 | 1–2 weeks | **+0** *(enabler)* | No direct Elo; multiplies everything after it by ~50×. The `RECT` mask alone removes 58% of evaluation cost **[M]**. |
| 5 | **Within-turn action search: canonical ordering + turn-TT + kill-combo table** | §3.1, §3.2, §3.6, §7.5 | 1 week | **+80…150** | ≥14× node reduction **[M]** and the tactical layer the engine currently only has in the WASM special case. |
| 6 | **Candidate generator (K≈24) with recall instrumentation** | §3.3, §3.4, §3.5 | 1–2 weeks | **+100…200** | The generator's recall caps everything above it. Measure recall ≥ 90% before proceeding. |
| 7 | **Iterative-deepening PVS + TT + move ordering + quiescence** | §4.1, §4.3, §4.4, §4.5 | 1–2 weeks | **+200…350** | The largest single jump: depth 4 heuristic MCTS → depth 5–7 verified minimax with a horizon-safe leaf. |
| 8 | **Evaluation v1: threat maps incl. purchase reach, home safety, spawn geometry, PST_mine, runway, draw clock** | §5.3–5.8, §5.10 | 1 week | **+120…220** | Fixes the three documented loss causes **[D]** (purchase-reach blindness, anchor fragility, zero-spawn) and adds a draw-clock term the engine currently lacks entirely **[V]**. |
| 9 | **Texel tuning on self-play corpus** | §5.12 | 3–5 days + compute | **+60…120** | Cheap once 7 and 8 exist; the evaluation is already a linear weighted sum **[V]**. |
| 10 | **LMR + aspiration + futility + home-threat extension** | §4.2, §4.7, §4.8, §4.12 | 3 days | **+40…80** | ~1.5× depth. SPRT each independently; LMR is easy to over-tune. |
| 11 | **df-pn forced-home module (≤3 turns)** | §4.10, §3.7 | 1 week | **+40…90** | Narrow but near-decisive where it fires. |
| 12 | **SPSA on search constants** | §5.12 | 2 days + compute | **+20…50** | Diminishing but real. |
| 13 | **Opening book (50k entries, 180°-canonicalised)** | §6 | 3 days + offline compute | **+30…70** | Only worth building once 7–9 are done, or you bake in weak play. |
| 14 | **AssemblyScript port of the two hot kernels** | §9.2 | 1 week | **+30…60** | Equivalent to ~0.5–1 extra ply. Do last: the kernels must stop changing first. |
| — | ~~Endgame tablebases~~ | §4.11 | — | ~0 | **Do not build.** The reserve vector makes the state space infeasible and the position class is rare **[M]**. |
| — | ~~Classical null-move pruning~~ | §4.6 | — | ≤0 | Income + upkeep + draw clock break the no-zugzwang assumption **[V]**. Use the quiet-turn substitute instead. |

**Cumulative [I]:** steps 1–9 are the core and I would expect them to produce an
engine that beats the current Hard preset at roughly 90–95% at equal wall-clock,
i.e. ~+450–700 Elo in the local scale. Steps 10–14 add perhaps another 150–250.
These numbers are guesses; step 1 exists precisely so they can be replaced with
measurements.

**Suggested first two weeks concretely:**
1. Day 1–2: SPRT harness + perft fixtures (steps 1–2).
2. Day 3: whole-turn path (step 3) — SPRT it immediately; this alone should be a
   measurable win and validates the harness.
3. Day 4–10: packed state + bitboards + Zobrist + `RECT` masks (step 4), with the
   differential fuzzer green at 10^6 actions.
4. Day 11–14: within-turn search with canonical ordering and the turn-TT (step 5),
   validated against the frozen perft numbers.

---

## 12. Open questions and risks

1. **Is the candidate generator's recall good enough?** Unmeasured. This is the
   single biggest risk in the plan; §3.5 proposes the instrument.
2. **How often do macro-positions actually transpose?** Reserves are in the key
   (§2.3) and they change most turns, so the macro-TT hit rate may be much lower
   than a chess engine's. If it is under ~5%, shrink the TT and spend the memory on
   the within-turn table instead. Unmeasured.
3. **Is alpha-beta really better than MCTS here?** I argued yes (§4.9) from the
   game's properties, but the honest answer is that a well-tuned
   MCTS-with-evaluation could compete. The SPRT harness settles it; do not spend a
   month before running that comparison.
4. **Draw frequency at high strength.** **[M]** Random play draws by inactivity in
   ~10 plies. If strong play also trends to draws (two engines that both refuse to
   trade), the draw-clock term (§5.10) and the pentanomial SPRT model become much
   more important, and the *game* may need a balance look — which is a design
   question, not an engine question.
5. **First-player advantage.** **[D]** SPEC §11 explicitly leaves this open. All
   matches must be seat-mirrored with paired seeds (§8.4) or every measurement is
   confounded.
6. **Mobile budget.** **[D]** `docs/AI_IMPLEMENTATION_STATUS.md` states real
   iPhone/Safari latency was never calibrated ("WebKit on a Mac is not a real
   iPhone/Safari device measurement"). A 3 s budget on an M2 Max is not a 3 s budget
   on a phone; the iterative-deepening design (§9.4) degrades gracefully, but the
   *depth* claim in §10 is desktop-only until measured.
7. **`lab/solver/model.ts:23` still says `ACTIONS = 6`** **[V]**, predating the
   four-action ruleset (`src/game/rules.ts:9`). Any reuse of `killFrontier`'s default
   budget in the new engine would silently model the wrong game. Pass the budget
   explicitly, or fix the constant.
8. **The checkmate prover inside the transition.** **[V]** `applyAction` calls
   `resolveHomeCheckmate` after every action (`src/ai/simulate.ts:28-33`), capped at
   20,000 nodes (`src/game/homeCheckmate.ts:22`). Any search that parks a unit on a
   corner pays that cost repeatedly. The fast engine must gate it explicitly, and the
   gating must be shown to preserve the canonical result at the root.
9. **Determinism across the JS/WASM boundary after tuning.** Integer scores make this
   easy, but any float in the evaluation (the current weights are floats —
   **[V]** `src/ai/types.ts:73-88`) reintroduces platform-dependent rounding. Convert
   to fixed-point before tuning, not after.

---

## Appendix A — Files read

Canonical rules: `muju/SPEC.md` (all sections);
`src/game/types.ts`, `units.ts`, `turn.ts`, `spawning.ts`, `board.ts`, `movement.ts`,
`combat.ts`, `mining.ts`, `upkeep.ts`, `promotion.ts`, `building.ts`, `rules.ts`,
`legality.ts`, `inactivity.ts`, `resourceMap.ts`, `victory.ts`, `homeCheckmate.ts`.

AI: `src/ai/types.ts`, `engine.ts`, `engine-v2.ts`, `moves.ts`, `simulate.ts`,
`runtime.ts`, `evaluation.ts`, `search/mcts.ts`, `search/uct.ts`, `search/types.ts`,
`planner/beam.ts`, `planner/types.ts`, `planner/scoring.ts`, `planner/placement.ts`,
`planner/strategies.ts`, `planner/templates.ts`, `eval/sharpener.ts`,
`tactics/home.ts`, `wasm/kernel.ts`, `worker/protocol.ts`, `worker/client.ts`,
`worker/handler.ts`, `worker/entry.ts`; `assembly/tactics.ts`.

UI integration: `src/hooks/useAI.ts`.

Lab/tests: `lab/ai/run.ts`, `lab/solver/model.ts` (partial), `lab/harness/stats.ts`,
`lab/harness/bench.ts`, `lab/harness/cli.ts` (partial),
`tests/game/properties.test.ts`, `tests/ai/static-value.test.ts`,
`tests/ai/deadline.test.ts`; directory listings of `tests/game/`, `tests/ai/`.

Docs: `docs/AI_IMPLEMENTATION_STATUS.md`, `docs/hard-ai/understand/napkin-snapshot.md`
(Muju entries), `package.json`, git log 2026-09-09 → 2026-09-14.

## Appendix B — Measurements reproduced

All **[M]** numbers came from four throwaway scripts run with
`node --import tsx` from `muju/`, importing the canonical engine by absolute path.
Environment: Node v24.11.1, Apple M2 Max, macOS 15.1.1. None of them wrote to the
repository.

1. **Map census** — direct reduction over the literal in `src/game/resourceMap.ts`:
   total 504; `{0:18, 4:54, 8:20, 16:8}`; `m[i]===m[99-i]` for all i; not symmetric
   under transpose or anti-transpose; 252 per half.
2. **Branching** — DFS over `generateAllActions` / `applyAction` counting
   `END_ACTION_PHASE` leaves and distinct end positions, from
   `createInitialGameState()` and from White turn-starts of a `seededRandom(7)`
   random game.
3. **Legal-action counts** — 12 seeded random games × ≤400 plies, 691 samples.
4. **Throughput** — `performance.now()` loops with an accumulator sink (an earlier
   run without the sink reported 20M+ ops/s because V8 eliminated the calls; the
   numbers quoted in §1.4 are from the sinked version on a *live, non-terminal*
   16-unit position).
5. **Purchase multiset counts** — exhaustive enumeration of non-negative
   `(a,b,c,d,e,f)` with `3a+3b+4c+4d+5e+5f ≤ C` over the six tier-1 prices from
   `src/game/units.ts`.
6. **Discounted cell values** (§5.4 table) — `Σ_{t=1..12} 0.9^t · min(mine, remaining)`
   evaluated per unit type and per starting reserve.

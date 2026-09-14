# Hard AI design — SEARCH-FIRST

Design document, 2026-09-14, worktree `/Users/ashkie/src/deevgames-muju-hardai` (branch `claude/muju-hard-ai`,
HEAD `44c41c4` = v2.8 snapshot). All paths are relative to `muju/` unless absolute.

**Grounding.** Every quantitative claim below carries a `path:line` reference into this tree, or a
reference into the six ground-truth documents: `docs/hard-ai/STRATEGIC_UNDERSTANDING.md` (SU),
`docs/hard-ai/ENGINE_GAPS.md` (EG), `docs/hard-ai/understand/engine-techniques.md` (ET),
`docs/hard-ai/understand/current-ai.md` (CA), `docs/hard-ai/understand/rules-engine.md` (RE),
`docs/hard-ai/understand/lab-harness.md` (LH).

**Audience.** A fleet of parallel coding agents. Every module below has a fixed public interface, a
fixed file path, a fixed dependency set, and a milestone whose acceptance gate is one command.
Interfaces are normative: if an implementation needs to change one, that is a design change and must be
recorded as a dated addendum at the end of this file, not done silently.

---

## 1. Thesis

**Strength in Muju comes from verified lookahead over whole turns, not from knowing more about Muju.**

The game is deterministic, perfect-information (CA §1.2 — the belief layer was deleted in v2.1), sharply
tactical (one kill swings 3–17 crystals; a tier-3 Cleave chain takes three units in one turn,
`src/game/combat.ts:13-17`), and its win conditions are all short-horizon and provable (home occupation
at `src/game/turn.ts:23-27`, home checkmate with an existing exact prover at
`src/game/homeCheckmate.ts:57-180`, elimination, and a 10-ply draw clock at `src/game/inactivity.ts:3-4`).
Three of ET §4.9's four criteria point at alpha-beta rather than MCTS, and the fourth — huge branching —
is not a property of the game but of the *encoding*: a macro-turn has > 4,000,000 action sequences by
turn 3 (ET §1.4 **[M]**) but White's turn 1 collapses from **14,959 sequences to 1,053 mid-turn states to
797 end positions** (ET §1.4 **[M]**), an 18.8× redundancy on the quietest turn in the game. Canonical
ordering plus a within-turn transposition table converts "unsearchable" into "searchable".

So the bet is:

1. **A replica engine that is ~50× faster than the canonical one** (packed struct-of-arrays state,
   two-lane bitboards over 100 squares, `RECT[player][anchor]` spawn masks, Zobrist, make/unmake).
   The canonical engine at `src/ai/simulate.ts:25` buys ~42,000 static evaluations in 3 s (ET §1.4
   **[M]**: `evaluatePosition` 71.9 µs, 58 % of it six `getAllSpawnPositions` calls). The replica must buy
   ~1–2 million. This is 0 Elo on its own and a multiplier on everything after it (EG G13).
2. **A candidate-turn generator with measured recall**, because the outer search can never choose a turn
   the generator did not emit. Recall is instrumented from day one and gated at ≥ 90 % (ET §3.5).
3. **Iterative-deepening PVS over macro-turns** with a macro TT on `Kpos`, real move ordering, and
   quiescence over *tactical turns* — the layer the shipped engine advertises and does not have
   (CA §0 **[MEASURED]**: MCTS completes **0 iterations in 138 of 140 decisions**; the production engine
   is tactical overrides → ≤ 20 bounded candidates → a one-ply static rank).
4. **A df-pn home-force module**, because the home objective converts stalled positions (LH §4.8
   **[sim]**: 399/960 games, median length 52 → 27, caps 438 → 280) and the engine currently searches
   exactly one reply turn (`src/ai/engine-v2.ts:108-151`).
5. **A deliberately modest evaluation.** Material with rent discounting, live-reserve mining PSTs, spawn
   geometry with the zero-spawn cliff, the strike/purchase-reach maps, runway, and the draw clock —
   thirteen integer terms, centi-crystals, tuned later by Texel. Anything the search can see within
   5–7 macro-plies does not need an evaluation term.

**What this design refuses to do.** No classical null-move (income, upkeep and the draw clock break the
no-zugzwang assumption — ET §4.6; `src/game/mining.ts:18-34`, `src/game/upkeep.ts:14-16`,
`src/game/turn.ts:96-99`). No endgame tablebases (the 100-cell reserve vector destroys the state space —
ET §4.11). No further investment in MCTS (ET §4.9, CA §7.11). No opening book until the engine that
would author it has been SPRT-verified (ET §6.1; a book built by a weak engine bakes in weak play).

**Non-negotiables inherited from the brief and the corpus.** The canonical `src/game` engine stays the
authority; the replica is continuously differential-tested against it; every dispatched action is
re-validated through `isLegalAction` (`src/game/legality.ts:16`) exactly as the WASM host already does
(`src/ai/wasm/kernel.ts:78`). Scores are integers. The engine is deterministic under fixed work.
`AIEngineV2` stays as Easy/Medium and as the fallback and is not deleted until the new engine wins an
SPRT (ET §10).

---

## 2. Architecture and the data flow of one AI turn

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ UI  src/hooks/useAI.ts                                                            │
│   difficulty==='hard'  ->  ONE request per TURN (mode:'turn')                     │
│   difficulty!=='hard'  ->  existing per-action loop, AIEngineV2 (unchanged)       │
│   dispatches the returned AIAction[] one at a time, re-validating each with        │
│   isLegalAction (useAI.ts:65) and awaiting the React commit (useAI.ts:69-78)      │
└───────────────────────────────┬──────────────────────────────────────────────────┘
                                │  worker protocol 3  (SearchRequest + mode/work/hard)
                                │  <- {type:'progress'} after each completed ID depth
┌───────────────────────────────▼──────────────────────────────────────────────────┐
│ Worker  src/ai/worker/entry.ts (serialised)  ->  handler.ts  ->  HardEngine        │
│                                                                                   │
│  0  adapt      GameState  --pack-->  PackedState        src/ai/hard/core/state.ts │
│                 round-trip property test; reject -> fall back to AIEngineV2       │
│  1  budget     pick a WORK RUNG from the device rate    src/ai/hard/search/time.ts│
│                 (quantised; the search is then a pure function of (pos, work))    │
│  2  must-answer layer                                   src/ai/hard/search/root.ts│
│       elimination-in-1 | home-mate-in-1 | home rescue (existing WASM/JS prover)   │
│  3  ITERATIVE DEEPENING PVS over macro-turns            src/ai/hard/search/pvs.ts │
│       for d = 1..MAX_DEPTH while work remains:                                    │
│         aspiration window (delta 200cc)                                           │
│         macro TT probe on Kpos                          .../search/tt.ts          │
│         candidates = generateTurns(pos, K)              .../gen/generate.ts       │
│           |- purchase knapsack + dominance              .../gen/purchase.ts       │
│           |- mission promotions                         .../gen/promote.ts        │
│           |- within-turn action DFS (canonical + TT)    .../gen/actionsearch.ts   │
│           |- forced injections from the kill table      .../gen/killcombo.ts      │
│         order: TT | forced | killValuePerAction | home | denial | killer |         │
│                counter | history | quiet-by-PST         .../search/order.ts       │
│         LMR rank>6; home-threat extension               .../search/pvs.ts         │
│         leaf -> QUIESCENCE over tactical turns          .../search/quiesce.ts     │
│         leaf eval -> staged integer eval                .../eval/eval.ts          │
│  4  df-pn HOME FORCE when minTurnsToCorner<=3 either side  .../search/dfpn.ts     │
│  5  verify     replay the chosen turn through canonical applyAction;              │
│                 legal prefix only; Kpos must match      .../verify/replay.ts      │
└──────────────────────────────────────────────────────────────────────────────────┘
   shared tables: bitboards, RECT masks, ADJ, POWER[18][18], KILLS_IN_ONE,
   BFS cache by (occHash, origin), PST_mine from LIVE reserves, strike + purchase-reach maps
```

### 2.1 One AI turn, step by step

1. `GameScreen` fires `executeAITurn` once per turn number (`src/components/GameScreen.tsx:249-250`,
   `:263-265`). `useAI` sees `difficulty === 'hard'` and issues **one** worker request with
   `mode: 'turn'` instead of the per-action loop at `src/hooks/useAI.ts:50-80`. This alone removes the
   7-searches-per-turn waste documented at CA §1.1 / EG G12 (+30…60 Elo, ET step 3).
2. The worker handler (`src/ai/worker/handler.ts:8-25`) routes protocol-3 `mode:'turn'` requests to
   `HardEngine`, keeping the existing per-`(gameId, player)` context map and the ≥ 2 eviction rule.
3. `HardEngine.searchTurn` packs the state. Packing is total for every state the canonical engine can
   produce; it throws `PackError` for anything else (unknown `definitionId`, > 128 units, a resource
   layout outside `0..16`). A `PackError` is caught and the request is answered by `AIEngineV2` with the
   same budget, with `fallback: 'pack-error'` in the result.
4. `chooseWork()` reads the device throughput EWMA and picks a rung off `WORK_LADDER`. From this point
   the search does **not** read a clock except for the abort watchdog (§4.13). Given
   `(PackedState, work, config)` the returned turn is byte-identical on every machine.
5. The must-answer layer runs first, exactly as `engine-v2.ts:85-121` does today, reusing the existing
   `TacticalSolver` (`src/ai/wasm/kernel.ts:15`, ABI 6 at `:31`, JS twin at `src/ai/tactics/home.ts:21`).
   It is an *ordering* input, not a short circuit, with one exception: a proven mate-in-1 or a proven
   elimination-in-1 returns immediately.
6. ID-PVS runs to exhaustion of the work rung. After each completed depth the worker posts a
   `progress` message (`{depth, scoreCc, pv0, work}`) so the UI can show thinking and so a cancel still
   yields a legal turn.
7. The chosen turn is decoded to `AIAction[]`, replayed through canonical `applyAction`
   (`src/ai/simulate.ts:25`) with `isLegalAction` checked before each step, and truncated at the first
   divergence. The replica's predicted `Kpos` is compared with a re-pack of the canonical result; a
   mismatch increments `stats.replicaDivergences`, logs the position, and truncates the turn to its
   verified prefix. Divergences are a hard CI failure (M2 gate) and a soft runtime degradation.
8. `useAI` dispatches the actions one by one with the existing commit-acknowledgement loop
   (`useAI.ts:69-78`). If any action is rejected against the *live* state, the loop falls through to the
   legacy per-action path for the remainder of the turn.

### 2.2 Why the macro node is "after `startTurn`"

`endTurn` (`src/game/turn.ts:92-104`) runs income → clock → draw check → `startTurn`, and `startTurn`
(`turn.ts:19-34`) runs home-occupation win → elimination → upkeep (auto-pay or pause) → heal + flag reset
→ Place. The search's node boundary is **the state `startTurn` returns**. Consequences, all load-bearing:

- At that point every unit of the side to move has `damageTaken = 0` and all turn flags cleared
  (`src/game/board.ts:267-294`), *unless* `upkeepPending` is true (upkeep precedes the heal, RE §2.3–2.4).
  So `Kpos` includes `upkeepPending` and per-unit damage; in the common case the damage contribution is
  zero and costs nothing.
- A pending upkeep keep-set is the **first decision of the turn**, not a separate node. The turn
  generator emits keep-set choices as a prefix (§4.8).
- The draw check has already fired, so a macro node is never a drawn position that still looks playable.

---

## 3. Module layout

All new production code lives under `src/ai/hard/`; all new tooling under `lab/hard-ai/`; all new tests
under `tests/ai/hard/`. Nothing under `src/game/` changes. Nothing under `src/ai/` outside `hard/`
changes except: `src/ai/worker/protocol.ts` (version 3, additive), `src/ai/worker/handler.ts` (route),
`src/hooks/useAI.ts` (whole-turn path), and `lab/harness/types.ts` + `lab/harness/bots/index.ts`
(two additive fields, two `WinType` members, one bot registration).

### 3.1 Dependency graph (edges point from dependent to dependency)

```
engine.ts
  ├── search/root.ts ── search/pvs.ts ── search/quiesce.ts ── eval/eval.ts ── eval/features.ts
  │                   ├── search/tt.ts                                         └── core/*
  │                   ├── search/order.ts
  │                   ├── search/time.ts
  │                   └── search/dfpn.ts
  ├── gen/generate.ts ── gen/actionsearch.ts ── gen/turn.ts
  │                   ├── gen/purchase.ts ──┐
  │                   ├── gen/promote.ts  ──┤
  │                   └── gen/killcombo.ts ─┤
  │                                          └── core/{state,movement,spawn,catalog,bits,tables}
  ├── verify/replay.ts ── core/state.ts
  └── core/state.ts ── core/{bits,tables,catalog,zobrist,movement,spawn,income}.ts
core/tables.ts ── core/bits.ts
core/catalog.ts ── src/game/{units,elements,combat,upkeep}.ts   (read once, at construction)
```

`core/` never imports from `gen/`, `search/`, or `eval/`. `gen/` never imports from `search/`.
`eval/` never imports from `gen/` or `search/`. This is enforced mechanically by the M2 gate
(`lab/hard-ai/deps.ts`).

### 3.2 `src/ai/hard/core/` — the replica engine

#### `core/bits.ts` — 100-square bitboards

Responsibility: allocation-free set operations over 100 squares. Four `Uint32` lanes
(`0..31, 32..63, 64..95, 96..99`); `BigInt` is forbidden in the hot path (ET §2.1: 30–100× slower).

```ts
/** A 100-square set. Always exactly 4 words. Never allocate one in a hot loop; take one from Scratch. */
export type BB = Uint32Array;

export function bbNew(): BB;                                   // Uint32Array(4)
export function bbZero(d: BB): BB;
export function bbCopy(d: BB, a: BB): BB;
export function bbSet(d: BB, sq: number): BB;
export function bbClear(d: BB, sq: number): BB;
export function bbHas(a: BB, sq: number): boolean;
export function bbOr(d: BB, a: BB, b: BB): BB;                 // d = a | b
export function bbAnd(d: BB, a: BB, b: BB): BB;
export function bbAndNot(d: BB, a: BB, b: BB): BB;             // d = a & ~b
export function bbXor(d: BB, a: BB, b: BB): BB;
export function bbIsEmpty(a: BB): boolean;
export function bbIntersects(a: BB, b: BB): boolean;
export function bbCount(a: BB): number;                        // popcount, Hamming weight
export function bbFirst(a: BB): number;                        // lowest set square, or -1
export function bbNext(a: BB, after: number): number;          // next set square > after, or -1
/** Orthogonal dilation with file-wrap masking: d = a | N(a) | S(a) | E(a) | W(a). */
export function bbDilate(d: BB, a: BB): BB;
/** Same, minus the source: the ring of squares orthogonally adjacent to `a`. */
export function bbRing(d: BB, a: BB): BB;

/** Per-ply scratch pool. `Scratch.get(ply, i)` returns a stable, zeroed BB. */
export class Scratch {
  constructor(maxPly: number, perPly: number);
  get(ply: number, index: number): BB;
}
```

Invariant: bits 100..127 of lane 3 are always 0. `bbCount` and `bbFirst` must be correct when they are
not (defensive masking), and a debug assertion checks them.

#### `core/tables.ts` — static geometry

```ts
export const BOARD = 100;
export const WHITE = 0, BLACK = 1;
export type Side = 0 | 1;

export const CORNER: readonly [number, number];                // [0, 99] — board.ts:175-177
export const CORNER_NEIGHBOURS: readonly (readonly number[])[]; // [[1,10],[89,98]] — homeCheckmate.ts:29-30
export const ADJ: readonly BB[];                               // ADJ[sq] = orthogonal neighbours, 100 entries
export const ADJ_LIST: Int8Array;                              // 100*4, -1 padded, order N,S,W,E (movement.ts:251)
export const ADJ_COUNT: Uint8Array;                            // 2 on a corner, 3 on an edge, 4 inside
/** RECT[side][anchorSq] = inclusive rectangle between CORNER[side] and anchorSq (spawning.ts:8-29). */
export const RECT: readonly (readonly BB[])[];                 // [2][100]
export const MANHATTAN: Uint8Array;                            // 100*100
export const SQ_X: Uint8Array, SQ_Y: Uint8Array;               // sq % 10, (sq / 10) | 0
export function sq(x: number, y: number): number;              // y*10 + x   (movement.ts:232)
```

All tables are frozen module constants built once at import. `RECT` is 2 × 100 × 16 bytes = 3.2 KB and is
the single highest-leverage table in the design (ET §2.1, §7.4): it turns the 6.94 µs
`getAllSpawnPositions` (ET §1.4 **[M]**, `src/game/spawning.ts:98-118`) into ~20 ns.

#### `core/catalog.ts` — baked unit tables

```ts
export const NDEF = 18;
export interface Catalog {
  atk: Int8Array;        // NDEF
  def: Int8Array;
  spd: Int8Array;
  mine: Int8Array;
  tier: Int8Array;       // 1..3
  cost: Int8Array;       // 3..17 crystals
  upkeep: Int8Array;     // UPKEEP_BY_TIER — src/game/upkeep.ts:5
  element: Int8Array;    // 0..5
  nextDef: Int8Array;    // -1 at tier 3 — src/game/units.ts:262-273
  promoCost: Int8Array;  // 4 (T1->T2) or 8 (T2->T3), 0 at tier 3 — promotion.ts:9-23
  /** POWER[a*NDEF+d] = calculateAttackPower(a, d) for the SEARCHING side (combat.ts:80-91). */
  power: Int8Array;      // NDEF*NDEF
  /** killsInOne[a*NDEF+d] = power[a][d] >= def[d]. Replaces canBeEliminated (combat.ts:219-226). */
  killsInOne: Uint8Array;
  /** Identity of the knobs this table was built under; part of every cached-table key (RE §7.5). */
  signature: number;
}
/** Rebuilt whenever the lab knobs change (elements.ts:45, combat.ts:62, upkeep.ts:8). */
export function buildCatalog(): Catalog;
export function catalogSignature(): number;
export function activeCatalog(): Catalog;  // memoised on catalogSignature()
```

`power` must be built through canonical `calculateAttackPower` so the element graph and the per-player
combat handicap are respected, exactly as `src/ai/wasm/kernel.ts:47-53` already does per solver call.
The per-player handicap means `power` is side-dependent; `Catalog` therefore carries two power planes
(`powerW`, `powerB`) when `combatHandicap` is non-zero, and one shared plane otherwise. The signature
distinguishes the two cases.

#### `core/zobrist.ts` — two-tier hashing

```ts
export interface Key { lo: number; hi: number }               // two 32-bit lanes, never BigInt
export const ZOBRIST_SEED = 0x4d554a55;                        // "MUJU"; seededRandom(runtime.ts:3)

export interface ZobristTables {
  piece: Uint32Array;    // 2 * NDEF * 100 * 2   (owner, def, square)
  reserve: Uint32Array;  // 100 * 17 * 2
  bankLo: Uint32Array;   // 2 * 64 * 2   (bank & 63)
  bankHi: Uint32Array;   // 2 * 16 * 2   (bank >>> 6, saturated at 15)
  side: Uint32Array;     // 2
  phase: Uint32Array;    // 2            (xored when phase === 'place')
  actions: Uint32Array;  // 5 * 2
  clock: Uint32Array;    // 11 * 2       (inactivityPlies 0..10)
  upkeep: Uint32Array;   // 2            (upkeepPending)
  damage: Uint32Array;   // 128 * 5 * 2  (slot, damageTaken 0..4)
  atkCount: Uint32Array; // 128 * 4 * 2
  unitFlags: Uint32Array;// 128 * 8 * 2  (lastAttackKilled | placedThisTurn | promotedThisPlacement)
}
export function buildZobrist(seed?: number): ZobristTables;
```

**Kpos** (macro key, the TT and the book key) = piece ⊕ reserve ⊕ bank(both) ⊕ side ⊕ clock ⊕ upkeep ⊕
damage. **Kturn** (within-turn key) = Kpos ⊕ phase ⊕ actions ⊕ atkCount ⊕ unitFlags.

Both are maintained incrementally by make/unmake. `attackedThisTurn` is deliberately **not** hashed:
RE §1.7(a) proves it redundant with `atkCount` in every reachable state (a unit's chain continues only if
every prior attack was lethal, so every id in the array names a removed unit, and `getValidAttacks`'
filter is a no-op — `src/game/combat.ts:13-17,31-36`). The differential fuzzer (M2) is what makes this
safe to rely on.

Reserves must be in `Kpos` (ET §2.3): reserves only decrease (`src/game/mining.ts:25-28`), and two
positions with identical pieces but different remaining ore are different games. The incremental cost is
≤ `unitCount` XOR pairs per turn boundary and zero during the action phase, because `endOfTurnIncome`
touches at most one cell per unit (`mining.ts:19-28`).

`inactivityPlies` must be in `Kpos` (ET §2.3, §4.10): a position at clock 9 is a different game, and
leaving it out produces search instability and the graph-history-interaction bug in df-pn.

#### `core/state.ts` — packed state, make/unmake, terminals

```ts
export const MAX_SLOTS = 128;      // 100 squares is the hard ceiling; 7-bit slot ids, 127 = none
export const NO_SLOT = 127;
export const DEAD = 255;

export interface PackedState {
  // --- units, struct-of-arrays (ET §2.2; mirrors assembly/tactics.ts:5-9 field-for-field)
  sq: Uint8Array;          // MAX_SLOTS, DEAD = off board
  defId: Uint8Array;
  owner: Uint8Array;
  damage: Uint8Array;      // 0..4  (max DEF is 5 — units.ts metal_3; RE §1.7b)
  atkCount: Uint8Array;    // 0..3
  uflags: Uint8Array;      // bit0 lastAttackKilled, bit1 placedThisTurn, bit2 promotedThisPlacement
  slotCount: number;       // high-water mark; dead slots are reused on BUY
  pieceAt: Uint8Array;     // 100, NO_SLOT = empty

  // --- occupancy bitboards, always consistent with sq/pieceAt
  occ: BB; occBy: [BB, BB];
  occElem: BB[];           // 6  (both sides; intersect with occBy for a side)
  occTier: BB[];           // 3

  // --- board
  reserve: Uint8Array;     // 100, 0..16  (resourceMap.ts:5)
  initialReserve: Uint8Array;

  // --- players
  bank: Int32Array;        // 2
  gained: Int32Array;      // 2, for the conservation invariant (lab/harness/invariants.ts:55-59)

  // --- turn
  side: Side;
  phase: 0 | 1;            // 0 = place, 1 = action
  actions: number;         // 0..4
  turnNumber: number;
  upkeepPending: 0 | 1;
  clock: number;           // inactivityPlies 0..10
  progressThisTurn: 0 | 1;

  // --- rules
  actionsPerTurn: 4;
  victoryHome: 0 | 1;      // victoryRule !== 'elimination'  (turn.ts:23, homeCheckmate.ts:173)
  drawRuleOn: 0 | 1;       // inactivityRule !== 'off'       (inactivity.ts:8)

  // --- terminal
  result: Result;          // ONGOING while playing

  // --- hashing
  kpos: Key; kturn: Key;
  catalogSignature: number;
}

export const enum Result {
  ONGOING = 0, WHITE_WIN = 1, BLACK_WIN = 2, DRAW = 3,
}
export const enum Reason {
  NONE = 0, ELIMINATION = 1, UPKEEP_ELIMINATION = 2, HOME_OCCUPATION = 3,
  HOME_CHECKMATE = 4, INACTIVITY = 5, RESIGNATION = 6,
}

/** Packed action: kind | slot<<3 | square<<10. Fits in an Int32Array. */
export type PA = number;
export const enum AKind {
  END_PLACE = 0, MOVE = 1, ATTACK = 2, BUY = 3, PROMOTE = 4, END_ACTION = 5, PAY_UPKEEP = 6,
}
export function paMake(kind: AKind, a: number, b: number): PA;
export function paKind(a: PA): AKind;
export function paSlot(a: PA): number;     // for BUY this is the defId (0..17)
export function paSquare(a: PA): number;

/** Undo record. Fixed 6 words; the turn boundary pushes an extra variable block (see §4.3). */
export interface Undo { w: Int32Array; top: number }

export class Replica {
  constructor(z?: ZobristTables, cat?: Catalog);
  /** Total for any state the canonical engine can produce; throws PackError otherwise. */
  pack(state: GameState, out?: PackedState): PackedState;
  /** Exact inverse up to unit ids and presentation fields; ids are re-derived as in simulate.ts:14-20. */
  unpack(p: PackedState): GameState;
  clone(p: PackedState, out?: PackedState): PackedState;      // ~1 KB of .set(), used at macro nodes

  /** Legality, byte-equivalent to isLegalAction (legality.ts:16-47). */
  isLegal(p: PackedState, a: PA): boolean;
  /** Apply a legal action, pushing undo. Mirrors simulate.ts:44-173 plus turn.ts:19-104. */
  make(p: PackedState, a: PA, u: Undo): void;
  unmake(p: PackedState, u: Undo): void;

  /** Generation. Writes into `out`, returns the count. Never allocates. */
  genActions(p: PackedState, out: Int32Array): number;        // action phase: attacks, moves, END_ACTION
  genPlace(p: PackedState, out: Int32Array): number;          // place phase: buys, promos, END_PLACE
  genKeepSets(p: PackedState, out: Int32Array): number;       // upkeep (see §4.8)

  /** Recompute both keys from scratch; debug assertion target (ET §2.3 "the classic silent killer"). */
  rehash(p: PackedState): { kpos: Key; kturn: Key };
  /** Structural invariants (ET §8.6). Debug builds only; ~2 µs. */
  check(p: PackedState): void;
}
export class PackError extends Error {}
```

`make` is *complete*: it reproduces the canonical transition including `finishPlacement`'s auto-advance
(`simulate.ts:118-120`), the multi-action move cost charged one action at a time (`simulate.ts:83-96`),
the kill's `inactivityPlies = 0; progressThisTurn = true` (`simulate.ts:101`), the mid-turn elimination
check (`simulate.ts:104-113`), and the full `END_ACTION_PHASE` chain income → clock → draw → `startTurn`
→ home-occupation → elimination → upkeep → heal → place-auto-skip (`turn.ts:92-104`, `turn.ts:19-34`).

**The one deliberate divergence: the checkmate prover is gated.** `applyAction` runs
`resolveHomeCheckmate` after *every* transition (`simulate.ts:28-33`), capped at `PROOF_NODES = 20000`
(`homeCheckmate.ts:22`). `make` calls the prover only when `victoryHome` and the mover occupies the
enemy corner and the opponent does not occupy the mover's — which is precisely the short-circuit at
`homeCheckmate.ts:173-176`, so the gate provably preserves the canonical result. Inside quiescence and
inside the df-pn module the prover is replaced by its `damage_bound` step alone
(`homeCheckmate.ts:27-49`), which is admissible: it can only return `mate` when a full proof would
(it never over-states the defence), so a quiescence that trusts it never claims a win the rules deny.
`Replica.make` takes a `proverMode: 'full' | 'bound' | 'off'` field on `PackedState.searchFlags`; `'off'`
is legal only when no corner is occupied, and a debug assertion enforces that.

#### `core/movement.ts` — bitboard BFS

```ts
export interface DistMap { dist: Int8Array /*100, -1 unreachable*/; origin: number; occHash: number }

export class MoveTables {
  constructor(scratch: Scratch);
  /** Ring-expanding BFS over ~occ. ~40 ops per full map (ET §2.1). Cached by (occHash, origin). */
  distancesFrom(p: PackedState, origin: number): DistMap;
  /** ceil(dist/speed) or -1. Identical semantics to getMoveCost (movement.ts:226-234). */
  moveCost(p: PackedState, from: number, to: number, speed: number): number;
  /** All squares reachable with <= actions actions, as a BB. */
  reach(p: PackedState, from: number, speed: number, actions: number, out: BB): BB;
  /** dilate(reach(u, actions-1), 1): every square this unit can attack this turn (ET §7.2). */
  strike(p: PackedState, slot: number, actions: number, out: BB): BB;
  /** Union of strike() over a side's living units. */
  strikeAll(p: PackedState, side: Side, actions: number, out: BB): BB;
  /** Threats from units that do not exist yet: seeded from every legal spawn square with each
   *  affordable tier-1's speed. Radi radius 10, Hi/Gol 7, Sjor 4 (SU §2.5). */
  strikeIfBought(p: PackedState, side: Side, out: BB): BB;
  /** Multi-source BFS: cheapest own unit per square, for the kill table and the economy DP. */
  nearestOwner(p: PackedState, side: Side, outSlot: Uint8Array, outCost: Uint8Array): void;
  invalidate(occHash: number): void;
}
```

The BFS cache is a direct-mapped `Int32Array` of 2^14 entries keyed by `hash(occHash, origin)`; occupancy
changes 2–4 times per turn so most sibling nodes reuse results (ET §7.1). `occHash` is the low 32 bits of
a Zobrist over occupancy only, maintained incrementally.

#### `core/spawn.ts` — spawn geometry

```ts
export interface SpawnInfo {
  legal: BB;           // union over unblocked anchors of (RECT[side][a] & ~occ)   (spawning.ts:98-118)
  area: number;        // popcount(legal)
  anchors: BB;         // squares of the side's units whose rectangle is unblocked (spawning.ts:85-92)
  depth: number;       // max over unblocked anchors of (x+y) for White, (18-x-y) for Black
  /** For each own unit slot: how many of MY anchors an enemy step onto sq would void. */
  fragility(p: PackedState, side: Side, anchorSlot: number): number;
}
export function spawnInfo(p: PackedState, side: Side, out: SpawnInfo): SpawnInfo;
export function isLegalSpawn(p: PackedState, side: Side, square: number): boolean;
/** Minimum set of squares whose occupation by ONE enemy unit voids every anchor.
 *  Exact min set cover over <= 8 anchors; mirrors server/analysis/geometry.ts:25-50. */
export function blockingSet(p: PackedState, side: Side, out: BB): number;
```

`isLegalSpawn` is `(RECT[side][anchor] & occBy[enemy]) === 0` for some own anchor containing the square,
i.e. two ANDs and a test. This is the replacement for the O(units × area) `Set<string>` scan that ET
measured at 58 % of `evaluatePosition` (ET §1.4 **[M]**).

#### `core/income.ts` — mining, upkeep, runway primitives

```ts
/** Sum of min(mine, reserve) over a side's units; exact for THIS turn (mining.ts:12-15). */
export function projectedIncome(p: PackedState, side: Side): number;
/** Rent due at the side's next turn start (upkeep.ts:14-16). */
export function upkeepDue(p: PackedState, side: Side): number;
/** Discounted extraction value of (defId, square) at LIVE reserves. Integer centi-crystals. */
export function pstMine(defId: number, reserve: number): number;
/** Rebuilt whenever a reserve changes; 18*17 entries, so it is a table not a loop. */
export function buildPstMineTable(): Int32Array;   // [defId * 17 + reserve]
/** Six-turn discounted income minus rent, with greedy relocation (ET §5.5). Stage-2 eval only. */
export function economyForecast(p: PackedState, side: Side, mv: MoveTables): number;
```

### 3.3 `src/ai/hard/gen/` — candidate turn generation

#### `gen/turn.ts` — the turn object and its canonical identity

```ts
export const MAX_TURN_ACTIONS = 24;   // 4 keep-set + <= 8 buys/promos + END_PLACE + 4 actions + END_ACTION,
                                      // with headroom; asserted in debug

export const enum TurnFlag {
  KILL          = 1 << 0,   // at least one attack killed
  CLEAVE_CHAIN  = 1 << 1,   // a single unit killed >= 2
  HOME_ENTRY    = 1 << 2,   // ends with a unit on the enemy corner
  HOME_RESCUE   = 1 << 3,   // removes an enemy from our corner
  SPAWN_DENY    = 1 << 4,   // voids >= 1 enemy anchor that was live before
  PURCHASE      = 1 << 5,
  PROMOTION     = 1 << 6,
  RETREAT       = 1 << 7,   // moves a unit out of enemy strike
  QUIET         = 1 << 8,   // no kill, no home event, no denial
  FORCED        = 1 << 9,   // injected: never reduced by LMR, never pruned by futility
  BOOK          = 1 << 10,
}

export interface Turn {
  actions: Int32Array;    // packed PA, length `count`; owned by a pool, valid until the pool is reset
  count: number;
  endKpos: Key;           // Kpos of the position AFTER the turn boundary
  sig: number;            // 32-bit abstract signature for killers/counter-moves (see below)
  flags: number;          // TurnFlag bitmask
  gainCc: number;         // static ordering score in centi-crystals
  place: number;          // index of the place-plan it came from, -1 if none
}

export class TurnPool {
  constructor(capacity: number);
  reset(): void;
  alloc(): Turn;
  readonly used: number;
}

/** Abstract signature: stable across positions, used for killers and the counter-move table.
 *  bits 0-2   first non-END action kind
 *  bits 3-7   element+tier of the primary acting unit (defId)
 *  bits 8-12  element+tier of the primary target/purchase (defId), 31 = none
 *  bits 13-15 region of the primary destination (0 own home quadrant .. 7)
 *  bits 16-19 popcount of TurnFlag bits KILL..PROMOTION
 */
export function turnSignature(p: PackedState, t: Turn): number;
export function decodeTurn(p: PackedState, t: Turn): AIAction[];   // for dispatch and lab replay
```

#### `gen/killcombo.ts` — `minActionsToKill`, the tactical spine

```ts
export interface KillEntry {
  minActions: number;     // 255 = impossible this turn
  minCrystals: number;    // purchase + promotion spend of the cheapest witness
  attackers: BB;          // squares of the attacker set of the cheapest witness
  needsBuy: 0 | 1;
  needsPromo: 0 | 1;
  valueCc: number;        // tuned value of the target (eval/features.ts)
}
export interface KillTable {
  /** Indexed by victim slot. Entries only for living enemies of `side`. */
  entry: KillEntry[];
  /** Union of victim squares with minActions <= actionsRemaining. */
  killableNow: BB;
  bestValuePerAction: number;
}

/** For every unit of `victimSide`, the cheapest way `side` can remove it THIS turn.
 *  Generalises homeCheckmate.ts:27-49 from the corner's 2 lanes to <= 4 lanes and from
 *  Manhattan to true BFS distances (EG G3, ET §7.5). */
export function computeKillTable(
  p: PackedState, side: Side, victimSide: Side, mv: MoveTables,
  opts: { includeBuys: boolean; includePromos: boolean; includeChains: boolean },
  out: KillTable,
): KillTable;

/** Cleave continuation: how many of `side`'s units fall to one enemy unit stepping onto `sq`
 *  (a kill unlocks one more attack up to tier; a non-lethal hit closes the chain, combat.ts:13-17). */
export function chainExposure(p: PackedState, side: Side, mv: MoveTables): number;
```

#### `gen/purchase.ts` — the Place-phase knapsack

```ts
export interface PlacePlan {
  actions: Int32Array;   // BUY/PROMOTE sequence, in an order proven legal by simulation
  count: number;
  spend: number;         // crystals
  scoreCc: number;
  flags: number;         // PURCHASE | PROMOTION
}
export interface PurchaseOpts {
  maxBodies: number;     // min(floor(bank/3), freeSpawnSquares, MAX_BODIES)
  maxPlans: number;
  weights: PurchaseWeights;
}
export interface PurchaseWeights {
  mineCc: number; safeCc: number; blockCc: number; strikeCc: number;
  anchorCc: number; zeroSpawnPenaltyCc: number; liquidityFloorCc: number;
}
export function planPurchases(
  p: PackedState, side: Side, mv: MoveTables, kt: KillTable, opts: PurchaseOpts, out: PlacePlan[],
): number;
/** Dominance filter over the six tier-1 definitions for THIS position (ET §3.3). */
export function candidateDefs(p: PackedState, side: Side, mv: MoveTables): number[];
```

#### `gen/promote.ts` — mission promotions

```ts
export const enum PromoMission { KILL = 0, SURVIVAL = 1, INCOME = 2, REACH = 3, ANCHOR = 4 }
export interface PromoCandidate { slot: number; mission: PromoMission; cost: number; scoreCc: number }
/** <= MAX_PROMO_CANDIDATES (8) missions instead of 2^n subsets (ET §3.4). */
export function planPromotions(
  p: PackedState, side: Side, mv: MoveTables, kt: KillTable, out: PromoCandidate[],
): number;
```

#### `gen/actionsearch.ts` — the within-turn DFS

```ts
export interface ActionSearchConfig {
  widths: Int32Array;      // per step; default [6,4,3,2]
  keep: number;            // best lines retained per place-plan (default 4)
  ttBits: number;          // default 18
  work: WorkMeter;
}
export interface ActionSearchResult { turns: Turn[]; nodes: number; ttHits: number }

export class ActionSearch {
  constructor(rep: Replica, mv: MoveTables, cfg: ActionSearchConfig, pool: TurnPool);
  /** Enumerate action-phase lines from `p` (which must already be in the action phase),
   *  canonically ordered (§4.5), deduped by Kturn, scored by `score`. */
  run(p: PackedState, side: Side, kt: KillTable, prefix: Int32Array, prefixLen: number,
      score: WithinTurnScorer, out: ActionSearchResult): ActionSearchResult;
  resetTT(): void;   // generation-counter clear, not memset
}
export type WithinTurnScorer = (p: PackedState, side: Side) => number;   // centi-crystals
```

#### `gen/generate.ts` — the generator facade

```ts
export interface GenConfig {
  K: number;                  // candidate turns returned (default 24)
  maxPlacePlans: number;      // default 16
  action: ActionSearchConfig;
  injectHomeEntries: boolean;
  injectKillCombos: boolean;
  recallProbe: boolean;       // when true, also emit the expensive reference set (lab only)
}
export interface GenResult { turns: Turn[]; count: number; stats: GenStats }
export interface GenStats { placePlans: number; rawLines: number; dedupedTo: number; nodes: number }

export class TurnGenerator {
  constructor(rep: Replica, mv: MoveTables, cfg: GenConfig, pool: TurnPool);
  generate(p: PackedState, ctx: NodeContext, out: GenResult): GenResult;
  /** Expensive reference generator for the recall instrument: widths [24,16,12,8], keep 64. */
  generateReference(p: PackedState, ctx: NodeContext, out: GenResult): GenResult;
}
export interface NodeContext {
  killMine: KillTable;    // what I can kill this turn
  killTheirs: KillTable;  // what they can kill next turn (their side, my units)
  spawnMine: SpawnInfo; spawnTheirs: SpawnInfo;
  strikeMine: BB; strikeTheirs: BB; strikeBoughtTheirs: BB;
  ttTurnKey: Key | null;  // end-position hash suggested by the macro TT
}
```

### 3.4 `src/ai/hard/search/`

#### `search/tt.ts`

```ts
export const enum Bound { EXACT = 0, LOWER = 1, UPPER = 2 }
export interface TTEntry { keyHi: number; scoreCc: number; depth: number; bound: Bound; bestEndLo: number; age: number }
export class TranspositionTable {
  constructor(bits: number);          // 2^bits entries, 4 buckets per cluster
  probe(k: Key, out: TTEntry): boolean;
  store(k: Key, scoreCc: number, depth: number, bound: Bound, bestEndLo: number, ply: number): void;
  newSearch(): void;                  // bumps age; no memset
  readonly hits: number; readonly probes: number;
}
/** Separate, small, keyed by Kpos: the checkmate prover's verdict (ET §4.3 — never in the main TT). */
export class ProofCache {
  constructor(bits: number);
  get(k: Key): 0 | 1 | 2;             // 0 unknown, 1 mate, 2 rescue
  put(k: Key, v: 1 | 2): void;
}
```

The TT stores `bestEndLo` — the low 32 bits of the best child's `endKpos` — not an action list
(ET §4.3). On a hit, the generator's candidates are reordered so the turn whose `endKpos.lo` matches is
searched first; if none matches (generator drift) the hit still supplies a bound and the search proceeds.

#### `search/order.ts`

```ts
export interface OrderTables {
  killers: Int32Array;        // 2 per ply, turn signatures
  counter: Int32Array;        // 2^14, keyed by hash(prevTurnSig)
  histMove: Int32Array;       // 128 (slot-kind) * 100 (to-square)  — butterfly
  histBuy: Int32Array;        // 18 * 100
}
export function newOrderTables(maxPly: number): OrderTables;
export function scoreTurns(
  p: PackedState, ctx: NodeContext, res: GenResult, tt: TTEntry | null,
  ord: OrderTables, ply: number, prevSig: number,
): void;                      // writes t.gainCc and sorts res.turns in place
export function onCutoff(ord: OrderTables, p: PackedState, t: Turn, ply: number, prevSig: number, depth: number): void;
```

#### `search/quiesce.ts`

```ts
export interface QuiesceConfig { maxPly: number; deltaMarginCc: number }
export function quiesce(
  s: SearchContext, p: PackedState, alpha: number, beta: number, ply: number, qply: number,
): number;
/** A turn is tactical iff it kills, touches a home corner, voids/creates an anchor,
 *  or promotes across a kill/survival threshold (ET §4.5). */
export function isTacticalTurn(p: PackedState, ctx: NodeContext, t: Turn): boolean;
```

#### `search/pvs.ts`

```ts
export interface SearchConfig {
  maxDepth: number;           // 12; ID stops on work, not depth, in practice
  aspirationCc: number;       // 200
  lmrRank1: number; lmrRank2: number;      // 6, 12
  futilityMarginCc: number;   // 200
  quiesce: QuiesceConfig;
  gen: GenConfig;
  ttBits: number;
  dfpn: DfpnConfig;
}
export interface SearchContext {
  rep: Replica; mv: MoveTables; gen: TurnGenerator; tt: TranspositionTable; proof: ProofCache;
  ord: OrderTables; eval: Evaluator; work: WorkMeter; cfg: SearchConfig; root: Side;
  stats: HardSearchStats; stop: () => boolean;
}
export interface SearchResult {
  bestTurn: Turn | null; scoreCc: number; depth: number; pv: Turn[]; stats: HardSearchStats;
}
export function pvs(s: SearchContext, p: PackedState, depth: number, alpha: number, beta: number, ply: number): number;
export function iterativeDeepening(s: SearchContext, p: PackedState, onDepth?: (r: SearchResult) => void): SearchResult;
```

#### `search/dfpn.ts`

```ts
export interface DfpnConfig { maxTurns: number /*3*/; nodeBudget: number; epsilon: number /*0.25*/ }
export const enum Proof { UNKNOWN = 0, PROVEN = 1, DISPROVEN = 2 }
/** "Can `side` force a home win within `cfg.maxTurns` own turns?" AND/OR over macro-turns.
 *  Keys include reserves and the draw clock, so GHI is contained (ET §4.10). */
export function forceHome(s: SearchContext, p: PackedState, side: Side, cfg: DfpnConfig): { proof: Proof; turn: Turn | null; nodes: number };
export function minTurnsToCorner(p: PackedState, side: Side, mv: MoveTables): number;
```

#### `search/time.ts`

```ts
export const WORK_LADDER: readonly number[];   // [8e3, 16e3, 32e3, 64e3, 128e3, 256e3]
export const enum WorkClass { MACRO = 0, QUIESCE = 1, TURN = 2, GEN = 3, KILLTABLE = 4, DFPN = 5, EVAL1 = 6, EVAL2 = 7 }
export const WORK_COST: readonly number[];     // [4, 2, 1, 8, 6, 2, 1, 4]
export class WorkMeter {
  constructor(limit: number);
  spend(cls: WorkClass, n?: number): void;
  readonly used: number; readonly limit: number;
  exhausted(): boolean;                        // pure integer compare; no clock
  readonly byClass: Int32Array;
}
export interface DeviceProfile { unitsPerMs: number; samples: number }
/** Quantised so timing jitter cannot change the rung, and therefore cannot change the move. */
export function chooseWork(profile: DeviceProfile, targetMs: number, cfg: TimeConfig): number;
export function updateProfile(profile: DeviceProfile, work: number, elapsedMs: number): DeviceProfile;
export interface TimeConfig { minMs: number /*2000*/; maxMs: number /*6000*/; baseMs: number /*3000*/ }
export function targetMs(p: PackedState, ctx: NodeContext, cfg: TimeConfig): number;
```

#### `search/root.ts`

```ts
export interface RootOptions {
  work: number; config: SearchConfig; solver?: TacticalSolver; canonical?: GameState;
  onProgress?: (p: { depth: number; scoreCc: number; work: number; firstAction: AIAction | null }) => void;
}
export interface RootResult {
  actions: AIAction[];      // already verified against the canonical engine
  scoreCc: number; depth: number; work: number;
  stats: HardSearchStats; source: 'search' | 'mate' | 'rescue' | 'dfpn' | 'fallback';
}
export function searchRoot(engine: HardEngine, state: GameState, opts: RootOptions): RootResult;
```

### 3.5 `src/ai/hard/eval/`

```ts
// eval/features.ts
export interface EvalWeights {           // all integer centi-crystals
  material: Int32Array;                  // 18 entries; fire_1 pinned at 300 to fix the scale
  bankCc: number; liquidityFloorCc: number; bankConvertCc: number;
  pstMineCc: number; economyCc: number; runwayCc: number; insolvencyCc: number;
  spawnAreaCc: number; zeroSpawnCc: number; anchorDepthCc: number; anchorFragilityCc: number;
  infiltrationCc: number; cornerInfiltrationCc: number;
  hangingCc: number; threatCc: number; chainExposureCc: number;
  homeThreatCc: number; homeCountdownCc: number; rescuerCc: number; plugCc: number;
  drawClockCc: number; tempoCc: number;
}
export const DEFAULT_EVAL_WEIGHTS: EvalWeights;
export function featureVector(p: PackedState, side: Side, ctx: NodeContext, out: Int32Array): void;  // for Texel

// eval/eval.ts
export class Evaluator {
  constructor(mv: MoveTables, w?: EvalWeights);
  /** Stage 0: material + bank + terminal flags. Incremental; ~50ns. */
  stage0(p: PackedState, root: Side): number;
  /** Stage 1: + PST_mine + spawn + strike/hanging + home + draw clock. Bitboard; ~300ns. */
  stage1(p: PackedState, root: Side, ctx: NodeContext): number;
  /** Stage 2: + economy DP + runway + kill-table durability. ~3us. */
  stage2(p: PackedState, root: Side, ctx: NodeContext): number;
  /** Lazy driver: runs the cheapest stage that can decide the (alpha,beta) window. */
  evaluate(p: PackedState, root: Side, ctx: NodeContext, alpha: number, beta: number, work: WorkMeter): number;
  setWeights(w: EvalWeights): void;
}
export const STAGE0_MARGIN_CC = 800;    // 8 crystals (ET §5.11)
export const STAGE1_MARGIN_CC = 300;    // 3 crystals
export const WIN_CC = 1_000_000;
export const MATE_PLY_CC = 1_000;
```

### 3.6 `src/ai/hard/verify/` and `src/ai/hard/engine.ts`

```ts
// verify/replay.ts
export interface ReplayCheck { actions: AIAction[]; verified: boolean; divergedAt: number; reason?: string }
/** Decode, then replay through canonical applyAction with isLegalAction before each step.
 *  Truncates at the first rejection. Compares the re-packed Kpos against the replica's. */
export function verifyTurn(rep: Replica, state: GameState, p: PackedState, t: Turn): ReplayCheck;

// verify/perft.ts  (production-side so tests can import it without the lab tsconfig)
export function perftActions(state: GameState, maxActions: number): number;   // distinct complete action sequences
export function perftTurns(state: GameState, depth: number): number;          // distinct end-of-turn positions
export function perftMidStates(state: GameState): number;                     // distinct mid-turn states
export function perftReplica(p: PackedState, maxActions: number): { sequences: number; midStates: number; endPositions: number };

// engine.ts
export interface HardConfig extends SearchConfig { time: TimeConfig; profile: DeviceProfile }
export const HARD_DEFAULT: HardConfig;
export const HARD_MOBILE: HardConfig;
export class HardEngine {
  constructor(cfg?: Partial<HardConfig>);
  setTacticalSolver(s: TacticalSolver): void;
  setSeed(seed: number): void;              // Zobrist seed only; the search has no RNG
  /** One whole turn. `work` overrides the device-rate rung (CI, SPRT, lab ladders). */
  searchTurn(state: GameState, opts?: { work?: number; targetMs?: number; onProgress?: RootOptions['onProgress'] }): Promise<RootResult>;
  /** Compatibility shim so the hard engine can drive the legacy per-action loop. */
  findBestAction(state: GameState, decisionMs?: number): Promise<AIResult>;
  readonly profile: DeviceProfile;
}
```

### 3.7 `lab/hard-ai/` — tooling

| File | Responsibility | Entry point |
|---|---|---|
| `lab/hard-ai/bot.ts` | `createHardBot(opts): EngineBot` — whole-turn plan cache over the per-action `EngineBot` contract (`lab/harness/types.ts:36-42`) | imported by `lab/harness/bots/index.ts` |
| `lab/hard-ai/perft.ts` | freeze/compare perft fixtures for 1 initial + 10 authored positions | `npm run hard:perft` |
| `lab/hard-ai/fuzz.ts` | three-way differential fuzzer: canonical vs replica vs WASM kernel | `npm run hard:fuzz` |
| `lab/hard-ai/recall.ts` | generator recall: cheap K vs expensive reference, over a position corpus | `npm run hard:recall` |
| `lab/hard-ai/suite.ts` | EPD-style suites (tactics / home-mate / spawn-strike / economy) | `npm run hard:suite` |
| `lab/hard-ai/sprt.ts` | pentanomial SPRT driver over seat-mirrored paired seeds, fixed work | `npm run hard:sprt` |
| `lab/hard-ai/ladder.ts` | engine-vs-engine and engine-vs-scripted round robin + Bradley–Terry Elo | `npm run hard:ladder` |
| `lab/hard-ai/bench.ts` | nodes/s, work-class breakdown, eval throughput, pack round-trip cost | `npm run hard:bench` |
| `lab/hard-ai/tune.ts` | Texel logistic fit over a self-play corpus; SPSA for search constants | `npm run hard:tune` |
| `lab/hard-ai/corpus.ts` | self-play position corpus generator with the quiet-position filter | `npm run hard:corpus` |
| `lab/hard-ai/deps.ts` | static import-graph check for the layering rules of §3.1 | `npm run hard:deps` |
| `lab/hard-ai/positions/*.json` | authored positions; `GameState` JSON plus `{tags, bestTurnEndHash, maxWork}` | — |

---

## 4. Algorithms

### 4.1 Score scale and terminals

One crystal = **100 centi-crystals (cc)**. All scores are `number` restricted to safe integers; no float
enters the search (ET §8.5 — float weights do not port across the JS/WASM boundary and break
determinism).

- `WIN_CC = 1_000_000`. Maximum plausible static score: 100 units × 17 crystals = 1,700 crystals
  (170,000 cc) plus a bank bounded by the 504-crystal map (`src/game/resourceMap.ts:18`, 50,400 cc), so
  `WIN_CC` cannot be reached by material.
- Mate scores are `±(WIN_CC − ply × MATE_PLY_CC)` with `MATE_PLY_CC = 1000`, so a win in 2 beats a win in
  3 (ET §4.1). TT store/probe adjust by ply — the classic bug; the M8 gate includes a unit test for it.
- **Draw is exactly 0**, and it is reachable: `resolveInactivityDraw` fires at the end of the tenth quiet
  ply (`src/game/inactivity.ts:7-11`).
- Terminal detection order in `make` is the canonical order (§2.2): home-checkmate resolves **at the
  action** (`simulate.ts:28-33`), the inactivity draw at `endTurn` (`turn.ts:96`), home occupation at
  `startTurn` (`turn.ts:23-27`). SU §8.1 verified that a *proven* checkmate at `inactivityPlies = 9`
  beats the draw and an *unproven* occupation does not. The replica reproduces exactly this, and
  `tests/ai/hard/terminal-order.test.ts` pins it.

### 4.2 Packing and unpacking

`pack` walks `state.board.units` in array order and assigns slots `0..n-1`; `pieceAt` is filled from
`sq`. Unit ids are **not** stored: `unpack` re-derives them with the canonical scheme
(`simulate.ts:14-20`, `unit-<player>-<turnNumber>-<n>`) for units the search bought, and carries the
original ids for units present at pack time via a side table `originIds: string[]` indexed by slot.
This side table is the only string data in the engine and it is never read inside the search.

`pack` rejects (throws `PackError`) when: any `definitionId` is outside the 18-entry catalogue
(`getUnitDefinition` throws — `units.ts:246`), `board.units.length > MAX_SLOTS`, any reserve is outside
`0..16`, `actionsPerTurn !== 4` (`rules.ts:11-13` accepts only 4), or `phase === 'setup'`.

### 4.3 make / unmake

Hybrid per ET §2.4: **make/unmake inside a turn, snapshot at the turn boundary.**

Undo words per action kind:

| Kind | Mutations | Undo words |
|---|---|---|
| `MOVE` | `sq[u]`, `pieceAt`, occ bitboards, `actions -= cost`, `kturn` | `[KIND, slot, fromSq, cost]` |
| `ATTACK` | `atkCount[u]`, `uflags[u].lastAttackKilled`, then `damage[v] += power` or kill (`sq[v]=DEAD`), `clock`, `progressThisTurn`, `actions -= 1` | `[KIND, u, v, oldDamageV, oldFlagsU, oldCountU, oldClock, oldProgress, oldSqV]` |
| `BUY` | new slot, `bank -= cost`, occ, possibly `finishPlacement` | `[KIND, slot, cost, phaseBefore]` |
| `PROMOTE` | `defId[u]`, `uflags.promotedThisPlacement`, `bank -= 4|8`, possibly `finishPlacement` | `[KIND, slot, oldDef, cost, phaseBefore]` |
| `END_PLACE` | `phase = 1`, `actions = 4` | `[KIND, oldActions]` |
| `PAY_UPKEEP` | releases tier ≥ 2 units not kept, `bank -= paid` | `[KIND, paid, nReleased, ...slots]` |
| `END_ACTION` | income (≤ one cell per unit), banks, clock, side, turnNumber, upkeep, heal + flag reset for the incoming side, place-auto-skip | `[KIND, ...header, nTakes, (sq, amount)*, nFlagRestores, (slot, damage, atkCount, uflags)*]` |

The turn boundary is the only heavy undo. It restores the incoming side's flag/damage vector (≤ 16 bytes
per unit, ≤ 2 KB) — cheaper than a full copy, simpler than per-field undo.

`Undo.w` is one `Int32Array(4096)` per search with a stack pointer; nothing allocates.

**Debug assertion (mandatory in the M2 gate).** Every 4096 nodes, `rehash(p)` is compared with the
incrementally maintained `kpos`/`kturn`, and `check(p)` verifies the ET §8.6 invariants:
crystal conservation `Σ reserve + gained[0] + gained[1] === Σ initialReserve`, `damage[u] < def[defId[u]]`
for every living unit, `atkCount[u] ≤ tier[defId[u]]` and `atkCount > 0 ⟹ lastAttackKilled` on the
previous hit, `pieceAt[sq[u]] === u`, `0 ≤ actions ≤ 4`.

### 4.4 Bitboard BFS

```
distancesFrom(origin):
  frontier = {origin}; visited = frontier; dist[origin] = 0
  for d = 1..9:                    # 9 is the diameter bound for a 10x10 with blockers? No:
      frontier = dilate(frontier) & ~occ & ~visited     # see note
      if empty: break
      visited |= frontier
      for sq in frontier: dist[sq] = d
```

Note on the loop bound: the true bound is 99 (a serpentine corridor), not 9. The loop runs until the
frontier is empty, at most 99 iterations; in practice 6–14. `dilate` masks file wrap at `x = 0` and
`x = 9` (ET §2.1). The neighbour order does not matter for distances; where a *path* is needed
(only in `verify/replay.ts`, never in search) the canonical up/down/left/right order of
`src/game/movement.ts:251` is reproduced.

`moveCost(from, to, speed) = ceil(dist[to] / speed)`, `-1` when `dist[to] <= 0` — identical to
`getMoveCost` (`movement.ts:226-234`), including the "own square returns null" case.

`strike(slot, actions) = dilate(reach(sq, speed, actions - 1))`, matching the semantics of
`getAttackFrontier`'s `moveActions = 3` default (`movement.ts:200-214`) when `actions = 4`.

`strikeIfBought(side)`: for each affordable tier-1 `d` (`getAffordablePurchases`, `building.ts:7`),
for each square in `spawnInfo(side).legal`, union `dilate(reach(sq, spd[d], 3))`. Naively this is
|spawn| × |defs| BFS calls. Optimisation (mandatory): a **multi-source** BFS per distinct speed over the
whole legal-spawn mask, which gives, for every board square, the minimum BFS distance from any legal
spawn square. Then the strike set for speed `s` is `{ q : minDist[q] ≤ 3s }` dilated by one. That is
≤ 3 multi-source BFS per side per node (speeds 1, 2, 3 among affordable tier-1s), ~120 ops.
This is EG G2 / SU §2.5 — "a fresh Radi strikes at BFS radius 10, a Hi at 7, a Sjor at 4" — and it is
the single largest evaluation gap in the shipped engine (ET §5.8).

### 4.5 Turn canonicalisation

Turns are atomic: there is no opponent interleaving inside a turn (`src/game/turn.ts:87-89`), and income
depends only on final squares (`mining.ts:19-23`). Three canonicalisations, in increasing value:

**C0 — promotions by slot index.** Enumerate `promotions(first..n)` with a non-decreasing slot index.
Already proven in this repo twice (`assembly/tactics.ts:143-159`, `src/game/homeCheckmate.ts:127-156`).
Reduces `k!` orderings to 1.

**C1 + C2 — adjacent independent transposition.** Maintain, for each node, the previously applied action
`prev`. Define a total order over actions:

```
rank(ATTACK) = 0, rank(MOVE) = 1
key(a) = (rank(a) << 20) | (slot(a) << 10) | square(a)
```

Prune the child `cur` iff `SAFE_INDEP(prev, cur)` and `key(prev) > key(cur)`.

```
SAFE_INDEP(prev, cur):
  if slot(prev) === slot(cur): return false
  Sprev = {from,to} for MOVE, {attackerSq, targetSq} for ATTACK
  Scur  = likewise
  if Sprev ∩ Scur ≠ ∅: return false
  # a lethal attack frees a square and may shorten the other action's BFS path
  if prev is a lethal ATTACK and cur is a MOVE:
      if distFromCache(cur.from)[prev.targetSq] <= speed(cur) * cost(cur): return false
  if cur is a lethal ATTACK and prev is a MOVE:
      if distFromCache(prev.from)[cur.targetSq] <= speed(prev) * cost(prev): return false
  return true
```

**Soundness.** Any legal action sequence can be transformed into its canonical representative by a
sequence of adjacent transpositions of `SAFE_INDEP` pairs, and each such transposition provably preserves
the end state: neither action's legality depends on the other (disjoint square sets, different units,
neither one's kill lies inside the other's movement ball, and attack legality depends only on attacker
square/flags and target square — `combat.ts:13-41`). Therefore pruning out-of-order adjacent independent
pairs removes only duplicate orders and no reachable end state. The M4 gate proves this empirically:
the canonical enumeration's set of end positions must equal the naive enumeration's set, on the initial
position and on 10 authored positions.

**C3 — the within-turn TT.** Everything C1/C2 misses (in particular non-independent reorderings that
happen to converge) is caught by the `Kturn` table. ET §1.4 measured the available collapse as
14,959 → 1,053 mid-turn states on turn 1, a 14.2× node reduction, on the *cheapest* turn in the game.

Table layout: `Int32Array(2^18 * 3)` = 3 MB: `[keyLo, keyHi, payload]` where
`payload = (generation << 8) | (actionsRemaining << 4) | visitedFlag`. An entry is a hit only when
`keyLo`, `keyHi` and `generation` match **and** the stored `actionsRemaining` is ≥ the current one.
Cleared by bumping `generation`, never by `fill`.

### 4.6 Purchase enumeration: knapsack with dominance pruning

Prices (`src/game/units.ts`): fire 3, lightning 3, water 4, shadow 4, plant 5, metal 5. The number of
affordable multisets is 38 at 10 crystals, 402 at 20, 2,117 at 30, 7,713 at 40 (ET §3.3 **[M]**), and each
must be multiplied by square assignments — hopeless without pruning.

**Stage 1 — dominance (`candidateDefs`).** Each rule is a decision procedure over the current position:

| Keep | Drop | Condition to drop (all must hold) |
|---|---|---|
| `fire_1` (Hi, ATK 2, SPD 2, MINE 1) | `lightning_1` (Radi, ATK 1, SPD 3, MINE 0) | no enemy unit and no anchor-target square `q` exists with `ceil(d(q)/2) > ceil(d(q)/3)` where `d` is the BFS distance from the nearest legal spawn square; **and** no enemy corner is within BFS 12 of a legal spawn square; **and** Radi is not the unique lethal answer to any `killsInOne` entry |
| `plant_1` (Muju, ATK 0, DEF 3, MINE 3) | `metal_1` (Inyan, ATK 1, DEF 3, MINE 2) | every candidate square has `reserve ≥ 3`, **and** Inyan's ATK 1 does not complete any `KillTable` entry (SU §3.3: Muju cannot damage anything but water/shadow, so this matters) |
| `water_1` (Sjor, DEF 2, SPD 1, MINE 2) | `shadow_1` (Göl, DEF 2, SPD 2, MINE 0) | every candidate square has `reserve ≥ 2`, **and** no target needs Göl's extra speed to be reached this turn |

Never drop a definition that is the sole lethal answer in `KillTable`, or the sole unit whose purchase
places a blocker inside an enemy rectangle. When the position is purely economic this cuts six classes to
two or three (ET §3.3), and the multiset count from 2,117 to ≤ 35.

**Stage 2 — multisets.** `maxBodies = min(floor(bank / 3), popcount(spawn.legal), MAX_BODIES)` with
`MAX_BODIES = 4`. Enumerate non-decreasing multisets over the reduced class set with
`Σ cost ≤ bank − LIQUIDITY_FLOOR` **and**, separately, one plan per multiset that ignores the floor
(so the search can still spend everything when that wins material now — SU invariant 14). ≤ 35 multisets.

**Stage 3 — square assignment.** For a multiset of `k ≤ 4` bodies, take the top `S = 8` candidate squares
by the per-square score below and enumerate all injective assignments (`P(8,4) = 1,680`, trivially exact).
Keep the best `m = 3` assignments per multiset.

```
squareScoreCc(def, sq) =
    w.mineCc     * pstMine(def, reserve[sq])                     // lifetime yield, not one-turn take
  + w.safeCc     * (bbHas(strikeTheirs | strikeBoughtTheirs, sq) ? -1 : +1)
  + w.blockCc    * anchorsVoidedByOccupying(sq, enemySide)       // 0..8; corner = all
  + w.strikeCc   * (killTableAfterBuy(def, sq).minActions <= actionsRemaining ? 1 : 0)
  - w.anchorCc   * ownAnchorsShrunkBy(sq)                        // own units never block, but occupy
```

and the whole plan carries a hard penalty `w.zeroSpawnPenaltyCc` when the post-plan
`spawnInfo(side).area === 0` while `bank ≥ 3`. NK:9 lost a game exactly this way (four of ten turns with
no purchases) and the opening census ranks corner-sealing lines last at −8.53 with 0 spawn squares
(LH §4.2). This is SU invariant 1 and it is a *generator* constraint, not only an evaluation term.

**Ordering legality.** A multiset's buys are emitted in an order validated by simulation: apply buys in
descending `squareScore`; if one is rejected because its square is not (yet) legal, retry it after the
remaining buys; drop the plan if a fixed point is reached with buys outstanding. Own units never block
own rectangles (they can only add anchors, `spawning.ts:85-92`), so at most one retry pass is ever needed
and the procedure is deterministic.

**Promotions.** `planPromotions` emits ≤ 8 candidates by mission (ET §3.4), never subsets:

- **KILL** — the promotion whose new `power` crosses a target's `calculateDefense` this turn, computed
  from `Catalog.power` and the live `KillTable`. SU Addendum: a promotion is **never free** — it costs
  4 or 8 crystals plus 1–2/turn forever (`upkeep.ts:5`), and the rent starts next own turn
  (`turn.ts:30-33`). `PromoCandidate.scoreCc` charges both.
- **SURVIVAL** — the promotion whose new DEF leaves an enemy one-shot band, read off `killsInOne`
  (e.g. `water_1` DEF 2 → `water_2` DEF 3 dodges every ATK-2 attacker).
- **INCOME** — a plant on a live cell: `plant_1→2` is +2 mine/turn for 4 crystals and +1 rent;
  `plant_2→3` is +3 for 8 and +1 rent (`units.ts`, `upkeep.ts:5`). Only when
  `reserve[sq] ≥ 2 × newMine`.
- **REACH** — `lightning_2→3` (SPD 5), `metal_2→3` (SPD 2 on a DEF-5 wall).
- **ANCHOR** — the unit that defines the deepest unblocked rectangle, when its `minActionsToKill` by the
  opponent is ≤ 4.

Each candidate is gated by SU invariant 7: reject when
`bank_after − Σ_{t<H}(upkeepDue_t − forecastIncome_t) < LIQUIDITY_FLOOR`, unless the mission is KILL or
SURVIVAL **this turn**.

Place-plans are the cross product of (≤ 12 purchase plans) × (≤ 8 promotion candidates), pruned to
`maxPlacePlans = 16` by `scoreCc`, always including the empty plan (no buys, no promotions).

### 4.7 The within-turn action search

Input: a state already in the action phase with `actions = 4`. Output: the best `keep` complete lines.

```
run(p, prefix):
  best = MinHeap(keep)
  dfs(step = 0)

dfs(step):
  work.spend(TURN)
  if ttProbe(kturn, p.actions): return                       # C3
  # stand-still line: END_ACTION_PHASE is always legal (legality.ts:25)
  consider(END_ACTION)
  if p.actions === 0: return
  n = genActions(p, buf)                                     # attacks then moves
  score each action with actionPriority(); take the top widths[step]
  for a in that slice:
      if !SAFE_INDEP_OK(prev, a): continue                   # C1/C2
      make(a); dfs(step + 1); unmake()
      if work.exhausted(): return
```

`widths = [6, 4, 3, 2]` gives ≤ 144 leaf lines per place-plan before the TT (ET §3.5), a few hundred
states, ~0.2–0.5 ms with the bitboard kernel. `consider(END_ACTION)` evaluates the line: make the
`END_ACTION_PHASE` (which runs income and the boundary), score with `WithinTurnScorer`, unmake, and push
into the heap.

`actionPriority(a)` (integer, descending):

```
+ 100_000 * (kills and the victim is a home invader on MY corner)
+  50_000 * (kills and the victim's minActionsAgainstMe was <= 4)      # remove the threat
+   1_000 * killValueCc(a) / max(1, actionCost(a))                     # MVV-LVA analogue
+     600 * (a completes a Cleave chain: attacker atkCount > 0 and tier allows)
+     400 * (move ends on the enemy corner)
+     300 * (move ends inside an enemy spawn rectangle that is currently live)
+     200 * (move ends OUT of strikeTheirs while it started inside)     # retreat
+ pstMine(def, reserve[to]) - pstMine(def, reserve[from])               # income delta
-      80 * actionCost(a)                                              # tempo
+ histMove[slotKind][to] >> 5
```

`WithinTurnScorer` for the generator is `Evaluator.stage1` at the post-boundary state, from the
*mover's* perspective. It is deliberately *not* the full eval: the generator only needs a good ranking,
and the outer search re-evaluates everything.

**Forced injections** (ET §3.5 step 3), added regardless of within-turn score and tagged `FORCED`:

1. Every proven kill combination from `KillTable` with `minActions ≤ actions`, realised as an action
   line by the cheapest-witness attacker set.
2. Every legal home-corner entry (a move whose destination is the enemy corner) — these are win-or-lose
   in one ply.
3. Every home rescue when `homeInvader` is present, taken from the existing prover
   (`src/ai/tactics/home.ts:21`, WASM at `src/ai/wasm/kernel.ts:34`), whose witnesses are already
   re-validated through `isLegalAction`.
4. The pure-mine turn (`END_ACTION_PHASE` with zero actions spent) — the income baseline and the
   quiet-turn substitute for null-move (§4.11).
5. The best pure-defence turn: retreat the unit with the highest `value × (minActionsAgainstMe ≤ 4)` out
   of `strikeTheirs ∪ strikeBoughtTheirs`.
6. The best spawn-denial turn: the move that voids the most enemy anchors, corner weighted highest
   (an enemy on your corner voids **every** rectangle — `homeCheckmate.ts:52-53`,
   `tests/game/home-victory.test.ts:19`).

### 4.8 Upkeep keep-sets inside a turn

When the macro node has `upkeepPending`, the turn's first action is a `PAY_UPKEEP`. `genKeepSets`
reproduces `upkeepActions` (`src/game/upkeep.ts:34-55`) — exact subset enumeration for ≤ 12 rent-bearing
units, four deterministic greedy orderings above that — but **caps the enumeration at 64 candidate
keep-sets**, ranked by: keep every unit that is (a) a rescuer adjacent to my corner, (b) an unblocked
anchor, (c) inside an enemy `killableNow` set as an attacker. 2^12 = 4,096 keep-sets per node is
search-killing (RE §7.4.9) and the optimal set is "keep everything" whenever affordable.

The upkeep branch is a genuine decision only when `due > bank` or `reviewUpkeep[side]`; otherwise
`startTurn` auto-pays (`turn.ts:32-33`) and the replica does the same.

### 4.9 Iterative-deepening PVS

```
iterativeDeepening(p):
  best = null; score = 0
  for depth = 1 .. cfg.maxDepth:
      if work.used > 0.45 * work.limit: break            # the classic ID heuristic (ET §9.4)
      window = depth <= 2 ? (-INF, +INF) : (score - 200, score + 200)
      loop:
         s = pvs(p, depth, window.lo, window.hi, 0)
         if s <= window.lo: window.lo -= 4 * (window.hi - window.lo); continue
         if s >= window.hi: window.hi += 4 * (window.hi - window.lo); continue
         break
      score = s; best = rootBest; onDepth(...)
      if work.exhausted() or stop(): break
  return best
```

```
pvs(p, depth, alpha, beta, ply):
  work.spend(MACRO)
  if p.result !== ONGOING: return terminalScore(p, ply)
  if depth <= 0: return quiesce(p, alpha, beta, ply, 0)
  tt = ttProbe(kpos)
  if tt and tt.depth >= depth and usable(tt.bound, tt.score, alpha, beta): return adjustMate(tt.score, ply)

  ctx = buildNodeContext(p)                    # kill tables, spawn info, strike maps; work.spend(KILLTABLE)
  # home-threat extension: the "in check" analogue (ET §4.8)
  ext = (minTurnsToCorner(p, side) <= 1 || minTurnsToCorner(p, other) <= 1) ? 1 : 0
  # df-pn gate
  if depth >= 3 and (minTurnsToCorner(p, side) <= 3 or minTurnsToCorner(p, other) <= 3):
      r = forceHome(p, side, cfg.dfpn)
      if r.proof === PROVEN: store and return WIN_CC - ply * MATE_PLY_CC

  gen.generate(p, ctx, res); work.spend(GEN)
  scoreTurns(p, ctx, res, tt, ord, ply, prevSig)

  bestScore = -INF; bestEnd = 0; searched = 0
  for t in res.turns:
      # futility at the frontier: skip quiet turns that cannot reach alpha (ET §4.12)
      if depth === 1 and !(t.flags & (KILL|HOME_ENTRY|HOME_RESCUE|FORCED))
         and stage1(p) + maxPlausibleGain(ctx) + 200 < alpha: continue
      r = depth - 1 + ext
      if searched >= cfg.lmrRank1 and !(t.flags & (KILL|HOME_ENTRY|HOME_RESCUE|SPAWN_DENY|FORCED)):
          r -= (searched >= cfg.lmrRank2 ? 2 : 1)
      makeTurn(p, t)
      s = searched === 0 ? -pvs(p, r, -beta, -alpha, ply+1)
                         : -pvs(p, r, -alpha-1, -alpha, ply+1)
      if searched > 0 and alpha < s < beta or (r < depth - 1 + ext and s > alpha):
          s = -pvs(p, depth - 1 + ext, -beta, -alpha, ply+1)     # re-search at full depth/window
      unmakeTurn(p, t)
      searched++
      if s > bestScore: bestScore = s; bestEnd = t.endKpos.lo
      if s > alpha: alpha = s
      if alpha >= beta: onCutoff(ord, p, t, ply, prevSig, depth); break
      if work.exhausted(): break
  ttStore(kpos, bestScore, depth, boundOf(bestScore, alphaOrig, beta), bestEnd, ply)
  return bestScore
```

`makeTurn` applies the turn's packed actions with `make`, pushing one undo frame per action;
`unmakeTurn` pops them in reverse. No copying at macro nodes below the root; the root clones once so a
cancel can always return a consistent position.

**Why negamax at the turn level is correct.** All four actions belong to one player
(`src/game/turn.ts:87-89`; the existing sharpener makes the same observation at
`src/ai/eval/sharpener.ts:29`). The sign is flipped **only** across turn boundaries, never inside a turn.
`tests/ai/hard/negamax-sign.test.ts` pins this — it is the exact bug `docs/AI_CORRECTNESS-2026-09-07.md`
repaired in the old engine.

### 4.10 Move ordering

Order, highest first (ET §4.4, adapted; Muju-specific entries marked ★):

1. TT turn: `t.endKpos.lo === tt.bestEndLo` → `+2_000_000`.
2. ★ Home rescue (`HOME_RESCUE`) → `+1_500_000`; ★ home entry (`HOME_ENTRY`) → `+1_200_000`.
   These are win/lose in one ply.
3. Proven kill combinations, by **value per action**: `Σ cost(killed) * 100 / actionsSpentKilling`.
   Costs run 3 → 17 (`src/game/units.ts`), so killing a `plant_3` with 2 actions outranks killing a
   `fire_1` with 1.
4. ★ SEE analogue: subtract the value of my own units that the opponent's `KillTable` can remove from
   the post-turn position — `computeKillTable(after, them, me, {includeBuys: true})`. A turn that hangs
   more than it takes is demoted below quiet turns. This is the direct fix for the F2/F3/F7/F10 loss
   class (SU §6.2).
5. ★ Spawn denial (`SPAWN_DENY`) weighted by anchors voided, corner = all → `+300_000`.
6. ★ Cleave chains (`CLEAVE_CHAIN`) → `+250_000`: material plus tempo plus a draw-clock reset.
7. Killers: two per ply, matched on `turnSignature` → `+200_000`.
8. Counter-move: `counter[hash(prevSig)]` → `+150_000`.
9. History: `histMove` and `histBuy` butterfly tables. The buy table is genuinely useful here — within a
   single search it learns which spawn squares are good (ET §4.4).
10. Quiet turns by `Δ(economy) + Δ(spawn area weighted by reserve) − Δ(exposure)`.

### 4.11 Quiescence

```
quiesce(p, alpha, beta, ply, qply):
  work.spend(QUIESCE)
  if p.result !== ONGOING: return terminalScore(p, ply)
  standPat = eval.evaluate(p, root, ctx, alpha, beta, work)
  if qply >= cfg.quiesce.maxPly: return standPat
  if standPat >= beta: return beta
  if standPat > alpha: alpha = standPat
  gen tactical turns only (isTacticalTurn), ordered by kill value per action
  for t in tacticalTurns:
      if standPat + maxGain(t) + cfg.quiesce.deltaMarginCc < alpha: continue     # delta pruning
      makeTurn; s = -quiesce(p, -beta, -alpha, ply+1, qply+1); unmakeTurn
      if s >= beta: return beta
      if s > alpha: alpha = s
  return alpha
```

`isTacticalTurn` (ET §4.5):

1. the turn contains an attack that kills; **or**
2. it moves a unit onto or off either home corner; **or**
3. it voids at least one enemy anchor, or restores one of ours that was voided; **or**
4. it promotes across a `killsInOne` or survival threshold; **or**
5. it buys a unit that kills this turn (summon-and-strike — SU §2.5).

`maxPly = 4`. **Income is real inside quiescence** and is applied, because suppressing it would make the
state inconsistent for the opponent's reply; the hallucination risk ET §4.5 warns about is removed by
*stand-pat*: the side to move is never forced into a forcing turn, so quiescence can never claim more
than the static evaluation unless a genuinely forcing line delivers it. The checkmate prover runs in
`'bound'` mode inside quiescence (§3.2), which is admissible.

The existing `tacticalSharpen` (`src/ai/eval/sharpener.ts:10-40`) is deleted from the hard path: it
recurses on *actions* not turns (so it never sees the reply) and its gate returns true whenever any unit
on either side has a legal attack (`sharpener.ts:42-50`), which is nearly always.

### 4.12 df-pn home force

Invoked from `pvs` when `depth ≥ 3` and `minTurnsToCorner ≤ 3` for either side. AND/OR tree over
macro-turns: my turns are OR nodes, the opponent's are AND nodes. Turn generation inside df-pn is
restricted to **threat-relevant turns** (ET §3.7): for the attacker, turns that reduce
`minTurnsToCorner`; for the defender, turns that increase it, kill the approaching unit, or plug the
corner (a unit on your own corner makes occupation impossible while it lives — movement never ends on an
occupied square, `movement.ts:251-253`; ET §5.3 term D).

- `(pn, dn)` are stored in a dedicated `Int32Array` table of 2^17 entries keyed by `Kpos` — which
  already contains the reserves and the draw clock, so the graph-history-interaction problem is
  contained (ET §4.10).
- `1 + ε` trick with `ε = 0.25` in fixed point (thresholds are integers; `δ2 * 5 / 4`).
- `pn/dn` initialisation: `pn = minTurnsToCorner(attacker)`, `dn = number of defenders within BFS 4 of the
  corner + (corner plugged ? 4 : 0)`.
- Node budget: `cfg.dfpn.nodeBudget = min(4000, work.limit / 16)`, charged to `WorkClass.DFPN`.
- A `PROVEN` result at the root returns a mate score; `DISPROVEN` is recorded in `ProofCache` so the same
  position is not re-attempted; `UNKNOWN` costs nothing further (ET: exhaustion never wins —
  `homeCheckmate.ts:167`, `tests/game/home-checkmate.test.ts:91-94`).

For the *single-turn* question — "can the defender rescue their home?" — df-pn buys nothing: the existing
DFS with its admissible bound is already near-optimal (ET §4.10.1). The hard engine calls the existing
`TacticalSolver` for that, reusing the WASM kernel verbatim.

### 4.13 Time, work, and determinism

The brief requires "deterministic under fixed work" and a 2–6 s browser budget. Reconciled as:

1. **Choose the work rung first, from the clock; then the search never reads a clock.** Given
   `(PackedState, work, config, catalogSignature)` the returned turn is byte-identical on every machine.
2. `WORK_LADDER = [8_000, 16_000, 32_000, 64_000, 128_000, 256_000]` work units.
   `WORK_COST = { MACRO: 4, QUIESCE: 2, TURN: 1, GEN: 8, KILLTABLE: 6, DFPN: 2, EVAL1: 1, EVAL2: 4 }`,
   chosen roughly proportional to measured microseconds so a rung maps near-linearly to time.
   Calibration target from ET §4.0: ~20,000 interior macro-nodes in 3 s at K = 24 ⇒ ≈ 25 units/ms on an
   M2-class laptop ⇒ 64k–128k is the desktop rung.
3. `targetMs` (ET §9.4, integer arithmetic):

```
targetMs = clamp(baseMs * m / 100, minMs, maxMs)          # baseMs 3000, min 2000, max 6000
m = 100
m = m * 150 / 100   if minTurnsToCorner <= 4 for either side        # a home threat is live
m = m * 130 / 100   if either side has a kill combo worth >= 800 cc
m = m *  50 / 100   if the generator returned exactly one candidate
m = m *  40 / 100   on a book hit
```

4. `chooseWork(profile, targetMs)` = the largest rung with `rung ≤ profile.unitsPerMs * targetMs`, floor
   at `WORK_LADDER[0]`. `profile.unitsPerMs` starts at a deliberately pessimistic **8** and is updated by
   an EWMA with α = 1/4 after each search: `unitsPerMs = (3 * old + used / elapsedMs) / 4`. Quantising to
   rungs means ordinary jitter cannot change the chosen rung and therefore cannot change the move.
   A phone at 5 units/ms lands on rung 0–1 and plays a depth-3–4 game: **this is the graceful
   degradation mechanism**, and it needs no separate mobile code path beyond `HARD_MOBILE`'s smaller TT.
5. **Cancellation.** `SearchContext.stop` is polled at every macro node and every 1,024 within-turn
   nodes (mirroring `assembly/tactics.ts:64`, which polls `shouldStop()` every 128 nodes). It returns the
   best turn from the last *completed* iteration. The worker also keeps the existing hard watchdog
   (`src/ai/worker/client.ts:43`, `max(2000, decisionMs + 2000)`), and `HardEngine` keeps an internal
   wall-clock abort at `3 × targetMs` that can only truncate iterative deepening — never alter a
   completed depth's result.
6. **Fixed-work mode** for CI, SPRT and the lab: `searchTurn(state, { work })` bypasses `chooseWork`
   entirely. The lab ladder always passes `work`, so results are machine-independent, preserving the
   property `src/ai/runtime.ts:1` already asserts for the old engine.
7. There is **no RNG in the search**. `setSeed` only reseeds the Zobrist tables, and those must be
   identical across clients, so the default seed is a constant and `setSeed` is used only by the
   collision-hunting fuzzer. This closes EG G19's "the seeded RNG is plumbed and never read" (CA W12).

### 4.14 Evaluation (modest, by design)

Perspective: always returned from `root`'s point of view; never sign-flipped inside a turn.
Symmetric-difference features (`f(me) − f(them)`), integer cc.

**Stage 0 — incremental, ~50 ns.**
- `material`: `Σ w.material[defId]` over living units. Initial values = `cost × 100`, then Texel-fitted
  (M14) with `fire_1` pinned at 300 to fix the scale. Each living tier-2/3 unit is additionally charged
  the present value of its rent at γ = 0.9: `−upkeep[tier] × 100 × 10` capped by the game's remaining
  length estimate. ET §5.1: a T3 held forever costs ~20 crystals of rent, more than its purchase price.
- `bank`: `min(bank, 5 × spawnArea) × w.bankCc` (the spawn-capacity ceiling, SU §1.6.2) plus
  `min(bank, 6) × w.liquidityFloorCc` (the liquidity floor — the price of a spawn-strike reply, two Hi =
  6, SU §1.6.1). The ratio between cash and bodies is **uncalibrated** (SU §8.4) and is a Texel target,
  not an assertion.

**Stage 1 — bitboard, ~300 ns.**
- `pstMine`: `Σ pstMine(defId[u], reserve[sq[u]])`. From live reserves, so the depletion cliff is
  visible: on a 16, Muju 11.59 vs Hi 4.22 (SU Addendum, γ = 0.9, H = 6, rent charged); on a 4 every miner
  is worth ~3.1–3.6 and tier-2/3 miners are ≤ +0.28. This single term replaces `centerControl`
  (`src/ai/evaluation.ts:207-223`), which pulls toward the zero-ore corridors D1–F3/E8–G10.
- `spawnArea` (`popcount(spawn.legal)`), `zeroSpawn` cliff (a large negative when `area === 0` and
  `bank ≥ 3`), `anchorDepth`, `anchorFragility` (`minActionsToKill(anchor)` for the opponent, plus
  "can an enemy step into the rectangle in ≤ 4 actions, buying if needed"), `infiltration`
  (`popcount(occBy[me] & enemyRectUnion)`) weighted by anchors voided, with the enemy corner weighted at
  the full rectangle count.
- `hanging`: `Σ value(u) × [sq[u] ∈ strikeTheirs ∪ strikeBoughtTheirs] × [minActionsAgainstMe(u) ≤ 4]`.
- `threat`: the mirror, from `killMine`.
- `chainExposure` (`gen/killcombo.ts`), for the Cleave line-of-soft-miners pattern (EG G16).
- `homeSafety` (ET §5.3): `−A × [enemy reaches my corner in ≤ 4 actions] − B × minTurnsToCorner
  + C × |rescuers adjacent to my corner with ATK > 0| + D × [my corner is plugged] − E × [enemy occupies
  my corner]`.
- `drawClock`: `−sign(stage0) × w.drawClockCc × plies² / 100`. At `plies = 9` with `w.drawClockCc = 800`
  this is 648 cc against the leader. Monotone, sign-correct, and linear in its weight so Texel can fit it.
  The shipped evaluator has no draw term at all (CA W5) while 20–62 % of scripted games end in inactivity
  draws (LH §5.12).
- `tempo`: unspent actions at a mid-turn leaf, valued at `0.3 × bestKillValuePerAction`.

**Stage 2 — ~3 µs, only when stage 1 is within `STAGE1_MARGIN_CC` of the window.**
- `economyForecast` (ET §5.5): H = 6, γ = 9/10 in integer arithmetic, with greedy relocation of miners
  whose cell empties, charging travel turns, and contested cells discounted when the opponent's
  `strikeIfBought` covers them. This is the term that sees the income cliff (SU §1.4: combined harvest
  38 → 9 between turns 9 and 13) four to six plies before it happens.
- `runway`: `bank + Σ γ^t income_t − Σ γ^t upkeep_t`, with a hard `insolvencyCc` cliff when
  `bank + nextIncome < upkeepDue` (a forced release next turn). The one conclusive real game was decided
  by this term: archived Black paid 54 upkeep on 175 gross and resigned at 4 crystals / 2 income /
  5 upkeep (SU §1.5).

Lazy driver margins: stage 0 → 1 at 800 cc, stage 1 → 2 at 300 cc (ET §5.11).

**Deliberately absent:** raw mobility (ET §5.2 — it costs more than it earns; replaced by the strike
intersections), `centerControl`, `unitHealth` as a linear DEF term (durability is a threshold, read from
`killsInOne` — SU §3.4.1), `techTreeProgress` (EG G5: it rewards climbing and charges nothing for rent).

---

## 5. Milestone plan (DAG)

Every gate is one command with a mechanical pass criterion a verifier agent can check. New npm scripts
are listed in §8. "Est." is my estimate against the current Hard preset at equal wall clock, on ET §11's
scale; the entire point of M1 is to replace those guesses with measurements.

| id | title | dependsOn | deliverables | gate command | pass criterion | Est. |
|---|---|---|---|---|---|---|
| **M1** | Measurement instrument | — | `lab/hard-ai/{perft,fuzz,sprt,ladder,bench,deps}.ts`; `lab/hard-ai/positions/*.json` (1 initial + 10 authored); `MatchOptions.blackCrystalHandicap` + `.actionsPerTurn` (`lab/harness/types.ts:46-70`, `runner.ts:113`); `WinType` + `'home-checkmate'`, `'timeout'` (`types.ts:82-90`); pentanomial SPRT + Bradley–Terry Elo | `npm run hard:perft -- --freeze && npm run hard:perft && npm run hard:ladder -- --smoke` | `perftActions(initial,4) === 14959`, `perftTurns(initial,1) === 797`, `distinctMid === 1053` (ET §8.1 **[M]**); 11 fixtures frozen; `hard:ladder --smoke` plays 8 seat-mirrored scripted games at fixed work with 0 illegal actions and 0 invariant violations | 0 (gates all) |
| **M2** | Packed core: bits, tables, catalog, zobrist, state, make/unmake | M1 | `src/ai/hard/core/{bits,tables,catalog,zobrist,state}.ts`; `tests/ai/hard/{bits,pack-roundtrip,make-unmake,terminal-order}.test.ts` | `npx vitest run tests/ai/hard && npm run hard:fuzz -- --actions 1000000 && npm run hard:deps` | 1,000,000 fuzz actions with **zero** divergences between canonical `applyAction` and the replica on (placements, defIds, damage, flags, banks, reserves, clock, phase, actions) and on both Zobrist keys; pack→unpack→pack is a fixed point on all 11 fixtures; `hard:deps` reports no illegal import edge | 0 (~50× enabler) |
| **M3** | Movement, spawn, income primitives | M2 | `src/ai/hard/core/{movement,spawn,income}.ts`; `tests/ai/hard/{movement,spawn,income}.test.ts` | `npx vitest run tests/ai/hard && npm run hard:bench -- --check` | `moveCost` agrees with `getMoveCost` on 200,000 random (position, from, to, speed) tuples; `spawnInfo().legal` equals `getAllSpawnPositions` as a set on 50,000 random positions; `projectedIncome` agrees with `mining.ts:12-15` exactly; bench reports ≥ 300,000 replica actions/s and ≥ 400,000 stage-1 evals/s | 0 (enabler) |
| **M4** | Within-turn action search: canonical ordering + turn TT | M3 | `src/ai/hard/gen/{turn,actionsearch}.ts`; `tests/ai/hard/canonical.test.ts` | `npm run hard:perft -- --replica && npx vitest run tests/ai/hard/canonical.test.ts` | On all 11 fixtures, the **set** of end positions produced by canonical enumeration equals the set from naive enumeration (identity of the `Kpos` multiset, not just cardinality); on the initial position the canonical DFS visits ≤ 1,300 mid-turn states against 14,959 naive sequences (≥ 11× reduction) | +40…80 |
| **M5** | Kill-combo table with purchases, promotions and chains | M4 | `src/ai/hard/gen/killcombo.ts`; `tests/ai/hard/killcombo.test.ts`; `lab/hard-ai/positions/tactics/*.json` (≥ 40 authored) | `npx vitest run tests/ai/hard/killcombo.test.ts && npm run hard:suite -- --suite tactics` | `minActionsToKill` matches a brute-force enumeration over the replica on 2,000 random positions (exact equality of `minActions`, and `minCrystals` no worse); on the 28 existing home fixtures (`lab/ai/fixtures.ts:13-33`) the table's `minActions ≤ 4` verdict agrees with the prover's `proved`/`disproved` in 28/28 | +80…150 (with M6) |
| **M6** | Candidate generator + recall instrument | M5 | `src/ai/hard/gen/{purchase,promote,generate}.ts`; `lab/hard-ai/recall.ts`; `lab/hard-ai/positions/corpus-500.json` | `npm run hard:recall -- --positions 500 --cheap 24 --reference 2000` | Recall ≥ **90 %**: on ≥ 90 % of 500 corpus positions, the reference generator's best turn under a depth-3 search appears in the cheap generator's K = 24 (ET §3.5). Also: 0 positions where the cheap generator emits an illegal turn, and 0 positions where it emits a turn ending with `spawnArea === 0 ∧ bank ≥ 3` unless every candidate does | +100…200 |
| **M7** | Evaluation v0 (integer, staged, modest) | M3, M5 | `src/ai/hard/eval/{features,eval}.ts`; `tests/ai/hard/eval.test.ts` | `npx vitest run tests/ai/hard/eval.test.ts && npm run hard:bench -- --eval` | Symmetry: `eval(σ(p)) === −eval(p)` under the exact 180° map `σ: (sq,owner,banks) ↦ (99−sq, ¬owner, swap)` on 10,000 random positions with handicap 0 (ET §6.2 proves σ is an exact symmetry of the v2.8 map); all scores integral and within ±900,000; stage-1 throughput ≥ 400,000/s; lazy-eval margins never mis-order a position pair (assert stage2 and stage1 agree on sign of `−` window decisions in 100,000 trials) | +60…120 |
| **M8** | ID-PVS + macro TT + move ordering | M6, M7 | `src/ai/hard/search/{tt,order,pvs,time}.ts`; `tests/ai/hard/{pvs,mate-score,determinism}.test.ts` | `npx vitest run tests/ai/hard && npm run hard:sprt -- --base ai-v2-hard --cand hard-m8 --work 32000 --elo0 0 --elo1 5` | Determinism: 20 repeats of `searchTurn(pos, {work: 32000})` on 50 positions return byte-identical action lists; mate scores prefer shorter wins (unit test); the SPRT accepts H1 (`elo1 = 5`) against `AIv2-hard` at equal fixed work, seat-mirrored paired seeds, at handicap 0 **and** 3 | +200…350 |
| **M9** | Quiescence over tactical turns | M8 | `src/ai/hard/search/quiesce.ts`; `tests/ai/hard/quiesce.test.ts` | `npm run hard:sprt -- --base hard-m8 --cand hard-m9 --work 32000 --elo0 0 --elo1 5 && npm run hard:suite -- --suite tactics` | SPRT accepts H1 vs M8 at equal work; tactics suite hit rate ≥ **90 %** and strictly greater than M8's; no quiescence explosion (`stats.byClass[QUIESCE] ≤ 0.35 × work.limit` on every corpus position) | +80…150 |
| **M10** | Exposure: worker protocol 3, lab bot, UI hard switch, fallback | M8 | `src/ai/hard/engine.ts`, `src/ai/hard/verify/replay.ts`; protocol 3 in `src/ai/worker/{protocol,handler}.ts`; whole-turn path in `src/hooks/useAI.ts`; `lab/hard-ai/bot.ts` + registration in `lab/harness/bots/index.ts:16-39`; `e2e/hard-ai.spec.ts` | `npx vitest run tests/ai && npx playwright test e2e/hard-ai.spec.ts && npm run hard:ladder -- --games 40 --mirror` | A full Hard vs Hard browser game completes with 0 illegal dispatches and 0 replica divergences; a forced `PackError` and a forced engine throw both fall back to `AIEngineV2` and the game continues; protocol-2 requests still work; 40 seat-mirrored lab games at fixed work with `legality: 'strict'` report `illegalActions === 0` | +30…60 (whole-turn path) |
| **M11** | df-pn home-force module | M9 | `src/ai/hard/search/dfpn.ts`; `lab/hard-ai/positions/home/*.json` (≥ 30 authored, ≥ 12 forced wins in ≤ 3 turns) | `npm run hard:suite -- --suite home && npm run hard:sprt -- --base hard-m9 --cand hard-m11 --work 32000` | Home suite: every authored forced win is found within the module's node budget and every authored non-win is **not** claimed (0 false positives — a false mate is a lost game); SPRT accepts H1 or is neutral (`elo0 = −3`), never a regression | +40…90 |
| **M12** | Search refinements: aspiration, LMR, futility, extensions | M9 | edits in `src/ai/hard/search/{pvs,order}.ts` | `npm run hard:sprt -- --base hard-m9 --cand hard-m12 --work 32000 --each-feature` | Each feature SPRT'd independently against the previous build; a feature ships only on an H1 accept; the combined build shows ≥ 1.3× nodes-to-depth improvement in `hard:bench --depth` at equal work | +40…80 |
| **M13** | Time management + device calibration + mobile profile | M10 | `src/ai/hard/search/time.ts` completion; `HARD_MOBILE`; telemetry in `HardSearchStats` | `npm run hard:bench -- --calibrate && npx playwright test e2e/hard-ai.spec.ts --project=mobile` | Calibration converges within 3 searches to ±15 % of the measured rate; every turn on the mobile Playwright project completes in < 6,000 ms wall clock with a legal turn returned; the chosen rung is stable (identical) across 5 repeats of the same position on the same device | +0…30 |
| **M14** | Tuning: Texel on eval, SPSA on search constants | M12, M13 | `lab/hard-ai/{corpus,tune}.ts`; `src/ai/hard/eval/weights.generated.ts` | `npm run hard:corpus -- --games 20000 --work 8000 && npm run hard:tune -- --texel && npm run hard:sprt -- --base hard-m12 --cand hard-m14 --work 32000` | ≥ 200,000 quiet positions collected (quietness decided by the kill table, ≥ 2 plies from a forced tactical resolution); the fitted weight vector is integral; SPRT accepts H1 | +60…120 |
| **M15** | Opening book keyed by handicap | M14 | `lab/hard-ai/book.ts`; `public/muju-book.bin`; probe in `src/ai/hard/search/root.ts` | `npm run hard:sprt -- --base hard-m14 --cand hard-m15 --work 32000 --openings none` | Book entries all verify: every stored recommendation re-derives to a legal turn from its stored `Kpos`; SPRT accepts H1 at handicap 0 and is neutral-or-better at handicap 3; book size ≤ 1.5 MB gzipped | +30…70 |

**Critical path:** M1 → M2 → M3 → M4 → M5 → M6 → M8 → M9 → M10. M7 can be built in parallel with M4–M6
once M3 and M5's interface exist. M11–M15 are strictly additive and individually SPRT-gated.

**Parallelisation.** M2's five files are independently testable (`bits`, `tables`, `catalog`, `zobrist`
each have their own unit test and no cross-dependency except `tables → bits`); M3's three files are
independent of each other; M5, M6 and M7 are three separate agents against the M3 interface; M8's four
files split into `tt` + `order` (one agent) and `pvs` + `time` (another). The tooling in M1 splits into
six independent files. That is 6 + 5 + 3 + 1 + 1 + 3 + 3 + 2 ≈ 24 independently buildable units.

---

## 6. How the engine is exposed

### 6.1 Worker protocol 3 (additive)

```ts
// src/ai/worker/protocol.ts
export const AI_PROTOCOL = 3;
export interface Identity { version: 2 | 3; gameId: string; requestId: number; revision: number; player: PlayerId }
export interface SearchRequest extends Identity {
  type: 'search'; state: GameState; difficulty: AIDifficulty;
  seed: number; decisionMs: number; fixedWork?: number;
  /** v3 only. 'action' reproduces the legacy one-action-per-request contract. */
  mode?: 'action' | 'turn';
  /** v3 only. Overrides the device-rate rung; CI/SPRT/lab always set it. */
  work?: number;
  hard?: Partial<HardConfig>;
}
export interface TurnResult {
  actions: AIAction[]; scoreCc: number; depth: number; work: number;
  stats: HardSearchStats; source: 'search' | 'mate' | 'rescue' | 'dfpn' | 'fallback';
  fallback?: 'pack-error' | 'engine-error' | 'divergence';
}
export type SearchResponse = Identity & (
  | { type: 'result'; result: AIResult; warning?: string }
  | { type: 'turn'; result: TurnResult; warning?: string }
  | { type: 'progress'; depth: number; scoreCc: number; work: number; firstAction: AIAction | null }
  | { type: 'error'; message: string }
);
```

`sameRequest` is unchanged except that `version` equality now admits 2 or 3. `handler.ts:12` currently
rejects `version !== AI_PROTOCOL`; it becomes `version !== 2 && version !== 3`, and a `mode: 'turn'`
request is routed to a per-`(gameId, player)` `HardEngine` instance (same map, same ≥ 2 eviction as
`handler.ts:17`). Everything else in the worker boundary is kept verbatim (CA §7.4): identity checking,
stale-response dropping (`client.ts:34-39`), the watchdog (`client.ts:43`), request serialisation
(`entry.ts:16-21`), and the JS fallback with a user-visible warning (`entry.ts:11-14`).

`progress` messages are not responses: `client.findBestTurn` keeps its promise open and forwards them to
an `onProgress` callback, resolving only on `turn` or `error`.

### 6.2 UI: the "hard" switch

`ModeSelect.tsx:167-178` already offers easy/medium/hard and writes `config.aiDifficulty`
(`ModeSelect.tsx:54-56`, `:71`). `GameScreen.tsx:218-227` passes it into `useAI`. The only change is
inside `useAI.executeAITurn` (`src/hooks/useAI.ts:35-86`):

```
if (difficulty === 'hard' && hardEnabled) {
    const { actions, fallback } = await client.findBestTurn(state, {
        work: undefined, targetMs: TURN_BUDGET_MS.hard, onProgress: setProgress });
    for (const action of actions) {
        if (!isLegalAction(currentState, action)) { legacyPerActionLoop(); break; }
        ... existing dispatch + commit-acknowledgement block (useAI.ts:66-78) ...
    }
} else {
    ... existing per-action loop, unchanged ...
}
```

`TURN_BUDGET_MS.hard` is already 8,000 ms (`src/ai/engine-v2.ts:39`) for the *whole* turn; the hard
engine's `targetMs` policy (§4.13) keeps a single search inside 2–6 s, so the turn gets faster, not
slower, while searching ~20–50× more (ET §4.0). The cosmetic 400 ms `thinkingDelay` per action
(`GameScreen.tsx:220`) stays, applied per dispatched action, outside the search budget.

Easy and Medium are untouched: they keep `AIEngineV2` and the per-action loop. The presets finally mean
something — Easy/Medium are the old engine, Hard is a different engine — which is a strict improvement on
CA §3's finding that all three presets chose the identical move in the opening probe.

### 6.3 Fallback

Three layers, all silent to the player except the existing `warning` channel:

1. **Pack failure.** `PackError` → answer the request with `AIEngineV2` at the same budget,
   `fallback: 'pack-error'`.
2. **Engine failure.** Any throw inside `searchTurn` → same. The worker never dies; `entry.ts`'s
   serialisation and the handler's try/catch (`handler.ts:24`) already contain this.
3. **Divergence.** `verifyTurn` truncates the action list at the first canonical rejection. If the
   verified prefix is empty, emit `phaseEndAction(state)` (`src/game/legality.ts:49-52`) — exactly what
   `engine-v2.ts:184` does today. `stats.replicaDivergences > 0` is a CI failure, never a crash.
4. **WASM absent.** Unchanged: `entry.ts:12-13` builds the handler with `solver = undefined` and the JS
   twin `referenceTactics` (`src/ai/tactics/home.ts:21`) is used for the must-answer layer. The hard
   search itself does not require WASM.

### 6.4 Lab bot adapter

```ts
// lab/hard-ai/bot.ts
export interface HardBotOptions { work: number; name?: string; config?: Partial<HardConfig> }
export function createHardBot(opts: HardBotOptions): EngineBot;
```

The harness contract is one action per call (`lab/harness/types.ts:36-42`). `createHardBot` therefore
keeps a per-turn plan cache keyed `` `${turnNumber}:${currentPlayer}` `` — the same key
`lab/harness/bots/engine.ts:67` already uses:

```
nextAction(state, player):
  key = `${state.turn.turnNumber}:${state.turn.currentPlayer}`
  if key !== cachedKey or cached queue is empty:
      cachedKey = key
      queue = (await engine.searchTurn(state, { work: opts.work })).actions
  while queue.length:
      a = queue.shift()
      if isLegalAction(state, a, player): return a       # lab/harness/legal.ts:44-46
      queue.length = 0                                   # divergence: re-search next call
      return null                                        # the runner substitutes phaseEndAction
  return null
```

Registered in `lab/harness/bots/index.ts:16-39` as `Hard-8k`, `Hard-32k`, `Hard-128k` (one entry per
ladder rung), so `npx tsx lab/harness/cli.ts --white Hard-32k --black AIv2-hard-fast --games 40 --mirror
true --legality strict` works with zero further plumbing, and `summarize()` (`lab/harness/summary.ts:44`)
reports it like any other pairing.

Two harness fixes ship in M1 because the hard engine needs them (LH §5.7, §5.8):
`MatchOptions.blackCrystalHandicap` and `.actionsPerTurn` threaded into
`createInitialGameState` at `lab/harness/runner.ts:113`, and `'home-checkmate'` + `'timeout'` added to
`WinType` (`lab/harness/types.ts:82-90`) — `home-checkmate` is already in committed data
(19/320 games, LH §1.8).

---

## 7. Risks, and how each is detected early

| # | Risk | Why it is real here | Early detector | Trigger point |
|---|---|---|---|---|
| R1 | **Generator recall is too low and caps the whole design.** | ET §12.1 names this the single biggest risk; the macro-turn cannot be enumerated (> 4M sequences by turn 3 **[M]**). A depth-7 search over a 60 %-recall generator is weaker than a depth-4 search over a 95 % one. | `npm run hard:recall`, run at M6 **and** re-run as a CI job after every generator change | Recall < 90 % at M6 blocks M8. Below 80 %, widen `widths` to `[8,6,4,3]` and raise `maxPlacePlans` to 24 before adding depth. |
| R2 | **Replica/canonical divergence produces wrong-but-plausible search results.** | Two independent rule implementations; the `attackedThisTurn`-is-redundant argument (RE §1.7a) and the checkmate gate are both *proofs*, not tests. | `npm run hard:fuzz` at 10^5 actions in the normal test run and 10^7 nightly; per-node Zobrist recompute in debug builds | Any divergence fails M2 and every later gate. A divergence found after M8 invalidates the SPRT that preceded it. |
| R3 | **Macro TT hit rate is near zero because reserves are in the key.** | ET §12.2: any mining changes `Kpos`, and mining happens every turn. A chess-sized TT would be wasted memory. | `hard:bench --tt` reports probe/hit at each depth on the corpus | If the hit rate is < 5 % at M8, shrink the macro TT to 2^16 and spend the memory on the within-turn table (which is measured at ≥ 11× in M4 and does not depend on reserves). |
| R4 | **The checkmate prover inside the transition destroys throughput.** | `applyAction` calls `resolveHomeCheckmate` after every action, ≤ 20,000 nodes each (`simulate.ts:28-33`, `homeCheckmate.ts:22`). A search line that parks a unit on a corner pays it per node. | `hard:bench --prover` counts prover invocations per 1,000 macro nodes, on a corpus that includes occupied-corner positions | > 5 full-prover calls per 1,000 macro nodes means the gate in §3.2 is wrong; fall back to `'bound'` mode everywhere except the root's chosen line and assert the root result matches the canonical one. |
| R5 | **Quiescence explodes.** | Nearly every mid-game position has a legal attack, which is why `isHotPosition` (`sharpener.ts:42-50`) is useless. A loose `isTacticalTurn` reproduces that failure. | `stats.byClass[QUIESCE] / work.limit` on every corpus position; M9's gate caps it at 0.35 | Over cap → tighten `isTacticalTurn` to kills + home events only, and drop `maxPly` to 2. |
| R6 | **Strong play is drawish and the SPRT never resolves.** | 20–24 % of scripted four-action games, 59 % of the alternate-map screen and 55–62 % of depth-economy games are inactivity draws (LH §5.12). Two engines that both refuse to trade may draw ~everything. | `hard:sprt` reports the pentanomial distribution; `hard:ladder` reports draw rate per pairing | Draw rate > 60 % in self-play at M8 → raise `drawClockCc` and re-tune, and report ladder results at handicap 3 as well as 0 (SU §8.2). If it persists, it is a *game-balance* finding to hand back to the designer, not an engine bug. |
| R7 | **Seat bias confounds every measurement.** | `Aware:Rush` mirror: White 15/20, Black 0/20 on both maps (LH §4.4 **[data]**); the handicap census needs 3 crystals to bring round 1 to "Close" (LH §4.3). | `hard:sprt` refuses to run without seat mirroring and paired seeds; every report prints the seat split | A seat split outside 45–55 % on ≥ 200 mirrored games means the instrument, not the engine, is being measured. |
| R8 | **Mobile blows the budget or the memory.** | `docs/AI_IMPLEMENTATION_STATUS.md` **[doc]**: real iPhone/Safari latency was never calibrated. The desktop TT at 2^19 × 16 B is 8 MB inside a worker in a mobile tab. | M13's mobile Playwright project; `HARD_MOBILE` caps the TT at 2^15 and the ladder at rung 1 | Any turn > 6,000 ms wall clock, or an OOM, fails M13. The work ladder degrades automatically; the memory does not, so `HARD_MOBILE` must be selected from `navigator.deviceMemory`/`hardwareConcurrency` at worker construction. |
| R9 | **A false home-mate loses a game outright.** | `analyzeHomeDefense` returning `mate` ends the game (`homeCheckmate.ts:178`). A df-pn bug that claims a forced win is worse than no module at all. | M11's gate requires **0 false positives** on the authored home suite; df-pn results are additionally re-proved by the canonical prover before being trusted at the root | Any false positive blocks M11 permanently until the `(pn, dn)` key is shown to contain reserves and the draw clock. |
| R10 | **Lab knobs silently change the rules under a cached table.** | `elements.ts:45`, `combat.ts:62`, `upkeep.ts:8` are process globals (RE §7.5); `runner.ts:93-105` sets and resets them per game. A cached `POWER` table would be wrong for a whole run. | `Catalog.signature` is compared on every `pack`; a mismatch rebuilds the tables and increments `stats.catalogRebuilds` | `catalogRebuilds > games` in a lab run means the signature is not capturing a knob. |
| R11 | **The engine is nondeterministic in production and the SPRT is meaningless.** | The old engine measured 9,247 / 10,415 / 10,640 candidates on three identical searches (CA W12). Any `performance.now()`, `Map`/`Set` iteration over nondeterministic ids, or float reduction reintroduces it. | M8's determinism test (20 repeats × 50 positions, byte-identical); a lint rule in `hard:deps` forbidding `Date.now`, `performance.now`, `Math.random`, `crypto.` under `src/ai/hard/**` except `search/time.ts` | Any repeat mismatch fails M8. |
| R12 | **`lab/solver/model.ts:23 ACTIONS = 6` leaks into a prior.** | Every six-action `killFrontier` number in `lab/results/current-static` overstates assembleable damage (LH §3.3, SU §8.12). | `hard:deps` forbids any import of `lab/solver/**` from `src/ai/hard/**` and from `lab/hard-ai/**` | Build failure. The kill table is computed from the rules, never from the static solver. |
| R13 | **Fixed-work determinism and "2–6 s" fight each other.** | If work were chosen *during* the search from a clock, the result would be machine-dependent and the ladder meaningless. | The design forbids it (§4.13); M13's gate requires the chosen rung to be identical across 5 repeats on one device | A rung that oscillates between repeats means the EWMA is being updated mid-turn; it must only update after a completed search. |
| R14 | **Parallel agents drift on the interfaces.** | 24 independently built units against interfaces written once, up front. | `npm run hard:deps` checks the layering; `tsc --noEmit` over `src` (`npm run build`'s first half) is part of every milestone gate; every interface in §3 is reproduced verbatim as a `.d.ts`-shaped declaration test in `tests/ai/hard/interfaces.test.ts` | Any signature change requires a dated addendum to this document before the code is merged. |

---

## 8. Appendix

### 8.1 npm scripts to add (`muju/package.json`)

```json
"hard:perft":  "node --import tsx lab/hard-ai/perft.ts",
"hard:fuzz":   "node --import tsx lab/hard-ai/fuzz.ts",
"hard:recall": "node --import tsx lab/hard-ai/recall.ts",
"hard:suite":  "node --import tsx lab/hard-ai/suite.ts",
"hard:sprt":   "node --import tsx lab/hard-ai/sprt.ts",
"hard:ladder": "node --import tsx lab/hard-ai/ladder.ts",
"hard:bench":  "node --import tsx lab/hard-ai/bench.ts",
"hard:corpus": "node --import tsx lab/hard-ai/corpus.ts",
"hard:tune":   "node --import tsx lab/hard-ai/tune.ts",
"hard:deps":   "node --import tsx lab/hard-ai/deps.ts",
"hard:types":  "tsc -p lab/hard-ai/tsconfig.json --noEmit"
```

`lab/hard-ai/tsconfig.json` mirrors `lab/tsconfig.json`. Production code under `src/ai/hard/` is covered
by the root `tsconfig.json` (`"include": ["src"]`, `strict: true`, `noUnusedLocals`,
`noUnusedParameters`) and by `vitest.config.ts`'s `tests/**/*.test.ts` include.

### 8.2 Constant reference

| Constant | Value | Rationale |
|---|---|---|
| `CC` | 100 per crystal | Integer scores; ET §8.5, §9.1.6 |
| `WIN_CC` | 1,000,000 | Above any material sum (1,700 crystals) + bank (504) |
| `MATE_PLY_CC` | 1,000 | Prefers shorter wins; ET §4.1 |
| `K` (candidate turns) | 24 desktop / 16 mobile / 40 analysis | ET §4.0: √24 ≈ 4.9 → 6.2 macro-plies in 3 s |
| `widths` | `[6,4,3,2]` | ET §3.5; 144 leaf lines per place-plan |
| `keep` (lines/place-plan) | 4 | ET §3.5 |
| `maxPlacePlans` | 16 | Cross product of ≤ 12 purchase × ≤ 8 promotion plans, pruned |
| `MAX_BODIES` | 4 | ET §3.3; `min(⌊C/3⌋, freeSquares, 4)` |
| `S` (squares/assignment) | 8 | `P(8,4) = 1,680` exact assignments, free |
| Turn TT | 2^18 entries × 3 words | ET §3.2; ≥ 11× measured reduction (M4 gate) |
| Macro TT | 2^18 desktop / 2^15 mobile | ET §4.3; low hit rate expected (reserves in key) |
| Aspiration δ | 200 cc | ET §4.2: 150–250 = half a Hi |
| LMR ranks | > 6 → −1, > 12 → −2 | ET §4.7 |
| Futility margin | 200 cc | ET §4.12 |
| Quiescence depth | 4 | ET §4.5 |
| Quiescence delta margin | 300 cc | 3 crystals ≈ a Hi |
| Lazy-eval margins | 800 cc / 300 cc | ET §5.11 |
| γ (discount) | 9/10, integer | ET §5.4–5.5; SU Addendum recomputes at γ = 0.9, H = 6 |
| H (economy horizon) | 6 turns | ET §5.5 |
| Liquidity floor | 6 crystals | Two Hi = the price of a spawn-strike reply; SU §1.6.1, P3 |
| Bank conversion ceiling | `5 × spawnArea` | SU §1.6.2; cheapest body 3, mean T1 ≈ 4 |
| `drawClockCc` | 800 | `−sign(e) × 800 × plies²/100` → 648 cc at plies 9 |
| `WORK_LADDER` | 8k/16k/32k/64k/128k/256k | Rungs quantise timing jitter out of the move choice |
| `WORK_COST` | 4/2/1/8/6/2/1/4 | ≈ proportional to measured µs per node class |
| `targetMs` | clamp(3000 × m/100, 2000, 6000) | ET §9.4 |
| Device rate seed | 8 units/ms, EWMA α = 1/4 | Pessimistic first turn; converges in ≤ 3 searches (M13 gate) |
| `PROOF_NODES` reuse | 20,000 | Unchanged from `src/game/homeCheckmate.ts:22` |
| df-pn ε | 1/4 | Standard 1+ε trick |
| df-pn turns | ≤ 3 | ET §4.10; fires in ~10–20 % of positions |

### 8.3 Frozen perft fixtures (M1)

| Fixture | `perftActions(·,4)` | `perftTurns(·,1)` | `perftMidStates` |
|---|---|---|---|
| `initial` (`createInitialGameState()`, `board.ts:203`) | **14,959** | **797** | **1,053** |
| `occupied-corner` (enemy on A1) | freeze | freeze | freeze |
| `blocked-rectangle` (one enemy inside every White anchor) | freeze | freeze | freeze |
| `cleave-chain` (Kagari adjacent to three Muju) | freeze | freeze | freeze |
| `clock-9` (`inactivityPlies = 9`) | freeze | freeze | freeze |
| `upkeep-pending` (`due > bank`) | freeze | freeze | freeze |
| `rich-place` (40 crystals, anchor at F5) | freeze | freeze | freeze |
| `promotion-kill` (SU §3.3 Sachita line) | freeze | freeze | freeze |
| `home-race` (SU Addendum: Radi G1 → J10 in 4 actions) | freeze | freeze | freeze |
| `endgame-dry` (all home reserves 0) | freeze | freeze | freeze |
| `handicap-3` (Black starts with 3) | freeze | freeze | freeze |

The three `initial` numbers are ET §8.1 **[M]**, recomputable in 21–49 ms with the canonical engine.
The other ten are frozen from the canonical engine at M1 and are thereafter regression constants.

### 8.4 What is explicitly not built

- Classical null-move pruning (ET §4.6). The quiet-turn substitute — search the cheapest real quiet turn
  at reduced depth — is a forced injection of the generator (§4.7 item 4) and costs nothing to generate,
  since `END_ACTION_PHASE` with zero actions is always legal (`src/game/legality.ts:25`).
- Endgame tablebases (ET §4.11): the 100-cell reserve vector makes the state space infeasible and the
  position class is rare.
- Further MCTS work (ET §4.9, CA §7.11). `src/ai/search/{mcts,uct}.ts` stay in the tree, unchanged, as
  part of Easy/Medium, and are deleted only after M10's SPRT.
- An AssemblyScript port of the new kernels (ET §9.2, step 14). The whole engine is written in TypeScript
  with a WASM-shaped packed state; porting happens only after the kernels stop changing, and it must not
  change a single search result at fixed work (its gate would be byte-identical output on the corpus).

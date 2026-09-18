# Hard AI design — knowledge-first

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai`, branch `claude/muju-hard-ai`,
v2.8 snapshot. All paths are relative to `muju/` unless absolute.

Ground truth for every claim below: `docs/hard-ai/STRATEGIC_UNDERSTANDING.md` (SU),
`docs/hard-ai/ENGINE_GAPS.md` (EG), `docs/hard-ai/understand/engine-techniques.md` (ET),
`understand/current-ai.md` (CA), `understand/rules-engine.md` (RE), `understand/lab-harness.md` (LH),
and the code cited by `path:line`.

---

## 1. Thesis

Muju is a perfect-information game whose macro-turn cannot be enumerated — White's turn 1, the quietest
turn in the game, has 14,959 action sequences for 797 end positions, and by turn 3 both counts exceed
4,000,000 and 287,000 without exhausting (ET §1.4 **[measured]**). A deep macro search is therefore
mostly a bet on a candidate generator that nobody has measured, at 313 generator calls per depth-3 node
budget and rising geometrically. The recorded losses say something different about where the strength is:
of the four logged losses and five admitted mistakes (SU §6.2, EG §2), **every one is a static property
of the position after a single turn** — zero spawn squares with money banked (NK:9), a unit standing
inside a purchasable Radi's kill radius (NK:10), a speed-1 attacker's true reach of 4 (NK:11), plants
bought onto squares with less ore than one harvest (NK:11, guide #4), a forward anchor with a blocking
set of 1 (NK:11), a kill combination one action point short because the attackers were not pre-adjacent
(NK:13), a tier-3 army whose rent (54 crystals on 175 gross) outran its income (archived Black, GR §2.3),
and a Cleave line of soft miners (archived t14). None of these needs depth. All of them need an
evaluation that computes the right quantity exactly.

**This design bets the budget on knowledge, not plies.** It builds an exact, staged, integer-valued
static evaluation over precomputed tables — threat maps that include the reach of units the opponent
has not bought yet, approach classification per soft unit, a kill-combination DP with true BFS distances
and pre-adjacency costs, spawn-rectangle bitboards with the zero-spawn cliff and reachability-aware
blocking sets, a discounted income DP over live reserves with miner relocation, an upkeep runway with a
forced-release cliff, a home-safety countdown, and a draw-clock term — plus the twenty invariants of
SU §7 as hard generation filters (three of them) and large tuned penalties (the rest). On top of that it
runs a **shallow** search: 3 macro-plies of iterative-deepening PVS with a tactical quiescence, extending
to 4–5 only when the budget is spent and the root is stable. Weights are integer centi-crystals fitted by
Texel on a v2.8 self-play corpus, with SPSA over the search and generator constants. An opening book keyed
by `(handicap, 180°-canonical Kpos)` removes the opening from the search entirely, built offline from the
797 enumerated first turns.

The claim this design makes, and which M10's gate must falsify or confirm: **a depth-3 search over an
evaluation that knows these twelve things beats a depth-6 search over an evaluation that knows none of
them, at the same 3-second browser budget.** Everything below is arranged so that the twelve things are
independently buildable, independently testable, and independently priced by SPRT.

Non-negotiables inherited from the corpus and preserved here: the canonical `src/game/` engine stays the
authority and every dispatched action is revalidated through `isLegalAction` (`src/game/legality.ts:16`,
as `src/ai/wasm/kernel.ts:78` and `src/hooks/useAI.ts:65` already do); scores are integers; determinism
under fixed work is preserved (`src/ai/runtime.ts:1,13-24`); `AIEngineV2` remains Easy/Medium and the
fallback for Hard; nothing existing is deleted until the new engine wins an SPRT.

---

## 2. Architecture and the data flow of one AI turn

```
┌── UI ────────────────────────────────────────────────────────────────────────┐
│ src/hooks/useAI.ts                                                           │
│  difficulty === 'hard'  →  ONE request per TURN (mode:'turn')                │
│  difficulty easy/medium →  one request per ACTION (unchanged path)           │
│  dispatches the returned action list one at a time, revalidating each with    │
│  isLegalAction; on any divergence it re-requests (existing loop, useAI:65-77) │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ worker protocol 3 = protocol 2 + {mode, progress, wholeTurn}
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ Worker  src/ai/worker/{entry,handler}.ts                                      │
│  handler routes difficulty 'hard' + mode 'turn' → HardEngine,                 │
│  everything else → AIEngineV2 (unchanged)                                     │
│                                                                               │
│  ┌─ 0. PACK ──────────────────────────────────────────────────────────────┐   │
│  │ adapter.packGameState(GameState) → PackedState (typed arrays, no       │   │
│  │ strings). Round-trip property-tested. Rebuilds the catalogue tables if  │   │
│  │ catalogueSignature() changed (lab element-graph / upkeep / handicap).   │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  ┌─ 1. BOOK ──────────────────────────────────────────────────────────────┐   │
│  │ book.probe(canonicalKey(state), handicap). Hit → verify the stored      │   │
│  │ end-position key against generateTurns(); match → return that turn      │   │
│  │ (budget × 0.4 still spent on a 1-ply sanity search). Miss → continue.    │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  ┌─ 2. MUST-ANSWER ───────────────────────────────────────────────────────┐   │
│  │ a. upkeep keep-set branch (state.upkeepPending)                         │   │
│  │ b. home race for us: for every affordable T1 × legal spawn square,      │   │
│  │    moveCost(spawn, enemyCorner) ≤ actionsRemaining  (SU addendum 20b)   │   │
│  │ c. home rescue for them: existing WASM/JS prover, unchanged             │   │
│  │ These do not bypass the search; they are force-injected candidates.     │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  ┌─ 3. TABLES (per macro node, this is where the knowledge lives) ────────┐   │
│  │ level 1 (~1 µs): distance maps · strike[side] · strikeIfBought[side]    │   │
│  │   · spawn masks · anchors · PST_mine · home countdown                  │   │
│  │ level 2 (~6 µs): minActionsToKill per enemy + symmetric · approach      │   │
│  │   class + retreat count per own unit · Cleave chains · economy DP       │   │
│  │   with relocation · runway · blocking sets · anchor fragility           │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  ┌─ 4. GENERATE (K ≈ 24 turns) ───────────────────────────────────────────┐   │
│  │ purchase knapsack (dominance-pruned) × mission promotions → P ≈ 10      │   │
│  │ place-plans; per plan a widened within-turn action search with          │   │
│  │ canonical ordering + turn-TT → A ≈ 3 lines; force-inject kills, home    │   │
│  │ entries, rescues, the mine-only baseline, the best pure retreat;        │   │
│  │ hard-filter invariants 1/8/18 unless that empties the list;             │   │
│  │ dedupe by end-position Kpos.                                            │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  ┌─ 5. SEARCH (shallow) ──────────────────────────────────────────────────┐   │
│  │ iterative deepening d = 1..Dmax (3 desktop / 2 phone, 4–5 if stable)   │   │
│  │   aspiration ±300 centi · macro TT on Kpos · order: TT|book|kill-per-  │   │
│  │   action|home|denial|killer|history|static                              │   │
│  │   leaf → quiescence over tactical turns (≤2 plies, ≤6 candidates)      │   │
│  │   leaf eval → staged evaluate() (stage 0/1/2 with margins)             │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  ┌─ 6. EMIT ──────────────────────────────────────────────────────────────┐   │
│  │ unpackToActions replays the chosen turn through canonical applyAction   │   │
│  │ from the original GameState, resolving slots → unit ids by square and   │   │
│  │ asserting isLegalAction at every step. Any failure → AIEngineV2.        │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Timing of one Hard turn on a desktop 3 s budget** (estimates from ET §1.4's measured primitives and
the ~50× bitboard speedup of ET §2.1):

| Stage | Cost | Note |
|---|---:|---|
| pack + tables level 1 at root | 10 µs | |
| book probe | 5 µs | binary search, 50k entries |
| root generation, K=24 | 12 ms | P=10 place-plans × ~1.2 ms |
| d=1: 24 leaf evals at stage 2 | 0.2 ms | |
| d=2: 24 nodes × (tables L2 6 µs + gen 1.2 ms) | 29 ms | K=12 at ply 2 |
| d=3: 288 nodes × (tables L2 + gen at K=6) | 250 ms | |
| quiescence at ~1,700 leaves, ≤2 tactical plies | 300 ms | ≤6 candidates each |
| slack for d=4 when stable | ~2.4 s | K schedule 24/12/6/4 |

The design deliberately leaves headroom: on a phone the same code runs `Dmax = 2` with `K = 12/6` in
under 400 ms of search (`calibrate()` measures evals/s once per engine construction and picks the row).

---

## 3. Module layout

New code lives in exactly two trees. Nothing under `src/game/` changes. `src/ai/engine-v2.ts`,
`src/ai/planner/**`, `src/ai/search/**`, `src/ai/eval/**`, `src/ai/tactics/**` and `src/ai/wasm/**` are
untouched and keep serving Easy/Medium and the fallback.

```
src/ai/hard/
  types.ts  config.ts  index.ts
  state/    bitboard.ts  masks.ts  catalogue.ts  zobrist.ts  packed.ts  adapter.ts
  rules/    distance.ts  moveGen.ts  spawn.ts  transition.ts
  tables/   context.ts  threat.ts  killCombo.ts  approach.ts  economy.ts  geometry.ts  home.ts
  eval/     features.ts  weights.ts  weights.gen.ts  evaluate.ts  invariants.ts
  gen/      purchase.ts  promote.ts  actionSearch.ts  generate.ts
  search/   tt.ts  order.ts  quiesce.ts  pvs.ts
  book/     format.ts  probe.ts  empty.ts  book.bin
  engine/   hardEngine.ts  fallback.ts  calibrate.ts

lab/hard-ai/
  cli.ts  bot.ts  perft.ts  fuzz.ts  recall.ts  bench.ts
  sprt.ts  ladder.ts  selfplay.ts  texel.ts  spsa.ts
  book/build.ts  book/pack.ts
  suites/{tactics,home,spawn,economy,invariant}.json  suites/run.ts
  fixtures/positions.ts
  tsconfig.json
```

Dependency edges point downward only; there are no cycles. `state/` depends on nothing in `hard/`;
`rules/` depends on `state/`; `tables/` on `rules/` + `state/`; `eval/` on `tables/`; `gen/` on `eval/`
+ `rules/`; `search/` on `gen/` + `eval/`; `engine/` on everything; `book/` on `state/` only.
`lab/hard-ai/` depends on `src/ai/hard/**`, `lab/harness/**` and `src/game/**`.

### 3.1 `state/` — packed representation (no game logic)

**`src/ai/hard/types.ts`** — shared vocabulary, zero dependencies.

```ts
export type Side = 0 | 1;                 // 0 = white, 1 = black
export type Square = number;              // 0..99, sq = y*10 + x  (movement.ts:232 layout)
export type DefId = number;               // 0..17, index into UNIT_DEFINITIONS order
export type Slot = number;                // dense unit slot, 0..MAX_SLOTS-1
export type Centi = number;               // integer centi-crystals; 1 crystal = 100

export const SCALE = 100;
export const WIN_SCORE = 1_000_000;       // mate scores are WIN_SCORE - 1000*plies
export const DRAW_SCORE = 0;

export const enum ActionKind { Move = 1, Attack = 2, Buy = 3, Promote = 4, EndPlace = 5, EndAction = 6, PayUpkeep = 7 }

/** One packed action. `slot` is the actor (or 255 for a buy); `sq` the destination/target;
 *  `defId` the purchased definition (255 otherwise). PayUpkeep carries a keep-set bitmask in `mask`. */
export interface HardAction { kind: ActionKind; slot: Slot; sq: Square; defId: DefId; mask: number }

export const enum Terminal { None = 0, WhiteWin = 1, BlackWin = 2, Draw = 3 }

export interface KeyPair { lo: number; hi: number }     // 64-bit Zobrist as two uint32 lanes
```

**`state/bitboard.ts`** — 100-square set ops over `Uint32Array(4)` (ET §2.1; `BigInt` is forbidden in
hot code). Words `w` cover squares `32w .. 32w+31`; word 3 uses only bits 0..3.

```ts
export type BB = Uint32Array;                                  // always length 4
export function bbNew(): BB;
export function bbCopy(out: BB, a: BB): BB;
export function bbSet(b: BB, sq: Square): void;
export function bbClear(b: BB, sq: Square): void;
export function bbHas(b: BB, sq: Square): boolean;
export function bbOr(out: BB, a: BB, b: BB): BB;
export function bbAnd(out: BB, a: BB, b: BB): BB;
export function bbAndNot(out: BB, a: BB, b: BB): BB;           // a & ~b
export function bbIsEmpty(b: BB): boolean;
export function bbPopcount(b: BB): number;
export function bbEquals(a: BB, b: BB): boolean;
export function bbFirst(b: BB): Square;                        // -1 when empty
export function bbForEach(b: BB, fn: (sq: Square) => void): void;   // ascending square order
export function bbDilate(out: BB, a: BB): BB;                  // a | north | south | east | west
export function bbShift(out: BB, a: BB, dir: 0 | 1 | 2 | 3): BB;    // N,S,E,W with file masking
export function bbReserveSum(b: BB, reserve: Uint8Array): number;
```

Determinism rule: `bbForEach` always ascends by square index; no callback may depend on iteration
order beyond that.

**`state/masks.ts`** — static tables, built once at module load.

```ts
export const ADJ: readonly BB[];                       // [100] orthogonal neighbours (board.ts:313-324)
export const ADJ_LIST: readonly Int8Array[];           // [100] the same, as ≤4 square indices
export const RECT: readonly (readonly BB[])[];         // RECT[side][anchorSq] = spawn rectangle mask
export const RECT_AREA: readonly Int32Array[];         // popcount of the above, precomputed
export const CORNER: readonly Square[];                // [0, 99]   (board.ts:175-177)
export const CORNER_NEIGHBOURS: readonly Int8Array[];  // [[1,10],[89,98]]  (homeCheckmate.ts:29-30)
export const CORRIDOR: BB;                             // the 18 zero-ore squares D1–F3, E8–G10
export function rot180(sq: Square): Square;            // 99 - sq   (exact map symmetry, ET §6.2)
export function sqOf(x: number, y: number): Square;
export function xOf(sq: Square): number;
export function yOf(sq: Square): number;
```

`RECT[0][a]` is the inclusive rectangle from square 0 to `a`; `RECT[1][a]` the inclusive rectangle from
`a` to 99. These reproduce `getSpawnRectangle` (`src/game/spawning.ts:8-29`) exactly and are the single
highest-leverage table in the engine: `getAllSpawnPositions` is six calls per `evaluatePosition`
at 6.94 µs each, 58 % of its 71.9 µs (ET §1.4 **[measured]**, SU §8.10); with `RECT` it is four `AND`s.

**`state/catalogue.ts`** — baked unit tables derived from `src/game/units.ts` at module load, plus the
element power matrix from `src/game/elements.ts` and `src/game/combat.ts`.

```ts
export const DEF_COUNT = 18;
export const ATK: Int8Array; export const DEF: Int8Array; export const SPD: Int8Array;
export const MINE: Int8Array; export const TIER: Int8Array; export const COST: Int8Array;
export const UPKEEP: Int8Array;        // UPKEEP_BY_TIER {1:0,2:1,3:2}  (upkeep.ts:5)
export const NEXT_TIER: Int8Array;     // -1 at tier 3
export const PROMO_COST: Int8Array;    // next.cost - cost = 4 or 8 uniformly (promotion.ts:9-23)
export const ELEMENT: Int8Array;
export const POWER: Int8Array;         // [18*18] effective attack of a vs b, = calculateAttackPower
export const KILLS_IN_ONE: Uint8Array; // [18*18] POWER[a][b] >= DEF[b]
export const TIER1_DEFS: Int8Array;    // the six purchasable ids, ascending by cost then id
export const DEF_ID_OF: ReadonlyMap<string, DefId>;
export const DEF_STRING: readonly string[];
/** Hash over every table plus the process-global rule knobs (elements.setElementGraph,
 *  upkeep.setUpkeepVariant, combat handicaps). Any cached table keyed on catalogue identity
 *  must carry this value (RE §7.5, EG G13). */
export function catalogueSignature(): number;
export function rebuildCatalogue(): void;
```

**`state/zobrist.ts`** — two-tier keys (ET §2.3). Key components, exactly:

- `Kpos` (macro TT, book): piece-on-square (2 owners × 18 defs × 100 squares), **cell reserve
  (100 cells × 0..16 = 1,700 keys — mandatory, reserves only deplete and two boards with different
  ore are different nodes)**, side to move, phase, `min(bank,63)` per side, `inactivityPlies` 0..10,
  `upkeepPending`, handicap.
- `Kturn` (within-turn TT): `Kpos` ⊕ `actionsRemaining` ⊕ per-unit `damageTaken`, `atkCount`,
  `canAct`, `promotedThisPlacement`, `placedThisTurn`, `lastAttackKilled`.

```ts
export function initZobrist(seed?: number): void;        // seededRandom (runtime.ts:3-6); identical on every client
export function recomputeKpos(s: PackedState): KeyPair;  // from scratch — debug assertion only
export function recomputeKturn(s: PackedState): KeyPair;
export const Z: { piece: Uint32Array; reserve: Uint32Array; side: Uint32Array; phase: Uint32Array;
                  actions: Uint32Array; bank: Uint32Array; clock: Uint32Array; upkeep: Uint32Array;
                  flags: Uint32Array; damage: Uint32Array; atk: Uint32Array; handicap: Uint32Array };
```

**`state/packed.ts`** — the mutable state, struct-of-arrays (ET §2.2, mirroring the existing WASM layout
at `assembly/tactics.ts:5-34,47`).

```ts
export const MAX_SLOTS = 100;

export interface PackedState {
  sq: Uint8Array;          // [MAX_SLOTS] 0..99, 255 = dead
  defId: Uint8Array; owner: Uint8Array; damage: Uint8Array;
  flags: Uint8Array;       // bit0 canAct, bit1 promotedThisPlacement, bit2 placedThisTurn, bit3 lastAttackKilled
  atkCount: Uint8Array;    // 0..3 Cleave counter (combat.ts:8-17)
  attacked: Uint32Array;   // [MAX_SLOTS*4] bitmask of already-attacked slots
  slotCount: number;
  pieceAt: Uint8Array;     // [100] slot or 255
  reserve: Uint8Array;     // [100] live ore
  occ: [BB, BB]; occAll: BB;
  bank: Int32Array; gained: Int32Array;              // [2] each
  side: Side; phase: 0 | 1; actionsRemaining: number;
  inactivityPlies: number; upkeepPending: 0 | 1; turnNumber: number;
  progressThisTurn: 0 | 1; handicap: number;
  kposLo: number; kposHi: number; kturnLo: number; kturnHi: number;
  terminal: Terminal;
}

export function allocState(): PackedState;
export function copyState(out: PackedState, src: PackedState): void;   // ~1.2 KB, turn boundaries only
export function unitValueCenti(s: PackedState, side: Side, material: Int32Array): Centi;
```

**`state/adapter.ts`** — the only bridge to `GameState`.

```ts
export function packGameState(g: GameState, out?: PackedState): PackedState;
export function unpackState(s: PackedState, template: GameState): GameState;   // tests + fuzzer only
/** Replay a packed turn through the canonical engine, resolving slots to unit ids by
 *  square, and return the canonical AIActions. Throws on any illegal step.  */
export function unpackToActions(origin: GameState, actions: readonly HardAction[]): AIAction[];
export function slotOrder(g: GameState): readonly string[];   // slot i ↔ g.board.units[i].id
```

`unpackToActions` is deliberately not a pure translation: it steps the canonical `applyAction`
(`src/ai/simulate.ts:25`) and looks the actor up by square at each step, so a unit bought earlier in the
same turn is identified without reimplementing `nextUnitId` (`simulate.ts:14-20`). It is the final
legality gate and it doubles as the divergence detector.

### 3.2 `rules/` — the fast rules replica

**`rules/distance.ts`**

```ts
/** Bitboard ring expansion: next = dilate(frontier) & ~occ & ~visited. ~40 ops for a full map. */
export function bfsFrom(occAll: BB, origin: Square, out: Int8Array): void;       // out[100], -1 unreachable
export function multiSourceBfs(occAll: BB, sources: BB, out: Int8Array): void;
export function reachWithin(dist: Int8Array, maxSteps: number, out: BB): BB;
export function moveCost(dist: Int8Array, to: Square, speed: number): number;    // ceil(d/speed), -1 if unreachable

export interface DistanceCache { get(s: PackedState, origin: Square): Int8Array; clear(): void; stats(): { hits: number; misses: number } }
export function createDistanceCache(bits?: number): DistanceCache;               // direct-mapped, default 1<<14, keyed (occHash, origin)
```

Occupancy hash is a running Zobrist over `occAll` maintained by `transition.ts`; occupancy changes 2–6
times per turn, so sibling nodes share BFS maps (ET §7.1).

**`rules/moveGen.ts`**

```ts
export function reachMask(s: PackedState, slot: Slot, moveActions: number, cache: DistanceCache, out: BB): BB;
export function strikeMask(s: PackedState, slot: Slot, moveActions: number, cache: DistanceCache, out: BB): BB;  // dilate(reach) minus own occupancy
export function legalMoves(s: PackedState, slot: Slot, cache: DistanceCache, out: HardAction[], at: number): number;
export function legalAttacks(s: PackedState, slot: Slot, out: HardAction[], at: number): number;
export function canAttackSlot(s: PackedState, slot: Slot): boolean;   // canAttack (combat.ts:13-17)
export function attackPower(s: PackedState, attacker: Slot, target: Slot): number;
export function effectiveDefense(s: PackedState, target: Slot): number;          // max(0, DEF - damage)
export function killsNow(s: PackedState, attacker: Slot, target: Slot): boolean;
```

**`rules/spawn.ts`**

```ts
export function anchorMask(s: PackedState, side: Side, out: BB): BB;             // squares of unblocked anchors
export function legalSpawnMask(s: PackedState, side: Side, out: BB): BB;         // ≡ getAllSpawnPositions (spawning.ts:98-118)
export function spawnMaskWithout(s: PackedState, side: Side, slot: Slot, out: BB): BB;   // "what if this anchor dies"
export function spawnMaskWith(s: PackedState, side: Side, extraSq: Square, out: BB): BB; // "what if I buy here"
export function affordableTier1(bank: number, out: Uint8Array): number;          // ≡ getAffordablePurchases (building.ts:7)
/** Minimum number of enemy bodies that would blank every anchor, counting only squares
 *  the enemy can occupy this turn (existing unit within 4 actions, or a legal enemy spawn
 *  square + affordable T1 within 4 actions). Exact for answers ≤ cap, else cap+1.
 *  The unreachable version is server/analysis/geometry.ts:25-50 blockingSet.            */
export function blockingSetSize(s: PackedState, side: Side, enemyReach: BB, cap?: number): number;
```

**`rules/transition.ts`** — make/unmake inside a turn, copy at the boundary (ET §2.4).

```ts
export interface UndoStack { data: Int32Array; top: number }
export function createUndoStack(): UndoStack;
export function isLegal(s: PackedState, a: HardAction): boolean;
export function makeAction(s: PackedState, a: HardAction, undo: UndoStack): boolean;
export function unmakeAction(s: PackedState, undo: UndoStack): void;
/** END_ACTION_PHASE: income (mining.ts:18-33) → draw clock (turn.ts:96-99) → handoff →
 *  startTurn (home occupation → elimination → upkeep → heal/reset → place).
 *  Snapshots the incoming side's flag/damage block; caller keeps the snapshot to unmake. */
export function makeTurnBoundary(s: PackedState, snapshot: PackedState): void;
export function terminalOf(s: PackedState): Terminal;
/** Exactly SU §8.1: a PROVEN checkmate resolves at the action and beats the draw; an
 *  unproven occupation is subject to the clock at endTurn and the win at startTurn.
 *  Called ONLY when the mover occupies the enemy corner, never inside quiescence. */
export function resolveCheckmateGate(s: PackedState, origin: GameState): Terminal;
```

The checkmate gate is the one place the fast engine calls back into `src/game/homeCheckmate.ts`. It is
invoked at most once per macro node and only when an occupier exists (`homeCheckmate.ts:173` already
short-circuits otherwise), which is what keeps a 20,000-node prover out of the inner loop (ET §12.8,
EG G13).

### 3.3 `tables/` — the knowledge substrate

**`tables/context.ts`** — one object per macro node, two build levels.

```ts
export interface NodeTables {
  keyLo: number; keyHi: number; level: 1 | 2;
  strike: [BB, BB];             // squares each side can attack this turn (3 moves + attack)
  strikeIfBought: [BB, BB];     // the same for units not yet bought
  spawn: [BB, BB]; anchors: [BB, BB];
  dist: DistanceCache;
  pstMine: Int32Array;          // [MAX_SLOTS] centi-crystals, live reserves
  home: [HomeSafety, HomeSafety];
  geom: [SpawnGeometry, SpawnGeometry];
  // level 2 only
  killActions: Int8Array;       // [MAX_SLOTS] min actions for the OWNER'S ENEMY to kill this slot, 127 = never
  killCrystals: Int16Array;     // [MAX_SLOTS] crystals of the cheapest such set
  approach: Uint8Array;         // [MAX_SLOTS] ApproachClass of the cheapest enemy attacker
  retreats: Uint8Array;         // [MAX_SLOTS] squares that attacker can retreat to outside our strike
  chain: Int16Array;            // [MAX_SLOTS] Cleave-chain value exposed by this enemy tier-2+ unit
  econ: [EconResult, EconResult];
}
export interface Scratch { /* preallocated BBs, Int8Arrays, stacks; never allocated in the search */ }
export function createScratch(): Scratch;
export function buildTables(s: PackedState, sc: Scratch, level: 1 | 2, out: NodeTables): NodeTables;
```

**`tables/threat.ts`**

```ts
export function strikeArea(s: PackedState, side: Side, sc: Scratch, out: BB): BB;
/** ∪ over (legal spawn square × affordable tier-1) of dilate(reach(speed, 3 actions)).
 *  Radi (SPD 3) radius 10, Hi/Göl (SPD 2) radius 7, Sjor/Muju (SPD 1) radius 4 (SU §2.5). */
export function strikeIfBoughtArea(s: PackedState, side: Side, sc: Scratch, out: BB): BB;
export function hangingSlots(s: PackedState, side: Side, t: NodeTables, out: Int8Array): number;
```

**`tables/killCombo.ts`** — the generalisation of `enoughPossibleDamage` (`homeCheckmate.ts:27-49`)
from the corner to any target, with BFS distances, purchases, promotions and Cleave.

```ts
export interface KillOpts {
  actionBudget: number;      // typically actionsRemaining, or 4 when asking about their next turn
  crystalBudget: number;
  allowBuys: boolean; allowPromotes: boolean;
  maxAttackers: number;      // 4, or 2 when the target sits on a corner
}
export interface KillPlan { actions: number; crystals: number; attackers: Int8Array; buys: Int32Array; promotes: Int8Array }
export function minActionsToKill(s: PackedState, target: Slot, attackerSide: Side, opts: KillOpts, sc: Scratch): KillPlan | null;
export function killTableFor(s: PackedState, attackerSide: Side, opts: KillOpts, sc: Scratch, outActions: Int8Array, outCrystals: Int16Array): void;
export function cleaveChain(s: PackedState, enemySlot: Slot, sc: Scratch): Centi;
```

**`tables/approach.ts`** — SU §2.3 exactly, plus the `retreat 0` rule of SU addendum 20a.

```ts
export const enum ApproachClass { None = 0, Strand = 1, Retreat = 2 }
export function classifyApproach(s: PackedState, attacker: Slot, target: Slot, sc: Scratch): { cls: ApproachClass; d: number; retreats: number };
export function approachTable(s: PackedState, defenderSide: Side, sc: Scratch, outClass: Uint8Array, outRetreats: Uint8Array): void;
```

**`tables/economy.ts`**

```ts
export const ECON_HORIZON = 6;
export const GAMMA_Q16: Int32Array;    // round(0.9^t * 65536), t = 0..7
export const PST_MINE: Int32Array;     // [18*17] centi-crystals: def × live reserve 0..16
export interface EconResult { stream: Centi; income: Int16Array; upkeep: Int16Array; turnsToInsolvency: number; relocationDebt: Centi; waste: number }
export function economyDP(s: PackedState, side: Side, t: NodeTables, sc: Scratch): EconResult;
export function pstSum(s: PackedState, side: Side, out: Int32Array): Centi;
```

**`tables/geometry.ts`**

```ts
export interface SpawnGeometry {
  area: number; reserveSum: number; anchorDepth: number;
  fragility: number;          // 0..3, see §4.6
  blocking: number;           // blockingSetSize, capped at 3
  infiltrationAnchors: number;// enemy anchors our bodies void; the enemy corner voids all of them
  convertible: Centi; zeroCliff: 0 | 1;
}
export function spawnGeometry(s: PackedState, side: Side, t: NodeTables, sc: Scratch): SpawnGeometry;
```

**`tables/home.ts`**

```ts
export interface HomeSafety { actionsToCorner: number; turnsToCorner: number; buyThreat: 0 | 1; rescuers: number; plug: 0 | 1; occupied: 0 | 1; cornerNeighboursHeld: number }
export function homeSafety(s: PackedState, side: Side, t: NodeTables, sc: Scratch): HomeSafety;
export function homeRaceAvailable(s: PackedState, side: Side, t: NodeTables, sc: Scratch): HardAction[] | null;   // SU addendum 20b
```

### 3.4 `eval/` — staged integer evaluation and the invariants

**`eval/features.ts`**

```ts
export const FEATURE_COUNT = 34;
export const enum F {
  Material = 0, Rent, BankLiquid, BankExcess, PstMine, EconDelta, DepletionWaste, RunwayCliff,
  Insolvency, Hanging, HangingBuy, ApproachRetreat, ApproachStrand, StrandPunish, KillAvailable,
  CleaveExposure, SpawnArea, SpawnReserve, SpawnZero, AnchorDepth, AnchorFragility, BlockingSet,
  Infiltration, CornerSeal, HomeThreat, HomeCountdown, HomePlug, HomeRescuers, HomeInvaded,
  ActionsLeft, DrawPressure, Corridor, TierClimb, InvariantPenalty
}
export const FEATURE_NAMES: readonly string[];
/** Symmetric difference: every feature is f(side) - f(other). Integer, no division by zero. */
export function extractFeatures(s: PackedState, t: NodeTables, side: Side, out: Int32Array): void;
export function extractStage(s: PackedState, t: NodeTables | null, side: Side, stage: 0 | 1 | 2, out: Int32Array): void;
```

**`eval/weights.ts` / `eval/weights.gen.ts`**

```ts
export interface Weights { w: Int32Array /* [FEATURE_COUNT] */; material: Int32Array /* [18] */; version: number; label: string }
export const DEFAULT_HARD_WEIGHTS: Weights;          // hand-set priors of §4.9
export function loadWeights(json: unknown): Weights; // used by lab/hard-ai/texel.ts output
export function serializeWeights(w: Weights): string;
export function weightsSignature(w: Weights): number;
```
`weights.gen.ts` is generated by the tuner and committed; it exports `TUNED_WEIGHTS: Weights`.

**`eval/evaluate.ts`**

```ts
export const STAGE0_MARGIN: Centi = 800;    // 8 crystals
export const STAGE1_MARGIN: Centi = 300;    // 3 crystals
export function evaluate(s: PackedState, side: Side, w: Weights, alpha: Centi, beta: Centi, sc: Scratch, t?: NodeTables): Centi;
export function evaluateFull(s: PackedState, side: Side, w: Weights, sc: Scratch): { score: Centi; features: Int32Array; stage: 0 | 1 | 2 };
export function terminalScore(s: PackedState, side: Side, pliesFromRoot: number): Centi | null;
```

**`eval/invariants.ts`** — SU §7, one entry per invariant, with SU addendum 20 substituted for the
original #20 and F13 dropped from the evidence list.

```ts
export const INVARIANT_COUNT = 20;
export const enum Inv {
  SpawnZero = 0, CornerSeal, StandOnRetreatSquare, StandOnStrandSquare, PoorMinerSquare,
  FragileAnchor, PromoteWithoutRunway, NoPreAdjacency, ChipAcrossTurn, HomeReachable,
  HomeBare, CleaveLine, Turtle, LiquidityFloor, UnknownAsSafe, DrawClock, SelfBlock,
  WastedEndPlace, SoftMinerExposed, KillPricedWithoutReply
}
export interface InvariantReport { violated: number; penalty: Centi; worst: Inv | -1 }
export function checkInvariants(s: PackedState, t: NodeTables, side: Side, sc: Scratch): InvariantReport;
export const HARD_FILTER_MASK: number;       // (1<<SpawnZero) | (1<<NoPreAdjacency) | (1<<WastedEndPlace) | (1<<SelfBlock)
export const INVARIANT_PENALTY: Int32Array;  // [20], centi-crystals, Texel-tunable
```

### 3.5 `gen/` — candidate turn generation

**`gen/purchase.ts`**

```ts
export interface PurchasePlan { buys: Int32Array /* (defId<<8)|sq pairs */; promotes: Int8Array; crystals: number; score: Centi; tags: number }
export interface GenConfig {
  maxTurns: number;            // K
  placePlans: number;          // P
  linesPerPlan: number;        // A
  widening: readonly number[]; // per action step
  allowHardFilters: boolean;
  maxBodies: number;
}
export function dominantDefs(s: PackedState, t: NodeTables, side: Side, out: Uint8Array): number;
export function purchaseMultisets(defs: Uint8Array, n: number, bank: number, maxBodies: number, out: Int32Array): number;
export function assignSquares(s: PackedState, t: NodeTables, multiset: Int32Array, cfg: GenConfig, sc: Scratch): PurchasePlan | null;
export function purchasePlans(s: PackedState, t: NodeTables, cfg: GenConfig, sc: Scratch): PurchasePlan[];
```

**`gen/promote.ts`**

```ts
export const enum Mission { KillEnable = 0, Survive = 1, Income = 2, Reach = 3, Anchor = 4 }
export interface PromotionCandidate { slot: Slot; mission: Mission; gain: Centi; crystals: number }
export function promotionCandidates(s: PackedState, t: NodeTables, max: number, sc: Scratch): PromotionCandidate[];
```

**`gen/actionSearch.ts`**

```ts
export interface ActionLine { actions: HardAction[]; score: Centi; endLo: number; endHi: number }
export const DEFAULT_WIDENING: readonly number[];    // [6, 4, 3, 2]
export function searchActions(s: PackedState, t: NodeTables, w: Weights, cfg: GenConfig, budget: SearchBudget, sc: Scratch): ActionLine[];
export function canonicalBefore(a: HardAction, b: HardAction, s: PackedState): boolean;   // §4.11
export interface TurnTT { probe(lo: number, hi: number): number; store(lo: number, hi: number, v: number): void; bump(): void }
export function createTurnTT(bits?: number): TurnTT;
```

**`gen/generate.ts`**

```ts
export interface TurnCandidate {
  actions: HardAction[]; tags: number; staticScore: Centi;
  endLo: number; endHi: number; invariants: number;
}
export const enum Tag { Kill = 1, HomeEntry = 2, Rescue = 4, Book = 8, Baseline = 16, Retreat = 32, Denial = 64, Buy = 128 }
export function generateTurns(s: PackedState, t: NodeTables, w: Weights, cfg: GenConfig, budget: SearchBudget, sc: Scratch): TurnCandidate[];
export function tacticalTurns(s: PackedState, t: NodeTables, w: Weights, budget: SearchBudget, sc: Scratch): TurnCandidate[];
```

### 3.6 `search/`

```ts
// search/tt.ts
export const enum Bound { Exact = 0, Lower = 1, Upper = 2 }
export interface TTHit { score: Centi; depth: number; bound: Bound; turnLo: number; turnHi: number }
export interface TT { probe(lo: number, hi: number): TTHit | null; store(lo: number, hi: number, depth: number, score: Centi, bound: Bound, turnLo: number, turnHi: number): void; newGeneration(): void; clear(): void; fill(): number }
export function createTT(bits?: number): TT;          // default 1<<18 entries, 16 B each = 4 MB

// search/order.ts
export function orderCandidates(cands: TurnCandidate[], s: PackedState, t: NodeTables, ctx: SearchContext, ttTurnLo: number, ttTurnHi: number): void;
export interface KillerTable { push(depth: number, lo: number, hi: number): void; has(depth: number, lo: number, hi: number): boolean }
export interface HistoryTable { bump(tag: number, defId: DefId, amount: number): void; score(tag: number, defId: DefId): number }

// search/quiesce.ts
export function quiesce(s: PackedState, ctx: SearchContext, alpha: Centi, beta: Centi, qdepth: number, plies: number): Centi;
export const QDEPTH_MAX = 2;

// search/pvs.ts
export interface SearchContext {
  weights: Weights; tt: TT; turnTT: TurnTT; scratch: Scratch; budget: SearchBudget;
  cfg: HardConfig; killers: KillerTable; history: HistoryTable; origin: GameState;
  stats: SearchStats; onProgress?: (p: Progress) => void;
}
export interface SearchResult { best: TurnCandidate | null; score: Centi; depth: number; pv: TurnCandidate[]; stable: number }
export function searchRoot(s: PackedState, ctx: SearchContext): SearchResult;
export function pvs(s: PackedState, ctx: SearchContext, depth: number, alpha: Centi, beta: Centi, plies: number): Centi;
```

### 3.7 `book/`

```ts
// book/format.ts
export const BOOK_MAGIC = 'MUJUBK02';
export interface BookEntry { keyLo: number; keyHi: number; flags: number; turnLo: number; turnHi: number; score: number; count: number }
export interface Book { lookup(keyLo: number, keyHi: number): BookEntry | null; size: number; handicap: number; mapHash: number; weightsVersion: number }
export function parseBook(bytes: ArrayBuffer): Book;
export function packBook(entries: BookEntry[], meta: { handicap: number; mapHash: number; weightsVersion: number }): Uint8Array;

// book/probe.ts
export function canonicalKey(s: PackedState): { lo: number; hi: number; negated: boolean };   // min(Kpos, Kpos∘rot180)
export function probeBook(book: Book, s: PackedState): BookEntry | null;

// book/empty.ts
export const EMPTY_BOOK: Book;
```

### 3.8 `engine/` and `config.ts`

```ts
// config.ts
export interface HardConfig {
  maxDepth: number; rootK: number; kSchedule: readonly number[];
  widening: readonly number[]; placePlans: number; linesPerPlan: number;
  quiesceDepth: number; aspiration: Centi; ttBits: number;
  stage2Always: boolean; useBook: boolean; fixedWork: number;
}
export const DESKTOP: HardConfig; export const PHONE: HardConfig; export const LAB: HardConfig;
export interface DeviceProfile { evalsPerSecond: number; tier: 'phone' | 'laptop' | 'desktop' }
export function configFor(profile: DeviceProfile, fixedWork?: number): HardConfig;

// engine/calibrate.ts
export function calibrate(budget: SearchBudget): DeviceProfile;   // 40 ms probe, cached per worker

// engine/hardEngine.ts
export interface HardSearchOptions { budgetMs: number; fixedWork?: number; seed: number; weights?: Weights; book?: Book; onProgress?: (p: Progress) => void }
export interface HardTurnResult { actions: AIAction[]; score: Centi; depth: number; bookHit: boolean; fellBack: boolean; stats: SearchStats }
export class HardEngine {
  constructor(cfg?: Partial<HardConfig>);
  setWeights(w: Weights): void; setBook(b: Book): void; setSeed(seed: number): void;
  searchTurn(state: GameState, opts: HardSearchOptions): Promise<HardTurnResult>;
}

// engine/fallback.ts
export function fallbackTurn(state: GameState, difficulty: AIDifficulty, budgetMs: number, seed: number): Promise<AIAction[]>;
```

### 3.9 `lab/hard-ai/`

```ts
// lab/hard-ai/bot.ts — harness adapter
export interface HardBotOptions { fixedWork: number; weights?: Weights; book?: Book; maxDepth?: number; label?: string }
export function createHardBot(opts: HardBotOptions): EngineBot;    // lab/harness/types.ts:36
// caches the whole-turn plan and replays it action by action; re-searches on divergence.

// lab/hard-ai/perft.ts
export function perftActions(g: GameState, depth: number): number;
export function perftTurns(g: GameState, depth: number): number;
export function distinctMidTurnStates(g: GameState): number;
export function perftFast(s: PackedState, depth: number): { sequences: number; endPositions: number; mid: number };

// lab/hard-ai/fuzz.ts
export function differentialFuzz(opts: { actions: number; seed: number; engines: ('canonical' | 'fast' | 'wasm')[] }): FuzzReport;

// lab/hard-ai/recall.ts
export function measureRecall(positions: GameState[], cheap: GenConfig, expensive: GenConfig): { recall: number; n: number; misses: number[] };

// lab/hard-ai/sprt.ts
export interface SprtConfig { elo0: number; elo1: number; alpha: number; beta: number; pentanomial: boolean }
export function sprt(results: PairResult[], cfg: SprtConfig): { llr: number; verdict: 'H0' | 'H1' | 'continue'; games: number };

// lab/hard-ai/ladder.ts
export function runLadder(opts: { a: string; b: string; games: number; work: number; handicaps: number[]; seed: number }): Promise<LadderReport>;

// lab/hard-ai/selfplay.ts
export function generateCorpus(opts: { games: number; work: number; seed: number; out: string }): Promise<CorpusStats>;

// lab/hard-ai/texel.ts
export function texelFit(corpus: string, init: Weights, opts: { iterations: number; kFit: boolean }): { weights: Weights; loss: number };

// lab/hard-ai/spsa.ts
export function spsaTune(params: SpsaParam[], batch: number, iterations: number, seed: number): Promise<SpsaReport>;

// lab/hard-ai/book/build.ts
export function buildBook(opts: { nodes: number; work: number; handicap: number; depth: number; out: string }): Promise<BookStats>;
```

---

## 4. Algorithms, with constants

### 4.0 Units, scale and determinism

- One crystal = `SCALE` = 100 centi-crystals. All evaluation arithmetic is `Int32`; the maximum
  non-terminal magnitude is bounded by design at ±60,000 (600 crystals), well inside `Int32`.
- `WIN_SCORE = 1_000_000`; a win at `p` plies from the root scores `WIN_SCORE − 1000·p`, a loss the
  negative. `DRAW_SCORE = 0`.
- Rationale for integers: ET §8.5 and §12.9 — float weights do not survive the JS/WASM boundary and
  break fixed-work reproducibility. Convert before tuning, not after.
- Every loop that could depend on ordering iterates over ascending square or slot index. No `Map`/`Set`
  iteration in the search path. No `Date.now()`; all timing through `SearchBudget`
  (`src/ai/runtime.ts:13-24`), polled every 512 nodes.
- Every node class is charged to the budget: macro nodes 4, generator place-plans 2, within-turn nodes 1,
  quiescence nodes 1, kill-combo DP calls 1. This closes CA W14 (tactical DFS nodes uncharged).

### 4.1 PST_mine — the discounted extraction table

Built once at module load, rebuilt on `catalogueSignature()` change.

```
PST_MINE[def][r] = round( SCALE * Σ_{t=1..12} γ^t · take_t )      γ = 0.9
  take_t = min(MINE[def], r_{t-1}),  r_t = r_{t-1} − take_t,  r_0 = r
```

- Size 18 × 17 = 306 entries. Cost: one array read per unit.
- Check values (γ = 0.9, no rent — rent is a separate feature, §4.8):
  on reserve 16 — `plant_1` 1159, `plant_2` 1285, `plant_3` 1368, `water_1` 1025, `metal_3` 1238,
  `fire_1` 646, all `lightning_*` 0; on reserve 8 — 659/693/720/619/684/513/0; on reserve 4 —
  351/360/360/342/360/310/0. These reproduce ET §5.4's table exactly, which the
  multi-turn-economy gap-fill verified as "the right arithmetic under the no-upkeep model"
  (SU addendum, correction 7).
- The two readings that matter: on a 4-cell every positive miner is worth 3.1–3.6 crystals, so rate is
  irrelevant; on a 16-cell the spread is 6.46 → 13.68. There are only eight 16-cells and twenty 8-cells
  on the whole board (`src/game/resourceMap.ts:6-17`), so rich-square assignment is the economic game
  (SU §1.2).
- `pstSum(side)` is maintained incrementally in make/unmake: a MOVE is two table reads, an income event
  at the turn boundary is one read per mining unit.

### 4.2 Economy DP with relocation (`economyDP`)

```
economyDP(s, side, t):
  H = 6 ; γ = 0.9 (GAMMA_Q16)
  miners  = own slots with MINE[def] > 0, ascending slot index
  assign[u] = sq[u] ; busy[u] = 0
  reserveCopy = copy of s.reserve (100 bytes)
  for turn = 0 .. H-1:
     income = 0
     for u in miners:                                   # deterministic slot order
        if busy[u] > 0: busy[u] -= 1; continue
        take = min(MINE[def[u]], reserveCopy[assign[u]])
        if take == 0:
           c = bestRelocation(u, reserveCopy, t)         # see below
           if c >= 0:
              assign[u] = c
              busy[u] = ceil(actionCost(u, c) / 4) ;  relocationDebt += actionCost(u,c) * ACTION_VALUE
              continue
        if take < MINE[def[u]] : waste += MINE[def[u]] - take
        income += take ; reserveCopy[assign[u]] -= take
     upkeep = Σ UPKEEP[def[u]] over all own live slots
     stream += (GAMMA_Q16[turn+1] * (income - upkeep) * SCALE) >> 16
     income[turn] = income ; upkeep[turn] = upkeep
  turnsToInsolvency = first k with bank + Σ_{t≤k}(income_t − upkeep_t) < 0, else H+1
```

`bestRelocation(u, reserves, t)`:

```
  cands = squares c with reserves[c] >= MINE[def[u]] and pieceAt[c] == 255
  score(c) = PST_MINE[def[u]][reserves[c]]
             >> (actionCost(u,c) / 2)                    # halve per 2 action points of travel
             * (c ∈ t.strike[enemy] ? 1 : 2) / 2         # contested cells count half
  pick argmax score with actionCost(u,c) <= 8 (two turns of travel); tie → lowest square index
```

- Rationale for the contested discount: the archived pivot (SU §4.2) shows a pocket being filled only
  after a forward anchor made it safe; a cell inside the enemy strike area is not reliably yours.
- Rationale for the 8-action travel cap: a speed-1 Muju covers 4 squares in a turn (SU §2.2); beyond two
  turns of travel the DP's H = 6 horizon makes the move worthless anyway.
- `ACTION_VALUE = 60` centi-crystals (tunable). Rationale: four actions buy roughly one 3-crystal kill
  in the recorded raid economy, so one action ≈ 0.6 crystals.
- Cost: ≤ 20 miners × 6 turns, relocation search at most twice per miner over ≤ 100 cells ≈ 2–5 µs
  (ET §5.5). Stage 2 only.
- The feature fed to the evaluation is **`EconDelta = economyDP.stream − pstSum(side)`**, not the raw
  stream, so that stage 1's `PstMine` and stage 2's DP do not double-count. This is what makes staged
  evaluation sound.

### 4.3 Threat maps including purchasable reach

```
strike[side]        = ∪ over live own slots u of dilate(reach(u, 3 move actions))  \ own occupancy
strikeIfBought[side]= ∪ over legal spawn squares q, over affordable tier-1 d of
                        dilate(reach_from(q, SPD[d], 3 actions))
```

- Reach radii from a spawn square, from `rules.ts:9` + `movement.ts:29-32`: Radi SPD 3 → BFS radius 10,
  Hi/Göl SPD 2 → 7, Sjor/Muju SPD 1 → 4 (SU §2.5). Costs: Hi 3, Radi 3, Sjor/Göl 4, Muju/Inyan 5.
- Optimisation that makes this affordable: a multi-source BFS from the whole spawn mask at once, once
  per distinct speed present in the affordable set (at most 3 speeds), instead of per square. That is
  three BFS calls, ~120 ops (ET §7.1).
- This is EG G2, the gap the corpus calls "the single largest evaluation gap in the existing engine"
  (ET §5.8). It is what catches NK:10 (a bought Radi killing a Hi on turn 2) and the archived Black
  turn-3 `BUY fire_1@I6 → I2 → ATK H2 → I4` (SU §2.5).

### 4.4 Kill combinations with pre-adjacency (`minActionsToKill`)

Generalises `enoughPossibleDamage` (`homeCheckmate.ts:27-49`) from the corner's 2 lanes to ≤ 4 lanes and
from Manhattan to BFS.

```
minActionsToKill(s, target, side, opts):
  lanes   = ADJ_LIST[sq[target]] filtered to squares that are empty or hold an attacker of `side`
  maxHits = min(opts.maxAttackers, |lanes| + (|lanes| < 4 ? 0 : 0))
            # a further attacker needs a lane vacated: exit + entry ≥ 2 extra actions, so
            # a corner target (2 lanes) admits at most 2 attacks in a 4-action turn
            # (homeCheckmate.ts:28-31; NK:13 is the same arithmetic)
  need    = max(0, DEF[def[target]] - damage[target])            # effective defence (combat.ts:130)
  power[h][a] = -INF for h in 0..maxHits, a in 0..opts.actionBudget ; power[0][0] = 0
  crystals[h][a] = INF ; crystals[0][0] = 0
  candidates = for each own live slot u that can still attack and has not hit `target`:
       base : cost = ceil(max(0, bfsDist(u, cheapest lane) ) / SPD[def[u]]) + 1 ; crystals = 0
              (cost 1 when already adjacent — this is the pre-adjacency term)
       promoted (if opts.allowPromotes and NEXT_TIER >= 0 and PROMO_COST <= crystalBudget):
              same cost, power from the promoted defId, crystals = PROMO_COST
    plus (if opts.allowBuys) for each affordable tier-1 d and each legal spawn square q:
       cost = ceil(bfsDist(q, cheapest lane)/SPD[d]) + 1 ; crystals = COST[d]
       (keep only the cheapest (cost, crystals) pair per d — one entry per definition, not per square)
  for each candidate (at most units + 6):
     newPower[h][a] = max(power[h][a], power[h-1][a-cost] + POWER[cand][target])
     with crystals tracked as the lexicographic tiebreak
  answer = min over (h,a) with power[h][a] >= need of (a, crystals[h][a])
```

- Each attacker contributes **at most one hit**: a non-lethal blow, including a zero-power one,
  permanently closes that unit's Cleave chain for the turn (`combat.ts:13-17`, `cleave.test.ts:53-69`).
  This is why the DP indexes by distinct attackers, exactly as SU §2.4 states.
- Attackers with `POWER = 0` are excluded: a live unit always has effective defence ≥ 1, so a 0-power
  attack can never kill (RE §1.7b, SU §3.1).
- Purchases enter at their own spawn-to-lane cost, mirroring `server/analysis/tactics.ts:41-69`
  `damageUpperBound`. This closes EG G17.
- Cost per target: O((units + 6) × 4 lanes × 5 actions) ≈ 400 ops per side (ET §7.5). `killTableFor`
  amortises the BFS across all targets by one multi-source BFS from the attacker side.
- Consumers: MVV-LVA ordering (`COST[target] / actions`), the quiescence trigger, the hanging-unit
  feature, the generator's forced-injection list, invariants 3/4/8/12/20.

**Cleave chains** (`cleaveChain`): for each enemy slot `v` with `TIER ≥ 2` and each square `q` in
`reach(v, 3 actions)`, count our units adjacent to `q` that `v` one-shots (`KILLS_IN_ONE`); the chain
value is the sum of the `TIER[v]` most valuable of them, since each kill unlocks exactly one more attack
up to the tier and each costs one action. Cap the sum by the actions left after the approach.
Evidence: the archived Hono at C9 killed B9 then C8 from one square (SU §2.4); three adjacent Mujus fall
to a Kagari in 3 actions while spaced ones do not (LH §4.1).

### 4.5 Approach classification and retreat counting

For a defender unit `v` and each enemy attacker `a` (existing, promotable, or purchasable):

```
d = bfsDist(a, cheapest empty square adjacent to v)        # real paths, both sides block (movement.ts:246)
s = SPD[def[a]]
cls = d <= 2s ? Retreat : d <= 3s ? Strand : None
retreats = |{ squares reachable by a in one move action after the attack } \ strike[defenderSide]|
```

- Table from SU §2.3: `d ≤ 2s` is strike-and-retreat (2 moves + attack + 1 retreat, 4 AP);
  `2s < d ≤ 3s` is strike-and-strand (3 moves + attack, no retreat); otherwise the attacker cannot
  strike this turn. `server/analysis/tactics.ts:272-291 approachTable` computes the same three-way split
  and is the reference implementation to differential-test against.
- The feature is weighted by the defender's value, so a Hi on a strike-and-retreat square is cheap and
  an Aegirinn on one is not — which is guide mistake #3 and #5 (SU §6.2 F7, F10).
- `retreats == 0` is the SU addendum 20a rule: an attacker with no retreat is a *punishable* attacker, so
  a strand approach against us is much less bad than a retreat approach, and a strand approach *by* us
  is only acceptable when our own reply kills the stranded unit (invariant 4).

### 4.6 Spawn geometry

```
anchors[side]    = squares a of own live units with (RECT[side][a] & occ[enemy]) == 0
spawn[side]      = (∪ over a ∈ anchors of RECT[side][a]) & ~occAll
area             = popcount(spawn)
reserveSum       = Σ reserve over spawn
anchorDepth      = max over a ∈ anchors of (side==0 ? x(a)+y(a) : 18-x(a)-y(a))
convertible      = min(bank, 500 * area)            # 5 crystals is the dearest tier-1 (Muju/Inyan)
zeroCliff        = area == 0 && bank >= 300 ? 1 : 0
blocking         = blockingSetSize(side, enemyReachThisTurn, cap = 3)
fragility        = (blocking <= 1 ? 2 : 0)
                 + (minActionsToKill(deepestAnchor, enemy, {budget:4, buys:true}) <= 4 ? 1 : 0)
infiltrationAnchors = Σ over own slots inside an enemy rectangle of the anchors voided;
                      a body on the enemy corner voids ALL of them (every rectangle contains the corner,
                      spawning.ts:8-29, homeCheckmate.ts:52-53)
```

- Evidence for the zero-spawn cliff: the opening census ranks corner-sealing lines at −8.53 with 0 spawn
  squares and the best lines at +3.66 with 21–27 (LH §4.2); NK:9 lost four of ten turns' purchases this
  way (SU §4.1).
- Evidence for fragility: a White Hi at F5 opens 30 squares but **one enemy unit on C3 cuts those 27
  empties to 2** — blocking-set size 1 (SU §4.1). NK:11 lost 16 crystals and 2 rent to exactly this.
- Evidence for infiltration weighting: NK:24, a Tanka walked into B2 and blanked every rectangle; the
  shipped evaluator prices that as one body at −1.5 (`evaluation.ts:268-294`, CA W7).
- `blockingSetSize` extends `server/analysis/geometry.ts:25-50` (an exact minimum set cover that does not
  check routes) with a reachability filter: only squares an enemy can actually occupy this turn count.

### 4.7 Home safety

```
actionsToCorner(side) = min over enemy slots u of ceil(bfsDist(u, CORNER[side]) / SPD[def[u]])
                        ∪ min over affordable enemy tier-1 d and enemy spawn square q of
                          ceil(bfsDist(q, CORNER[side]) / SPD[d])
turnsToCorner         = ceil(actionsToCorner / 4)
buyThreat             = 1 if the purchase branch produced the minimum
rescuers              = |own live units adjacent to CORNER[side] with POWER > 0 against something|
plug                  = pieceAt[CORNER[side]] is our own unit
occupied              = pieceAt[CORNER[side]] is an enemy unit
cornerNeighboursHeld  = |CORNER_NEIGHBOURS[side] occupied by our own immobile units|
```

- A plug makes home occupation impossible while it lives, because movement never ends on an occupied
  square (`movement.ts:251-253`); it costs one spawn square and blocks no rectangle, since own units
  never block (SU §8.15). Black's `BUY plant_1@J10` on turn 4 of the archived game "invalidated every
  one-turn assault I could compute" (SU §4.4).
- The cheapest invader is a 3-crystal Radi with move reach 12 and kill radius 10 (SU §6.3); `buyThreat`
  is exactly the case the shipped engine cannot see.
- `homeRaceAvailable` implements SU addendum 20b as a root check: for each affordable tier-1 and legal
  spawn square, `moveCost(spawn, enemyCorner, SPD) ≤ actionsRemaining`. In the archived fixture this
  finds White's forced turn-3 win (`BUY lightning_1@G1 → G4 → G7 → G10 → J10`, BFS 12 = 4 × SPD 3) that
  both players missed.

### 4.8 Upkeep, runway and material

```
Rent(side)      = Σ over own live slots of UPKEEP[TIER[def]] * RENT_PV
RENT_PV         = round(SCALE * Σ_{t=1..6} 0.9^t) = 422        # 4.22 crystals per 1/turn of rent
RunwayCliff     = 1 if bank + income_1 < upkeepDue  (a forced release next turn, upkeep.ts:23-31)
Insolvency      = max(0, 6 - turnsToInsolvency)
Material(side)  = Σ material[def] over own live slots                # 18 tuned parameters
```

- `RENT_PV = 422` is why a tier-3 held for six turns costs 8.4 crystals of rent against a 15–17 crystal
  purchase price, and why the net-income ladder is Plant +3/+4/+6 but Fire +1/0/−1 and Lightning
  0/−1/−2 (SU §1.5, verified by simulation in the SU addendum).
- The archived game is the whole argument for this feature: Black paid 54 upkeep on 175 gross (31 %) and
  resigned at 4 crystals / 2 income / 5 upkeep, while White paid 19 on 223 (8.5 %) and never fell below
  40 banked after turn 9 (SU §1.5, §6.3). `grep upkeep src/ai` finds nothing in the evaluation today
  (EG G5) and `techTreeProgress` pays +0.4 per tier climbed regardless.
- Material priors before tuning: `material[def] = SCALE * COST[def]` (3/4/5 · 7/8/9 · 15/16/17), with
  `material[fire_1]` pinned at 300 during Texel to fix the scale (ET §5.1).
- Durability is never a linear DEF term. It enters only through `killActions`/`killCrystals`: one point
  of DEF changes the whole set of units that can remove you — Tanka (DEF 5) is one-shot only by Kagari,
  Aegirinn (DEF 4) only by Karanlık (SU §3.3).

### 4.9 The evaluation, staged

```
evaluate(s, side, w, alpha, beta):
  terminal = terminalScore(s, side, plies)      ; if terminal != null return terminal

  # Stage 0 — ~50 ns, incrementally maintained by make/unmake
  v0 = w[Material]·Material + w[Rent]·Rent + w[BankLiquid]·min(bank,800)
     + w[BankExcess]·max(0, bank − convertible_cached) + w[HomeInvaded]·homeInvaded
  if v0 >= beta + STAGE0_MARGIN or v0 <= alpha − STAGE0_MARGIN: return v0

  # Stage 1 — ~300 ns, level-1 tables (all bitboard)
  build level-1 tables
  v1 = v0 + w[PstMine]·pstSum + w[SpawnArea]·area + w[SpawnReserve]·(reserveSum/4)
     + w[SpawnZero]·zeroCliff + w[AnchorDepth]·anchorDepth + w[Infiltration]·infiltrationAnchors
     + w[CornerSeal]·cornerNeighboursHeld + w[HomeThreat]·(actionsToCorner<=4)
     + w[HomeCountdown]·max(0, 4−turnsToCorner) + w[HomePlug]·plug + w[HomeRescuers]·rescuers
     + w[ActionsLeft]·actionsRemaining + w[DrawPressure]·drawTerm + w[Corridor]·corridorOccupancy
     + w[TierClimb]·tierClimb
  if v1 >= beta + STAGE1_MARGIN or v1 <= alpha − STAGE1_MARGIN: return v1

  # Stage 2 — ~6 µs, level-2 tables
  build level-2 tables
  v2 = v1 + w[EconDelta]·(econ.stream − pstSum) + w[DepletionWaste]·econ.waste
     + w[RunwayCliff]·cliff + w[Insolvency]·insolvency
     + w[Hanging]·Σ value(u)·[killActions[u] ≤ 4 via existing units]
     + w[HangingBuy]·Σ value(u)·[killActions[u] ≤ 4 only with a purchase]
     + w[ApproachRetreat]·Σ value(u)·[approach[u] == Retreat]
     + w[ApproachStrand]·Σ value(u)·[approach[u] == Strand]
     + w[StrandPunish]·Σ value(a)·[enemy a stranded and killable by us next turn]
     + w[KillAvailable]·Σ value(target)/killActions[target]
     + w[CleaveExposure]·Σ chain[v]
     + w[AnchorFragility]·fragility + w[BlockingSet]·max(0, 2 − blocking)
     + w[InvariantPenalty]·invariantReport.penalty / SCALE
  return v2
```

- `drawTerm = max(0, inactivityPlies − 4) × sign(v1 without this term)`. It stays zero for the first four
  quiet plies, then grows linearly to 6 at the limit. Rationale: `INACTIVITY_WARNING = 7`,
  `INACTIVITY_LIMIT = 10` (`inactivity.ts:3-4`); only an attack kill resets the clock
  (`simulate.ts:101`). The side ahead must force kills; the side behind welcomes quiet plies (SU §5.2).
  20–24 % of scripted four-action games and 55–62 % of the depth-economy games end in inactivity draws
  (LH §5.12), and every one of them is a real `inactivity` draw, not a cap artefact (SU addendum 2).
- Stage margins 800 / 300 centi-crystals: stage 1 can move the score by at most ~6 crystals in practice
  (spawn area ≤ 30 at a 0.3-crystal weight, home terms bounded by ±3), and stage 2 by at most ~3; the
  margins are set one band above the observed spread and are checked mechanically by M8's gate, which
  compares staged and full evaluation on 100k positions and asserts the staged result never lands on the
  wrong side of the window.
- Hand-set priors for the weights (all in centi-crystals per unit of feature, all Texel-tunable):
  `Material 100, Rent −100, BankLiquid 90, BankExcess 25, PstMine 60, EconDelta 80, DepletionWaste −30,
  RunwayCliff −600, Insolvency −150, Hanging −70, HangingBuy −45, ApproachRetreat −25,
  ApproachStrand −10, StrandPunish 20, KillAvailable 35, CleaveExposure −40, SpawnArea 30,
  SpawnReserve 8, SpawnZero −800, AnchorDepth 25, AnchorFragility −120, BlockingSet 150,
  Infiltration 90, CornerSeal −60, HomeThreat −400, HomeCountdown −180, HomePlug 220,
  HomeRescuers 90, HomeInvaded −4000, ActionsLeft 40, DrawPressure −40, Corridor 0, TierClimb 0,
  InvariantPenalty 100`.
  `BankLiquid` at 90 with `BankExcess` at 25 encodes the SU §8.4 ruling: the 6–8 crystal liquidity floor
  and the spawn-capacity ceiling are defensible, the conversion ratio is not — so the floor is worth
  nearly a crystal per crystal and the excess is worth a quarter, and Texel decides the rest.
  `Corridor` and `TierClimb` start at 0 deliberately: `centerControl` in the shipped evaluator pulls
  toward the zero-ore corridors (CA W16) and `techTreeProgress` rewards climbing with no runway check
  (EG G5). They are kept as tunable parameters so the corpus, not the author, decides their sign.

### 4.10 Invariants as filters and penalties

All twenty are evaluated by `checkInvariants` on the position **after** our candidate turn. Four are
hard filters at generation time; sixteen are penalties.

| # | Invariant (SU §7) | Mechanised test | Mode |
|---:|---|---|---|
| 1 | never end with zero spawn squares while you hold ≥ 3 | `geom.area == 0 && bank ≥ 300` | **filter** + −800 |
| 2 | never seal your own corner's two neighbours | `cornerNeighboursHeld == 2 && both are speed-1 miners` | −300 |
| 3 | no unit ≥ 4 crystals on a strike-and-retreat square | `approach[u]==Retreat && COST ≥ 4 && retreats > 0` | −25·value |
| 4 | strand only with a proved reply | `approach[u]==Strand && minActionsToKill(attacker, us, 4 AP, buys) > 4` | −10·value |
| 5 | no miner onto reserve < 2×MINE | checked on every `Buy` in the plan | −400 per body |
| 6 | no anchor with blocking set 1 | `geom.blocking ≤ 1 && anchorDepth ≥ 6` | −120 |
| 7 | no promotion when `bank_after − Σ_H(upkeep − income) < 6` | `econ.turnsToInsolvency ≤ 6 && plan promotes` | −600 |
| 8 | kill plans need pre-adjacency | the plan claims a kill the DP prices above the budget | **filter** |
| 9 | never plan chip damage across a turn boundary | the plan leaves a damaged, unkilled enemy | −150 |
| 10 | no enemy reaching our corner in ≤ 4 unless a rescue is proved | `home.actionsToCorner ≤ 4 && prover != rescue` | −400 |
| 11 | never leave corner and both neighbours empty vs a solvent enemy | mask test | −250 |
| 12 | no enemy tier-2+ adjacent to two of our soft units | `chain[v] > 0` | −40·chain |
| 13 | never turtle | `≥60 % of units within Chebyshev 2 of home && anchorDepth < 4 && enemy anchorDepth ≥ 4` | −200 |
| 14 | never spend the last 6–8 liquid crystals | `bank_after < 600 && plan wins no material` | −200 |
| 15 | never treat `unknown` as safe | prover returning `unknown` scores as *threatened* | structural |
| 16 | clock discipline | the `DrawPressure` term | tuned |
| 17 | no buy blocking your own path | replay shows a later MOVE's cost rise | **filter** |
| 18 | never emit `END_PLACE_PHASE` with an affordable purchase left | `canActInPlacePhase` (turn.ts:141-145) | **filter** |
| 19 | no undefended DEF-1 miner in the centre/pocket vs a solvent enemy | `u ∈ strikeIfBought[enemy] && DEF == 1 && MINE > 0` | −150 |
| 20 | price every kill three ways | the plan's kill is scored after the opponent's full reply including purchases; `retreats == 0` is a hard penalty, not a tiebreak | −250 if `retreats == 0` |

Filter discipline, stated as a rule the implementer must follow: `generateTurns` applies
`HARD_FILTER_MASK` and, **if the filtered list is empty, retries with filters off and tags the result**.
A hard filter must never be able to make the engine return no move. Invariant 15 is structural, not a
penalty: any `unknown` from the checkmate prover is scored as the bad case, never as safety
(SU §6.2 F15).

### 4.11 Canonical ordering and the within-turn TT

Three rules, in increasing value (ET §3.1):

1. **Promotion subsets by slot index** — enumerate `for (u = first; u < count; u++)`, exactly as
   `assembly/tactics.ts:143-159` and `homeCheckmate.ts:125-156` already do. Reduces `k!` to 1.
2. **Independent actions in ascending `(slot, kind, sq)`** — two actions are independent if they are by
   different units and their `{from, to, BFS corridor, target, adjacency}` square sets are disjoint and
   neither attacks the other's target.
3. **Attacks before independent moves** — safe in Muju because a turn is atomic with no opponent
   interleaving, a kill only frees a square and widens later BFS, and a move never enables an attack that
   was not already legal (ET §3.1, SU §2.7).

The within-turn TT is keyed on `Kturn` with a per-node generation counter instead of a memset.
Measured payoff: 14,959 sequences collapse to 1,053 distinct mid-turn states on the quietest turn in the
game — a 14.2× reduction, and that is the floor (ET §1.4 **[measured]**).

### 4.12 Purchase-set generation

Stage 1 — **dominance pruning** over the six tier-1 definitions (prices 3/3/4/4/5/5):

- `metal_1` (ATK 1, DEF 3, MINE 2, cost 5) is dominated by `plant_1` (ATK 0, DEF 3, MINE 3, cost 5) on
  any square with reserve ≥ 3, unless the ATK 1 crosses a kill threshold in `killCombo`.
- `shadow_1` (SPD 2, MINE 0, cost 4) is dominated by `water_1` (SPD 1, MINE 2, cost 4) on any live
  square, unless the extra speed is needed to reach a target or an anchor square this turn.
- `lightning_1` (ATK 1, SPD 3, MINE 0, cost 3) is dominated by `fire_1` (ATK 2, SPD 2, MINE 1, cost 3)
  unless ≥ 3 reach matters — a target or the enemy corner at BFS distance `d` with
  `ceil((d−1)/2) > ceil((d−1)/3)`. **Radi is kept whenever that test passes**: the handicap census makes
  it Black's best 3-crystal reply in 214 of 797 openings and `lightning_1` was the most common winning
  home invader in the v1.3 screen (SU §8.5). Its absence from one recorded game is not evidence.
- 54 of 100 cells hold 4 and 20 hold 8, so "on a live square" is the normal case and the pruning
  typically leaves 2–3 classes (ET §3.3 **[measured]**).

Stage 2 — **multiset enumeration** capped at `min(floor(bank/3), popcount(spawn), 4)` bodies. With 2–3
classes and ≤ 4 bodies that is ≤ 35 multisets, against 7,713 raw multisets at 40 crystals (ET §3.3).

Stage 3 — **scored square assignment**, exact by a 4×K Hungarian assignment (4 bodies costs nothing):

```
score(d, q) = w_mine   · PST_MINE[d][reserve[q]]
            + w_safe   · (q ∉ strike[enemy] ∪ strikeIfBought[enemy] ? 1 : 0) · COST[d]
            + w_block  · (q blanks an enemy anchor ? anchorsVoided : 0)
            + w_strike · (q adjacent to a target we can then kill ? COST[target] : 0)
            − w_anchor · (RECT_AREA[side][q] shrink caused by occupying q)
            − HARD      if reserve[q] < 2·MINE[d] and d is a miner            # invariant 5
            − HARD      if the resulting spawn mask for next turn is empty     # invariant 1
```

Defaults `w_mine 100, w_safe 60, w_block 120, w_strike 80, w_anchor 20, HARD 100000`; SPSA-tuned.
The turn-9 four-Muju burst of the archived game — spawn squares 12 → 30, income 14 → 25, bank 57 — is a
whole-bank knapsack, not a greedy single purchase, and the shipped generator emits only the top 2 squares
per definition (`placement.ts:14-59`, EG G7).

### 4.13 The search

```
searchRoot(s, ctx):
  cands = generateTurns(s, tables, K = cfg.rootK)
  if cands is empty: return the phase-end action              # never resign implicitly
  best = cands[0] ; score = -INF
  for depth = 1 .. cfg.maxDepth:
     window = depth >= 2 ? [score - 300, score + 300] : [-INF, +INF]
     loop:
       v = searchAll(cands, depth, window)
       if v <= window.lo: window.lo -= 3*(window.hi-window.lo); continue
       if v >= window.hi: window.hi += 3*(window.hi-window.lo); continue
       break
     score = v ; record PV ; report progress
     if budget.exhausted() break
     if elapsed > 0.45 * budgetMs: break                       # never start an iteration you cannot finish
     if bestUnchangedFor >= 3 and |Δscore| < 50: break
  return best
```

- `pvs(depth)`: negamax at the **turn** level. Never sign-flip inside a turn — a turn is atomic
  (SU §2.7). Mate scores by ply.
- `K` schedule `[24, 12, 6, 4]` by ply. Rationale: the generator costs ~1.2 ms per node, so
  `1 + 24 + 288` interior calls at depth 3 is ~380 ms, leaving the rest of the budget for quiescence and
  a depth-4 attempt.
- Macro TT on `Kpos`, depth-preferred with ageing. Expected hit rate is low because reserves are in the
  key (ET §12.2); M10's gate reports it, and if it is under 5 % the table shrinks to 2^14 and the memory
  goes to the within-turn table.
- **Quiescence** over *tactical turns*: a position is tactical iff some `killActions ≤ actionsRemaining`
  for the side to move, or a home entry exists, or an enemy occupies a corner. The quiescence generator
  emits at most 6 candidates (kills by descending `value/actions`, home entries, rescues) and recurses at
  most `QDEPTH_MAX = 2` macro-plies. Income still happens at turn boundaries, because it is part of the
  canonical transition; there is no "no-income quiescence" shortcut and none is needed at depth 2.
- **No null-move pruning.** Income arrives unconditionally, upkeep is charged next turn regardless and
  the draw clock advances, so passing is never free and the no-zugzwang assumption fails in both
  directions (ET §4.6, SU §5.2).
- **No LMR in v1.** With `K = 24` and depth 3 the tree is small; reductions are a depth-7 tool. Listed in
  M14 as an SPSA candidate only.
- Ordering (`orderCandidates`): TT turn → book turn → forced injections (kill, home entry, rescue) by
  `COST[victim] / actions` → spawn-denial turns → killer turns at this ply by end key → history by
  `(tag, defId)` → static score descending.

### 4.14 Opening book

- **Key**: `canonicalKey(s) = min(Kpos(s), Kpos(rot180(s)))` with a `negated` flag. The 180° symmetry is
  exact and unique: the map satisfies `m[i] === m[99−i]`, the corners are (0,0)/(9,9) and the three
  starting units are exact images — `rot180(1,0) = (8,9)`, `rot180(1,1) = (8,8)`, `rot180(0,1) = (9,8)`
  (`board.ts:175-198`, ET §6.2). It is **broken by a non-zero handicap** and by a loaded map with
  different `initialResourceLayers`, so the book header carries `handicap` and `mapHash` and the probe
  refuses a mismatch.
- **Format** (`book/format.ts`), a flat sorted blob fetched by the worker exactly like the WASM module
  (`worker/entry.ts:7-15`):
  `header: "MUJUBK02" | entryCount u32 | handicap u8 | mapHash u32 | weightsVersion u16`,
  then 16-byte entries sorted by key: `keyLo u32 | keyHi u32 | flags u8 | score i16 | count u8 |
  turnLo u32` (with `turnHi` derived from the stored 16 low bits of the end key in `flags`+`count`
  padding — the implementer may instead use 20-byte entries; the gate only checks round-trip fidelity).
- **Lookup**: binary search; on a hit, ask `generateTurns` for its candidates and pick the one whose end
  key matches. If none matches, the book is stale relative to the generator — fall through to search.
  This makes the book robust to generator changes, which is the usual maintenance failure.
- **Build** (`lab/hard-ai/book/build.ts`): best-first expansion from the 797 enumerated White first turns
  (`lab/experiments/opening-census-2026-09-14/census.ts` already produces them and cross-checks every
  successor against production `getValidMoves`). Priority = `bestValue × (1 / (1 + visits))`. Each leaf
  gets a fixed-node search at 20× the game budget; values minimax back up. Budget 50,000 book nodes for
  v1 (800 KB), keyed separately for handicap 0 and handicap 3 — the census says 3 crystals brings the
  first round to "Close" and the engine's opening knowledge must be keyed by handicap (SU §8.2).
- **Sequencing rule**: the book is built by M13, *after* the tuned evaluation of M12. A book built by a
  weak engine bakes in weak play (ET §6.3). Until then the opening is searched, which is also the SU §8.3
  ruling — the best White first turn is not settled and must not be booked on an untested index.

---

## 5. Milestone plan (DAG)

Every gate is one command with a mechanical pass criterion. Gates run under `node --import tsx` or
`vitest run`, both already in `package.json:10,15`. New scripts to add to `package.json`:

```
"hard:test":   "vitest run tests/ai/hard",
"hard:perft":  "node --import tsx lab/hard-ai/cli.ts perft --check",
"hard:fuzz":   "node --import tsx lab/hard-ai/cli.ts fuzz --actions 1000000 --seed 20260914",
"hard:bench":  "node --import tsx lab/hard-ai/cli.ts bench --check",
"hard:recall": "node --import tsx lab/hard-ai/cli.ts recall --positions 200",
"hard:suite":  "node --import tsx lab/hard-ai/cli.ts suite --all",
"hard:sprt":   "node --import tsx lab/hard-ai/cli.ts sprt",
"hard:ladder": "node --import tsx lab/hard-ai/cli.ts ladder",
"hard:selfplay":"node --import tsx lab/hard-ai/cli.ts selfplay",
"hard:texel":  "node --import tsx lab/hard-ai/cli.ts texel",
"hard:spsa":   "node --import tsx lab/hard-ai/cli.ts spsa",
"hard:book":   "node --import tsx lab/hard-ai/cli.ts book",
"hard:gate:m1" … "hard:gate:m15": composites that exit non-zero on failure.
```

Every gate command prints a single JSON line and exits non-zero on failure, so a verifier agent needs
only the exit code.

### M1 — Measurement spine
- **dependsOn**: —
- **Deliverables**: `lab/hard-ai/{cli.ts,perft.ts,sprt.ts,ladder.ts,bot.ts,tsconfig.json}`;
  `lab/hard-ai/fixtures/positions.ts` (the initial position plus 10 authored mid-game positions: one with
  a home occupier, one with a blocked rectangle, one with Cleave available, one at `inactivityPlies = 9`,
  one at a zero-spawn corner, one with a 16-cell contested, one upkeep-insolvent, one with a promotable
  kill, one with a purchasable-Radi threat, one endgame relocation treadmill); extensions to
  `lab/harness/types.ts` adding `blackCrystalHandicap` and `actionsPerTurn` to `MatchOptions` and
  `'home-checkmate'` and `'timeout'` to `WinType` (EG G20); `lab/solver/model.ts:23 ACTIONS` fixed to 4.
- **Gate**: `npm run hard:gate:m1` — runs `hard:perft --record` to freeze
  `perftActions(initial,4) = 14959`, `distinctMid = 1053`, `perftTurns(initial,1) = 797` from the
  canonical engine, then re-runs `--check` and asserts equality; runs a 40-game seat-mirrored
  paired-seed ladder of `AIv2-medium-fast` vs `Rush` at `fixedWork 1200` and asserts it completes with
  `adjudicationRate == 0` and both seats played.
- **Pass**: exit 0; printed `{"perft":{"actions":14959,"mid":1053,"turns":797},"ladderGames":40,"adjudicated":0}`.
- **Strength**: 0 (enabling; nothing below can be believed without it).

### M2 — Packed state, bitboards, masks, Zobrist, catalogue
- **dependsOn**: M1
- **Deliverables**: `src/ai/hard/{types.ts,config.ts}`, `state/*`; `tests/ai/hard/state.test.ts`.
- **Gate**: `npm run hard:gate:m2` — `vitest run tests/ai/hard/state.test.ts` asserting: `RECT`
  equals `getSpawnRectangle` on all 200 (side, anchor) pairs; `ADJ` equals `getAdjacentPositions` on all
  100 squares; `packGameState`/`unpackState` round-trips 10,000 seeded random positions field for field;
  `recomputeKpos` equals the incrementally maintained key after 100,000 random actions;
  `catalogueSignature()` changes under `setElementGraph`/`setUpkeepVariant`/`setCombatHandicap` and
  returns to its previous value when they are restored.
- **Pass**: exit 0, 0 failures.
- **Strength**: 0 (enabling).

### M3 — Fast rules replica
- **dependsOn**: M2
- **Deliverables**: `rules/*`; `lab/hard-ai/fuzz.ts`; `tests/ai/hard/rules.test.ts`.
- **Gate**: `npm run hard:gate:m3` — (a) `hard:fuzz --actions 1000000` drives canonical
  `applyAction`, the fast `makeAction`, and the WASM kernel where applicable over seeded random games and
  compares after every action: unit placements, defIds, damage, flags, banks, reserves, clock, phase,
  actions remaining, and both Zobrist keys; unmake restores the key exactly. (b) `hard:perft --check
  --engine fast` reproduces 14,959 / 1,053 / 797 and the per-fixture numbers recorded in M1.
- **Pass**: `{"mismatches":0,"actions":1000000,"perftOk":true}`.
- **Strength**: 0 (enabling, ~50× throughput).

### M4 — Threat maps and approach classification
- **dependsOn**: M3
- **Deliverables**: `tables/threat.ts`, `tables/approach.ts`, part of `tables/context.ts`;
  `tests/ai/hard/threat.test.ts`.
- **Gate**: `npm run hard:gate:m4` — on 5,000 seeded positions: `strikeMask` equals a brute-force
  `getAttackFrontier`-derived area (`movement.ts:200-214`) as a set; `strikeIfBoughtArea` equals a
  brute-force union over `getAllSpawnPositions × getAffordablePurchases` of `getMovementRange`+dilate;
  `classifyApproach` agrees with `server/analysis/tactics.ts:272-291 approachTable` on every
  (attacker, target) pair in 500 positions.
- **Pass**: `{"positions":5000,"strikeMismatch":0,"buyMismatch":0,"approachMismatch":0}`.
- **Strength**: +40…80 once wired into the evaluation at M8 (this is EG G2, the blindness behind NK:10,
  NK:11 and guide mistakes #3/#5).

### M5 — Kill-combination DP with purchases, promotions and Cleave
- **dependsOn**: M3
- **Deliverables**: `tables/killCombo.ts`; `tests/ai/hard/kill.test.ts`;
  `lab/hard-ai/suites/tactics.json`.
- **Gate**: `npm run hard:gate:m5` — (a) against an exhaustive brute-force turn search (bounded to
  positions with ≤ 8 own units and ≤ 4 actions), `minActionsToKill` returns the exact optimum on 10,000
  seeded targets, for all four `(allowBuys, allowPromotes)` combinations; (b) all 28 cases of
  `lab/ai/fixtures.ts` classify identically to the shipped prover; (c) the Cleave probe reproduces
  LH §4.1 exactly — one Kagari kills three adjacent Mujus in 3 actions and only two of three spaced at
  C1/E1/G1 in 4.
- **Pass**: `{"targets":10000,"suboptimal":0,"fixtures":28,"fixtureMismatch":0,"cleaveOk":true}`.
- **Strength**: +60…120 (EG G3, "one AP short four turns running").

### M6 — Economy DP, PST_mine, runway
- **dependsOn**: M3
- **Deliverables**: `tables/economy.ts`; `tests/ai/hard/economy.test.ts`;
  `lab/hard-ai/suites/economy.json`.
- **Gate**: `npm run hard:gate:m6` — (a) with relocation disabled, `economyDP`'s income stream equals a
  literal 6-turn simulation through canonical `endTurn` on 2,000 seeded positions, to the crystal;
  (b) with relocation enabled the stream is ≥ the stay-in-place stream on every position (upper-bound
  property) and never exceeds the total board reserve; (c) `PST_MINE` reproduces the 21 published
  reference values of ET §5.4 to ±1 centi-crystal; (d) `turnsToInsolvency` matches a literal simulation
  of `upkeepDue` vs income on the 10 fixtures.
- **Pass**: `{"exactStream":2000,"streamMismatch":0,"relocationMonotone":true,"pstMaxErr":1}`.
- **Strength**: +60…120 (EG G4/G5; the axis both essays name as decisive).

### M7 — Spawn geometry and home safety
- **dependsOn**: M3
- **Deliverables**: `tables/geometry.ts`, `tables/home.ts`, `rules/spawn.ts` completion;
  `tests/ai/hard/geometry.test.ts`; `lab/hard-ai/suites/spawn.json`.
- **Gate**: `npm run hard:gate:m7` — (a) `legalSpawnMask` equals `getAllSpawnPositions` as a set on
  1,000,000 seeded positions (both sides, every position from the fuzz stream); (b) `blockingSetSize`
  with the reachability filter disabled equals `server/analysis/geometry.ts:25-50 blockingSet` on 2,000
  positions; (c) the F5-anchor case reproduces SU §4.1 exactly — 30 rectangle squares, 27 empty, an
  enemy on C3 reduces them to 2, blocking-set size 1; (d) `homeRaceAvailable` finds White's turn-3
  `lightning_1@G1 → J10` win in the archived fixture and reports none at turn 4.
- **Pass**: `{"spawnPositions":1000000,"spawnMismatch":0,"blockingMismatch":0,"f5Ok":true,"homeRaceOk":true}`.
- **Strength**: +60…120 (EG G6; four of the recorded losses and the one recorded pivot).

### M8 — Evaluation v1 and the invariant module
- **dependsOn**: M4, M5, M6, M7
- **Deliverables**: `eval/*` with `DEFAULT_HARD_WEIGHTS`; `lab/hard-ai/bench.ts`;
  `tests/ai/hard/eval.test.ts`, `tests/ai/hard/invariants.test.ts`;
  `lab/hard-ai/suites/invariant.json` (one position per invariant, hand-authored from the SU §6.2 failure
  table, each with the expected violated bit).
- **Gate**: `npm run hard:gate:m8` — (a) staged evaluation never disagrees with the full evaluation on
  the side of the window: on 100,000 positions × 20 random `(alpha, beta)` windows, every early return is
  verified against `evaluateFull`; (b) the evaluation is deterministic: the same position evaluated
  1,000 times, and evaluated after a make/unmake round-trip, gives byte-identical `Int32` features;
  (c) `hard:bench --check` reports ≥ 200,000 stage-1 evaluations/s and ≥ 60,000 stage-2 evaluations/s on
  the reference box, and the numbers are recorded for regression; (d) every one of the 20 invariant
  fixtures sets exactly its own bit and no other.
- **Pass**: `{"windowViolations":0,"nondeterministic":0,"stage1Eps":">=200000","stage2Eps":">=60000","invariantFixtures":20,"invariantMismatch":0}`.
- **Strength**: +120…220 measured at M10 (the whole knowledge-first bet lands here).

### M9 — Candidate generator with recall instrumentation
- **dependsOn**: M5, M7, M8
- **Deliverables**: `gen/*`; `lab/hard-ai/recall.ts`; `tests/ai/hard/gen.test.ts`.
- **Gate**: `npm run hard:gate:m9` — (a) `hard:recall --positions 200` runs an expensive generator
  (`K = 2000`, widening `[16,10,6,4]`, all filters off) and the shipped cheap one (`K = 24`) on 200
  positions sampled from self-play, deep-searches the expensive generator's turns at depth 2, and
  reports how often its best turn is inside the cheap generator's K; (b) every emitted turn replays
  legally through canonical `applyAction` (0 illegal emissions in 200 × 24 turns); (c) the generator
  never returns an empty list, including on positions where all candidates violate a hard filter.
- **Pass**: `{"recall":">=0.90","illegal":0,"emptyLists":0}`.
- **Strength**: +80…150 (EG G7; recall caps everything above it).

### M10 — Shallow PVS, quiescence, whole-turn engine
- **dependsOn**: M8, M9
- **Deliverables**: `search/*`, `engine/{hardEngine,fallback,calibrate}.ts`, `src/ai/hard/index.ts`;
  `tests/ai/hard/search.test.ts`.
- **Gate**: `npm run hard:gate:m10` — (a) fixed-work determinism: the same `(position, seed, fixedWork)`
  produces byte-identical action lists over 500 positions and 3 repetitions each; (b) `hard:sprt --a
  Hard --b AIv2-hard-fast --work 200000 --elo0 0 --elo1 25 --handicaps 0,3 --mirrored` reaches the H1
  bound; (c) no illegal dispatch in the whole SPRT run (the harness counts them,
  `lab/harness/types.ts:112`); (d) mean search time at `budgetMs = 3000` stays under 3,300 ms and
  `Dmax ≥ 3` is reached on ≥ 90 % of turns on the reference box.
- **Pass**: `{"sprt":"H1","games":N,"illegalActions":0,"deterministic":true,"depth3Share":">=0.90"}`.
- **Strength**: +150…250 over the M8 evaluation alone (the first number that means anything).

### M11 — Worker protocol 3, UI difficulty switch, graceful degradation
- **dependsOn**: M10
- **Deliverables**: `src/ai/worker/protocol.ts` → `AI_PROTOCOL = 3` with
  `mode: 'action' | 'turn'`, a `{type:'progress', depth, score}` message, and `Identity.version: 2 | 3`;
  `src/ai/worker/handler.ts` routing `difficulty === 'hard' && mode === 'turn'` to `HardEngine` and
  everything else to `AIEngineV2`; `src/hooks/useAI.ts` whole-turn path;
  `tests/ai/hard/worker.test.ts`, `tests/hooks/useAI-hard.test.tsx`.
- **Gate**: `npm run hard:gate:m11` — (a) a protocol-2 request is still answered by `AIEngineV2`
  unchanged (back-compat test); (b) the whole-turn path dispatches every action through
  `isLegalAction` and, when an injected divergence occurs at action 2 of 5, falls back to the per-action
  loop and still completes a legal turn; (c) a thrown `HardEngine` error yields an `AIEngineV2` turn,
  not an error toast; (d) with `calibrate()` stubbed to a phone profile the engine returns inside
  1,200 ms and reports `depth ≥ 2`; (e) `cancel()` mid-search resolves with the best line so far and
  leaves no pending worker.
- **Pass**: exit 0, 0 failures.
- **Strength**: +20…40 (EG G12: the shipped loop runs 7 independent searches per turn and throws away
  all but the first action, `useAI.ts:53-61`).

### M12 — Texel tuning pipeline
- **dependsOn**: M10
- **Deliverables**: `lab/hard-ai/{selfplay.ts,texel.ts}`; `src/ai/hard/eval/weights.gen.ts`;
  `lab/results/hard-texel-<date>/`.
- **Gate**: `npm run hard:gate:m12` — (a) `hard:selfplay --games 20000 --work 20000` produces a corpus
  of ≥ 300,000 positions with the quietness filter applied (a position is quiet iff no
  `minActionsToKill ≤ actionsRemaining` for either side), reports the draw share and asserts it is
  < 70 % (a corpus that is nearly all draws cannot fit weights); (b) `hard:texel` fits `k` first, then
  coordinate-descends the 34 weights and 18 material values with `material[fire_1]` pinned at 300, and
  reports a strictly lower loss than the prior weights; (c) `hard:sprt --a Hard@tuned --b Hard@prior
  --elo0 0 --elo1 10` reaches H1.
- **Pass**: `{"positions":">=300000","drawShare":"<0.70","lossBefore":x,"lossAfter":"<x","sprt":"H1"}`.
- **Strength**: +60…120 (ET step 9; the evaluation is a linear weighted sum, which is a perfectly shaped
  Texel target).

### M13 — Opening book
- **dependsOn**: M12
- **Deliverables**: `book/*`, `src/ai/hard/book/book.bin`; `lab/hard-ai/book/{build.ts,pack.ts}`;
  `tests/ai/hard/book.test.ts`.
- **Gate**: `npm run hard:gate:m13` — (a) `canonicalKey` is invariant under `rot180` on 100,000 random
  positions and the negation flag is correct (`eval(σ(p)) == −eval(p)` to the centi-crystal);
  (b) `hard:book --nodes 50000 --handicap 0` and `--handicap 3` build, pack, re-parse and round-trip
  every entry; (c) the book's recommended turn is reproduced by `generateTurns` for ≥ 95 % of entries
  (drift check); (d) `hard:sprt --a Hard@book --b Hard@nobook --elo0 0 --elo1 10` reaches H1 or H0 —
  **either verdict passes**, and H0 means the book ships disabled with the measurement recorded.
- **Pass**: `{"symmetryMismatch":0,"roundTrip":true,"drift":"<=0.05","sprt":"H1|H0"}`.
- **Strength**: +30…70.

### M14 — SPSA over search and generator constants
- **dependsOn**: M12
- **Deliverables**: `lab/hard-ai/spsa.ts`; updated `config.ts` defaults.
- **Parameters**: `rootK`, `kSchedule[1..3]`, `widening[0..3]`, `placePlans`, `linesPerPlan`,
  `quiesceDepth`, `aspiration`, `STAGE0_MARGIN`, `STAGE1_MARGIN`, the five purchase-assignment weights,
  `ACTION_VALUE`, and the 20 invariant penalties.
- **Gate**: `npm run hard:gate:m14` — 20 SPSA iterations × 2,000 paired games at fixed work, then
  `hard:sprt --a Hard@spsa --b Hard@m12 --elo0 0 --elo1 8` reaching H1 or H0 (either passes; H0 keeps
  the M12 constants and records the measurement).
- **Pass**: `{"iterations":20,"sprt":"H1|H0","configWritten":true}`.
- **Strength**: +20…50.

### M15 — Regression suites and the census gate
- **dependsOn**: M10 (runs continuously thereafter)
- **Deliverables**: `lab/hard-ai/suites/{tactics,home,spawn,economy,invariant}.json` and `suites/run.ts`;
  a census regression that replays the 797 enumerated White first turns.
- **Gate**: `npm run hard:gate:m15` — (a) the four EPD suites score ≥ their recorded baselines
  (tactics ≥ 90 %, home 28/28, spawn ≥ 90 %, economy ≥ 85 %) at `fixedWork 200000`; (b) the census
  regression asserts the engine's turn-1 choice is a Hi sortie with ≥ 15 spawn squares and bank 6, and
  that it never seals the corner, over handicaps 0 and 3 and both seats; (c) `hard:fuzz --actions 100000`
  is clean; (d) determinism re-checked.
- **Pass**: `{"tactics":">=0.90","home":"28/28","spawn":">=0.90","economy":">=0.85","censusOk":true,"mismatches":0}`.
- **Strength**: 0 (regression protection).

### DAG

```
M1 ──► M2 ──► M3 ──┬──► M4 ──┐
                   ├──► M5 ──┤
                   ├──► M6 ──┼──► M8 ──┬──► M9 ──► M10 ──┬──► M11
                   └──► M7 ──┘         │                 ├──► M12 ──┬──► M13
                                       └─────────────────┘          └──► M14
                                                          └──► M15 (continuous)
```

Parallelism note for the agent fleet: after M3 lands, **M4, M5, M6 and M7 are four independent modules
with no shared files**, each with its own test file and its own gate. M8 integrates them behind the
`NodeTables` interface, which is frozen at M3 — so the four table agents code against the interface, not
against each other. `lab/hard-ai/` tooling (M1, and the `selfplay`/`texel`/`spsa`/`book` scripts) is a
fifth independent lane that only needs the `HardEngine` facade signature, which is frozen at M2.

---

## 6. Exposure

### 6.1 Lab bot adapter

`lab/hard-ai/bot.ts` exports `createHardBot({ fixedWork, weights, book, maxDepth, label })` returning the
harness's `EngineBot` (`lab/harness/types.ts:36-42`). The harness asks for one action at a time, so the
adapter:

- computes a whole turn on the first call of each `(turnNumber, currentPlayer)` pair,
- caches the action list and returns it one action at a time,
- re-validates each action against the live state with `isLegalAction` before returning it and
  re-searches from scratch on any divergence (this is also how a `PAY_UPKEEP` interleaving is handled),
- returns `null` to end a phase when the plan is exhausted.

Register it in `lab/harness/bots/index.ts` as `'Hard'`, `'Hard-fast'` (fixedWork 20,000) and
`'Hard-tuned'`. Everything the existing ladder, CLI and summary code does then works unchanged
(`lab/harness/cli.ts`, `summary.ts`).

### 6.2 Worker protocol

Protocol 3 is protocol 2 plus three fields; `sameRequest` (`protocol.ts:13-15`) is unchanged.

```ts
export const AI_PROTOCOL = 3;
export interface Identity { version: 2 | 3; gameId: string; requestId: number; revision: number; player: PlayerId }
export interface SearchRequest extends Identity {
  type: 'search'; state: GameState; difficulty: AIDifficulty;
  seed: number; decisionMs: number; fixedWork?: number;
  mode?: 'action' | 'turn';        // absent ≡ 'action' — a protocol-2 client is unaffected
}
export interface Progress { type: 'progress'; depth: number; score: number; actions: number }
export type SearchResponse = Identity & (
  | { type: 'result'; result: AIResult; wholeTurn?: boolean; warning?: string }
  | { type: 'progress'; depth: number; score: number }
  | { type: 'error'; message: string }
);
```

`handler.ts` keeps its per-`(gameId, player)` context map and its 2-context bound; the Hard context holds
a `HardEngine`, its `Scratch`, its TT and the parsed book, so tables and the 4 MB TT are allocated once
per game rather than per search. Request serialisation in `entry.ts:16-21` is unchanged and is what keeps
two searches off the same mutable buffers. The client's `terminate()` cancellation and
`max(2000, decisionMs + 2000)` watchdog (`client.ts:20-23,43`) are unchanged; the engine additionally
polls `budget.exhausted()` every 512 nodes so a cancel returns the best line rather than killing the
worker.

### 6.3 UI difficulty switch

- `ModeSelect.tsx:27,170,199` already offers `easy | medium | hard`; no UI change is needed to select it.
- `useAI.ts` gains one branch at the top of `executeAITurn`: if `difficulty === 'hard'`, issue **one**
  request with `mode: 'turn'` and the full `TURN_BUDGET_MS.hard` allowance, then dispatch
  `result.plan.actions` one at a time through the existing commit-acknowledgement loop
  (`useAI.ts:64-78`), revalidating each with `isLegalAction` exactly as line 65 does today.
- If any action is illegal, or the committed state diverges from the expected state, the loop drops back
  to the existing per-action path for the rest of the turn. The per-action path is not deleted; it is the
  fallback and it still serves Easy/Medium.
- `TURN_BUDGET_MS.hard` stays 8,000 ms as the outer allowance; the Hard engine internally clamps its own
  search to `clamp(3000 × modifiers, 2000, 6000)` per ET §9.4, with modifiers ×1.5 for a home threat
  within 4 actions on either side, ×1.3 for a ≥ 8-crystal kill combination on either side, ×0.5 when
  only one candidate survives generation, ×0.4 on a book hit.
- Graceful degradation: `calibrate()` runs a 40 ms fixed-work probe once per worker and selects
  `DESKTOP` (≥ 150k stage-1 evals/s), `LAPTOP`, or `PHONE` (`Dmax = 2`, `K = [12, 6]`, quiescence depth
  1, stage 2 only at the root and at PV leaves). The iterative-deepening structure means a phone returns
  a complete legal turn at depth 1 in ~80 ms and improves from there.

### 6.4 Fallback

Three layers, all already patterned in the repo:

1. `HardEngine.searchTurn` wraps its body in try/catch; any throw returns
   `fallbackTurn(state, 'hard', budget, seed)` = `AIEngineV2` with the Hard preset, and sets
   `fellBack: true` in the result and a `warning` on the response (the client already surfaces
   `warning`, `client.ts:38`).
2. A missing or mismatched book (`mapHash`, `handicap`, `weightsVersion`) silently degrades to
   `EMPTY_BOOK`, exactly as a missing WASM module degrades to the JS solver (`entry.ts:12-14`).
3. `unpackToActions` throwing on an illegal step is treated as an engine bug: it falls back for the whole
   turn and logs the packed position to the result's `debug` field so the fuzzer can be pointed at it.

---

## 7. Risks and early detection

1. **Generator recall is the whole bet.** A depth-3 search over a 60 %-recall generator is capped no
   matter how good the evaluation is (ET §3.5, §12.1 — unmeasured today).
   *Detect*: M9's `hard:recall` gate, run again after every generator change; it is a standing metric,
   not a one-time gate. If recall sits below 0.85, raise `placePlans` before raising `maxDepth`.
2. **The knowledge is fitted to n = 1 real game and a hand-weighted static index.** Nothing has been
   measured as a win rate on the v2.8 map (SU header, `docs/EXPANSION_ECONOMY-2026-09-13.md`).
   *Detect*: every feature enters as a tunable weight with a prior, never as a hard rule, except the four
   hard filters — and each of the four is falsifiable by an SPRT with it disabled. M12's Texel pass is
   the referee. If a weight's fitted sign contradicts the corpus, the corpus is wrong, not the fit.
3. **Hard filters can lose forced positions.** An invariant filter that empties the candidate list would
   make the engine return no move.
   *Detect*: M9 gate clause (c) asserts `emptyLists == 0`, including on adversarial positions where every
   candidate violates a filter; the generator's retry-with-filters-off path is exercised by a dedicated
   fixture.
4. **Silent evaluation bugs are the classic engine killer** — a wrong bit in a mask produces
   wrong-but-plausible play that no test catches.
   *Detect*: M2's from-scratch Zobrist assertion every N nodes in debug builds; M3's 10^6-action
   differential fuzz in CI and 10^7 nightly; M4/M5/M6/M7 each differential-test against an independent
   reference (`server/analysis/*`, brute force, or literal simulation) rather than against themselves.
5. **A book built by a weak engine bakes in weak play**, and SU §8.3 explicitly declines to settle the
   best White first turn.
   *Detect*: M13 depends on M12 by construction; the gate accepts H0 and ships the book disabled. The
   book is also keyed by `weightsVersion` so a retune invalidates it automatically.
6. **Self-play corpora that are mostly draws cannot fit weights.** 20–24 % of scripted four-action games
   and 55–62 % of depth-economy games end in inactivity draws (LH §5.12), and a capture-free game is a
   draw at the end of Black's turn 5 (SU addendum, correction 1).
   *Detect*: M12 gate clause (a) asserts draw share < 70 % and reports the terminal-reason histogram; if
   it fails, the corpus is regenerated with the `DrawPressure` weight perturbed and with opening
   diversity injected from the 797 census turns.
7. **Adjudication artefacts poison ladder numbers.** Every corpus run with the draw clock off is
   8.6–52.2 % adjudicated, and the June first-player numbers are 94–96 % adjudicated
   (SU addendum 2).
   *Detect*: `lab/hard-ai/ladder.ts` refuses to report a win rate for any cell whose adjudication share
   exceeds 1 %, and every printed result carries its adjudication share. Cap adjudication stays off.
8. **Process-global rule knobs invalidate cached tables.** `setElementGraph` (`elements.ts:45`),
   `setUpkeepVariant` (`upkeep.ts:8`) and the combat handicaps are module-global and the lab changes
   them per game (`lab/harness/runner.ts:93-96`).
   *Detect*: `catalogueSignature()` is part of every cached table's identity and is asserted at the top
   of `buildTables`; M2's gate flips each knob and asserts the signature changes.
9. **The checkmate prover inside the transition.** `applyAction` runs `resolveHomeCheckmate` after every
   action (`simulate.ts:28-33`), capped at 20,000 nodes; a search line that parks a unit on a corner pays
   it repeatedly.
   *Detect*: M3's bench reports mean nanoseconds per action separately for lines with and without a
   corner occupier; the gate fails if the occupier case exceeds 5 µs. The fast engine's gate is
   `resolveCheckmateGate`, and M15's home suite proves it preserves the canonical result.
10. **Mobile is unmeasured.** No real iPhone/Safari latency has ever been calibrated
    (`docs/AI_IMPLEMENTATION_STATUS.md`, ET §12.6).
    *Detect*: M11 gate clause (d) runs the phone profile in CI with a stubbed calibration; a real-device
    measurement is a separate manual task whose only requirement is that `calibrate()` classify it
    correctly. Because depth is chosen by iterative deepening, a wrong classification costs strength,
    never legality or a timeout.
11. **Integer scale and overflow.** Features are sums over ≤ 100 units with weights up to 4,000; a
    pathological position could in principle exceed `Int32` in an intermediate product.
    *Detect*: a debug-build assertion clamping every feature to ±100,000 before weighting, plus a fuzz
    assertion that no non-terminal evaluation exceeds ±60,000.
12. **Divergence between the fast replica and the canonical engine in the emitted turn.** The replica
    could compute a legal-looking turn that the canonical engine rejects.
    *Detect*: `unpackToActions` replays through canonical `applyAction` and throws — so a divergence is a
    caught fallback, never an illegal dispatch. The harness independently counts illegal emissions
    (`lab/harness/types.ts:112`) and M10's gate requires zero over the whole SPRT run.
13. **The 0-vs-500-crystal bank conversion constant, and every other number in §4.9, is a prior.**
    SU §8.4 rules explicitly that the ratio is uncalibrated.
    *Detect*: they are all in `weights.ts` and `config.ts`, all tuned by M12/M14, and each is printed in
    the ladder report so a regression can be attributed.

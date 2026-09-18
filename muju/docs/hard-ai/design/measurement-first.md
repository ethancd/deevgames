# Muju Hard AI — a measurement-first design

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai`, branch `claude/muju-hard-ai`,
v2.8 snapshot. All paths relative to `muju/` unless absolute. Every factual claim carries a `path:line`
citation into this worktree or into `docs/hard-ai/STRATEGIC_UNDERSTANDING.md` (SU), `docs/hard-ai/ENGINE_GAPS.md`
(EG) and `docs/hard-ai/understand/engine-techniques.md` (ET), `understand/current-ai.md` (CA),
`understand/lab-harness.md` (LH), `understand/rules-engine.md` (RE).

---

## 1. Thesis

**The binding constraint on this project is not search cleverness; it is the inability to tell whether any
change helped.** The repo currently has no engine-vs-engine ladder, no SPRT, no Elo, no perft, no fixed-work
match axis, and its last engine-strength datapoint is 16 games at one seed with `fixedWork: 1200`
(`lab/ai/run.ts:49-66`, LH §1.9) — a work level at which the shipped engine's MCTS completes **zero**
iterations in 138 of 140 decisions (CA §0, EG §0). Every strength number in `docs/` is therefore either a
scripted-bot artefact or an estimate. ET's own ranked plan puts the harness at steps 1–2 "precisely so the
Elo guesses can be replaced with measurements" (ET §11).

This design bets on four things:

1. **Instruments before engine.** Perft fixtures, a three-way differential fuzzer, fixed-work determinism
   tests, four EPD-style position suites, a seat-mirrored paired-seed pentanomial-SPRT ladder, and a
   candidate-generator *recall* meter are built and green **before** the first line of search code. Each is
   one command; each writes a machine-readable artifact under `lab/results/hard-ai-*`; a verifier agent runs
   `npm run hard:verify -- --gate M<n>` and reads a boolean.
2. **A replica, not a rewrite.** `src/game/` stays authoritative (`src/game/legality.ts:16-47`,
   `src/ai/simulate.ts:25-34`). The fast engine is a packed-typed-array replica whose only licence to exist
   is that the fuzzer proves it equal to the canonical transition on 10^7 actions. Every dispatched action is
   revalidated through `isLegalAction` — the pattern the WASM host already enforces
   (`src/ai/wasm/kernel.ts:78-82`).
3. **A deliberately boring search.** Integer-scored iterative-deepening PVS over *macro-turns*, one macro
   transposition table, one within-turn transposition table, quiescence over tactical turns. No MCTS, no
   null-move (income, upkeep and the ten-quiet-turn clock break the no-zugzwang assumption —
   `src/game/turn.ts:92-104`, `src/game/inactivity.ts:3-10`, ET §4.6). The novelty budget is spent entirely
   on the candidate generator, because the generator's recall caps everything above it (ET §3.5).
4. **Staged rollout behind SPRT.** Nothing is deleted. `AIEngineV2` remains Easy/Medium and remains the
   fallback (`src/ai/engine-v2.ts:34-39`). The new engine reaches the UI's `hard` slot only after it wins an
   SPRT against today's Hard preset **at equal wall clock** on the phone profile as well as the desktop one.

Sizing follows from the measurements, not from ambition: `evaluatePosition` costs 71.9 µs and `applyAction`
0.58 µs today (ET §1.4), so a 3 s browser budget buys ~42,000 static evaluations. The packed state plus the
`RECT` spawn-rectangle bitboard removes the 58 % of evaluation cost that is six `getAllSpawnPositions` calls
(`src/ai/evaluation.ts:148,269,283` → `src/game/spawning.ts:98-118`), and the target is 5–7 macro-plies at
K ≈ 24 on desktop, 3–5 on a phone (ET §4.0, §10). Each of those numbers is a gate, not a hope.

---

## 2. Architecture and the data flow of one AI turn

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ UI  src/hooks/useAI.ts                                                        │
│   difficulty==='hard' && protocol 3 available                                 │
│     → ONE request per TURN  (mode:'turn')                                     │
│   else → today's per-ACTION loop (useAI.ts:49-81), unchanged                   │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │ postMessage SearchRequest{version:3, mode:'turn',
                                │   state, difficulty, seed, decisionMs, fixedWork?, profile?}
┌───────────────────────────────▼───────────────────────────────────────────────┐
│ Worker  src/ai/worker/entry.ts (serialised, WASM or JS fallback: entry.ts:7-21)│
│ handler dispatches on request.mode                                            │
│   mode 'action' → AIEngineV2 (unchanged path, handler.ts:6-25)                 │
│   mode 'turn'   → HardEngine.searchTurn                                        │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────────────┐
│ HardEngine.searchTurn(state, budgetMs)      src/ai/hard/api/hardEngine.ts      │
│                                                                                │
│ 0. GUARDS                                                                      │
│    tablesIdentity() == identity baked into the cached tables, else rebuild      │
│      (elements.ts:47 setElementGraph and combat.ts:62-66 setCombatHandicap are  │
│       process-global; RE §7.5)                                                  │
│    profile := fixedWork ? 'lab' : calibrate()          (§6.4 degradation)       │
│                                                                                │
│ 1. ADAPT     fromGameState(state) -> PackedState   core/packed.ts               │
│              keys recomputed from scratch; ids[] kept for the return trip       │
│                                                                                │
│ 2. UPKEEP    if p.upkeepPending: chooseKeepSet(p)   search/upkeep.ts            │
│              (searched as a real root branch, not a static rank — EG G5)        │
│                                                                                │
│ 3. MUST-ANSWER LAYER (cheap, always run, never pruned)   search/mustAnswer.ts   │
│      a. home race first: for every affordable T1 × legal spawn square,          │
│         moveCost(spawn, enemyCorner) <= actions  -> candidate forced win        │
│         (SU Addendum "20b"; verified win existed in the archived game)          │
│      b. elimination-in-one                                                      │
│      c. enemy occupier on our corner -> rescue prover (tactics/home.ts)         │
│      d. our occupier on their corner -> mate prover                             │
│    Any proven terminal returns immediately with a full action list.             │
│                                                                                │
│ 4. BOOK PROBE (M14+, off until then)   book/probe.ts, keyed by Kpos ⊕ handicap  │
│                                                                                │
│ 5. ITERATIVE-DEEPENING PVS over macro-turns   search/pvs.ts                     │
│    for d = 1..maxDepth until budget:                                            │
│      aspiration window (s-δ, s+δ), δ = 40 cc                                    │
│      macro TT probe on Kpos                                                     │
│      candidates := generateTurns(p, K)      gen/turnsearch.ts                   │
│         ├ place plans: dominance-pruned knapsack   gen/purchases.ts             │
│         ├ promotion missions (<=8)                 gen/promotions.ts            │
│         ├ per place-plan: 4-action DFS with canonical ordering + turn-TT        │
│         └ forced injections: every proven kill, every home entry, the           │
│           mine-only turn, the best pure-defence turn                            │
│      order: TT-turn | book | kill-value-per-action | home | denial | killer     │
│             | history | quiet-by-PST                                            │
│      recurse; leaf -> quiescence over tactical turns -> evaluate()              │
│    poll budget.exhausted() every 1024 nodes; post {type:'progress'} per depth   │
│                                                                                │
│ 6. RETURN    decode PV turn -> AIAction[] via ids[]; assert each action legal    │
│              by replaying through canonical applyAction before responding       │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │ SearchResponse{type:'result', result:{plan, turnActions, ...}}
┌───────────────────────────────▼───────────────────────────────────────────────┐
│ useAI dispatches turnActions one at a time, with the existing animation delay   │
│   for each a: if (!isLegalAction(cur, a)) -> FALLBACK to per-action AIEngineV2   │
│   applyAction + await React commit + gameplay-digest compare (useAI.ts:66-78)    │
└───────────────────────────────────────────────────────────────────────────────┘
```

Two invariants govern the whole picture:

- **Atomic turns.** All four actions belong to one player (`src/game/turn.ts:87-89` / `rules.ts:9-13`), so
  negamax sign-flips only at the turn boundary, and "attacks before independent moves" is a *safe* canonical
  ordering here in a way it would not be in a game with interleaved replies (ET §3.1).
- **The checkmate prover lives inside the canonical transition.** `applyAction` calls `resolveHomeCheckmate`
  after every action (`src/ai/simulate.ts:28-33`) with a 20,000-node cap (`src/game/homeCheckmate.ts:22`).
  The replica must gate it: run it only at turn boundaries where a corner is occupied, and prove the gate
  preserves the canonical result (gate M6b).

---

## 3. Module layout

### 3.1 `src/ai/hard/` — the engine

Dependency edges point downward only. Nothing under `src/ai/hard/` imports `src/ai/engine-v2.ts`,
`src/ai/planner/*`, `src/ai/search/*` or `src/ai/evaluation.ts`; the old engine is untouched.

```
core/     <- src/game/* (read-only, at init and adapt time)
tables/   <- core
gen/      <- core, tables
tactics/  <- core, tables, gen
eval/     <- core, tables, tactics
search/   <- core, tables, gen, tactics, eval
book/     <- core, search
api/      <- everything
```

---

#### `src/ai/hard/core/packed.ts`
**Responsibility.** The engine's only state type: flat typed arrays, no objects, no strings in the hot path,
WASM-shaped. Bidirectional adapter to `GameState`.

```ts
import type { GameState, PlayerId } from '../../../game/types';

export const MAX_SLOTS = 100;          // assembly/tactics.ts:5 uses the same ceiling
export const BOARD = 100;
export const DEAD = 255;

/** flags bit layout — mirrors src/game/types.ts:62-76 */
export const F_CAN_ACT = 1, F_PROMOTED_THIS_PLACE = 2, F_PLACED_THIS_TURN = 4, F_LAST_KILLED = 8;

export interface PackedState {
  readonly sq: Uint8Array;        // [MAX_SLOTS] square 0..99, DEAD = removed
  readonly def: Uint8Array;       // [MAX_SLOTS] catalogue index 0..17
  readonly owner: Uint8Array;     // [MAX_SLOTS] 0 = white, 1 = black
  readonly damage: Uint8Array;    // [MAX_SLOTS] 0..5  (max DEF is metal_3 = 5)
  readonly flags: Uint8Array;     // [MAX_SLOTS]
  readonly atkCount: Uint8Array;  // [MAX_SLOTS] 0..3  (Cleave, combat.ts:13-17)
  readonly attacked: Uint32Array; // [MAX_SLOTS*4] bitmask of slots already hit this turn
  readonly pieceAt: Uint8Array;   // [100] slot index, DEAD = empty
  readonly reserve: Uint8Array;   // [100] 0..16  (resourceMap.ts:5)
  readonly occ: Uint32Array;      // [8] lanes: 0..3 = white occupancy, 4..7 = black
  readonly bank: Int32Array;      // [2]
  readonly gained: Int32Array;    // [2]
  slotCount: number;
  side: 0 | 1;                    // 0 = white
  phase: 0 | 1;                   // 0 = place, 1 = action
  actions: number;                // 0..4 (rules.ts:9)
  turnNumber: number;
  clock: number;                  // inactivityPlies 0..10 (inactivity.ts:3)
  progress: 0 | 1;                // progressThisTurn
  upkeepPending: 0 | 1;
  handicap: number;               // blackCrystalHandicap
  result: 0 | 1 | 2 | 3;          // 0 playing, 1 white win, 2 black win, 3 draw
  reason: number;                 // VictoryReason ordinal, 0 = none
  keyTurnLo: number; keyTurnHi: number;   // Kturn  (§3.1 core/zobrist.ts)
  keyPosLo: number;  keyPosHi: number;    // Kpos
  /** slot -> canonical unit id; cold path only, used to decode actions back out */
  ids: string[];
}

export function allocPacked(): PackedState;
export function fromGameState(s: GameState): PackedState;
/** Rebuilds a GameState by replaying decoded actions through the canonical
 *  transition; never used in the hot path, only in tests and tooling. */
export function toGameState(p: PackedState, template: GameState): GameState;
export function copyInto(dst: PackedState, src: PackedState): void;
export function sideOf(player: PlayerId): 0 | 1;
/** 24-field digest used by the differential fuzzer; stable across engines. */
export function digest(p: PackedState): string;
```

**Notes for the implementer.** Drop `hasMoved` and `hasAttacked` (never read by any rule — `canAttack` uses
`attackedThisTurn.length` / `hasAttacked` only as a legacy fallback, `combat.ts:8-9`; `atkCount` is the real
state) and drop `canActThisTurn` as a separate array only if a fuzz run proves it is never false for an alive
unit in a reachable state (RE §1.7); until then keep `F_CAN_ACT`. `attacked` uses slot indices in exactly the
four-word layout the WASM kernel already uses (`assembly/tactics.ts:47`) so both kernels share a format.

---

#### `src/ai/hard/core/action.ts`
**Responsibility.** One 32-bit integer per action; encode/decode; conversion to `AIAction`.

```ts
import type { AIAction } from '../../types';
import type { PackedState } from './packed';

export const enum Kind { MOVE = 0, ATTACK = 1, BUY = 2, PROMOTE = 3, END_PLACE = 4, END_ACTION = 5, UPKEEP = 6, RESIGN = 7 }

/** layout: kind<<24 | a<<16 | b<<8 | c   (a,b,c are 0..255) */
export type PackedAction = number;
export function enc(kind: Kind, a?: number, b?: number, c?: number): PackedAction;
export function kindOf(a: PackedAction): Kind;
export function argA(a: PackedAction): number;
export function argB(a: PackedAction): number;
export function toAIAction(p: PackedState, a: PackedAction, keepSets: Int32Array[]): AIAction;
export function fromAIAction(p: PackedState, a: AIAction): PackedAction;
```

`MOVE`: a = slot, b = destination square. `ATTACK`: a = slot, b = target square. `BUY`: a = catalogue index,
b = square. `PROMOTE`: a = slot. `UPKEEP`: a = index into the node-local keep-set list (upkeep is a root-only
branch, §3.1 `search/upkeep.ts`).

---

#### `src/ai/hard/core/bitboards.ts`
**Responsibility.** 100-bit masks as four `Uint32` lanes; the spawn-rectangle tables; bitboard BFS.

```ts
export type Mask = Uint32Array;       // length 4; bits 0..99 used, bits 100..127 always 0
export const LANES = 4;

export const ADJ: Uint32Array;        // [100*4] orthogonal neighbours (board.ts:313-324)
export const RECT_W: Uint32Array;     // [100*4] inclusive rect from (0,0) to sq  (spawning.ts:8-29)
export const RECT_B: Uint32Array;     // [100*4] inclusive rect from sq to (9,9)
export const FILEM: Uint32Array;      // [10*4]
export const RANKM: Uint32Array;      // [10*4]
export const CORNER = [0, 99] as const;         // white home = A1 = 0, black home = J10 = 99

export function clear(m: Mask, off: number): void;
export function orInto(dst: Mask, d: number, src: Mask, s: number): void;
export function andInto(dst: Mask, d: number, src: Mask, s: number): void;
export function andNotInto(dst: Mask, d: number, src: Mask, s: number): void;
export function isEmpty(m: Mask, off: number): boolean;
export function popcount(m: Mask, off: number): number;
export function get(m: Mask, off: number, sq: number): boolean;
export function set(m: Mask, off: number, sq: number): void;
/** one-step orthogonal dilation with file-wrap masking */
export function dilate(dst: Mask, d: number, src: Mask, s: number): void;

/** legal spawn set for `side`, per spawning.ts:98-118, in bitboard form.
 *  Returns popcount. anchorsOut (optional) receives the unblocked anchor slots. */
export function spawnMask(p: PackedState, side: 0 | 1, out: Mask, off: number, anchorsOut?: Int32Array): number;

/** exact BFS over unoccupied squares, both sides blocking (movement.ts:240-257).
 *  dist[sq] = step count, -1 unreachable. dist[from] = 0. */
export function bfs(p: PackedState, from: number, dist: Int8Array): void;

/** squares reachable with `actions` actions at `speed`: ceil(dist/speed) <= actions */
export function reachMask(dist: Int8Array, speed: number, actions: number, out: Mask, off: number): void;
```

`spawnMask` pseudocode (this single table is worth more than every other representation change — ET §2.1):

```
occE = occ[1-side]; occAll = occ[0] | occ[1]; out = 0
for each alive slot u with owner === side:
    R = (side === 0 ? RECT_W : RECT_B)[sq[u]]
    if ((R & occE) === 0) out |= R
out &= ~occAll
```

`dilate` must mask file 0 and file 9 before the ±1 shifts, standard wrap avoidance.

---

#### `src/ai/hard/core/zobrist.ts`
**Responsibility.** Two 64-bit keys as pairs of `Uint32`, maintained incrementally.

```ts
export interface ZobristTables {
  piece: Uint32Array;    // [100*18*2 * 2]   square × definition × owner
  reserve: Uint32Array;  // [100*17 * 2]
  unitFlags: Uint32Array;// [100*16 * 2]     turn-local: flags byte, keyed BY SQUARE
  damage: Uint32Array;   // [100*6 * 2]
  atkCount: Uint32Array; // [100*4 * 2]
  side: Uint32Array;     // [2*2]
  phase: Uint32Array;    // [2*2]
  actions: Uint32Array;  // [5*2]
  clock: Uint32Array;    // [11*2]
  bank: Uint32Array;     // [2*512 * 2]      exact: total ore is 504 (resourceMap.ts:18)
  upkeep: Uint32Array;   // [2*2]
}
export const ZOB: ZobristTables;            // built once with seededRandom(0x4d554a55)
export function buildZobrist(seed: number): ZobristTables;
/** full recompute; debug assertion target */
export function recompute(p: PackedState): { turnLo: number; turnHi: number; posLo: number; posHi: number };
export function assertKeys(p: PackedState): void;   // throws in debug builds
```

**Keying rules that are load-bearing:**
- Everything is keyed **by square, not by slot**, so two states that differ only in slot numbering transpose.
- `Kpos` (macro TT) = piece ⊕ reserve ⊕ side ⊕ phase ⊕ clock ⊕ bank ⊕ upkeepPending. Turn-local flags are
  excluded because `resetUnitActions` zeroes them at the owner's turn start (`src/game/board.ts:267-294`).
- `Kturn` (within-turn TT) = `Kpos` ⊕ unitFlags ⊕ damage ⊕ atkCount ⊕ actions ⊕ `attacked` bits folded as
  `piece[sq][victimSq]` pairs.
- **Reserves must be in the key** — they deplete monotonically (`src/game/mining.ts:25-28`) and two positions
  with identical pieces but different remaining ore are different games (ET §2.3).
- **The clock must be in the key** — `inactivityPlies` 9 versus 0 is a different game
  (`src/game/inactivity.ts:3-10`), and SU §8.1 shows a proven checkmate beating the draw at ply 9.
- Seed is a compile-time constant, using `seededRandom` from `src/ai/runtime.ts:3-6`, so keys are identical
  on every client — required by the fixed-work determinism contract (`src/ai/runtime.ts:1`).

---

#### `src/ai/hard/core/apply.ts`
**Responsibility.** `make`/`unmake` inside a turn; copy-with-snapshot at the turn boundary. The replica of
`src/ai/simulate.ts:25-186` + `src/game/turn.ts:19-104`.

```ts
export interface UndoStack { buf: Int32Array; sp: number; snap: Uint8Array; ssp: number }
export function newUndoStack(): UndoStack;

/** Applies a *legal* packed action. Returns false only if the action is illegal
 *  (which the generator must never produce; assert in debug). */
export function make(p: PackedState, a: PackedAction, u: UndoStack): boolean;
export function unmake(p: PackedState, u: UndoStack): void;

/** END_ACTION_PHASE: income -> clock -> draw check -> hand off -> startTurn
 *  (home occupation, elimination, upkeep, heal, place auto-skip). Heavy undo:
 *  snapshots the incoming side's whole flag/damage/atkCount block. */
export function makeBoundary(p: PackedState, u: UndoStack): void;
export function unmakeBoundary(p: PackedState, u: UndoStack): void;

/** Exact replica of legality.ts:16-47 for one packed action. Debug-only in the
 *  hot path; used by the fuzzer on every action. */
export function isLegal(p: PackedState, a: PackedAction): boolean;
```

**Order of operations at the boundary, verbatim from the canonical engine** (`src/game/turn.ts:92-104` then
`:19-34`, `:53-64`):
```
income (mining.ts:18-34, one cell per unit, final squares only)
clock := progress ? 0 : clock+1 ; progress := 0
if clock >= 10 and inactivityRule !== 'off'  -> draw          (inactivity.ts:7-10)
turnNumber += (next === white ? 1 : 0)
side := next
if home occupier for `next` exists -> next WINS (home-occupation)  (turn.ts:23-27)
if elimination -> win                                          (turn.ts:28-29)
upkeepDue > bank OR reviewUpkeep -> upkeepPending := 1 and STOP (turn.ts:30-32)
else settle upkeep (pay all)                                   (turn.ts:33, upkeep.ts:23-31)
resetUnitActions(next): flags, damage, atkCount, attacked all zeroed (board.ts:267-294)
phase := place ; actions := 4
if !canActInPlacePhase -> phase := action                      (turn.ts:141-145)
```
Two traps the fuzzer exists to catch: (a) a promotion's rent starts on the owner's *next* turn, because
upkeep is summed from the current definitions at turn start (`upkeep.ts:14-16`); (b) `END_PLACE_PHASE` is
frequently **illegal** because the place phase auto-advances after the last affordable purchase
(`src/ai/simulate.ts:118-120`, SU §5.3).

---

#### `src/ai/hard/tables/catalogue.ts`
**Responsibility.** Bake the 18-unit catalogue and every derived combat table once, with an identity string.

```ts
export interface Catalogue {
  atk: Int8Array; def: Int8Array; spd: Int8Array; mine: Int8Array;
  tier: Int8Array; cost: Int8Array; element: Int8Array;
  next: Int8Array;        // -1 if max tier
  promoCost: Int8Array;   // nextDef.cost - def.cost  (promotion.ts:9-23): 4 then 8, all elements
  upkeep: Int8Array;      // UPKEEP_BY_TIER {1:0,2:1,3:2} (upkeep.ts:5)
}
export const CAT: Catalogue;
export const POWER: Int8Array;        // [18*18] max(0, atk + elementModifier) (combat.ts:80-91, elements.ts:103-114)
export const KILLS_IN_ONE: Uint8Array;// [18*18] POWER[a][d] >= CAT.def[d]
export const HITS_TO_KILL: Uint8Array;// [18*18] ceil(def/POWER), 255 when POWER === 0 (a 0-power hit never kills, RE §1.7b)
export const T1_DEFS: Int8Array;      // the six tier-1 catalogue indices, prices 3,3,4,4,5,5 (building.ts:7-9)

/** hash over UNIT_DEFINITIONS + getElementGraph() + both combat handicaps +
 *  the upkeep variant. Any cached table keyed on rules must carry it. */
export function tablesIdentity(): string;
export function rebuildTables(): void;
```

Handicaps are per-*player* (`src/game/combat.ts:62-66`) and only the lab sets them, but `POWER` is computed
with the mover's handicap, exactly as `src/ai/wasm/kernel.ts:47-53` already does per call. In the lab, call
`rebuildTables()` at the start of every game; assert `tablesIdentity()` at the start of every search.

---

#### `src/ai/hard/tables/pst.ts`
**Responsibility.** The two piece-square tables. `PST_mine` is dynamic (live reserves); `PST_combat` is static.

```ts
/** discounted extraction value of (unit definition d) standing on square sq,
 *  given the current reserve, with rent charged from the unit's next own turn.
 *  gamma = 0.9, horizon H = 6.  Units: centi-crystals. */
export function pstMine(defIdx: number, reserve: number): number;
export const PST_MINE: Int32Array;    // [18*17] precomputed, indexed [defIdx*17 + reserve]
export const PST_COMBAT: Int32Array;  // [18*100]
```

`PST_MINE` is a closed-form table because extraction from one square depends only on `(mining, reserve)`:
```
take_t = min(mine, reserve - sum of earlier takes)
value  = SUM_{t=1..H} 0.9^t * take_t  -  SUM_{t=2..H} 0.9^t * upkeep(tier)
```
Anchor values, re-derived by simulation in SU's third addendum (correcting the earlier no-rent table): on a
16-cell **Muju 11.59 > Sachita 9.53 > Sjor = Inyan 8.43 > Mazask 8.27 > Sachakuna 7.05 > Tanka 5.75 >
Straumr 5.12 > Aegirinn 4.95 > Hi 4.22**, down to Kimubunga −6.63; on an 8-cell Muju 6.59 > Sjor 6.19 >
Hi 4.22 > Sachita 3.61; on a 4-cell every tier-2/3 unit is ≤ +0.28. Store ×100 as integers. The generator
uses this table for square assignment; the evaluator uses it as feature 25.

`PST_COMBAT` is small and static: distance-to-both-corners, the 18 zero-ore corridor squares D1–F3 / E8–G10
valued only for lightning (they are walkable, spawnable and worthless — SU §1.1), and the two home corners.
Initialise it to zero and let Texel (M12) fill it; the harness measures whether it pays.

---

#### `src/ai/hard/gen/actions.ts`
**Responsibility.** Legal action generation over `PackedState`, plus the canonical-ordering predicate.

```ts
/** writes packed actions into out[off..]; returns the count. */
export function genPlace(p: PackedState, out: Int32Array, off: number): number;
export function genAction(p: PackedState, out: Int32Array, off: number): number;
export function genAll(p: PackedState, out: Int32Array, off: number): number;

/** Canonical-ordering filter (ET §3.1). `prev` is the previous action in this
 *  turn (0 at the start). Returns false for an order that is a permutation of an
 *  already-enumerated one. Pure pruning: never removes a reachable end state. */
export function isCanonical(p: PackedState, prev: PackedAction, a: PackedAction): boolean;
```

The three canonicalisations, in order of value:
1. **Promotion subsets by slot index.** Enumerate `for (u = first; u < slotCount; u++)` — already proven
   twice in this repo (`assembly/tactics.ts:143-159`, `src/game/homeCheckmate.ts:125-156`).
2. **Independent actions in slot order.** Two actions are independent iff they are by different slots and
   their square sets (from, to, the BFS corridor, the target and its neighbours) are disjoint and neither is
   an attack on the other's target. For independent pairs require increasing `(slot, kind, dest)`.
3. **Attacks before independent moves.** Safe here: a kill frees a square (widening later BFS) and unlocks
   Cleave, while a move never enables an attack that was already legal, and there is no enemy reply mid-turn
   (turns are atomic).

Expected effect, measured on the quietest turn in the game: 14,959 sequences collapse to 1,053 mid-turn
states and 797 end positions — a 14.2× reduction (ET §1.4). Gate M5 requires ≥ 10× measured and set equality
against naive enumeration.

---

#### `src/ai/hard/gen/purchases.ts`
**Responsibility.** The Place phase as a dominance-pruned bounded knapsack, not a template list. Closes EG G7.

```ts
export interface PlacePlan {
  buys: Int32Array;        // pairs [defIdx, sq, defIdx, sq, ...]
  promotions: Int32Array;  // slot indices
  cost: number;
  spawnAfter: number;      // |legal spawn squares| after this plan  -- hard gate at 0
  tag: number;             // bitmask: ECONOMY|ANCHOR|BLOCK|STRIKE|PLUG|DEFENCE
  score: number;           // centi-crystals, assignment score
}
export interface PurchaseConfig {
  maxBodies: number;       // min(floor(bank/3), freeSpawnSquares, 4)
  maxPlans: number;        // 24 desktop, 12 mobile
  liquidityFloor: number;  // 600 cc = 6 crystals (SU §1.6)
}
export function dominatedT1(p: PackedState): Uint8Array;   // [6] 1 = pruned this position
export function generatePlacePlans(p: PackedState, cfg: PurchaseConfig, out: PlacePlan[]): number;
```

**Dominance tests** (evaluate per position; typically cut 6 classes to 2–3):
- `lightning_1` (Radi, ATK 1 / SPD 3 / MINE 0 / 3c) is kept **only** if some target square or enemy unit lies
  at a BFS distance where `ceil((d-1)/3) < ceil((d-1)/2)`, i.e. where SPD 3 buys a strike SPD 2 cannot, **or**
  the enemy corner is within 12 steps of a legal spawn square (the home-race case). SU §8.5 rules Radi a
  positional unit — the generator must keep it under these conditions, not delete it.
- `metal_1` (Inyan) is dominated by `plant_1` (Muju) on any square with reserve ≥ 3, same price 5, same DEF 3;
  keep Inyan only when its ATK 1 crosses a kill threshold (`HITS_TO_KILL`).
- `shadow_1` (Göl) is dominated by `water_1` (Sjor) on any square with reserve ≥ 2; keep Göl for the extra
  speed (SPD 2 vs 1) or when the square is one of the 18 zero-ore corridor cells.
- `fire_1` (Hi) is never dominated: it is the 3-crystal answer to every DEF-3 plant (SU §3.3).

**Enumeration.** Multisets over the surviving classes, capped at `maxBodies`; with 2–3 classes and ≤ 4 bodies
this is ≤ 35 multisets (ET §3.3; the raw space is 7,713 multisets at 40 crystals).

**Square assignment.** Exact 4×K Hungarian assignment (4 bodies — it costs nothing), maximising
```
score(unit d, square s) =
    w_mine   * PST_MINE[d][reserve[s]]
  + w_safe   * (s ∉ enemyStrike ∪ enemyStrikeIfBought ? 1 : 0) * value(d)
  + w_block  * (s inside the enemy's spawn rectangle ? anchorsVoided(s) : 0)
  + w_strike * (s adjacent to a target with minActionsToKill <= actions ? 1 : 0)
  - w_anchor * shrinksOwnRectangle(s)
  - w_plugpen* (s === ownCorner && ownCorner neighbours both hostile ? 0 : 1)   // a plug is good, sealing is not
```
with **two hard rejections, not penalties**:
- `spawnAfter === 0` while `bank - cost >= 3` → reject the plan outright (SU invariant 1; the opening census
  ranks corner-sealing lines last at −8.53 with 0 spawn squares, LH §4.2; NK:9 lost four of ten turns'
  purchases this way).
- a miner on a square with `reserve < 2 × mining` and no `ANCHOR|BLOCK|PLUG` tag → reject (SU invariant 5,
  failure modes F4/F12).

**Liquidity.** Plans that leave `bank < 600 cc` are kept but tagged, and the *evaluator* prices the floor
(feature 2); the generator does not hard-gate it, because SU §8.4 rules the conversion ratio uncalibrated —
Texel decides it (M12), not a hand-set constant.

---

#### `src/ai/hard/gen/promotions.ts`
**Responsibility.** ≤ 8 mission-based promotion candidates instead of `2^n` subsets.

```ts
export const enum Mission { KILL = 0, SURVIVE = 1, INCOME = 2, REACH = 3, ANCHOR = 4 }
export function promotionCandidates(p: PackedState, out: Int32Array): number;  // slot indices
export function missionOf(p: PackedState, slot: number): Mission | -1;
```
- **KILL**: promotion makes `POWER[newDef][target]` ≥ `def[target] - damage[target]` for some reachable
  target this turn. (Muju→Sachita kills Sjor/Göl: 1+1 = 2 ≥ 2 — SU §3.3, verified.)
- **SURVIVE**: promotion moves `def` out of an enemy one-shot band (`water_1` DEF 2 → `water_2` DEF 3 dodges
  every ATK-2; `metal_2` DEF 4 → `metal_3` DEF 5 leaves only Kagari — SU §3.3).
- **INCOME**: a plant on a live cell; +2 mine for 4 and +1 rent, +3 for 8 and +1 rent (`units.ts` v2.8 Mining
  3/5/8). Only emitted when `reserve >= 2 × newMining`.
- **REACH**: `lightning_2→3` (SPD 5) or `metal_3` (SPD 2 DEF-5 wall), only when a home race or an anchor run
  is live.
- **ANCHOR**: the unit currently defining the deepest unblocked rectangle.

**Rule interactions the implementer must not get wrong:** a unit placed this turn cannot be promoted
(`promotion.ts:44-52`); one promotion per unit per place phase; promotion costs **4 then 8 for every
element** (`promotion.ts:9-23`); rent begins next own turn. SU's first addendum is the cautionary case: the
"free Sachita kill" costs 4 crystals plus 1/turn forever and consumed an entire turn — **never price a
promotion at zero because it costs zero actions.**

---

#### `src/ai/hard/gen/turnsearch.ts`
**Responsibility.** The candidate generator — the single most important module in the design (ET §3.5).

```ts
export interface TurnLine {
  actions: Int32Array;    // packed, length <= 12
  length: number;
  score: number;          // within-turn static score, centi-crystals
  endKeyLo: number; endKeyHi: number;   // Kpos of the end-of-turn position
  tags: number;           // FORCED_KILL | HOME | DEFENCE | MINE_ONLY | BOOK | TT
}
export interface GenConfig {
  widths: Int32Array;     // per action step; default Int32Array.of(6,4,3,2)
  maxPlacePlans: number;  // 24 desktop / 12 mobile
  maxLinesPerPlan: number;// 4
  K: number;              // candidate turns returned; 24 desktop / 10 mobile
  ttBits: number;         // within-turn TT, 18
}
export function generateTurns(p: PackedState, cfg: GenConfig, budget: SearchBudget, out: TurnLine[]): number;
/** instrumentation hook used by lab/hard-ai/recall; no cost when undefined */
export let onCandidateSet: ((p: PackedState, lines: TurnLine[], n: number) => void) | undefined;
```

Algorithm:
```
1. place plans P := generatePlacePlans(p) ∪ promotionCandidates(p)      (<= maxPlacePlans)
2. for each place plan:
     make() all buys and promotions, then END_PLACE
     DFS over <= 4 actions:
       at each step generate all legal actions, filter by isCanonical,
       probe the within-turn TT on Kturn, score each action by the ordering key
       below, expand only the top widths[step]
       at actions === 0 or END_ACTION: record a TurnLine keyed on Kpos
     keep the best maxLinesPerPlan lines by within-turn score
3. force-inject, regardless of score:
     - every proven kill combination from tactics/killcombo.ts
     - every legal home-corner entry (and the home race from a fresh purchase)
     - the "mine only" turn: END_PLACE, END_ACTION  (the income baseline)
     - the best pure-defence turn: retreat the single highest-value unit that
       sits inside enemyStrike ∪ enemyStrikeIfBought
4. dedupe by (endKeyLo, endKeyHi); return the top K by within-turn score
```

Action ordering key inside the DFS (descending):
```
proven kill that ends a Cleave chain      : 100000 + victimValue
proven kill                               :  90000 + victimValue - 100*actionCost
Cleave continuation                       :  80000
move into the enemy rectangle (denial)    :  20000 * anchorsVoided
move onto the enemy corner                :  70000
retreat out of enemyStrike                :  10000 + value/4
income-improving move (ΔPST_MINE)         :   ΔPST_MINE
everything else                           :   PST_COMBAT delta
```
`6*4*3*2 = 144` leaf lines per place plan before the TT — a few hundred states, ~0.2–0.5 ms per plan with the
packed kernel (ET §3.5). Budget: charge one work unit per DFS node to `SearchBudget.spend()` so fixed-work
mode is exact (EG G19 records that today's tactical DFS nodes are *not* charged, CA W14).

**Recall is the metric.** `onCandidateSet` is the hook `lab/hard-ai/recall` uses. Target ≥ 90 % top-1 recall
against an expensive generator (M7).

---

#### `src/ai/hard/tactics/killcombo.ts`
**Responsibility.** Generalise `enoughPossibleDamage` (`src/game/homeCheckmate.ts:27-49`) from "the corner"
to "any target", with true BFS distances, purchases and promotions. Closes EG G3/G16/G17.

```ts
export interface KillPlan {
  targetSlot: number;
  actions: number;        // total AP, <= 4
  crystals: number;       // purchases + promotions spent
  attackers: Int32Array;  // slots (>= 0) or -(defIdx+1) for a purchase from spawn square `spawnAt[i]`
  spawnAt: Int32Array;
  retreat: number;        // number of safe squares the last attacker can reach afterwards
}
export interface KillOpts {
  allowPurchases: boolean;   // default true
  allowPromotions: boolean;  // default true
  maxLanes: number;          // 4 normally, 2 on a corner (homeCheckmate.ts:28-31)
  budgetActions: number;
}
/** null = cannot be killed this turn within the options. */
export function minActionsToKill(p: PackedState, side: 0 | 1, targetSlot: number, o: KillOpts): KillPlan | null;
/** For every enemy slot at once. out[slot] = actions | (crystals<<8), 255 = impossible. */
export function killTable(p: PackedState, side: 0 | 1, o: KillOpts, out: Int32Array): void;
/** Cleave chain: how many of `side`'s units fall to one enemy tier>=2 unit that
 *  reaches square `sq` (combat.ts:13-17; a non-lethal hit closes the chain). */
export function cleaveChain(p: PackedState, enemySlot: number, sq: number): number;
```

The DP, generalising `homeCheckmate.ts:31-48`:
```
power[hits][used] = max cumulative damage, hits <= maxLanes, used <= budgetActions
for each candidate attacker a (existing unit, its promoted form, or a purchase):
    d    = BFS distance from a's square to the cheapest EMPTY square adjacent to the target
    cost = ceil(max(0, d) / speed) + 1       // purchases start adjacent at cost 1 when a
                                             // legal spawn square touches the target
    for hits = 1..maxLanes, used = cost..budget:
        power'[hits][used] = max(power'[hits][used],
                                 power[hits-1][used-cost] + POWER[a][target])
kill iff any power[h][u] >= def[target] - damage[target]
```
Four correctness details, each with a recorded failure behind it:
- The per-attacker cost is `ceil(max(0, d-1)/speed) + 1` when `d` is measured to the **target square**; the
  form above measures to the adjacent square, so use `ceil(d/speed) + 1`. Pick one and test it against
  `homeCheckmate.ts:40-41` on the corner case (NK:13 — "one AP short of killing the enemy Aeg four turns
  running").
- BFS distances, not Manhattan: both sides' units block (`movement.ts:246`).
- One attacker contributes **at most one chip**: a non-lethal hit permanently closes that unit's Cleave chain
  (`combat.ts:13-17`). The DP's `hits` counter is therefore "distinct attackers", not "attacks".
- **Price the kill three ways before taking it** (SU restated invariant 20): crystals spent, the attacker's
  value left standing after the opponent's full reply *including their purchases*, and what the target was
  anchoring. SU's addendum records a concrete engine defect from ignoring this: `searchTurn` returns the
  first witness in move order and buys an 8-crystal kill where a 4-crystal one with 12 retreat squares
  exists. `KillPlan.crystals` and `KillPlan.retreat` exist so the orderer can prefer the cheap unanswerable
  line; `retreat === 0` is a hard penalty, not a tiebreak (invariant 20a).

---

#### `src/ai/hard/tactics/threat.ts`
**Responsibility.** Threat maps including the reach of units that do not exist yet. Closes EG G2/G8.

```ts
export interface ThreatMaps {
  strike: Uint32Array;          // [2*4] union over units of dilate(reach(u, 3 actions))
  strikeIfBought: Uint32Array;  // [2*4] seeded from every legal spawn square x affordable T1
  reach1: Uint32Array;          // [2*4] reach with the full 4 actions (move only)
  minKill: Int32Array;          // [MAX_SLOTS] actions needed to kill this unit, 255 = safe
}
export function computeThreats(p: PackedState, out: ThreatMaps): void;
export const enum Approach { RETREAT = 0, STRAND = 1, UNREACHABLE = 2 }
export function approachClass(p: PackedState, attackerSlot: number, targetSq: number): Approach;
```
`strikeIfBought` seeds: from a spawn square a fresh **Radi (SPD 3) strikes at BFS radius 10, Hi (SPD 2) at 7,
Göl at 7, Sjor at 4**, at costs 3/3/4/4 (SU §2.5). This single map is the fix for the most-repeated recorded
loss: NK:10 (a bought Radi killed a Hi on turn 2) and the archived game's turn-3 `BUY fire_1@I6 → I2 → ATK H2
→ I4` (a 3-crystal Hi walked 6 squares, killed a 5-crystal Muju and retreated, all in 4 AP).

`approachClass` is SU §2.3 exactly, and `server/analysis/tactics.ts:272-291 approachTable` already computes
the same three-way split — use it as the reference oracle in the M6 differential test:
```
d = BFS distance to the cheapest empty square adjacent to the target
d <= 2*speed -> RETREAT  (2 moves + attack + 1 retreat = 4 AP)
d <= 3*speed -> STRAND   (3 moves + attack = 4 AP, no retreat)
otherwise    -> UNREACHABLE
```

---

#### `src/ai/hard/tactics/home.ts`
**Responsibility.** Replica of the home-defence prover, plus forced-home-win search. Closes EG G9/G22.

```ts
export type HomeVerdict = 'mate' | 'rescue' | 'unknown';
/** Must agree with src/game/homeCheckmate.ts:57-59 on every input. */
export function homeVerdict(p: PackedState, invader: 0 | 1, maxNodes: number, budget: SearchBudget): HomeVerdict;
/** min turns for `side` to put any unit on the enemy corner, purchases included. */
export function minTurnsToCorner(p: PackedState, side: 0 | 1): number;
/** df-pn over home threats (M10). Proven wins only; `unknown` is never a win. */
export function forcedHomeWin(p: PackedState, side: 0 | 1, maxTurns: number, budget: SearchBudget):
  { proven: boolean; line: Int32Array };
/** The gate that keeps the 20k-node prover out of the inner loop. */
export function needsCheckmateProof(p: PackedState): boolean;   // true iff a corner is occupied by the mover
```

The exact adjudication ordering, verified in SU §8.1 and to be encoded as a vitest fixture (EG G22): a
**proven** checkmate resolves at the instant of the move and beats the draw even at `inactivityPlies = 9`; an
**unproven** occupation is subject to the draw at `endTurn` and to the occupation win at the next `startTurn`.
`unknown` is never a win (`homeCheckmate.ts:167`), and SU invariant 15 forbids reading `unknown` as safety.

---

#### `src/ai/hard/eval/features.ts`, `eval/weights.ts`, `eval/evaluate.ts`
**Responsibility.** A linear integer evaluation in centi-crystals, feature-extractable for Texel tuning.

```ts
// features.ts
export const FEATURE_COUNT = 28;
export const FEATURE_NAMES: readonly string[];
/** white-positive symmetric differences; out.length === FEATURE_COUNT */
export function extract(p: PackedState, t: ThreatMaps, out: Int32Array): void;

// weights.ts
export const DEFAULT_W: Int32Array;              // centi-crystals, FEATURE_COUNT entries
export function loadWeights(json: unknown): Int32Array;
export function weightsHash(w: Int32Array): string;

// evaluate.ts
export const WIN = 1_000_000;
export function terminalScore(p: PackedState, ply: number): number | null;  // ±(WIN - ply), 0 for a draw
/** side-to-move relative: (white - black) * (p.side === 0 ? 1 : -1) */
export function evaluate(p: PackedState, t: ThreatMaps, w: Int32Array): number;
/** stage 1 = material+bank+income; stage 2 = +geometry; stage 3 = +threats.
 *  Returns early when a stage is already outside (alpha, beta) by MARGIN. */
export function evaluateLazy(p: PackedState, t: ThreatMaps, w: Int32Array, alpha: number, beta: number): number;
export const LAZY_MARGIN = 250;   // 2.5 crystals
```

The 28 features, each an integer white-minus-black difference. Every one is traceable to a recorded loss or
a measured fact; nothing is here because it sounded good.

| # | feature | definition | evidence |
|---:|---|---|---|
| 1 | `material` | Σ cost − present value of rent (γ=0.9, H=6) | EG G5/G18; a T3 held long costs ~20c of rent |
| 2 | `bankLiquid` | `min(bank, 8)` | SU §1.6 liquidity floor |
| 3 | `bankExcess` | `max(0, bank − 8)` | SU §8.4: the ratio is uncalibrated, so split the term and let Texel price it |
| 4 | `bankConvertible` | `min(bank, 5 × spawnCount)` | ET §5.6 |
| 5 | `incomeNow` | `Σ min(mining, reserve)` | `mining.ts:12-15` |
| 6 | `incomeH` | discounted income DP, H=6, γ=0.9, greedy relocation | EG G4; the archived cliff 38 → 9 in four turns |
| 7 | `oreUnderMiners` | `Σ min(reserve, 3×mining)` under own miners | SU §1.4 |
| 8 | `relocationDebt` | Σ AP to move each dry miner to the nearest square with `reserve ≥ 2×mining` | GR §6.7 treadmill |
| 9 | `upkeepDue` | `upkeep.ts:14-16` | archived Black: 54 upkeep on 175 gross |
| 10 | `runway` | `bank + Σγ^t(income_t − upkeep_t)`, H=6 | ET §5.7 |
| 11 | `insolvent` | 1 if `bank + nextIncome < upkeepDue` | `turn.ts:30-32` forced keep-set |
| 12 | `spawnCount` | `popcount(spawnMask)` | `spawning.ts:98-118` |
| 13 | `spawnOre` | Σ reserve inside the spawn mask | SU §6.1 |
| 14 | `zeroSpawnCliff` | 1 if `spawnCount === 0 && bank ≥ 3` | NK:9; census −8.53 |
| 15 | `anchorDepth` | max BFS depth of an unblocked anchor from own corner | archived D9 pivot: spawn 12 → 30 |
| 16 | `anchorFragility` | Σ over anchors of `minKill(anchor) ≤ 4 ∨ enemy can enter the rect in ≤ 4 AP incl. purchase` | NK:11; blocking-set-1 anchors |
| 17 | `infiltration` | our bodies inside their rectangles, weighted by anchors voided (corner = all) | NK:24 Tanka into B2 |
| 18 | `denial` | their bodies inside ours, same weighting | CA W7 under-prices this at −1.5/body |
| 19 | `hanging` | Σ value of own units inside `enemyStrike ∪ enemyStrikeIfBought`, scaled by whether the kill is affordable | F2/F3/F7/F10 |
| 20 | `threatening` | Σ value of enemy units inside our strike maps | symmetric |
| 21 | `killableNow` | Σ value of enemy units with `minKill ≤ actionsRemaining` | EG G3 |
| 22 | `cleaveExposure` | Σ over enemy tier≥2 units of `cleaveChain` | archived t14: Hono killed B9 then C8 |
| 23 | `homeSafetySelf` | `(4 − minTurnsToCorner(enemy))` clamped, + plug bonus, + rescuer-adjacent bonus | HOME_VICTORY 399/960 |
| 24 | `homeSafetyEnemy` | mirror | |
| 25 | `pstMine` | `Σ PST_MINE[def][reserve[sq]]` | SU addendum 3 |
| 26 | `pstCombat` | `Σ PST_COMBAT[def][sq]` | replaces `centerControl`, which pulls toward the zero-ore corridors (CA W16) |
| 27 | `drawPressure` | `(10 − clock) × sign(materialLead)` | EG G10; 20–62 % of scripted games draw |
| 28 | `elementCoverage` | 1 if we own (or can buy) a unit that one-shots their most common DEF-3/4 body, else 0 | SU §3.4.2 |

Removed on purpose: `centerControl` (points at the corridors), raw `mobility` (over-rewards option count in a
game rationed by four shared actions), `unitHealth` on base DEF (ignores `damageTaken`), `techTreeProgress`
(rewards climbing with rent free) — all four indicted in EG G15/G5.

**Everything is an integer.** Floats reintroduce platform-dependent rounding across the JS/WASM boundary and
make tuned weights unportable (ET §12.9); today's weights are floats (`src/ai/types.ts:73-88`).

---

#### `src/ai/hard/search/tt.ts`, `search/order.ts`, `search/quiesce.ts`, `search/pvs.ts`, `search/upkeep.ts`, `search/time.ts`

```ts
// tt.ts — two open-addressed tables in flat Uint32Arrays
export const enum Bound { EXACT = 0, LOWER = 1, UPPER = 2 }
export interface TT { keys: Uint32Array; data: Int32Array; bits: number; gen: number }
export function newTT(bits: number): TT;
export function probe(t: TT, lo: number, hi: number): number;   // -1 miss, else slot
export function store(t: TT, lo: number, hi: number, depth: number, score: number, bound: Bound, best: number): void;
export function ageTT(t: TT): void;
/** Mate scores are stored relative to the node and adjusted by ply on
 *  store/probe. The classic bug; today's flat VICTORY_SCORE = 100000
 *  (src/ai/evaluation.ts:21) has no ply adjustment at all. */
export function scoreToTT(score: number, ply: number): number;
export function scoreFromTT(score: number, ply: number): number;

// order.ts
export interface OrderState { killers: Int32Array; history: Int32Array }
export function orderCandidates(p: PackedState, lines: TurnLine[], n: number, ttBest: number, o: OrderState): void;

// quiesce.ts
/** A turn is tactical iff some minActionsToKill <= actionsRemaining for either
 *  side, or a home entry is available. No income inside quiescence: the boundary
 *  is applied but the economy features are frozen at the entry values. */
export function quiesce(p: PackedState, alpha: number, beta: number, ply: number, depth: number, ctx: SearchCtx): number;
export const QUIESCE_MAX_DEPTH = 3;   // 1 on mobile

// pvs.ts
export interface SearchCtx {
  cfg: SearchConfig; budget: SearchBudget; ttMacro: TT; ttTurn: TT;
  order: OrderState; threats: ThreatMaps; undo: UndoStack; stats: SearchStats;
  onProgress?: (depth: number, score: number, line: Int32Array, n: number) => void;
}
export interface SearchConfig {
  maxDepth: number; K: number; ttBitsMacro: number; ttBitsTurn: number;
  quiesceDepth: number; lmrMinRank: number; aspirationDelta: number;
  weights: Int32Array; gen: GenConfig; useBook: boolean; profile: 'desktop' | 'mobile' | 'lab';
}
export function pvs(p: PackedState, depth: number, alpha: number, beta: number, ply: number, ctx: SearchCtx): number;
export function iterate(p: PackedState, ctx: SearchCtx): { line: Int32Array; n: number; score: number; depth: number };

// upkeep.ts
/** Root-only. Enumerates affordable keep-sets exactly as upkeep.ts:34-55 does
 *  (exact to 12 rent-bearing units), searches each as a real branch to depth-1,
 *  and preserves any affordable home rescue (engine-v2.ts:67-75 does this today
 *  and it must not regress). */
export function chooseKeepSet(p: PackedState, ctx: SearchCtx): { keep: Int32Array; score: number };

// time.ts
export function turnBudgetMs(p: PackedState, t: ThreatMaps, profile: string): number;
export function shouldStartIteration(elapsed: number, budget: number, lastIterMs: number): boolean;
```

**PVS driver, with the exact constants:**
```
for depth d = 1 .. cfg.maxDepth:
    window = d <= 2 ? (-INF, +INF) : (s - 40, s + 40)     // aspirationDelta = 40 cc
    on fail high/low: widen x4, then x16, then full window
    root: candidates := generateTurns(p, cfg.gen); order by orderCandidates
    first candidate: full window; the rest: null window (alpha, alpha+1), re-search on fail-high
    LMR: reduce by 1 for rank > 6 when the candidate is quiet (tags === 0) and depth >= 3;
         NEVER reduce a force-injected candidate
    extensions: +1 ply when minTurnsToCorner(either side) <= 1, or when the move
                is a Cleave chain of length >= 2   (cap total extensions at 4)
    stop early when the best turn is unchanged for 3 iterations and |Δscore| < 50 cc
    never start iteration d+1 if elapsed > 0.45 * budget
    poll budget.exhausted() every 1024 nodes; every node calls budget.spend(1)
```
**Explicitly excluded: null-move pruning.** Income arrives unconditionally, upkeep is charged next turn
regardless, and the clock advances — passing is never free, so the no-zugzwang assumption fails in both
directions (`src/game/turn.ts:92-104`, ET §4.6). The substitute is the "mine only" candidate that the
generator always injects.

**Time management** (`time.ts`):
```
base = 3000
  × 1.5  if minTurnsToCorner <= 1 for either side
  × 1.3  if some killTable entry worth >= 800 cc is available to either side
  × 0.5  if generateTurns returned 1 candidate
  × 0.4  if the book hit
budget = clamp(base, 2000, 6000)          // desktop; see §6.4 for mobile
```
In fixed-work mode the wall clock is ignored entirely, exactly as `src/ai/engine-v2.ts:58` does today.

---

#### `src/ai/hard/api/hardEngine.ts`
```ts
export interface HardEngineOptions {
  seed: number;
  fixedWork?: number;               // deterministic lab/CI mode
  profile?: 'desktop' | 'mobile' | 'lab';
  weights?: Int32Array;
  maxDepth?: number;
}
export interface HardResult {
  turnActions: AIAction[];          // the WHOLE turn
  score: number;                    // centi-crystals, side-to-move relative
  depth: number;
  endKey: string;                   // Kpos hex of the chosen end position
  stats: SearchStats;               // reuses src/ai/runtime.ts:7-12
  bookHit: boolean;
  degraded: boolean;                // true if we fell back to depth 1
}
export class HardEngine {
  constructor(opts: HardEngineOptions);
  searchTurn(state: GameState, decisionMs: number): Promise<HardResult>;
  /** deterministic micro-benchmark; never called in fixedWork mode */
  static calibrate(): { evalsPerSecond: number; profile: 'desktop' | 'mobile' };
}
```
`searchTurn` **must** replay its own `turnActions` through the canonical `applyAction` before returning and
throw if any action is rejected or if the resulting state's side differs from the input's. That check costs
~0.58 µs per action (ET §1.4) and it is the single guarantee that the replica can never desync the real game.

---

### 3.2 `lab/hard-ai/` — the tooling

```
lab/hard-ai/
  tsconfig.json          extends ../../tsconfig.json, include ["**/*.ts","../../src/**/*.ts"], types node
  positions/
    corpus.ts            load/save; schema `muju-position-v1`
    openings.jsonl       the 797 census turn-1 end positions (from lab/experiments/opening-census-2026-09-14)
    midgame.jsonl        200 positions sampled from self-play, stratified by turn number
    authored.jsonl       10 hand-authored perft positions (see M1)
  perft/
    perft.ts             perftActions / perftTurns / perftMid over BOTH engines
    fixtures.json        frozen counts; the regression surface
    run.ts               CLI
  fuzz/
    differential.ts      canonical vs replica vs WASM
    run.ts               CLI
  suites/
    format.ts            .suite.json reader/writer, schema `muju-suite-v1`
    tactics.suite.json       ~60 cases
    spawn-strike.suite.json  ~20 cases authored from the logged games
    home-mate.suite.json     56 cases (lab/ai/fixtures.ts:13-33 = 28, x2 for attacker/defender framing)
    economy.suite.json       ~30 cases
    invariants.suite.json    20 negative cases, one per SU §7 invariant
    run.ts               CLI
  ladder/
    sprt.ts              pentanomial SPRT
    elo.ts               Elo with draws + LOS
    pairing.ts           seat-mirrored paired-seed scheduler
    engines.ts           engine registry (name -> factory + config hash)
    run.ts               CLI
  recall/
    run.ts               generator recall + regret
  bench/
    run.ts               throughput: evals/s, nodes/s, make/unmake/s, spawnMask/s
  bots/
    hard.ts              EngineBot adapter for lab/harness
  verify/
    gates.ts             milestone id -> command + pass predicate
    determinism.ts       fixed-work determinism, in-process and cross-process
    run.ts               `npm run hard:verify -- --gate M7`
```

New `package.json` scripts (additive; nothing existing changes):
```json
"hard:types":       "tsc -p lab/hard-ai/tsconfig.json --noEmit",
"hard:perft":       "node --import tsx lab/hard-ai/perft/run.ts",
"hard:fuzz":        "node --import tsx lab/hard-ai/fuzz/run.ts",
"hard:suite":       "node --import tsx lab/hard-ai/suites/run.ts",
"hard:ladder":      "node --import tsx lab/hard-ai/ladder/run.ts",
"hard:recall":      "node --import tsx lab/hard-ai/recall/run.ts",
"hard:bench":       "node --import tsx lab/hard-ai/bench/run.ts",
"hard:determinism": "node --import tsx lab/hard-ai/verify/determinism.ts",
"hard:verify":      "node --import tsx lab/hard-ai/verify/run.ts"
```
Note `npm test` runs `pretest` = `npm run ai:wasm` (`package.json:21-23`), so every gate that shells out to
vitest already rebuilds the WASM kernel.

---

## 4. The tooling in full detail

### 4.1 File formats

**Position corpus** — `lab/hard-ai/positions/*.jsonl`, one object per line:
```json
{"schema":"muju-position-v1","id":"mid-0147","tags":["midgame","pocket","upkeep"],
 "source":"selfplay:hard-ai-ladder-2026-09-20/games.jsonl#seed=91,ply=63",
 "state":{ /* a full GameState, exactly as src/game/types.ts:120-148 */ },
 "rules":{"actionsPerTurn":4,"blackCrystalHandicap":0,"elementGraph":"double-thick",
          "upkeep":"shipped","inactivityRule":"on","handicap":{"white":0,"black":0}}}
```
The `rules` block is mandatory: `setElementGraph`, `setCombatHandicap` and `setUpkeepVariant` are
process-global (`elements.ts:47`, `combat.ts:62-66`, `upkeep.ts:9-11`), and a position replayed under the
wrong knobs is a silently different game (RE §7.5).

**Suite** — `lab/hard-ai/suites/*.suite.json`:
```json
{"schema":"muju-suite-v1","name":"tactics","version":3,
 "cases":[{"id":"tac-014",
   "position":"midgame.jsonl#mid-0147",
   "best":["a41f...c0","9b02...17"],        // accepted Kpos hex of the END position; multiple allowed
   "avoid":["77de...02"],                    // optional
   "budget":{"fixedWork":200000},
   "points":1,
   "tags":["kill","purchase","retreat"],
   "rationale":"Gol at G2 kills the Sjor for 4c with 12 retreat squares; the 8c promotion line leaves retreat 0 (SU addendum 1).",
   "authoredFrom":"tests/fixtures/codex-claude-2026-09-12.json#rev7"}]}
```
**Scoring compares end-position Zobrist keys, never action sequences.** `move A then B` and `move B then A`
reach the same position (ET §1.4: 14,959 sequences for 797 end positions), so a sequence-based suite would be
measuring move order. A case passes when the engine's chosen turn's `Kpos` ∈ `best` and ∉ `avoid`.

**Ladder result directory** — `lab/results/hard-ai-ladder-<name>-<YYYY-MM-DD>/`:
- `manifest.json` — `{schema:"muju-hard-ladder-v1", engines:[{name, module, configHash, weightsHash}],
  work:{mode:"fixed"|"wall", fixedWork?, decisionMs?}, seeds:{base, pairs}, handicaps:[0,3],
  map:"UNEQUAL_ROUTES_MAP", rules:{...}, git, wasmSha256, node, device}`
- `games.jsonl` — `GameRecord` extended to `muju-lab-game-v3` (see §4.7)
- `pairs.jsonl` — `{seed, handicap, aAsWhite:{winner,winType}, aAsBlack:{...}, pairScore: 0|0.5|1|1.5|2}`
- `sprt.json` — `{elo0, elo1, alpha, beta, llr, upper, lower, decision:"H1"|"H0"|"continue", pairs, penta:[n0,n05,n1,n15,n2]}`
- `elo.json` — `{elo, lo95, hi95, los, drawRate, adjudicationRate, meanPairScore}`
- `summary.md` — human-readable

**Verify artifact** — `lab/results/hard-ai-verify-<YYYY-MM-DD>/M<n>.json`:
```json
{"gate":"M7","pass":true,"command":"npm run hard:recall -- --corpus midgame.jsonl --k 24",
 "criterion":"top1 >= 0.90 and regret_p90 <= 60",
 "metrics":{"top1":0.934,"top3":0.981,"regret_p50":0,"regret_p90":41,"positions":200},
 "git":"44c41c4","wasmSha256":"...","node":"v24.11.1","elapsedMs":184213,"at":"2026-09-20T09:11:03Z"}
```

### 4.2 Perft

```
npm run hard:perft -- --check
npm run hard:perft -- --freeze --position authored.jsonl#auth-03 --depth 2
```
Three counts, computed by **both** engines and compared with `fixtures.json`:
- `perftActions(pos, n)` — distinct complete legal action sequences of length ≤ n.
  **Frozen seed value: `perftActions(initial, 4) = 14,959`** (ET §8.1).
- `perftMid(pos)` — distinct mid-turn states. **Frozen: 1,053.**
- `perftTurns(pos, d)` — distinct end-of-turn positions after d macro plies. **Frozen: `perftTurns(initial, 1) = 797`.**

Ten authored positions in `authored.jsonl`, recorded from the canonical engine and then frozen, covering:
a home occupier present; a blocked spawn rectangle (zero spawn squares with cash); a Cleave chain available;
`inactivityPlies = 9`; `upkeepPending` with an unaffordable keep-set; a place phase that auto-skips; a
position with 40 crystals and a forward anchor (the 192-buy node, CA W11); a corner plug; a position where
the only legal reply is `RESIGN`-or-pass; a mid-game position at turn 12 with 16 units.

Pass criterion: **every count identical across canonical, replica and the frozen file.** A perft mismatch is
never a "tuning" difference; it is a bug.

### 4.3 Three-way differential fuzzing

```
npm run hard:fuzz -- --actions 100000              # normal test run
npm run hard:fuzz -- --actions 10000000 --nightly  # CI nightly
npm run hard:fuzz -- --surface prover --cases 20000
```
Three surfaces, because the three implementations do not all cover the same ground:

| surface | A | B | C | compared |
|---|---|---|---|---|
| transition | canonical `applyAction` (`simulate.ts:25`) | replica `make`/`unmake` (`core/apply.ts`) | — | 24-field digest + `Kpos` + `Kturn` after every action |
| legality | `isLegalAction` (`legality.ts:16-47`) | `core/apply.ts isLegal` | — | the full legal-action *set*, as a sorted multiset |
| target removal | JS prover (`homeCheckmate.ts:57`) | replica `tactics/home.ts` | WASM kernel (`assembly/tactics.ts:163`) | proof status, and every witness replayed through canonical `isLegalAction` |

The driver reuses the pattern already in `tests/game/properties.test.ts:10-23` (20 seeded random games,
500 plies, reducer-vs-search agreement, reserves never increase) plus `checkInvariants` from
`lab/harness/invariants.ts:21-75`. New assertions on top:
- `unmake(make(a)) === identity` on all 24 digest fields **and both Zobrist keys**;
- Zobrist recomputed from scratch equals the incrementally maintained key, every 64th node;
- crystal conservation `Σreserve + whiteGained + blackGained === 504` (`invariants.ts:55-59`);
- `atkCount[u] ≤ tier(u)` and `atkCount > 0 ⟹ lastAttackKilled` on the previous hit (`combat.ts:13-17`);
- `pieceAt[sq[u]] === u` and vice versa;
- `actions ∈ [0,4]`.

Every divergence is written to `lab/results/hard-ai-fuzz-<date>/divergence-<n>.json` with the seed, the ply,
the full action prefix and both states — a self-contained reproducer.

### 4.4 Fixed-work determinism

```
npm run hard:determinism
```
For 40 corpus positions × {fixedWork 20k, 200k} × {seed 1, 7}:
1. run three times in one process — identical `endKey`, `score`, `depth`, `stats.evaluations`,
   `stats.tacticalNodes`;
2. run once in a fresh `node` process — identical to (1);
3. run once with the WASM kernel absent (JS fallback path, `src/ai/worker/entry.ts:11-14`) — identical
   `endKey` and `score` (node counts may differ only if the kernels are declared non-equivalent; from M15
   they must match exactly).

Plus a static check: `grep -RnE 'Date\.now|performance\.now|Math\.random|crypto\.randomUUID' src/ai/hard/`
must return nothing outside `api/hardEngine.ts` (where `calibrate()` legitimately times) and the `SearchBudget`
injection point. Today's engine fails this — `mcts.ts:46,49`, `runtime.ts:17`, `board.ts:104` (CA W12), and
three identical Medium searches produced 9,247 / 10,415 / 10,640 candidates.

### 4.5 EPD-style suites

```
npm run hard:suite -- --suite tactics --work 200000
npm run hard:suite -- --all --work 200000 --out lab/results/hard-ai-suite-2026-09-21
```
Five suites:
1. **tactics** (~60) — generated by running `killcombo` over self-play positions and keeping turns that kill
   ≥ 800 cc of material; each case hand-checked, each with a `rationale` naming the SU section.
2. **spawn-strike** (~20) — authored from the logged games: NK:10 (bought Radi), the archived turn-3
   `BUY fire_1@I6` raid, NK:13's per-turn fresh-Hi raid, the D9 anchor pivot (spawn 12 → 30, four Mujus in
   one Place phase, income 14 → 25).
3. **home-mate** (56) — `lab/ai/fixtures.ts:13-33` gives 14 authored puzzles × a 180°-rotated mirror = 28
   (**28, not 30**; SU §8.11 rules the doc stale), each framed twice: "prove the rescue" and "prove the mate".
4. **economy** (~30) — positions where `PST_MINE` differences exceed 400 cc: relocation-treadmill turns, a
   Muju about to be bought onto a 4-stack (F4/F12), the promotion-versus-bank decision.
5. **invariants** (20 negative cases) — one per SU §7 invariant. Each case's `avoid` list contains the
   `Kpos` of every turn that violates the invariant; the engine passes by *not* choosing them. This is the
   regression net for the four recorded losses.

Suite scoring is reported as `points / total` per suite plus a per-tag breakdown. Suites are **not** SPRT
substitutes: they are fast, they localise regressions, and a suite win with a ladder loss means the suite is
wrong.

### 4.6 The ladder: seat-mirrored paired seeds, pentanomial SPRT

```
npm run hard:ladder -- --a hard-new --b aiv2-hard --work fixed:200000 --handicaps 0,3 --max-pairs 4000
npm run hard:ladder -- --a hard-new --b aiv2-hard --work wall:3000 --handicaps 0 --max-pairs 600
```

**Pairing** (`pairing.ts`). For seed `s` and handicap `h`, play the *same* seed twice: A-white/B-black and
B-white/A-black. That pair yields A's score ∈ {0, 0.5, 1, 1.5, 2}. Seat-mirroring is mandatory, not optional:
the first-player advantage is contested and instrument-dependent (SU §5.4 / §8.2 — `Aware:Rush` mirrors give
White 15/20 and Black 0/20 on both maps, while the June six-action `Rush` mirror found nothing), so an
unmirrored match measures the seat, not the engine. Both handicaps are run because the handicap census makes
Black's best first turn qualitatively different at 0, 3 and 4 (LH §4.3) and the engine's opening knowledge
must be keyed by it.

**SPRT** (`sprt.ts`), the standard normalised form with a pentanomial variance estimate:
```
score(elo)   = 1 / (1 + 10^(-elo/400))
t0 = score(elo0);  t1 = score(elo1)             // elo0 = 0, elo1 = 5, alpha = beta = 0.05
mu_hat  = mean over pairs of (pairScore / 2)     // in [0,1]
var_hat = variance over pairs of (pairScore / 2)  (unbiased; floor at 1e-9)
LLR = N * (t1 - t0) * (2*mu_hat - t0 - t1) / (2 * var_hat)
upper = log((1 - beta) / alpha) =  2.9444
lower = log(beta / (1 - alpha)) = -2.9444
decision: LLR >= upper -> accept H1 (the change is >= elo1)
          LLR <= lower -> accept H0 (the change is <= elo0)
          otherwise continue, up to --max-pairs, then "inconclusive"
```
The pentanomial pair-score variance (rather than a per-game win/loss variance) is what makes this tractable
here: **draws are the modal scripted outcome** — 20.4 → 23.6 % of four-action games, 59 % of the alternate-map
screen, 55–62 % of depth-economy, and `Balanced` vs `Turtle` drew 40/40 on all four maps (LH §5.12, SU §5.1) —
and a trinomial model wastes most of the information in a paired draw.

**Elo** (`elo.ts`): `elo = -400 * log10(1/mu_hat - 1)` with a 95 % interval from `sqrt(var_hat/N)` propagated
through the same transform, plus LOS `= Φ((mu_hat - 0.5)/sqrt(var_hat/N))`.

**Adjudication discipline.** Every ladder row reports `adjudicationRate`, and the gate criteria below all
require `adjudicationRate ≤ 0.01`. The reason is measured, not theoretical: SU's second addendum shows that
across `lab/results/` the material+bank cap-scorer would have handed **Black 232 of 235** material-tied
`alternate-map` games, and that the June `e3-first-player` numbers this project's docs quote are **94–96 %
adjudicated**. With `inactivityRule: 'on'` (the shipped rule) real runs are ≤ 0.03 % adjudicated, so the gate
is easy to meet and is an early-warning signal when it is not. `home-checkmate` must be counted as a rule
terminal, not folded into adjudication — it is 212 games in the committed corpus and is missing from
`lab/harness/types.ts:82-90`.

### 4.7 Harness changes required (all additive)

- `MatchOptions` (`lab/harness/types.ts:46-70`) gains `blackCrystalHandicap?: number` and
  `actionsPerTurn?: 4`, and `runner.ts:113` passes them to `createInitialGameState`
  (`src/game/board.ts:203`, which already accepts both). Without this, handicap experiments bypass the
  harness entirely (LH §1.8).
- `WinType` gains `'home-checkmate'` and `'timeout'`; both already flow straight through `runner.ts:154`
  from `VictoryReason` (`src/game/types.ts:116`).
- `GameRecord.schema` bumps to `'muju-lab-game-v3'` and gains `fixedWork`, `engineConfigHash`,
  `adjudicated: boolean`, `handicap`, and `adjudicationFormula: 'material+bank'` — SU's second addendum shows
  that *nothing* in the current record says which formula produced an `adjudication`, so adjudicated win
  rates are not comparable across eras. Fix it once.
- `lab/solver/model.ts:23` `ACTIONS = 6` is stale under the four-action ruleset (`rules.ts:9`). Either fix it
  or have every new caller pass the budget explicitly; every six-action `killFrontier` number in
  `lab/results/current-static` overstates assembleable damage (SU §8.12).
- `lab/harness/bots/index.ts` (`FACTORIES`, `:16-39`) gains `Hard-fixed-200k`, `Hard-wall-3000`,
  `Hard-mobile`. `tests/lab/harness.test.ts:125-131` asserts `botNames()`, so that test is updated in the
  same commit.

### 4.8 The bot adapter — `lab/hard-ai/bots/hard.ts`

```ts
import type { EngineBot } from '../../harness/types';
export interface HardBotOptions {
  work: { mode: 'fixed'; fixedWork: number } | { mode: 'wall'; decisionMs: number };
  profile?: 'desktop' | 'mobile' | 'lab';
  weights?: Int32Array;
  name?: string;
}
export function createHardBot(o: HardBotOptions): EngineBot;
```
It implements `EngineBot` (`lab/harness/types.ts:36-42`) and satisfies the three rules LH §1.8 names, but
with one structural difference from `lab/harness/bots/engine.ts`: because the engine searches a **whole turn**,
the bot caches the action list on the first `nextAction` of a turn (detected by
`` `${turnNumber}:${currentPlayer}:${phase}` ``) and then hands out one action per call, re-searching only if
the state diverges from the projection. That makes the fixed-work axis meaningful — one search per turn, one
`fixedWork` charge — where the shipped adapter spends a *fraction* of the turn budget per dispatch
(`bots/engine.ts:85-86`). A fresh engine instance per game, as `cli.ts:95-99` requires. Measured under
`legality: 'strict'`, and `illegalActions > 0` fails every gate.

### 4.9 Recall instrumentation

```
npm run hard:recall -- --corpus midgame.jsonl --k 24 --deep 2000 --depth 3
```
- **Cheap generator**: production `GenConfig` (K = 24, widths 6/4/3/2, 24 place plans).
- **Expensive generator**: K = 2,000, widths 40/16/8/4, 200 place plans, no budget cap.
- **Truth**: run the depth-3 PVS restricted to the expensive candidate set; the argmax turn's `Kpos` is the
  reference.
- **Metrics**: `top1` (reference key ∈ cheap set), `top3`, and `regret` = the depth-3 score gap between the
  best cheap candidate and the reference, in centi-crystals, reported at p50/p90/max.

Target ≥ 90 % top-1 (ET §3.5). This is the single most useful diagnostic in the project: a depth-7 search on
a 60 %-recall generator is capped no matter how deep it goes.

### 4.10 Bench

```
npm run hard:bench
```
Reports and gates: `evaluate` per second, `make`+`unmake` per second, `spawnMask` per second, `bfs` per
second, `generateTurns` per second, and the same four numbers for the canonical engine as a ratio. Baselines
to beat, all measured (ET §1.4): `evaluatePosition` 13,904/s, `applyAction` 1,716,741/s,
`generateAllActions` 193,909/s, `getAllSpawnPositions` 144,145/s.

### 4.11 The verifier's single command

```
npm run hard:verify -- --gate M9
npm run hard:verify -- --all
```
`lab/hard-ai/verify/gates.ts` is a table of `{id, dependsOn, command, artifact, criterion(metrics) => boolean,
description}`. `run.ts` executes the command with `execFileSync`, reads the artifact JSON, applies the
predicate, writes `lab/results/hard-ai-verify-<date>/M<n>.json`, prints one line, and **exits 1 on failure**.
A verifier agent needs to know nothing else.

---

## 5. Milestone DAG

Gates are mechanical. "Pass" is a predicate over a JSON artifact, never a judgement.

| id | title | dependsOn | deliverables | gate command | pass criterion | est. strength |
|---|---|---|---|---|---|---|
| **M1** | Perft fixtures and the position corpus | — | `lab/hard-ai/perft/*`, `positions/*`, `authored.jsonl` (10 positions), `fixtures.json` | `npm run hard:verify -- --gate M1` → `npm run hard:perft -- --check` | `perftActions(initial,4)===14959`, `perftMid===1053`, `perftTurns(initial,1)===797`, and all 10 authored positions match the frozen file; canonical-engine-only at this stage | 0 (enabling) |
| **M2** | Ladder, SPRT, Elo, bot adapter, determinism harness | M1 | `lab/hard-ai/ladder/*`, `bots/hard.ts` (wrapping `AIEngineV2` for now), `verify/*`, harness `MatchOptions`/`WinType`/`GameRecord v3` changes | `npm run hard:verify -- --gate M2` | (a) A-vs-A self-match of `AIv2-hard-fast` over 400 pairs at `fixedWork 200000` returns SPRT `H0` or `inconclusive` with `|elo| < 10`; (b) `adjudicationRate ≤ 0.01`; (c) `illegalActions === 0`; (d) `npm run hard:determinism` green on the existing engine in fixed-work mode | 0 (enabling) |
| **M3** | Whole-turn worker protocol 3 + `useAI` turn path | M2 | `src/ai/worker/protocol.ts` v3, `client.ts`, `handler.ts`, `entry.ts`, `src/hooks/useAI.ts` turn path + fallback; `tests/ai/worker.test.ts` extended | `npm run hard:verify -- --gate M3` | (a) `npm test` green; (b) e2e `e2e/ai-worker.spec.ts` green; (c) ladder `AIv2-hard (turn path)` vs `AIv2-hard (action path)` at `wall:3000`, 300 pairs: SPRT not `H0`, i.e. the turn path is **not worse**, and mean turn wall-clock ≤ the action path's | +30…60 |
| **M4** | Packed state, bitboards, Zobrist, make/unmake | M1 | `src/ai/hard/core/*`, `tables/*`, `lab/hard-ai/fuzz/*`, `bench/*` | `npm run hard:verify -- --gate M4` | (a) `npm run hard:fuzz -- --actions 1000000` zero divergences across transition + legality surfaces; (b) `npm run hard:perft -- --check --engine replica` matches the frozen file exactly; (c) round-trip `fromGameState`/`toGameState` property test green on the whole corpus; (d) `npm run hard:bench` shows `evaluate ≥ 500k/s` placeholder-eval and `spawnMask ≥ 5M/s`; (e) `npm run build` (root `tsc`) green | 0 (~50× enabler) |
| **M5** | Within-turn action search: canonical ordering + turn TT | M4 | `gen/actions.ts`, `gen/turnsearch.ts` (DFS only, no purchases yet), `search/tt.ts` | `npm run hard:verify -- --gate M5` | (a) canonical enumeration and naive enumeration produce **identical sets** of end-position keys on all 10 authored positions plus 50 corpus positions; (b) measured node reduction ≥ 10× on the initial position (target 14.2×); (c) fuzz still zero | 0 (enabler, folded into M9) |
| **M6** | Kill-combo table, threat maps, Cleave chains | M4 | `tactics/killcombo.ts`, `tactics/threat.ts`, `suites/tactics.suite.json`, `suites/spawn-strike.suite.json` | `npm run hard:verify -- --gate M6` | (a) `minActionsToKill` equals brute force on 5,000 randomly generated target positions (exhaustive ≤ 4-action search); (b) on the corner case it equals `homeCheckmate.ts:27-49` exactly; (c) `approachClass` equals `server/analysis/tactics.ts:272-291 approachTable` on 2,000 pairs; (d) tactics suite ≥ 0.85, spawn-strike ≥ 0.80 with a stub evaluator | +80…150 (with M9) |
| **M6b** | Home prover replica + checkmate gating proof | M4, M6 | `tactics/home.ts`, `suites/home-mate.suite.json`, vitest fixture for the SU §8.1 ordering | `npm run hard:verify -- --gate M6b` | (a) replica verdict equals `analyzeHomeDefense` on all 28 fixtures **and** on 20,000 fuzz positions with an occupier; (b) every witness replays legally through canonical `applyAction`; (c) the gated prover (run only when `needsCheckmateProof`) produces the identical game result as ungated on 100,000 fuzz actions; (d) the clock-vs-checkmate fixture asserts `victory/home-checkmate` at `inactivityPlies = 9` | included in M9 |
| **M7** | Candidate generator: purchases, promotions, recall meter | M5, M6 | `gen/purchases.ts`, `gen/promotions.ts`, full `gen/turnsearch.ts`, `lab/hard-ai/recall/*` | `npm run hard:verify -- --gate M7` | `npm run hard:recall -- --corpus midgame.jsonl --k 24 --deep 2000 --depth 3`: **top1 ≥ 0.90**, top3 ≥ 0.97, `regret_p90 ≤ 60` cc, over ≥ 200 positions; and zero generated actions rejected by canonical `isLegalAction` | +100…200 |
| **M8** | Evaluation v0 (integer, 12 of 28 features, staged) | M4 | `eval/features.ts`, `eval/weights.ts`, `eval/evaluate.ts` | `npm run hard:verify -- --gate M8` | (a) mirror symmetry: for every corpus position, `evaluate(p) === -evaluate(mirror180(p))` exactly (the map is 180°-symmetric, `resourceMap.ts:6-17`); (b) `evaluate ≥ 1,000,000/s` in `hard:bench`; (c) `evaluateLazy` never disagrees with `evaluate` about being outside `(alpha,beta)`, over 10^6 samples; (d) determinism green | 0 (enabler) |
| **M9** | ID-PVS + macro TT + ordering + quiescence — **ship gate 1** | M5, M6, M6b, M7, M8, M3 | `search/*`, `api/hardEngine.ts`, `lab/hard-ai/bots/hard.ts` real engine | `npm run hard:verify -- --gate M9` | (a) TT-on vs TT-off at fixed depth 3 returns the **same score** on 200 positions (exact alpha-beta property); (b) `hard:determinism` green; (c) ladder `Hard-new` vs `AIv2-hard` at **equal wall clock** (`wall:3000`), handicap 0 and 3, seat-mirrored pairs: SPRT accepts H1 at `elo1 = 100`, `adjudicationRate ≤ 0.01`, `illegalActions === 0`; (d) all five suites ≥ their M6/M8 baselines | **+200…350** |
| **M10** | UI rollout: `hard` switch, fallback, phone profile | M9 | `src/hooks/useAI.ts` difficulty routing, `HardEngine.calibrate`, `e2e/ai-worker.spec.ts` + a mobile-viewport e2e | `npm run hard:verify -- --gate M10` | (a) ladder `Hard-mobile` vs `AIv2-medium` at `wall:1500`: SPRT accepts H1 at `elo1 = 0`; (b) p95 turn latency ≤ 6,000 ms desktop profile and ≤ 3,000 ms mobile profile over 200 corpus turns; (c) depth-1 completes in ≤ 150 ms on the mobile profile in every corpus position (graceful degradation); (d) an injected worker failure falls back to `AIEngineV2` and the game completes (e2e) | 0 (ships M9) |
| **M11** | Evaluation v1: all 28 features | M9 | economy DP, spawn geometry, runway, draw clock, home safety, `PST_MINE` | `npm run hard:verify -- --gate M11` | (a) invariants suite ≥ 0.95 (it is the regression net for the four recorded losses); (b) economy suite ≥ 0.85; (c) ladder vs the M9 build at `fixed:200000`: SPRT accepts H1 at `elo1 = 5` | +120…220 |
| **M12** | Texel tuning on a v2.8 self-play corpus | M11 | `lab/hard-ai/tune/texel.ts`, a ≥ 200k-position labelled corpus, `weights-<date>.json` | `npm run hard:verify -- --gate M12` | (a) held-out 20 % log-loss strictly improves; (b) every tuned weight is an integer and `weightsHash` is recorded in the ladder manifest; (c) ladder tuned vs M11 at `fixed:200000`: SPRT accepts H1 at `elo1 = 5`. **The bank-vs-bodies ratio (EG G11) is set here and nowhere else** — SU §8.4 rules it uncalibrated | +60…120 |
| **M13** | LMR, aspiration, extensions, futility | M9 | `search/pvs.ts` refinements, each behind a config flag | `npm run hard:verify -- --gate M13` | each refinement SPRT'd **independently** at `fixed:200000` against the build without it, `elo1 = 5`; a refinement that fails is deleted, not kept "for later" | +40…80 |
| **M14** | df-pn forced-home module | M6b, M9 | `tactics/home.ts forcedHomeWin`, threat-space search over home threats | `npm run hard:verify -- --gate M14` | (a) proves/refutes forced home wins in ≤ 3 turns on 200 authored positions with zero false "proven" (checked by exhaustive search on a 50-position subset); (b) ladder vs M11 at `fixed:200000`: SPRT accepts H1 at `elo1 = 0` | +40…90 |
| **M15** | Opening book, keyed by handicap and 180°-canonicalised | M12 | `book/build.ts` (offline self-play + minimax backup), `book/probe.ts`, `public/book-v1.bin` | `npm run hard:verify -- --gate M15` | (a) every book move is legal and every book position's stored score is within 50 cc of a fresh depth-6 search on a 200-entry random sample; (b) the book is symmetric under the 180° rotation; (c) ladder book-on vs book-off at `wall:3000`: SPRT accepts H1 at `elo1 = 0`, and mean time-to-move in the first 3 turns drops | +30…70 |
| **M16** | AssemblyScript port of the two hot kernels | M12, M13 | `assembly/hard.ts` (ABI 7), `src/ai/hard/wasm/*` | `npm run hard:verify -- --gate M16` | (a) `npm run hard:fuzz -- --surface kernel --cases 1000000`: WASM and TS agree bit-for-bit on `(score, bestEndKey, nodes)`; (b) `hard:bench` shows ≥ 1.5× on the ported kernels; (c) ladder WASM vs TS at `wall:3000`: SPRT accepts H1 at `elo1 = 0`; (d) JS fallback path still green (`entry.ts:11-14`) | +30…60 |

**Critical path**: M1 → M2 → M4 → M5/M6 → M7 → M9 → M10.
**Parallelisable from day one**: M3 (worker/UI, no engine dependency beyond M2), M6 and M8 (independent of
each other, both need only M4), the five suites (need only M1), M6b (needs M4 + M6).

**Do not build**: endgame tablebases — the 100-cell reserve vector makes the state space infeasible and the
position class is rare (ET §11). **Do not build**: classical null-move — §3.1 `search/pvs.ts`.

---

## 6. Exposure

### 6.1 Lab bot adapter
`lab/hard-ai/bots/hard.ts` (§4.8), registered in `lab/harness/bots/index.ts:16-39` as `Hard-fixed-200k`,
`Hard-wall-3000`, `Hard-mobile`. Every ladder and suite run uses `legality: 'strict'` and treats
`illegalActions > 0` as a hard failure, not a counted divergence — the "as-shipped" mode
(`lab/harness/types.ts:57-61`) exists to measure the *old* engine's divergences and must not be used to
measure a new one.

### 6.2 Worker protocol 3
```ts
// src/ai/worker/protocol.ts
export const AI_PROTOCOL = 3;
export interface Identity { version: 3; gameId: string; requestId: number; revision: number; player: PlayerId }
export interface SearchRequest extends Identity {
  type: 'search';
  mode: 'action' | 'turn';          // NEW. 'action' is byte-compatible with protocol 2 behaviour
  state: GameState; difficulty: AIDifficulty;
  seed: number; decisionMs: number; fixedWork?: number;
  profile?: 'desktop' | 'mobile' | 'lab';   // NEW
}
export type SearchResponse = Identity & (
  | { type: 'result'; result: AIResult; warning?: string }
  | { type: 'progress'; depth: number; score: number; actions: AIAction[] }   // NEW
  | { type: 'error'; message: string }
);
export function sameRequest(a: Identity, b: Identity): boolean;
```
`AIResult` (`src/ai/types.ts:93-101`) gains `turnActions?: AIAction[]` and `endKey?: string`. Everything that
already works is preserved unchanged and is a requirement, not an option:
versioned identity with `sameRequest` filtering of stale responses (`protocol.ts:13-15`); `cancel()`
terminating the worker outright so even a wedged native call dies (`client.ts:20-23`); the
`max(2000, decisionMs + 2000)` watchdog that rejects retryably rather than resigning (`client.ts:43`);
request serialisation inside the worker so two searches never interleave on the same mutable WASM buffers
(`entry.ts:16-21`); per-`(gameId, player)` engine contexts cleared past two (`handler.ts:15-20`).

Added: **cooperative cancellation** — the search polls `budget.exhausted()` every 1,024 nodes and returns its
best-so-far line instead of being killed, mirroring the WASM kernel's `shouldStop()` every 128 nodes
(`assembly/tactics.ts:63-66`). `progress` messages let the UI show a depth counter and guarantee that a
cancel still yields a legal move.

### 6.3 UI difficulty `hard` and the fallback ladder
`useAI` routes on difficulty:
```
difficulty === 'hard'  -> mode 'turn',  HardEngine
otherwise              -> mode 'action', AIEngineV2   (today's loop, untouched)
```
The turn path dispatches `result.turnActions` one at a time through the existing commit-acknowledgement loop
(`useAI.ts:66-78`), revalidating each with `isLegalAction` before dispatch exactly as line 65 does now.

Four fallback triggers, in order of cheapness, each dropping to the per-action `AIEngineV2` loop for the
remainder of the turn and setting `warning`:
1. `turnActions` is empty or its first action is illegal;
2. the committed state's gameplay digest diverges from the projection (the check already at `useAI.ts:75-77`);
3. the worker returns `type: 'error'` or the watchdog fires;
4. `HardEngine` reports `degraded === true` twice in a row (the calibration says the device cannot reach
   depth 2 in the budget).

Nothing is deleted from `src/ai/engine-v2.ts`, `src/ai/planner/*`, `src/ai/search/*` or
`src/ai/evaluation.ts` until the new engine has held ship gate 1 (M9) and ship gate 2 (M10) for a release.
The dead surfaces EG G21 lists (`generateTemplatePlans` behind `templates: false`, `tacticalSharpen` reachable
only from the MCTS leaf, `getMinThinkingTime`, `estimateUnitValue`, `evaluateUnitPosition`, `scoreAction`)
are a separate, independent cleanup — not part of this critical path.

### 6.4 Graceful degradation on phones
`HardEngine.calibrate()` runs a fixed micro-benchmark at worker start: 50,000 `make`/`unmake` pairs plus
20,000 `evaluate` calls on a baked position, timed once. It is **never** called in fixed-work mode, so
determinism is untouched.

| profile | trigger | K | widths | maxDepth | quiesceDepth | budget clamp | book |
|---|---|---:|---|---:|---:|---|---|
| desktop | ≥ 1.5M evals/s | 24 | 6/4/3/2 | 8 | 3 | 2000–6000 ms | on |
| midrange | 0.4–1.5M | 16 | 5/3/2/2 | 6 | 2 | 1500–4000 ms | on |
| mobile | < 0.4M | 10 | 4/3/2/1 | 5 | 1 | 1200–2500 ms | off |

Iterative deepening is what makes this safe: a complete legal turn exists from depth 1 onward, so the budget
can be cut anywhere. M10's gate (c) measures the worst case directly — depth 1 must complete in ≤ 150 ms on
the mobile profile in every corpus position. ET §12.6 flags that real iPhone/Safari latency was never
calibrated ("WebKit on a Mac is not a real iPhone/Safari device measurement"); the depth claims in this
document are desktop-only until M10 runs on a real device, and the artifact records the device string.

### 6.5 AssemblyScript port strategy
Write everything in TypeScript first, with a state that is already WASM-shaped (`core/packed.ts`: no objects,
no strings, flat typed arrays, integer scores). Port only when the kernels stop changing — i.e. **after**
Texel (M12) and the search-refinement SPRTs (M13), because the marshalling boundary would otherwise be
crossed per node instead of per search.

Port order and shape:
1. **The within-turn action search + kill-combo DP.** Extend `assembly/tactics.ts` to **ABI 7**: keep the
   existing one-packed-input/one-packed-output pattern and the `shouldStop` import
   (`assembly/tactics.ts:32-33`, `src/ai/wasm/kernel.ts:26-29`), add a generic target (not just the corner),
   add a `2^18` "already failed at ≥ this action budget" table (the kernel has **no** transposition table
   today — `assembly/tactics.ts:79-140` is a pure DFS with an optimistic bound; ET §3.2 calls this the
   cheapest available win in existing code), and add the purchase and promotion axes.
2. **`evaluate` + `extract`.** One packed position in, one `Int32Array` of features out.

Never port: the outer PVS, the candidate generator, the book. Two existing defects to fix during the port:
the ABI marshalling is O(units²) in `attackedThisTurn` resolution (`src/ai/wasm/kernel.ts:63` calls
`units.findIndex` inside a loop) — acceptable once per search, unacceptable per node; and the catalogue and
power matrix must keep being rebuilt per call (`kernel.ts:42-53`) so the lab's element-graph and handicap
knobs stay honoured.

Every WASM witness keeps being replayed through canonical `isLegalAction`/`applyAction` with a throw on
divergence (`kernel.ts:78-82`). The JS fallback path stays (`entry.ts:11-14`) and stays gated.

---

## 7. Risks and their early-warning instruments

| # | risk | why it is real here | detector | trips at |
|---:|---|---|---|---|
| R1 | **Generator recall is too low**, capping everything above it | Macro-turns cannot be enumerated: 14,959 sequences on the *quietest* turn, > 4M by turn 3 (ET §1.4). Today's generator emits the top 2 squares per definition (`planner/placement.ts:37`) | `npm run hard:recall` (M7), run again after every generator change | top1 < 0.90 or regret_p90 > 60 cc |
| R2 | **Replica desync** — the fast engine plays a subtly different game | Two independent rule implementations; `applyAction` has non-obvious behaviour (rejected actions return identity, `simulate.ts:26`; place auto-skip, `:118-120`; the prover inside the transition, `:28-33`) | `hard:fuzz` on 3 surfaces + perft equality + the mandatory canonical replay in `searchTurn` | any divergence; nightly 10^7 actions |
| R3 | **Macro-TT hit rate is near zero**, so the TT is wasted memory | Reserves are in the key and deplete every turn (`mining.ts:25-28`) — chess-style transposition may simply not exist here | `hard:bench` reports macro-TT hit rate per depth | < 5 % ⇒ shrink the macro TT and give the memory to the within-turn table (ET §12.2) |
| R4 | **Alpha-beta is the wrong choice** and a tuned MCTS-with-eval would win | Argued from game properties (ET §4.9), not measured | the M9 ladder is engine-agnostic: run the shipped MCTS at the same wall clock as the control arm | if `Hard-new` cannot beat `AIv2-hard` by 100 Elo at M9, stop and re-run the comparison before building M11+ |
| R5 | **Draws swallow the signal** at strong play | 20–62 % of scripted games draw by inactivity (LH §5.12); `Balanced` vs `Turtle` drew 40/40 on all four maps | ladder `drawRate` in `elo.json`, every run | `drawRate > 0.5` ⇒ escalate the `drawPressure` weight to Texel and report the number to the design owner: it may be a *game* question, not an engine one |
| R6 | **Cap adjudication contaminates the ladder** | Measured: the June `e3-first-player` mirrors are 94–96 % adjudicated, and the material+bank scorer would hand Black 232 of 235 material-tied games (SU addendum 2) | `adjudicationRate` gate on every ladder run | > 0.01 ⇒ the run is void; raise `maxTurns` or fix the scorer, never reinterpret |
| R7 | **Seat confound** — measuring the first-player advantage instead of the engine | `Aware:Rush` mirrors: White 15/20, Black 0/20 on both maps (SU §5.4) | pairing is structurally seat-mirrored; `pairs.jsonl` records both seats per seed | a pair with only one seat recorded is a bug, not a datum |
| R8 | **Process-global rule knobs poison cached tables** | `setElementGraph` (`elements.ts:47`), `setCombatHandicap` (`combat.ts:62-66`), `setUpkeepVariant` (`upkeep.ts:9-11`) are module-global; `runner.ts:90-106` sets and resets them per game | `tablesIdentity()` asserted at the start of every search; the position corpus carries a mandatory `rules` block | mismatch ⇒ throw, never silently continue |
| R9 | **The 20,000-node checkmate prover inside the transition** blows the budget | `simulate.ts:28-33` runs it after *every* action; a line that parks a unit on a corner pays it per node (`homeCheckmate.ts:22`) | `hard:bench` reports prover calls per search; M6b gate (c) proves the gate preserves results | > 50 prover calls per search ⇒ the gate is wrong |
| R10 | **Floats leak back in** and tuned weights stop porting across JS/WASM | Today's weights are floats (`src/ai/types.ts:73-88`) | `hard:determinism` cross-process check + a lint test forbidding float literals in `eval/weights.ts` | any cross-process score difference |
| R11 | **Nondeterminism re-enters the search path** | Today: `Date.now()` in `mcts.ts:46,49`, `performance.now()` in `runtime.ts:17`, `crypto.randomUUID()` game ids, `Date.now()+Math.random()` unit ids (`board.ts:104`) | the grep test in §4.4 plus the three-run/fresh-process determinism check | any occurrence outside `calibrate()` |
| R12 | **Phone budget is a guess** | Real iPhone/Safari latency has never been calibrated (ET §12.6) | M10 gate (b)/(c), with the device string recorded in the artifact | p95 > 3,000 ms or depth-1 > 150 ms on the mobile profile |
| R13 | **Stale constants silently model the wrong game** | `lab/solver/model.ts:23 ACTIONS = 6` under a four-action ruleset; SU §8.12 lists map, price and schema numbers that are wrong in prose across the repo | a vitest assertion that every constant the hard engine reads agrees with `src/game/` (`ACTIONS === 4`, total ore `=== 504`, `MAX_RESOURCE_RESERVE === 16`, `UPKEEP_BY_TIER === {1:0,2:1,3:2}`, `INACTIVITY_LIMIT === 10`, T1 prices `3,3,4,4,5,5`) | any mismatch |
| R14 | **A suite win with a ladder loss** — the suites are teaching the engine the wrong thing | Suites are authored from n=1 game evidence; SU §9 lists what is genuinely unknown | every suite gate is *paired* with a ladder gate at the same milestone | suite up, ladder down ⇒ the suite case is wrong; fix the case, not the engine |
| R15 | **Over-promotion / rent blindness returns** | The single conclusive real game was decided by it (archived Black: 54 upkeep on 175 gross, resigned at 4 crystals / 2 income / 5 upkeep) | economy suite + the `runway` and `insolvent` features + a ladder telemetry row reporting mean `upkeepPaid / resourcesGained` per engine | the new engine's upkeep share exceeding 20 % |

---

## 8. What this design deliberately does not decide

- **The best White first turn.** Guide says H3 (n=1), the census says E6/F5 (+3.66/+3.56, static one-round
  index), the route screen says centre anchors lose to Rush on older maps (SU §8.3). The engine *searches*
  turn 1 with a threat model that includes Black's turn-2 purchases; the book (M15) is built from self-play
  after M12, not from any of those three sources.
- **The bank-versus-bodies ratio.** The eval currently prices a 17-crystal unit at ~25.6 against 17 banked
  crystals at ~8.5 (CA §2) — a 3× premium that is a guess. Features 2/3/4 split the quantity so Texel can
  price it; nothing here hand-sets it (SU §8.4).
- **Whether the 3/5/8 plant climb is strong or a raid magnet.** Untested (SU §8.6). `PST_MINE` encodes the
  arithmetic honestly (Sachakuna on a 16 is worth 7.05 for 17 crystals against a plain Muju's 11.59 for 5 —
  the climb is *tempo*, not income) and the economy suite measures whether the engine's choices win.
- **The J-log ruling on checkmate-versus-draw.** The code is authoritative for the engine (SU §8.1) and M6b
  freezes the observed ordering as a fixture; `SPEC.md:373-374` says the opposite and should be corrected,
  but that is a documentation task, not an engine one.

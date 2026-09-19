/**
 * Shared vocabulary for the hard engine (DESIGN §3.1). This module has no
 * imports: it is the bottom of the `src/ai/hard/**` layering (DESIGN §2), so
 * every other layer may depend on it.
 *
 * It carries three groups:
 *   1. the scalar aliases and score constants DESIGN §2 lists for `types.ts`
 *      (`Side`, `Square`, `DefId`, `Slot`, `Centi`, `Key`, `Result`, `Reason`);
 *   2. the `PackedState` slot/flag constants (`MAX_SLOTS`, `NO_SLOT`, `DEAD`,
 *      `MAX_TURN_ACTIONS`, `F_*`);
 *   3. the `PackedState` layout itself.
 *
 * DESIGN §3.1 prints groups 2 and 3 under a `// src/ai/hard/core/state.ts`
 * header. They live here instead because `core/action.ts` (this milestone,
 * DESIGN §3.2) takes `PackedState` in four of its six signatures while
 * `core/state.ts` does not land until M5 — and `types.ts` is precisely the
 * layer for vocabulary two modules share. `core/state.ts` MUST re-export
 * these names verbatim (`export { MAX_SLOTS, ... } from '../types'`;
 * `export type { PackedState } from '../types'`) so DESIGN §3.1's stated
 * export site stays exact. See `docs/hard-ai/design/DEVIATIONS.md` under M4.
 */

/** 0 = white, 1 = black (board.ts:175-177). */
export type Side = 0 | 1;
/** 0..99, `sq = y*10 + x` (movement.ts:232). */
export type Square = number;
/** 0..17, index into `UNIT_DEFINITIONS` order (units.ts:8-222). */
export type DefId = number;
/** 0..MAX_SLOTS-1. */
export type Slot = number;
/** Integer centi-crystals; 1 crystal = 100. */
export type Centi = number;

/** Two uint32 lanes. DESIGN §2 bans 64-bit integer types under `src/ai/hard/**`. */
export interface Key {
  lo: number;
  hi: number;
}

export const CC = 100;
export const WIN_CC = 1_000_000;
export const MATE_PLY_CC = 1_000;
export const DRAW_CC = 0;

export const Result = { ONGOING: 0, WHITE_WIN: 1, BLACK_WIN: 2, DRAW: 3 } as const;
export type Result = (typeof Result)[keyof typeof Result];

/** `src/game/types.ts:116` (`VictoryReason`) order, with 0 reserved for "no reason yet". */
export const Reason = {
  NONE: 0,
  ELIMINATION: 1,
  UPKEEP_ELIMINATION: 2,
  HOME_OCCUPATION: 3,
  HOME_CHECKMATE: 4,
  INACTIVITY: 5,
  RESIGNATION: 6,
} as const;
export type Reason = (typeof Reason)[keyof typeof Reason];

/** 100 squares bound live units; 7-bit slot ids (DESIGN F20). */
export const MAX_SLOTS = 128;
/**
 * Stride of the square-keyed pending-summon plane: `[side * PEND_STRIDE + sq]`.
 * Phasing allows at most ONE commitment per owner per square
 * (`hasPendingSummon`, summoning.ts:5-7), so a side's capacity is exactly the
 * 100 squares and the plane can never overflow.
 */
export const PEND_STRIDE = 100;
/** `pieceAt` sentinel. */
export const NO_SLOT = 255;
/** `sq` sentinel for a dead (reusable) slot. */
export const DEAD = 255;
/**
 * The capacity of a generated `Turn`'s action buffer, and the hard ceiling the
 * generator emits against.
 *
 * WHAT A GENERATED TURN HOLDS (M4, Phasing). Act: ≤4 actions + END_ACTION.
 * Upkeep: ≤1 PAY_UPKEEP. Prepare: the purchase plan's buys, ≤2 PROMOTEs
 * (`gen/generate.ts runFortifyPairs` — one ordinary promotion, or a FORTIFY
 * pair) and END_PLACE. `gen/purchase.ts PURCHASE_MAX_BODIES` caps a plan at
 * FOUR buys, so the longest turn this generator can emit is
 * `4 + 1 + 1 + 4 + 2 + 1 = 13` actions and 24 leaves ample headroom.
 *
 * THE FOUR-BUY CONTRACT IS THE GENERATOR'S, NOT THE RULES'. Under Phasing a BUY
 * takes no board slot, so the RULES bound a Prepare's purchases only by the
 * bank: a rich side may legally buy more bodies in one turn than any plan this
 * generator writes, and `verify/replay.ts` accepts such a turn from anywhere
 * else. What is bounded here is what `gen/**` PROPOSES. Raising
 * `PURCHASE_MAX_BODIES` above 18 — not a number any profile is near — would be
 * the first change that also has to move this constant. See
 * `docs/hard-ai/phasing/M4-STATUS.md`.
 */
export const MAX_TURN_ACTIONS = 24;

/** `uflags` bits. `F_PLACED` survives Phasing only as the `placedThisTurn`
 * MIRROR for `pack`/`unpack`: a Phasing arrival is created with
 * `placedThisTurn: false` (summoning.ts:29-30), so `make` never sets it. */
export const F_CAN_ACT = 1;
export const F_LAST_KILLED = 2;
export const F_PLACED = 4;
export const F_PROMOTED = 8;
/** Every `uflags` bit set: the Zobrist `uflags` plane is indexed 0..UFLAGS_MASK. */
export const UFLAGS_MASK = F_CAN_ACT | F_LAST_KILLED | F_PLACED | F_PROMOTED;

/**
 * The packed macro/mid-turn position (DESIGN §3.1). Struct-of-arrays, slot
 * indexed; dead slots are reused on BUY (lowest dead index).
 *
 * `attackedThisTurn` is deliberately absent: RE §1.7a proves it redundant
 * with `atkCount` + `F_LAST_KILLED` in every reachable state. `hasMoved` /
 * `hasAttacked` are absent because no rule reads them (RE §1.5).
 */
export interface PackedState {
  // --- units (struct-of-arrays, slot-indexed) ---
  /** [MAX_SLOTS] 0..99 or `DEAD`. */
  sq: Uint8Array;
  /** [MAX_SLOTS] 0..17. */
  defId: Uint8Array;
  /** [MAX_SLOTS] 0 | 1. */
  owner: Uint8Array;
  /** [MAX_SLOTS] 0..4 (max DEF 5 = metal_3; RE §1.7b). */
  damage: Uint8Array;
  /** [MAX_SLOTS] 0..3 (combat.ts:8-17). */
  atkCount: Uint8Array;
  /** [MAX_SLOTS] `F_CAN_ACT | F_LAST_KILLED | F_PLACED | F_PROMOTED`. */
  uflags: Uint8Array;
  /** High-water mark of used slots. */
  slotCount: number;
  /**
   * [MAX_SLOTS] the slot's rank in canonical `board.units` (M2-STATUS §2.6).
   *
   * A slot is a HANDLE, not an identity: `pack` hands out slot `i` to
   * `board.units[i]`, but an arrival reuses the lowest DEAD slot, so after one
   * death-and-arrival the two orders part company. Canonical appends arrivals to
   * `board.units` in `pendingSummons` order (`summoning.ts:24`) and removes with
   * `filter`, which preserves the survivors' relative order — so canonical order
   * is a per-unit BIRTH SEQUENCE and nothing else. That sequence lives here,
   * assigned by `pack` from the array index and by `resolveArrivals` from
   * `pendOrd`, restored byte-for-byte by `unmake`, and read by every
   * ORDER-SENSITIVE consumer (`tactics/prover.ts buildOwned`, `unpack`).
   *
   * Only meaningful for a LIVING slot; a dead slot keeps its stale value until
   * an arrival overwrites it (and `unmake` puts the stale value back).
   */
  ord: Int32Array;
  /** The next birth sequence number; `unmake` restores it. */
  ordNext: number;
  /** [100] slot or `NO_SLOT`. */
  pieceAt: Uint8Array;

  // --- occupancy bitboards, always consistent with sq/pieceAt ---
  /** [4] all units. */
  occ: Uint32Array;
  /** [8] lanes 0..3 white, 4..7 black. */
  occBy: Uint32Array;
  /** [12] lanes 0..3 tier1, 4..7 tier2, 8..11 tier3 (both sides). */
  occTier: Uint32Array;

  // --- pending summons (Phasing; DESIGN M2 item B) ---
  /**
   * [2 * PEND_STRIDE] indexed `[side * 100 + sq]`: `0` = no commitment, else
   * `defId + 1`. Square-keyed, exactly like everything else the replica hashes,
   * so buy ORDER never shows through and one commitment per owner per square is
   * enforced by the representation rather than by a check.
   */
  pendDef: Uint8Array;
  /** [2 * PEND_STRIDE] the exact cost paid, refunded verbatim on disruption. */
  pendCost: Uint8Array;
  /**
   * [2 * PEND_STRIDE] the commitment's rank in canonical `pendingSummons`
   * (M2-STATUS §2.6). `applyBuyUnit` APPENDS (`simulate.ts:131`) and
   * `resolveSummons` REMOVES with `filter` (`summoning.ts:22`), so canonical
   * pending order is a commit sequence — which the square-keyed plane above
   * cannot express on its own. `resolveArrivals` consumes it to decide the order
   * arrivals take in `board.units`; nothing in the RULES reads it (every
   * commitment is judged against the same snapshot).
   *
   * One global sequence for both sides, exactly like the single canonical array.
   */
  pendOrd: Int32Array;
  /** The next commit sequence number; `unmake` restores it. */
  pendOrdNext: number;
  /** [8] lanes 0..3 white, 4..7 black — squares carrying a commitment. */
  pendBB: Uint32Array;
  /** [2] `popcount(pendBB[side])`. */
  pendCount: Uint8Array;
  /** [2] `Σ pendCost` per side. */
  pendCostSum: Int32Array;

  // --- board ---
  /** [100] 0..16 (resourceMap.ts:5). */
  reserve: Uint8Array;
  /** [100] for the conservation invariant (lab/harness/invariants.ts:55-59). */
  initialReserve: Uint8Array;

  // --- players ---
  /** [2] crystals in hand. */
  bank: Int32Array;
  /** [2] cumulative `resourcesGained`. */
  gained: Int32Array;

  // --- turn ---
  side: Side;
  /** 0 = place, 1 = action. */
  phase: 0 | 1;
  /** 0..4 actions remaining. */
  actions: number;
  turnNumber: number;
  upkeepPending: 0 | 1;
  /**
   * `inactivityPlies`, 0..`INACTIVITY_LIMIT` (`src/game/inactivity.ts`, mirrored
   * by `core/state.ts`). 20 under `muju-phasing-2`; a plain `number`, never
   * bit-packed anywhere, so widening the range costs no layout change.
   */
  clock: number;
  /** `progressThisTurn`. */
  progress: 0 | 1;

  // --- rules (DESIGN F5) ---
  /** `blackCrystalHandicap`, 0..20. */
  handicap: number;
  /** `victoryRule !== 'elimination'` (turn.ts:23, homeCheckmate.ts:173). */
  victoryHome: 0 | 1;
  /** `inactivityRule !== 'off'` (inactivity.ts:8). */
  drawRuleOn: 0 | 1;
  /** [2] `state.reviewUpkeep?.[player]` (turn.ts:32). */
  reviewUpkeep: Uint8Array;

  // --- terminal ---
  result: Result;
  reason: Reason;

  // --- hashing (incremental) ---
  kposLo: number;
  kposHi: number;
  kturnLo: number;
  kturnHi: number;
  occHash: number;
  catalogSignature: number;

  // --- incremental sums (stage 0) ---
  /** [2] Σ material prior per side (updated on BUY/PROMOTE/kill/release). */
  materialCc: Int32Array;
  /** [2] Σ `PST_MINE[def][reserve[sq]]` per side (updated on MOVE/BUY/kill/income). */
  pstSumCc: Int32Array;

  // --- search flags ---
  /** 0 off, 1 bound, 2 full (DESIGN §5.9). */
  proverMode: 0 | 1 | 2;

  // --- cold data: never read inside the search ---
  /** slot -> canonical unit id for units present at pack time. */
  originIds: string[];
  /**
   * `[side * PEND_STRIDE + sq]` -> the ROOT position's `PendingSummon.id`, for
   * `unpack` fidelity only. `make` never invents one (DESIGN M2 item G).
   */
  pendIds: string[];
}

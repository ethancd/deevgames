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
 * 1 keep-set + ≤4 buys + ≤8 promos + END_PLACE + ≤4 actions + END_ACTION = 19,
 * with headroom.
 *
 * M2 note: under Phasing a BUY takes no slot, so the number of purchases in one
 * Prepare is bounded by the bank rather than by the board — a rich side can
 * exceed 24 half-actions in a turn. This constant is only read by `gen/**`,
 * which M2 leaves on Standard semantics (DESIGN M2 item H); raising it belongs
 * with the turn generator's own milestone, where the buffers it sizes live.
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
  /** `inactivityPlies` 0..10 (inactivity.ts:3). */
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

/**
 * The packed replica of the canonical rules engine (DESIGN §3.1, §3.4, §4.4).
 *
 * PHASING ONLY as of M2. There is no ruleset bit and no dual mode: `pack`
 * REFUSES any state that is not `ruleset: 'phasing'` (a missing ruleset means
 * Standard, `rules.ts:4`), because a Standard position reinterpreted as Phasing
 * would be a different game with the same bytes.
 *
 * `Replica` is a byte-for-byte mirror of `src/game` + `src/ai/simulate.ts`
 * over `PackedState`:
 *
 *   - `pack`/`unpack` cross the boundary in both directions;
 *   - `isLegal` reproduces `legality.ts:16-47`;
 *   - `genActions`/`genPlace`/`genKeepSets` reproduce `src/ai/moves.ts`
 *     `generateAllActions` (expanded to multi-action MOVEs, DESIGN §4.4);
 *   - `make`/`unmake` reproduce `applyAction` (`simulate.ts:25`) — including
 *     the five rule terminals and Phasing's split turn boundary — while
 *     maintaining the incremental `Kpos`/`Kturn`/`occHash` keys and the
 *     `materialCc`/`pstSumCc` stage-0 sums, and while allocating nothing per
 *     node.
 *
 * The Phasing turn (`docs/PHASING-2026-09-16.md`; `turn.ts`, `summoning.ts`):
 * the mover starts in ACT; `END_ACTION` collects mining income and settles
 * upkeep, sets `phase = place` (Prepare) and does NOT hand off; in Prepare a
 * `BUY` debits the bank and records a public commitment instead of placing a
 * unit, and never auto-advances the phase; `END_PLACE` is the hand-off, and the
 * incoming side's own commitments resolve against ONE snapshot of the arrival
 * board — each one either materialises (and may act AND promote that turn) or
 * refunds its exact cost.
 *
 * Everything is keyed BY SQUARE (DESIGN F10 §3.3), so a slot is nothing but a
 * handle: buy-order permutations transpose, and `digest` — the fuzzer's
 * comparison surface — is slot-order independent by construction. Pending
 * summons are square-keyed for the same reason (DESIGN M2 item B).
 *
 * The home-checkmate gate is fully packed as of M10: `make` calls
 * `tactics/prover.ts` — `homeVerdict` at `proverMode = 2`, the admissible
 * `damageBound` alone at `proverMode = 1` (DESIGN §3.4). The canonical
 * `analyzeHomeDefense` survives only as M10's differential gate, so `make`
 * no longer unpacks anything. See `docs/hard-ai/design/DEVIATIONS.md` under
 * M5 and M10.
 *
 * NOTE (M2 scope): `tactics/prover.ts` still implements the STANDARD rescue
 * (upkeep keep-sets and pre-action promotions), while canonical Phasing gives
 * the defender its present army and four actions only (`homeCheckmate.ts:152`).
 * The GATE — Prepare, no upkeep pending — is Phasing here; the VERDICT is a
 * later milestone's job.
 */
import {
  CC,
  DEAD,
  F_CAN_ACT,
  F_LAST_KILLED,
  F_PLACED,
  F_PROMOTED,
  MAX_SLOTS,
  NO_SLOT,
  PEND_STRIDE,
  Reason,
  Result,
  UFLAGS_MASK,
  type PackedState,
  type Side,
  type Slot,
  type Square,
} from '../types';
import type { GameState, PendingSummon, PlayerId, Unit, Cell } from '../../../game/types';
import { INITIAL_RESOURCE_LAYERS } from '../../../game/board';
import { MAX_RESOURCE_RESERVE } from '../../../game/resourceMap';
import { getAttackCount } from '../../../game/combat';
import {
  INACTIVITY_LIMIT as CANONICAL_INACTIVITY_LIMIT,
  INACTIVITY_WARNING as CANONICAL_INACTIVITY_WARNING,
} from '../../../game/inactivity';
import { HomeVerdict, PROOF_NODES, damageBound, homeVerdict, needsProof } from '../tactics/prover';
import { Scratch, bbCount, bbHas, bbNew, bbNext, bbZero } from './bits';
import { ADJ_LIST, BOARD, CORNER } from './tables';
import { DEF_ID, DEF_INDEX, activeCatalog, powerIndex, type Catalog } from './catalog';
import {
  AKind,
  KEEP_SET_CAPACITY,
  keepSetAdd,
  keepSetHas,
  keepSetReset,
  paA,
  paMake,
  paB,
  paC,
  paKind,
  unitIdFor,
  type KeepSetTable,
  type PA,
} from './action';
import {
  Z,
  recomputeKpos,
  recomputeKturn,
  recomputeOccHash,
  zActions,
  zAtkCount,
  zBankHi,
  zBankLo,
  zClock,
  zDamage,
  zPend,
  zPiece,
  zReserve,
  zUflags,
} from './zobrist';
import { createDistanceCache, moveCost, type DistanceCache, type ReachMemo } from './movement';
import { isLegalSpawn, newSpawnInfo, spawnInfo, type SpawnInfo } from './spawn';
import { PST_MINE, RENT_PV, RESERVE_VALUES } from './income';

export { DEAD, F_CAN_ACT, F_LAST_KILLED, F_PLACED, F_PROMOTED, MAX_SLOTS, MAX_TURN_ACTIONS, NO_SLOT, PEND_STRIDE } from '../types';
export type { PackedState } from '../types';

/**
 * `resolveInactivityDraw` fires at this many quiet plies. NOT a second copy of
 * the rule: it IS the canonical `src/game/inactivity.ts` export, re-exported
 * under the replica's name so the packed engine cannot drift from the rules it
 * replicates. Under `muju-phasing-2` (preregistration amendment A4) it is 20.
 */
export const INACTIVITY_LIMIT = CANONICAL_INACTIVITY_LIMIT;
/**
 * `inactivityPlies` is clamped into the Zobrist `clock` plane's domain
 * (DESIGN §3.1). The domain is exactly `0..INACTIVITY_LIMIT`: the draw resolves
 * the moment the clock REACHES the limit, so no reachable position carries a
 * higher value and the clamp is unobservable.
 */
export const MAX_CLOCK = INACTIVITY_LIMIT;
/**
 * The canonical in-game warning threshold (`INACTIVITY_WARNING`), three plies
 * short of the draw. `eval/invariants.ts` bit 16 — "sitting on a lead while the
 * draw clock runs" — reads it instead of the literal it used to carry, so the
 * invariant keeps its three-ply meaning at any limit.
 */
export const INACTIVITY_WARNING = CANONICAL_INACTIVITY_WARNING;
/** `getActionsPerTurn` is frozen at 4 for every current-rule match (rules.ts:11-13). */
export const ACTIONS_PER_TURN = 4;

const PLAYER_OF_SIDE: readonly PlayerId[] = ['white', 'black'];

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackError';
  }
}

export interface Undo {
  w: Int32Array;
  top: number;
}

/**
 * DESIGN §3.4: one `Int32Array(8192)` per search, with a stack pointer.
 *
 * M2 note: `END_PLACE` is now the widest record — ELEVEN words per resolved
 * commitment (nine, plus the reused dead slot's stale `ord` and the
 * commitment's own `pendOrd`) plus `resetUnitActions`'s four per healed unit. A
 * side can hold at most 100 commitments and 100 units, so the worst case is
 * ~1,510 words, and a
 * line that stacked several of those without unwinding would overflow. Every
 * current driver either unwinds in lock step (the search) or resets `top` per
 * applied action (the fuzzer, `unpack` tooling); real commitment counts are a
 * handful. Revisit the bound if a caller ever holds many macro turns at once.
 */
export const UNDO_WORDS = 8192;

export function newUndo(): Undo {
  return { w: new Int32Array(UNDO_WORDS), top: 0 };
}

/**
 * Undo record kinds: the seven action kinds reuse their `AKind` value.
 *
 * Standard's `U_HOME_MATE` record — the `END_ACTION` that `simulate.ts:28-31`
 * adjudicated BEFORE the boundary ran — is gone. Under Phasing that pre-check
 * is dead code: `resolveHomeCheckmate` returns the state untouched whenever
 * `turn.phase !== 'place'` (`homeCheckmate.ts:170`), and `END_ACTION` is legal
 * only in ACT. The mate now falls out of the ordinary `resolveHomeCheckmate`
 * call at the END of `makeEndAction`, once the phase has become Prepare.
 */

export function allocState(): PackedState {
  return {
    sq: new Uint8Array(MAX_SLOTS).fill(DEAD),
    defId: new Uint8Array(MAX_SLOTS),
    owner: new Uint8Array(MAX_SLOTS),
    damage: new Uint8Array(MAX_SLOTS),
    atkCount: new Uint8Array(MAX_SLOTS),
    uflags: new Uint8Array(MAX_SLOTS),
    slotCount: 0,
    ord: new Int32Array(MAX_SLOTS),
    ordNext: 0,
    pieceAt: new Uint8Array(BOARD).fill(NO_SLOT),
    occ: new Uint32Array(4),
    occBy: new Uint32Array(8),
    occTier: new Uint32Array(12),
    pendDef: new Uint8Array(2 * PEND_STRIDE),
    pendCost: new Uint8Array(2 * PEND_STRIDE),
    pendOrd: new Int32Array(2 * PEND_STRIDE),
    pendOrdNext: 0,
    pendBB: new Uint32Array(8),
    pendCount: new Uint8Array(2),
    pendCostSum: new Int32Array(2),
    reserve: new Uint8Array(BOARD),
    initialReserve: new Uint8Array(BOARD),
    bank: new Int32Array(2),
    gained: new Int32Array(2),
    side: 0,
    phase: 1,
    actions: ACTIONS_PER_TURN,
    turnNumber: 1,
    upkeepPending: 0,
    clock: 0,
    progress: 0,
    handicap: 0,
    victoryHome: 1,
    drawRuleOn: 1,
    reviewUpkeep: new Uint8Array(2),
    result: Result.ONGOING,
    reason: Reason.NONE,
    kposLo: 0,
    kposHi: 0,
    kturnLo: 0,
    kturnHi: 0,
    occHash: 0,
    catalogSignature: 0,
    materialCc: new Int32Array(2),
    pstSumCc: new Int32Array(2),
    proverMode: 2,
    originIds: [],
    pendIds: [],
  };
}

export function copyState(dst: PackedState, src: PackedState): void {
  dst.sq.set(src.sq);
  dst.defId.set(src.defId);
  dst.owner.set(src.owner);
  dst.damage.set(src.damage);
  dst.atkCount.set(src.atkCount);
  dst.uflags.set(src.uflags);
  dst.ord.set(src.ord);
  dst.pieceAt.set(src.pieceAt);
  dst.occ.set(src.occ);
  dst.occBy.set(src.occBy);
  dst.occTier.set(src.occTier);
  dst.pendDef.set(src.pendDef);
  dst.pendCost.set(src.pendCost);
  dst.pendOrd.set(src.pendOrd);
  dst.pendBB.set(src.pendBB);
  dst.pendCount.set(src.pendCount);
  dst.pendCostSum.set(src.pendCostSum);
  dst.reserve.set(src.reserve);
  dst.initialReserve.set(src.initialReserve);
  dst.bank.set(src.bank);
  dst.gained.set(src.gained);
  dst.reviewUpkeep.set(src.reviewUpkeep);
  dst.materialCc.set(src.materialCc);
  dst.pstSumCc.set(src.pstSumCc);
  dst.slotCount = src.slotCount;
  dst.ordNext = src.ordNext;
  dst.pendOrdNext = src.pendOrdNext;
  dst.side = src.side;
  dst.phase = src.phase;
  dst.actions = src.actions;
  dst.turnNumber = src.turnNumber;
  dst.upkeepPending = src.upkeepPending;
  dst.clock = src.clock;
  dst.progress = src.progress;
  dst.handicap = src.handicap;
  dst.victoryHome = src.victoryHome;
  dst.drawRuleOn = src.drawRuleOn;
  dst.result = src.result;
  dst.reason = src.reason;
  dst.kposLo = src.kposLo;
  dst.kposHi = src.kposHi;
  dst.kturnLo = src.kturnLo;
  dst.kturnHi = src.kturnHi;
  dst.occHash = src.occHash;
  dst.catalogSignature = src.catalogSignature;
  dst.proverMode = src.proverMode;
  dst.originIds.length = 0;
  for (let i = 0; i < src.originIds.length; i++) {
    const id = src.originIds[i];
    if (id !== undefined) dst.originIds[i] = id;
  }
  dst.originIds.length = src.originIds.length;
  dst.pendIds.length = 0;
  for (let i = 0; i < src.pendIds.length; i++) {
    const id = src.pendIds[i];
    if (id !== undefined) dst.pendIds[i] = id;
  }
  dst.pendIds.length = src.pendIds.length;
}

// --- incremental hashing -----------------------------------------------------

/** XOR a `Kpos` component; `Kturn` = `Kpos` ⊕ extras, so it moves too. */
function xKpos(p: PackedState, table: Uint32Array, index: number): void {
  const lo = table[index];
  const hi = table[index + 1];
  p.kposLo = (p.kposLo ^ lo) >>> 0;
  p.kposHi = (p.kposHi ^ hi) >>> 0;
  p.kturnLo = (p.kturnLo ^ lo) >>> 0;
  p.kturnHi = (p.kturnHi ^ hi) >>> 0;
}

/** XOR a `Kturn`-only extra (phase, actions, atkCount, uflags). */
function xKturn(p: PackedState, table: Uint32Array, index: number): void {
  p.kturnLo = (p.kturnLo ^ table[index]) >>> 0;
  p.kturnHi = (p.kturnHi ^ table[index + 1]) >>> 0;
}

/** `recomputeKpos` clamps a negative bank to 0; the incremental path must agree. */
function bankKeyValue(bank: number): number {
  return bank < 0 ? 0 : bank;
}

function setBank(p: PackedState, side: Side, value: number): void {
  const before = bankKeyValue(p.bank[side]);
  const after = bankKeyValue(value);
  if (before !== after) {
    xKpos(p, Z.bankLo, zBankLo(side, before));
    xKpos(p, Z.bankHi, zBankHi(side, before));
    xKpos(p, Z.bankLo, zBankLo(side, after));
    xKpos(p, Z.bankHi, zBankHi(side, after));
  }
  p.bank[side] = value;
}

function setClock(p: PackedState, value: number): void {
  const clamped = value > MAX_CLOCK ? MAX_CLOCK : value;
  if (clamped === p.clock) return;
  xKpos(p, Z.clock, zClock(p.clock));
  xKpos(p, Z.clock, zClock(clamped));
  p.clock = clamped;
}

function setActions(p: PackedState, value: number): void {
  if (value === p.actions) return;
  xKturn(p, Z.actions, zActions(p.actions));
  xKturn(p, Z.actions, zActions(value));
  p.actions = value;
}

function setPhase(p: PackedState, value: 0 | 1): void {
  if (value === p.phase) return;
  xKturn(p, Z.phase, 0);
  p.phase = value;
}

/**
 * `progressThisTurn`, a `Kturn` extra (`core/zobrist.ts`'s `progress` plane).
 *
 * It is hashed because under Phasing nothing else in `Kturn` implies it: the
 * capture that sets it leaves `atkCount`/`uflags` evidence on the killer, and
 * that killer can be RELEASED by `PAY_UPKEEP` in the same turn's Prepare, so two
 * reachable Prepare states can agree on every other key component and still hand
 * off with different inactivity clocks. Every write goes through here.
 */
function setProgress(p: PackedState, value: 0 | 1): void {
  if (value === p.progress) return;
  xKturn(p, Z.progress, 0);
  p.progress = value;
}

function setSide(p: PackedState, value: Side): void {
  if (value === p.side) return;
  xKpos(p, Z.side, 0);
  p.side = value;
}

function setUpkeepPending(p: PackedState, value: 0 | 1): void {
  if (value === p.upkeepPending) return;
  xKpos(p, Z.upkeep, 0);
  p.upkeepPending = value;
}

function setReserve(p: PackedState, s: Square, value: number): void {
  const before = p.reserve[s];
  if (before === value) return;
  xKpos(p, Z.reserve, zReserve(s, before));
  xKpos(p, Z.reserve, zReserve(s, value));
  const slot = p.pieceAt[s];
  if (slot !== NO_SLOT) {
    const base = p.defId[slot] * RESERVE_VALUES;
    p.pstSumCc[p.owner[slot]] += PST_MINE[base + value] - PST_MINE[base + before];
  }
  p.reserve[s] = value;
}

/** Attacker-side `atkCount`/`uflags` update; both are `Kturn` extras keyed by square. */
function setUnitTurnState(p: PackedState, slot: Slot, atkCount: number, uflags: number): void {
  const s = p.sq[slot];
  xKturn(p, Z.atkCount, zAtkCount(s, p.atkCount[slot]));
  xKturn(p, Z.uflags, zUflags(s, p.uflags[slot] & UFLAGS_MASK));
  p.atkCount[slot] = atkCount;
  p.uflags[slot] = uflags;
  xKturn(p, Z.atkCount, zAtkCount(s, atkCount));
  xKturn(p, Z.uflags, zUflags(s, uflags & UFLAGS_MASK));
}

function setDamage(p: PackedState, slot: Slot, value: number): void {
  const before = p.damage[slot];
  if (before === value) return;
  const s = p.sq[slot];
  if (before !== 0) xKpos(p, Z.damage, zDamage(s, before));
  if (value !== 0) xKpos(p, Z.damage, zDamage(s, value));
  p.damage[slot] = value;
}

/**
 * Bind a living slot to its square: occupancy lanes, `pieceAt`, `occHash`, the
 * square-keyed key components and `pstSumCc`. `p.sq[slot]` must already be `s`
 * and every per-unit field (`defId`, `owner`, `damage`, `atkCount`, `uflags`)
 * must hold its final value.
 */
function linkSquare(cat: Catalog, p: PackedState, slot: Slot, s: Square): void {
  const owner = p.owner[slot] as Side;
  const def = p.defId[slot];
  const word = s >>> 5;
  const bit = 1 << (s & 31);
  p.pieceAt[s] = slot;
  p.occ[word] |= bit;
  p.occBy[owner * 4 + word] |= bit;
  p.occTier[(cat.tier[def] - 1) * 4 + word] |= bit;
  p.occHash = (p.occHash ^ Z.piece[zPiece(0, 0, s)]) >>> 0;
  xKpos(p, Z.piece, zPiece(owner, def, s));
  const damage = p.damage[slot];
  if (damage !== 0) xKpos(p, Z.damage, zDamage(s, damage));
  xKturn(p, Z.atkCount, zAtkCount(s, p.atkCount[slot]));
  xKturn(p, Z.uflags, zUflags(s, p.uflags[slot] & UFLAGS_MASK));
  p.pstSumCc[owner] += PST_MINE[def * RESERVE_VALUES + p.reserve[s]];
}

/** Exact inverse of `linkSquare`; call before changing `sq`/`defId`/`uflags`. */
function unlinkSquare(cat: Catalog, p: PackedState, slot: Slot, s: Square): void {
  const owner = p.owner[slot] as Side;
  const def = p.defId[slot];
  const word = s >>> 5;
  const bit = ~(1 << (s & 31));
  p.pieceAt[s] = NO_SLOT;
  p.occ[word] &= bit;
  p.occBy[owner * 4 + word] &= bit;
  p.occTier[(cat.tier[def] - 1) * 4 + word] &= bit;
  p.occHash = (p.occHash ^ Z.piece[zPiece(0, 0, s)]) >>> 0;
  xKpos(p, Z.piece, zPiece(owner, def, s));
  const damage = p.damage[slot];
  if (damage !== 0) xKpos(p, Z.damage, zDamage(s, damage));
  xKturn(p, Z.atkCount, zAtkCount(s, p.atkCount[slot]));
  xKturn(p, Z.uflags, zUflags(s, p.uflags[slot] & UFLAGS_MASK));
  p.pstSumCc[owner] -= PST_MINE[def * RESERVE_VALUES + p.reserve[s]];
}

/**
 * Record a commitment on `side`'s square `s` for definition `def` at `cost`,
 * maintaining the bitboard, the two counters and the `pend` key plane. O(1):
 * the plane is square-keyed, so there is no slot to allocate and nothing to
 * link. Never called on a square that already carries one of `side`'s
 * commitments (`isLegal` and `genPlace` both mask those out).
 */
function addPending(p: PackedState, side: Side, s: Square, def: number, cost: number, ord: number): void {
  p.pendDef[side * PEND_STRIDE + s] = def + 1;
  p.pendCost[side * PEND_STRIDE + s] = cost;
  p.pendOrd[side * PEND_STRIDE + s] = ord;
  p.pendBB[side * 4 + (s >>> 5)] |= 1 << (s & 31);
  p.pendCount[side] += 1;
  p.pendCostSum[side] += cost;
  xKpos(p, Z.pend, zPend(side, def, s));
}

/** Exact inverse of `addPending`. Returns the definition that was committed. */
function removePending(p: PackedState, side: Side, s: Square): number {
  const i = side * PEND_STRIDE + s;
  const def = p.pendDef[i] - 1;
  xKpos(p, Z.pend, zPend(side, def, s));
  p.pendCostSum[side] -= p.pendCost[i];
  p.pendCount[side] -= 1;
  p.pendBB[side * 4 + (s >>> 5)] &= ~(1 << (s & 31));
  p.pendDef[i] = 0;
  p.pendCost[i] = 0;
  p.pendOrd[i] = 0;
  return def;
}

function addMaterial(cat: Catalog, p: PackedState, slot: Slot): void {
  p.materialCc[p.owner[slot]] += cat.cost[p.defId[slot]] * CC;
}

function subMaterial(cat: Catalog, p: PackedState, slot: Slot): void {
  p.materialCc[p.owner[slot]] -= cat.cost[p.defId[slot]] * CC;
}

/** Living units of `side`, straight off the occupancy lanes. */
function unitCount(p: PackedState, side: Side): number {
  const base = side * 4;
  return (
    popcount32(p.occBy[base]) +
    popcount32(p.occBy[base + 1]) +
    popcount32(p.occBy[base + 2]) +
    popcount32(p.occBy[base + 3])
  );
}

function popcount32(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

// --- keep-set scratch --------------------------------------------------------

/** `upkeepActions` enumerates every affordable subset of at most 12 rent units. */
const MAX_RENT_UNITS = 12;
const MAX_KEEP_CANDIDATES = 1 << MAX_RENT_UNITS;
const KEEP_WORDS = MAX_SLOTS >>> 5;
const KEEP_BUF = new Uint32Array(MAX_KEEP_CANDIDATES * KEEP_WORDS);
const KEEP_SCORE = new Int32Array(MAX_KEEP_CANDIDATES);
const RENT_SLOT = new Int32Array(MAX_SLOTS);
const RENT_COST = new Int32Array(MAX_SLOTS);
const RENT_PRIORITY = new Int32Array(MAX_SLOTS);
const RENT_ORDER = new Int32Array(MAX_SLOTS);
const KEEP_CHOSEN = new Int32Array(KEEP_SET_CAPACITY);
const KEEP_TAKEN = new Uint8Array(MAX_KEEP_CANDIDATES);
const KEEP_BASE = new Uint32Array(KEEP_WORDS);
const KEEP_WORK = new Uint32Array(KEEP_WORDS);

/** `genPlace`'s spawn mask minus the mover's own commitments. */
const PLACE_MASK = bbNew();
/** One side's `pendBB` lanes, so `bbNext` can walk them without a subarray. */
const PEND_LANES = bbNew();
/**
 * `resolveArrivals`'s pre-pass: the arriving squares, sorted by commit sequence,
 * and the resulting rank per square. Canonical appends the arrivals to
 * `board.units` in `pendingSummons` order (`summoning.ts:24`), so their BIRTH
 * ORDER is the commit order of the ones that survive — which has to be known
 * before the walk starts, because the walk clears each `pendOrd` as it consumes
 * it. Sized for the plane's capacity (one commitment per square).
 */
const ARRIVAL_SQ = new Int32Array(BOARD);
const ARRIVAL_RANK = new Int32Array(BOARD);
/** `check`'s duplicate-sequence scratch (units, then commitments). */
const ORD_SEEN = new Int32Array(MAX_SLOTS > 2 * PEND_STRIDE ? MAX_SLOTS : 2 * PEND_STRIDE);

// --- the replica -------------------------------------------------------------

export class Replica {
  readonly cat: Catalog;
  /** BFS distance cache shared by `isLegal`, `genActions` and `make`. */
  readonly dist: DistanceCache;
  private readonly spawn: SpawnInfo = newSpawnInfo();
  private readonly spawnScratch: SpawnInfo = newSpawnInfo();
  /** The single arrival-board snapshot `resolveArrivals` judges every commitment against. */
  private readonly arrivalSpawn: SpawnInfo = newSpawnInfo();
  /**
   * The `originIds` entry an arrival displaced from its reused dead slot, and
   * the `pendIds` entry the resolved commitment vacated — two strings per
   * commitment, pushed in that order. Strings cannot live in the `Int32Array`
   * undo stack; `make`/`unmake` are strictly LIFO-paired on one `Replica`,
   * exactly like the undo stack itself.
   */
  private readonly idStack: string[] = [];
  /**
   * The one-ply pool `tactics/prover.ts` takes its knapsack buffer from
   * (DESIGN §4.14 types `damageBound`/`homeVerdict` with a `Scratch` + `ply`).
   * The prover is called from `make` at a single depth and never recurses into
   * itself, so one ply is enough.
   */
  private readonly proverScratch: Scratch = new Scratch(1, 0, 0, 1);
  /**
   * How many times `make` has run the FULL prover (`homeVerdict` at
   * `proverMode = 2`). DESIGN §5.11.6 prices work at "PROVER 40 per full-prover
   * call" and M14's gate reports `proverCallsPer1000Macro`, so the search needs
   * the real count — the turns that COULD trigger one are a different (larger)
   * number. Additive to DESIGN §4.4; monotone, never reset by `unmake`, and a
   * pure function of the positions the caller applied, so it costs nothing in
   * determinism. Added by M14; see DEVIATIONS.
   */
  fullProverCalls = 0;
  /**
   * How many of those full-prover calls ended AT THE CAP (`HomeVerdict.UNKNOWN`,
   * canonical `cutoffReason: 'node_limit'`).
   *
   * This is the order-exposure meter (M2-STATUS §2.6, the key-soundness
   * argument). A completed prover search has an order-INDEPENDENT verdict, and
   * MATE is only ever returned by a completed search — so a capped call cannot
   * change the adjudicated result, only the RESCUE/UNKNOWN label and the node
   * count the differential compares. Any run in which this is non-zero is a run
   * where the replica's candidate ORDER was load-bearing for something, and can
   * be vetoed on that basis rather than on trust. Accounted exactly like
   * `fullProverCalls`: monotone, never reset by `unmake`, a pure function of the
   * positions the caller applied.
   */
  cappedProverCalls = 0;

  /** `memo` is E4.3 candidate C's shared reach memo (`searchFix.reachCache`),
   * `null` for every existing caller and for the champion. */
  constructor(cat: Catalog = activeCatalog(), memo: ReachMemo | null = null) {
    this.cat = cat;
    this.dist = createDistanceCache(undefined, memo);
  }

  // --- boundary ------------------------------------------------------------

  /** `GameState` -> `PackedState` (DESIGN §3.1). Throws `PackError`. */
  pack(state: GameState, out: PackedState = allocState()): PackedState {
    if (state.phase === 'setup') throw new PackError('pack: phase "setup" has no packed representation');
    // The replica is PHASING ONLY (DESIGN M2 item A). A missing ruleset means
    // Standard (rules.ts:4), and a Standard position is NEVER reinterpreted:
    // its turn shape, its purchases and its home-checkmate gate all differ.
    if (state.ruleset !== 'phasing') {
      throw new PackError(`pack: ruleset ${JSON.stringify(state.ruleset ?? 'standard')} is not "phasing" (the replica is Phasing-only)`);
    }
    if ((state.actionsPerTurn ?? ACTIONS_PER_TURN) !== ACTIONS_PER_TURN) {
      throw new PackError(`pack: actionsPerTurn ${String(state.actionsPerTurn)} !== ${ACTIONS_PER_TURN} (rules.ts:11-13)`);
    }
    const units = state.board.units;
    if (units.length > MAX_SLOTS) throw new PackError(`pack: ${units.length} units exceeds MAX_SLOTS ${MAX_SLOTS}`);

    out.sq.fill(DEAD);
    out.defId.fill(0);
    out.owner.fill(0);
    out.damage.fill(0);
    out.atkCount.fill(0);
    out.uflags.fill(0);
    out.ord.fill(0);
    out.originIds.length = 0;
    out.pendDef.fill(0);
    out.pendCost.fill(0);
    out.pendOrd.fill(0);
    out.pendIds.length = 0;

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const reserve = state.board.cells[y][x].resourceLayers;
        if (!Number.isInteger(reserve) || reserve < 0 || reserve > MAX_RESOURCE_RESERVE) {
          throw new PackError(`pack: reserve ${reserve} at ${x},${y} outside 0..${MAX_RESOURCE_RESERVE}`);
        }
        out.reserve[y * 10 + x] = reserve;
      }
    }
    const initial = state.board.initialResourceLayers;
    for (let s = 0; s < BOARD; s++) out.initialReserve[s] = initial ? initial[s] : INITIAL_RESOURCE_LAYERS;

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const def = DEF_INDEX.get(u.definitionId);
      if (def === undefined) throw new PackError(`pack: unknown definitionId "${u.definitionId}"`);
      const s = u.position.y * 10 + u.position.x;
      if (s < 0 || s >= BOARD) throw new PackError(`pack: unit ${u.id} out of bounds at ${u.position.x},${u.position.y}`);
      out.sq[i] = s;
      out.defId[i] = def;
      out.owner[i] = u.owner === 'white' ? 0 : 1;
      out.damage[i] = u.damageTaken;
      out.atkCount[i] = getAttackCount(u);
      out.uflags[i] =
        (u.canActThisTurn ? F_CAN_ACT : 0) |
        (u.lastAttackKilled ? F_LAST_KILLED : 0) |
        (u.placedThisTurn ? F_PLACED : 0) |
        (u.promotedThisPlacement ? F_PROMOTED : 0);
      // Slot `i` holds `board.units[i]`, so at pack time the birth sequence IS
      // the slot index. It stops being the slot index at the first arrival that
      // reuses a dead slot, which is why it is carried as state from here on.
      out.ord[i] = i;
      out.originIds[i] = u.id;
    }
    out.slotCount = units.length;
    out.ordNext = units.length;

    // Pending summons, square-keyed. `rehash` derives `pendBB`/`pendCount`/
    // `pendCostSum` from these two planes, so only they are written here.
    const pendings = state.pendingSummons ?? [];
    let pendRank = 0;
    for (const summon of pendings) {
      const def = DEF_INDEX.get(summon.definitionId);
      if (def === undefined) throw new PackError(`pack: pending summon ${summon.id} has unknown definitionId "${summon.definitionId}"`);
      const s = summon.position.y * 10 + summon.position.x;
      if (!Number.isInteger(s) || s < 0 || s >= BOARD) {
        throw new PackError(`pack: pending summon ${summon.id} out of bounds at ${summon.position.x},${summon.position.y}`);
      }
      // The paid cost is not hashed (DESIGN M2 item C); it is only ever the
      // catalogue cost (`applyBuyUnit`, simulate.ts:135-137), so a state that
      // says otherwise carries information the packed form cannot represent.
      if (summon.cost !== this.cat.cost[def]) {
        throw new PackError(`pack: pending summon ${summon.id} paid ${summon.cost}, catalogue cost of "${summon.definitionId}" is ${this.cat.cost[def]}`);
      }
      const side = summon.owner === 'white' ? 0 : 1;
      const i = side * PEND_STRIDE + s;
      // `hasPendingSummon` (summoning.ts:5-7) makes this unreachable in play;
      // the square-keyed plane cannot represent it, so it is refused, not lost.
      if (out.pendDef[i] !== 0) throw new PackError(`pack: ${summon.owner} has two pending summons on square ${s}`);
      out.pendDef[i] = def + 1;
      out.pendCost[i] = summon.cost;
      // The commit sequence, straight off the canonical array index.
      out.pendOrd[i] = pendRank++;
      out.pendIds[i] = summon.id;
    }
    out.pendOrdNext = pendRank;

    out.bank[0] = state.players.white.resources;
    out.bank[1] = state.players.black.resources;
    out.gained[0] = state.players.white.resourcesGained;
    out.gained[1] = state.players.black.resourcesGained;

    out.side = state.turn.currentPlayer === 'white' ? 0 : 1;
    out.phase = state.turn.phase === 'place' ? 0 : 1;
    out.actions = state.turn.actionsRemaining;
    out.turnNumber = state.turn.turnNumber;
    out.upkeepPending = state.upkeepPending ? 1 : 0;
    const plies = state.inactivityPlies ?? 0;
    out.clock = plies > MAX_CLOCK ? MAX_CLOCK : plies;
    out.progress = state.progressThisTurn ? 1 : 0;

    out.handicap = state.blackCrystalHandicap ?? 0;
    out.victoryHome = (state.victoryRule ?? 'home-or-elimination') !== 'elimination' ? 1 : 0;
    out.drawRuleOn = (state.inactivityRule ?? 'on') !== 'off' ? 1 : 0;
    out.reviewUpkeep[0] = state.reviewUpkeep?.white ? 1 : 0;
    out.reviewUpkeep[1] = state.reviewUpkeep?.black ? 1 : 0;

    if (state.phase === 'victory') {
      out.result = state.winner === 'white' ? Result.WHITE_WIN : state.winner === 'black' ? Result.BLACK_WIN : Result.DRAW;
      out.reason = REASON_OF[state.victoryReason ?? 'elimination'] ?? Reason.NONE;
    } else {
      out.result = Result.ONGOING;
      out.reason = Reason.NONE;
    }

    out.catalogSignature = this.cat.signature;
    out.proverMode = 2;
    this.rehash(out);
    return out;
  }

  /** `PackedState` -> `GameState`; ids per `simulate.ts:14-20` (DESIGN §3.1). */
  unpack(p: PackedState): GameState {
    const cells: Cell[][] = new Array<Cell[]>(10);
    for (let y = 0; y < 10; y++) {
      const row: Cell[] = new Array<Cell>(10);
      for (let x = 0; x < 10; x++) row[x] = { position: { x, y }, resourceLayers: p.reserve[y * 10 + x] };
      cells[y] = row;
    }
    // CANONICAL ORDER, not slot order: `board.units` is a birth sequence
    // (`summoning.ts:24` appends, every removal is a `filter`), and slot order
    // stops agreeing with it at the first arrival into a reused dead slot. An
    // order-sensitive canonical consumer — `analyzeHomeDefense`'s candidate
    // lists under the node cap, `incomingPlayback`'s `JSON.stringify` board
    // comparison — would otherwise read a permuted army out of the replica.
    const order: number[] = [];
    for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD) order.push(slot);
    order.sort((a, b) => p.ord[a] - p.ord[b]);
    const units: Unit[] = [];
    for (const slot of order) {
      const s = p.sq[slot];
      const owner = PLAYER_OF_SIDE[p.owner[slot]];
      const flags = p.uflags[slot];
      const count = p.atkCount[slot];
      // `getAttackCount` reads `attackedThisTurn.length`; the concrete ids are
      // never compared against a LIVING unit (RE §1.7a: every target a unit has
      // already attacked this turn is dead), so synthetic ids are exact here.
      const attacked: string[] = new Array<string>(count);
      for (let k = 0; k < count; k++) attacked[k] = `dead-${slot}-${k}`;
      units.push({
        id: p.originIds[slot] !== undefined && p.originIds[slot] !== '' ? p.originIds[slot] : unitIdFor(p, slot),
        definitionId: DEF_ID[p.defId[slot]],
        owner,
        position: { x: s % 10, y: (s / 10) | 0 },
        hasMoved: false,
        hasAttacked: count > 0,
        attackedThisTurn: attacked,
        lastAttackKilled: (flags & F_LAST_KILLED) !== 0,
        canActThisTurn: (flags & F_CAN_ACT) !== 0,
        damageTaken: p.damage[slot],
        placedThisTurn: (flags & F_PLACED) !== 0,
        promotedThisPlacement: (flags & F_PROMOTED) !== 0,
      });
    }
    const initialResourceLayers: number[] = new Array<number>(BOARD);
    for (let s = 0; s < BOARD; s++) initialResourceLayers[s] = p.initialReserve[s];

    // Commitments come out in CANONICAL COMMIT ORDER (`pendOrd`), one array for
    // both sides, exactly as `applyBuyUnit` built it (`simulate.ts:131`). No rule
    // reads that order — `resolveSummons` checks every commitment against the
    // same board (summoning.ts:17-22) — but `resolveSummons` then APPENDS the
    // arrivals in it, so it decides `board.units` order one hand-off later.
    const pendOrder: number[] = [];
    for (let i = 0; i < 2 * PEND_STRIDE; i++) if (p.pendDef[i] !== 0) pendOrder.push(i);
    pendOrder.sort((a, b) => p.pendOrd[a] - p.pendOrd[b]);
    const pendingSummons: PendingSummon[] = [];
    for (const i of pendOrder) {
      const side = (i / PEND_STRIDE) | 0;
      const s = i % PEND_STRIDE;
      const stored = p.pendIds[i];
      pendingSummons.push({
        id: stored !== undefined && stored !== '' ? stored : `pending-${PLAYER_OF_SIDE[side]}-${s}`,
        owner: PLAYER_OF_SIDE[side],
        definitionId: DEF_ID[p.pendDef[i] - 1],
        position: { x: s % 10, y: (s / 10) | 0 },
        cost: p.pendCost[i],
      });
    }

    return {
      actionsPerTurn: ACTIONS_PER_TURN,
      ruleset: 'phasing',
      pendingSummons,
      blackCrystalHandicap: p.handicap,
      victoryRule: p.victoryHome ? 'home-or-elimination' : 'elimination',
      inactivityRule: p.drawRuleOn ? 'on' : 'off',
      upkeepPending: p.upkeepPending === 1,
      reviewUpkeep: { white: p.reviewUpkeep[0] === 1, black: p.reviewUpkeep[1] === 1 },
      inactivityPlies: p.clock,
      progressThisTurn: p.progress === 1,
      phase: p.result === Result.ONGOING ? 'playing' : 'victory',
      board: { cells, units, initialResourceLayers },
      players: {
        white: { id: 'white', resources: p.bank[0], startCorner: { x: 0, y: 0 }, resourcesGained: p.gained[0], resourcesUpkeep: 0 },
        black: { id: 'black', resources: p.bank[1], startCorner: { x: 9, y: 9 }, resourcesGained: p.gained[1], resourcesUpkeep: 0 },
      },
      turn: {
        currentPlayer: PLAYER_OF_SIDE[p.side],
        phase: p.phase === 0 ? 'place' : 'action',
        actionsRemaining: p.actions,
        turnNumber: p.turnNumber,
      },
      winner: p.result === Result.WHITE_WIN ? 'white' : p.result === Result.BLACK_WIN ? 'black' : null,
      ...(p.result === Result.ONGOING ? {} : { victoryReason: REASON_NAME[p.reason] }),
      selectedUnit: null,
      validMoves: [],
      validAttacks: [],
    };
  }

  // --- legality ------------------------------------------------------------

  /** Byte-equivalent to `isLegalAction(state, action)` (legality.ts:16-47). */
  isLegal(p: PackedState, a: PA, keep?: KeepSetTable): boolean {
    if (p.result !== Result.ONGOING) return false;
    const kind = paKind(a);
    const side = p.side;
    if (kind === AKind.PAY_UPKEEP) return this.isLegalKeepSet(p, a, keep);
    if (p.upkeepPending === 1) return kind === AKind.RESIGN;
    switch (kind) {
      case AKind.RESIGN:
        return true;
      case AKind.END_PLACE:
        return p.phase === 0;
      case AKind.END_ACTION:
        return p.phase === 1;
      case AKind.BUY: {
        if (p.phase !== 0) return false;
        const def = paA(a);
        if (def >= DEF_ID.length || this.cat.tier[def] !== 1) return false;
        if (p.bank[side] < this.cat.cost[def]) return false;
        const s = paB(a);
        if (s >= BOARD) return false;
        // `!hasPendingSummon(state, player, position)` (legality.ts:30): one own
        // commitment per square, whatever the definition.
        if (p.pendDef[side * PEND_STRIDE + s] !== 0) return false;
        return isLegalSpawn(p, side, s);
      }
      case AKind.PROMOTE: {
        if (p.phase !== 0) return false;
        const slot = paA(a);
        if (slot >= MAX_SLOTS || p.sq[slot] === DEAD || p.owner[slot] !== side) return false;
        return this.canPromote(p, slot, p.bank[side]);
      }
      case AKind.MOVE: {
        if (p.phase !== 1 || p.actions <= 0) return false;
        const slot = paA(a);
        if (slot >= MAX_SLOTS || p.sq[slot] === DEAD || p.owner[slot] !== side) return false;
        if ((p.uflags[slot] & F_CAN_ACT) === 0) return false;
        const to = paB(a);
        if (to >= BOARD) return false;
        const cost = moveCost(this.dist.get(p, p.sq[slot]), to, this.cat.spd[p.defId[slot]]);
        return cost > 0 && cost <= p.actions;
      }
      case AKind.ATTACK: {
        if (p.phase !== 1 || p.actions <= 0) return false;
        const slot = paA(a);
        if (slot >= MAX_SLOTS || p.sq[slot] === DEAD || p.owner[slot] !== side) return false;
        if (!this.canAttack(p, slot)) return false;
        const target = paB(a);
        if (target >= BOARD || !isAdjacentSquare(p.sq[slot], target)) return false;
        const victim = p.pieceAt[target];
        return victim !== NO_SLOT && p.owner[victim] !== side;
      }
      default:
        return false;
    }
  }

  /** `canAttack` (combat.ts:13-17) on the packed unit. */
  private canAttack(p: PackedState, slot: Slot): boolean {
    if ((p.uflags[slot] & F_CAN_ACT) === 0) return false;
    const count = p.atkCount[slot];
    if (count >= this.cat.tier[p.defId[slot]]) return false;
    return count === 0 || (p.uflags[slot] & F_LAST_KILLED) !== 0;
  }

  /** `canPromote` (promotion.ts:44-58) on the packed unit. */
  private canPromote(p: PackedState, slot: Slot, cash: number): boolean {
    const flags = p.uflags[slot];
    if ((flags & F_PLACED) !== 0 || (flags & F_PROMOTED) !== 0) return false;
    const def = p.defId[slot];
    if (this.cat.nextDef[def] < 0) return false;
    return cash >= this.cat.promoCost[def];
  }

  /** `isUpkeepSelectionLegal` (upkeep.ts:17-21) on a keep-set table entry. */
  private isLegalKeepSet(p: PackedState, a: PA, keep?: KeepSetTable): boolean {
    if (keep === undefined) return false;
    if (p.upkeepPending !== 1 || p.phase !== 0) return false;
    const index = paA(a);
    if (index >= keep.count) return false;
    const side = p.side;
    let due = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const kept = keepSetHas(keep, index, slot);
      if (p.sq[slot] === DEAD || p.owner[slot] !== side) {
        // Every id in the selection must name a unit the player owns.
        if (kept) return false;
        continue;
      }
      const def = p.defId[slot];
      if (this.cat.tier[def] === 1 && !kept) return false;
      if (kept) due += this.cat.upkeep[def];
    }
    return due <= p.bank[side];
  }

  // --- generators ----------------------------------------------------------

  /**
   * Action phase: every legal ATTACK (slot ascending, target square
   * ascending), then every legal MOVE including multi-action ones (slot
   * ascending, destination ascending), then `END_ACTION` (DESIGN §4.4).
   */
  genActions(p: PackedState, out: Int32Array): number {
    if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 1) return 0;
    let n = 0;
    const side = p.side;
    if (p.actions > 0) {
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const s = p.sq[slot];
        if (s === DEAD || p.owner[slot] !== side) continue;
        if (!this.canAttack(p, slot)) continue;
        const base = s * 4;
        // ADJ_LIST is up, down, left, right (board.ts:313-324); ASCENDING_ADJ
        // reorders those four slots into ascending square order.
        for (let k = 0; k < 4; k++) {
          const q = ADJ_LIST[base + ASCENDING_ADJ[k]];
          if (q < 0) continue;
          const victim = p.pieceAt[q];
          if (victim !== NO_SLOT && p.owner[victim] !== side) out[n++] = paMake(AKind.ATTACK, slot, q, 0);
        }
      }
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const s = p.sq[slot];
        if (s === DEAD || p.owner[slot] !== side) continue;
        if ((p.uflags[slot] & F_CAN_ACT) === 0) continue;
        const speed = this.cat.spd[p.defId[slot]];
        if (speed <= 0) continue;
        const dist = this.dist.get(p, s);
        for (let to = 0; to < BOARD; to++) {
          const d = dist[to];
          if (d <= 0) continue;
          const cost = ((d + speed - 1) / speed) | 0;
          if (cost > p.actions) continue;
          out[n++] = paMake(AKind.MOVE, slot, to, cost);
        }
      }
    }
    out[n++] = paMake(AKind.END_ACTION, 0, 0, 0);
    return n;
  }

  /** Prepare phase: BUY (defId ascending, square ascending), PROMOTE, `END_PLACE`. */
  genPlace(p: PackedState, out: Int32Array): number {
    if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 0) return 0;
    let n = 0;
    const side = p.side;
    const cash = p.bank[side];
    // `getPurchasePositions` = `getAllSpawnPositions` minus the side's OWN
    // commitments (summoning.ts:9-11). The enemy's commitments mask nothing:
    // they are not units and they never occupy a square.
    const legal = spawnInfo(p, side, this.spawn).legal;
    const lanes = side * 4;
    PLACE_MASK[0] = legal[0] & ~p.pendBB[lanes];
    PLACE_MASK[1] = legal[1] & ~p.pendBB[lanes + 1];
    PLACE_MASK[2] = legal[2] & ~p.pendBB[lanes + 2];
    PLACE_MASK[3] = legal[3] & ~p.pendBB[lanes + 3];
    // `generatePlaceActions` iterates UNIT_DEFINITIONS order, not cost order.
    for (let def = 0; def < DEF_ID.length; def++) {
      if (this.cat.tier[def] !== 1 || this.cat.cost[def] > cash) continue;
      for (let s = bbNext(PLACE_MASK, -1); s >= 0; s = bbNext(PLACE_MASK, s)) {
        out[n++] = paMake(AKind.BUY, def, s, 0);
      }
    }
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
      if (this.canPromote(p, slot, cash)) out[n++] = paMake(AKind.PROMOTE, slot, 0, 0);
    }
    out[n++] = paMake(AKind.END_PLACE, 0, 0, 0);
    return n;
  }

  /**
   * Keep-set candidates for `PAY_UPKEEP` (DESIGN §4.4, §5.10). Reproduces
   * `upkeepActions` (upkeep.ts:34-55) exactly — every affordable subset of at
   * most twelve rent-bearing units, or the empty set plus the four greedy
   * orderings above that — and then, only if more than `KEEP_SET_CAPACITY`
   * subsets survive, keeps the 64 best-ranked ones (rescuers adjacent to the
   * side's own corner, then unblocked anchors, then
   * `material − RENT_PV × upkeep`).
   */
  genKeepSets(p: PackedState, out: KeepSetTable): number {
    keepSetReset(out);
    if (p.result !== Result.ONGOING || p.upkeepPending !== 1 || p.phase !== 0) return 0;
    const side = p.side;
    const cash = p.bank[side];

    KEEP_BASE.fill(0);
    let rentCount = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
      const rent = this.cat.upkeep[p.defId[slot]];
      if (rent === 0) {
        KEEP_BASE[slot >>> 5] |= 1 << (slot & 31);
        continue;
      }
      RENT_SLOT[rentCount] = slot;
      RENT_COST[rentCount] = rent;
      rentCount++;
    }

    let candidates = 0;
    if (rentCount <= MAX_RENT_UNITS) {
      candidates = this.enumerateKeepSubsets(rentCount, cash);
    } else {
      candidates = this.greedyKeepSets(p, rentCount, cash);
    }
    if (candidates === 0) return 0;

    let chosen = candidates;
    if (candidates <= KEEP_SET_CAPACITY) {
      for (let i = 0; i < candidates; i++) KEEP_CHOSEN[i] = i;
    } else {
      this.rankKeepSets(p, side, rentCount, candidates);
      chosen = KEEP_SET_CAPACITY;
    }

    for (let i = 0; i < chosen; i++) {
      const src = KEEP_CHOSEN[i] * KEEP_WORDS;
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        if ((KEEP_BUF[src + (slot >>> 5)] & (1 << (slot & 31))) !== 0 || (KEEP_BASE[slot >>> 5] & (1 << (slot & 31))) !== 0) {
          keepSetAdd(out, i, slot);
        }
      }
    }
    out.count = chosen;
    return chosen;
  }

  /** Keep-first DFS over the rent-bearing units, mirroring `upkeepActions`'s `visit`. */
  private enumerateKeepSubsets(rentCount: number, cash: number): number {
    let written = 0;
    KEEP_WORK.fill(0);
    const visit = (i: number, left: number): void => {
      if (written >= MAX_KEEP_CANDIDATES) return;
      if (i === rentCount) {
        const dst = written * KEEP_WORDS;
        for (let w = 0; w < KEEP_WORDS; w++) KEEP_BUF[dst + w] = KEEP_WORK[w];
        written++;
        return;
      }
      const slot = RENT_SLOT[i];
      const rent = RENT_COST[i];
      if (rent <= left) {
        KEEP_WORK[slot >>> 5] |= 1 << (slot & 31);
        visit(i + 1, left - rent);
        KEEP_WORK[slot >>> 5] &= ~(1 << (slot & 31));
      }
      visit(i + 1, left);
    };
    visit(0, cash);
    return written;
  }

  /** The `> 12` branch of `upkeepActions`: the empty set plus four greedy orderings. */
  private greedyKeepSets(p: PackedState, rentCount: number, cash: number): number {
    const dst0 = 0;
    for (let w = 0; w < KEEP_WORDS; w++) KEEP_BUF[dst0 + w] = 0;
    let written = 1;
    const keys: readonly ('cost' | 'def' | 'atk' | 'mine')[] = ['cost', 'def', 'atk', 'mine'];
    for (const key of keys) {
      for (let i = 0; i < rentCount; i++) RENT_ORDER[i] = i;
      const rank = (i: number): number => {
        const def = p.defId[RENT_SLOT[i]];
        switch (key) {
          case 'cost':
            return this.cat.cost[def];
          case 'def':
            return this.cat.def[def];
          case 'atk':
            return this.cat.atk[def];
          case 'mine':
            return this.cat.mine[def];
        }
      };
      // Descending by the stat, then by square ascending (y then x = square order).
      insertionSort(RENT_ORDER, rentCount, (x, y) => rank(y) - rank(x) || p.sq[RENT_SLOT[x]] - p.sq[RENT_SLOT[y]]);
      const dst = written * KEEP_WORDS;
      for (let w = 0; w < KEEP_WORDS; w++) KEEP_BUF[dst + w] = 0;
      let left = cash;
      for (let k = 0; k < rentCount; k++) {
        const i = RENT_ORDER[k];
        if (RENT_COST[i] <= left) {
          KEEP_BUF[dst + (RENT_SLOT[i] >>> 5)] |= 1 << (RENT_SLOT[i] & 31);
          left -= RENT_COST[i];
        }
      }
      written++;
    }
    return written;
  }

  /** §5.10's ranking, reduced to the quantities `core` can see. */
  private rankKeepSets(p: PackedState, side: Side, rentCount: number, candidates: number): void {
    spawnInfo(p, side, this.spawnScratch);
    const corner = CORNER[side];
    for (let i = 0; i < rentCount; i++) {
      const slot = RENT_SLOT[i];
      const s = p.sq[slot];
      const def = p.defId[slot];
      let priority = this.cat.cost[def] * CC - RENT_PV * this.cat.upkeep[def];
      if (isAdjacentSquare(s, corner)) priority += 4_000_000;
      if ((this.spawnScratch.anchors[s >>> 5] & (1 << (s & 31))) !== 0) priority += 2_000_000;
      RENT_PRIORITY[i] = priority;
    }
    for (let c = 0; c < candidates; c++) {
      const base = c * KEEP_WORDS;
      let score = 0;
      for (let i = 0; i < rentCount; i++) {
        const slot = RENT_SLOT[i];
        if ((KEEP_BUF[base + (slot >>> 5)] & (1 << (slot & 31))) !== 0) score += RENT_PRIORITY[i];
      }
      KEEP_SCORE[c] = score;
    }
    // Partial selection of the best `KEEP_SET_CAPACITY`, ties broken by the
    // canonical enumeration order so the result is deterministic.
    KEEP_TAKEN.fill(0, 0, candidates);
    for (let k = 0; k < KEEP_SET_CAPACITY; k++) {
      let best = -1;
      for (let c = 0; c < candidates; c++) {
        if (KEEP_TAKEN[c] === 1) continue;
        if (best < 0 || KEEP_SCORE[c] > KEEP_SCORE[best]) best = c;
      }
      KEEP_TAKEN[best] = 1;
      KEEP_CHOSEN[k] = best;
    }
    insertionSort(KEEP_CHOSEN, KEEP_SET_CAPACITY, (x, y) => x - y);
  }

  // --- transition ----------------------------------------------------------

  /** Applies `a` (which must be legal) and records the inverse in `u`. */
  make(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    switch (paKind(a)) {
      case AKind.MOVE:
        this.makeMove(p, a, u);
        return;
      case AKind.ATTACK:
        this.makeAttack(p, a, u);
        return;
      case AKind.BUY:
        this.makeBuy(p, a, u);
        return;
      case AKind.PROMOTE:
        this.makePromote(p, a, u);
        return;
      case AKind.END_PLACE:
        this.makeEndPlace(p, u);
        return;
      case AKind.PAY_UPKEEP:
        this.makePayUpkeep(p, a, u, keep);
        return;
      case AKind.END_ACTION:
        this.makeEndAction(p, u);
        return;
      case AKind.RESIGN:
        this.makeResign(p, u);
        return;
    }
  }

  private makeMove(p: PackedState, a: PA, u: Undo): void {
    const slot = paA(a);
    const to = paB(a);
    const from = p.sq[slot];
    let cost = paC(a);
    if (cost === 0) cost = moveCost(this.dist.get(p, from), to, this.cat.spd[p.defId[slot]]);
    const base = openRecord(u, AKind.MOVE, p);
    u.w[u.top++] = slot;
    u.w[u.top++] = from;
    u.w[u.top++] = cost;
    closeRecord(u, base);

    unlinkSquare(this.cat, p, slot, from);
    p.sq[slot] = to;
    linkSquare(this.cat, p, slot, to);
    setActions(p, p.actions - cost);
    this.resolveHomeCheckmate(p);
  }

  private makeAttack(p: PackedState, a: PA, u: Undo): void {
    const slot = paA(a);
    const target = paB(a);
    const victim = p.pieceAt[target];
    const victimDef = p.defId[victim];
    const power = this.cat.power[powerIndex(p.owner[slot] as Side, p.defId[slot], victimDef)];
    const effectiveDef = Math.max(0, this.cat.def[victimDef] - p.damage[victim]);
    const lethal = power >= effectiveDef;

    const base = openRecord(u, AKind.ATTACK, p);
    u.w[u.top++] = slot;
    u.w[u.top++] = victim;
    u.w[u.top++] = p.damage[victim];
    u.w[u.top++] = p.uflags[slot];
    u.w[u.top++] = p.atkCount[slot];
    u.w[u.top++] = p.clock;
    u.w[u.top++] = p.progress;
    u.w[u.top++] = target;
    closeRecord(u, base);

    const flags = lethal ? p.uflags[slot] | F_LAST_KILLED : p.uflags[slot] & ~F_LAST_KILLED;
    setUnitTurnState(p, slot, p.atkCount[slot] + 1, flags);

    if (lethal) {
      const victimSide = p.owner[victim] as Side;
      unlinkSquare(this.cat, p, victim, target);
      subMaterial(this.cat, p, victim);
      p.sq[victim] = DEAD;
      setClock(p, 0);
      setProgress(p, 1);
      setActions(p, p.actions - 1);
      if (unitCount(p, victimSide) === 0) {
        p.result = victimSide === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
        p.reason = Reason.ELIMINATION;
        return;
      }
    } else {
      setDamage(p, victim, p.damage[victim] + power);
      setActions(p, p.actions - 1);
    }
    this.resolveHomeCheckmate(p);
  }

  /**
   * `applyBuyUnit`'s Phasing branch (`simulate.ts:134-139`): the bank is debited
   * and a PUBLIC COMMITMENT is recorded. No unit appears, so there is no slot to
   * allocate, nothing to link, no material to add and no occupancy to touch —
   * and no `finishPlacement`, because `finishPlacement` returns the state
   * untouched under Phasing (`simulate.ts:118-121`): preparation always ends
   * explicitly, even after the purchase that empties the bank.
   */
  private makeBuy(p: PackedState, a: PA, u: Undo): void {
    const def = paA(a);
    const s = paB(a);
    const side = p.side;
    const cost = this.cat.cost[def];

    const base = openRecord(u, AKind.BUY, p);
    u.w[u.top++] = s;
    u.w[u.top++] = cost;
    // `applyBuyUnit` APPENDS to `pendingSummons`, so the commitment takes the
    // next commit sequence number. Restored explicitly rather than by
    // decrementing, so a driver that unwinds out of order fails loudly.
    u.w[u.top++] = p.pendOrdNext;
    closeRecord(u, base);

    addPending(p, side, s, def, cost, p.pendOrdNext);
    p.pendOrdNext += 1;
    setBank(p, side, p.bank[side] - cost);
    this.resolveHomeCheckmate(p);
  }

  private makePromote(p: PackedState, a: PA, u: Undo): void {
    const slot = paA(a);
    const oldDef = p.defId[slot];
    const cost = this.cat.promoCost[oldDef];
    const side = p.side;

    const base = openRecord(u, AKind.PROMOTE, p);
    u.w[u.top++] = slot;
    u.w[u.top++] = oldDef;
    u.w[u.top++] = p.uflags[slot];
    u.w[u.top++] = cost;
    closeRecord(u, base);

    const s = p.sq[slot];
    unlinkSquare(this.cat, p, slot, s);
    p.defId[slot] = this.cat.nextDef[oldDef];
    p.uflags[slot] |= F_PROMOTED;
    linkSquare(this.cat, p, slot, s);
    p.materialCc[p.owner[slot]] += cost * CC;
    setBank(p, side, p.bank[side] - cost);
    // No `finishPlacement`: Phasing's preparation never auto-advances
    // (`simulate.ts:118-121`), so phase and actions are untouched.
    this.resolveHomeCheckmate(p);
  }

  /**
   * The Phasing HAND-OFF: `startActionPhase` -> `handOffTurn` -> `startTurn`
   * (`turn.ts:75-79, 118-131, 19-40`), in exactly that order:
   *
   *   1. the quiet-turn clock advances once, then the inactivity draw resolves;
   *   2. the turn number bumps when White is next;
   *   3. `startTurn` awards an established home occupation to the INCOMING side;
   *   4. then elimination, which leaves the turn state alone;
   *   5. `resolveSummons` checks every one of the incoming side's commitments
   *      against ONE snapshot of the arrival board — arrivals cannot anchor each
   *      other — materialising or refunding each;
   *   6. heal/reset the incoming side;
   *   7. ACT, four actions.
   *
   * `END_ACTION` already mined, settled upkeep and set Prepare, so none of that
   * happens here (`endTurn`'s Phasing branch returns before `handOffTurn`).
   */
  private makeEndPlace(p: PackedState, u: Undo): void {
    const mover = p.side;
    const next = (1 - mover) as Side;
    const base = openRecord(u, AKind.END_PLACE, p);
    u.w[u.top++] = mover;
    u.w[u.top++] = p.actions;
    u.w[u.top++] = p.clock;
    u.w[u.top++] = p.progress;
    u.w[u.top++] = p.turnNumber;
    u.w[u.top++] = p.slotCount;
    u.w[u.top++] = p.ordNext;
    const pendCountSlot = u.top++;
    u.w[pendCountSlot] = 0;

    // 1. the quiet-turn clock, then `resolveInactivityDraw` (turn.ts:120-124).
    const plies = p.progress === 1 ? 0 : p.clock + 1;
    setClock(p, plies);
    setProgress(p, 0);
    if (p.drawRuleOn === 1 && plies >= INACTIVITY_LIMIT) {
      u.w[u.top++] = 0;
      closeRecord(u, base);
      p.result = Result.DRAW;
      p.reason = Reason.INACTIVITY;
      return;
    }

    // 2. the turn number belongs to the handover, not to `startTurn` (turn.ts:128-130).
    if (next === 0) p.turnNumber += 1;

    // 3. an occupation that survived to the defender's turn start wins now.
    if (p.victoryHome === 1 && this.occupiesEnemyCorner(p, next)) {
      u.w[u.top++] = 0;
      closeRecord(u, base);
      setSide(p, next);
      setPhase(p, 0);
      setActions(p, ACTIONS_PER_TURN);
      p.result = next === 0 ? Result.WHITE_WIN : Result.BLACK_WIN;
      p.reason = Reason.HOME_OCCUPATION;
      return;
    }
    // 4. `checkVictory` looks at BOTH sides, and `startTurn` leaves the turn
    //    state untouched on an elimination (turn.ts:29) — the side does NOT flip.
    const whiteAlive = unitCount(p, 0);
    const blackAlive = unitCount(p, 1);
    if (whiteAlive === 0 || blackAlive === 0) {
      u.w[u.top++] = 0;
      closeRecord(u, base);
      p.result = whiteAlive === 0 && blackAlive === 0 ? Result.DRAW : whiteAlive === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
      p.reason = Reason.ELIMINATION;
      return;
    }

    // 5. `resolveSummons` (summoning.ts:17-32). ONE `spawnInfo` over the arrival
    //    board: every commitment is judged against the same squares, so an
    //    arrival can never anchor the next one.
    u.w[pendCountSlot] = this.resolveArrivals(p, next, u);

    // 6. `resetUnitActions(board, next)` — heal, clear the attack history, drop
    //    the placement/promotion marks. An arrival is already in that shape, so
    //    it costs no restore word.
    const restoreCountSlot = u.top++;
    u.w[restoreCountSlot] = this.resetUnitActions(p, next, u);
    closeRecord(u, base);

    // 7. the new mover acts (turn.ts:33-35). `resolveHomeCheckmate` cannot fire
    //    from ACT under Phasing (homeCheckmate.ts:170), but it is called where
    //    `applyAction` calls it so the ordering stays literal.
    setSide(p, next);
    setPhase(p, 1);
    setActions(p, ACTIONS_PER_TURN);
    this.resolveHomeCheckmate(p);
  }

  /**
   * `resolveSummons(state, side)`: materialise or refund each of `side`'s
   * commitments against a single snapshot, clearing the plane.
   *
   * SLOT allocation walks squares ASCENDING and takes the lowest dead slot —
   * a slot is a handle and the snapshot predates the first arrival, so that
   * choice is free. The arrivals' BIRTH ORDER is NOT free: canonical appends
   * them to `board.units` in `pendingSummons` order (`summoning.ts:24`), so each
   * one's `ord` comes from its rank in the commit sequence, computed in the
   * pre-pass below and independent of the square it happens to sit on. Getting
   * this from the slot index instead was the round-5 defect (§2.6).
   *
   * Appends ELEVEN words per commitment and returns how many it wrote. Cost is
   * O(pendCount), not O(board).
   */
  private resolveArrivals(p: PackedState, side: Side, u: Undo): number {
    if (p.pendCount[side] === 0) return 0;
    const legal = spawnInfo(p, side, this.arrivalSpawn).legal;
    const lanes = side * 4;
    PEND_LANES[0] = p.pendBB[lanes];
    PEND_LANES[1] = p.pendBB[lanes + 1];
    PEND_LANES[2] = p.pendBB[lanes + 2];
    PEND_LANES[3] = p.pendBB[lanes + 3];

    // Pre-pass: the arriving squares in COMMIT order, so each one's birth rank
    // is its index. It has to happen first — the walk below clears `pendOrd` as
    // it consumes each commitment.
    let arrivals = 0;
    for (let s = bbNext(PEND_LANES, -1); s >= 0; s = bbNext(PEND_LANES, s)) {
      if (bbHas(legal, s)) ARRIVAL_SQ[arrivals++] = s;
    }
    for (let a = 1; a < arrivals; a++) {
      const value = ARRIVAL_SQ[a];
      const key = p.pendOrd[side * PEND_STRIDE + value];
      let b = a - 1;
      while (b >= 0 && p.pendOrd[side * PEND_STRIDE + ARRIVAL_SQ[b]] > key) {
        ARRIVAL_SQ[b + 1] = ARRIVAL_SQ[b];
        b--;
      }
      ARRIVAL_SQ[b + 1] = value;
    }
    for (let a = 0; a < arrivals; a++) ARRIVAL_RANK[ARRIVAL_SQ[a]] = a;
    const ordBase = p.ordNext;

    let count = 0;
    for (let s = bbNext(PEND_LANES, -1); s >= 0; s = bbNext(PEND_LANES, s)) {
      const i = side * PEND_STRIDE + s;
      const def = p.pendDef[i] - 1;
      const cost = p.pendCost[i];
      const pendOrd = p.pendOrd[i];
      // `isValidSpawnPosition(position, side, snapshotBoard)`: empty and inside
      // at least one unblocked rectangle — exactly `spawnInfo().legal`.
      const arrives = bbHas(legal, s);
      let slot = -1;
      if (arrives) {
        slot = lowestDeadSlot(p);
        if (slot < 0) throw new Error('resolveArrivals: no free slot');
      }
      u.w[u.top++] = s;
      u.w[u.top++] = def;
      u.w[u.top++] = cost;
      u.w[u.top++] = slot;
      // A reused dead slot still carries whatever died or was released there;
      // `unmake` of that earlier ATTACK/PAY_UPKEEP resurrects it by writing `sq`
      // back and calling `linkSquare`, which reads these five fields out of the
      // slot — so they must be restored exactly (the same discipline Standard's
      // `makeBuy` used; DEVIATIONS.md under M5).
      u.w[u.top++] = slot < 0 ? 0 : p.defId[slot];
      u.w[u.top++] = slot < 0 ? 0 : p.owner[slot];
      u.w[u.top++] = slot < 0 ? 0 : p.damage[slot];
      u.w[u.top++] = slot < 0 ? 0 : p.atkCount[slot];
      u.w[u.top++] = slot < 0 ? 0 : p.uflags[slot];
      // The reused dead slot's stale birth sequence, and the commitment's own
      // commit sequence: both have to come back byte-for-byte, because `unmake`
      // of an earlier ATTACK/PAY_UPKEEP resurrects that slot into the array
      // position it held before it died.
      u.w[u.top++] = slot < 0 ? 0 : p.ord[slot];
      u.w[u.top++] = pendOrd;
      count++;

      if (slot >= 0) {
        this.idStack.push(p.originIds[slot] ?? '');
        p.originIds[slot] = p.pendIds[i] ?? '';
        p.ord[slot] = ordBase + ARRIVAL_RANK[s];
        p.sq[slot] = s;
        p.defId[slot] = def;
        p.owner[slot] = side;
        p.damage[slot] = 0;
        p.atkCount[slot] = 0;
        // `placedThisTurn: false` (summoning.ts:29-30): an arrival may act AND
        // promote on the very turn it lands, so `F_PLACED` is NOT set.
        p.uflags[slot] = F_CAN_ACT;
        linkSquare(this.cat, p, slot, s);
        addMaterial(this.cat, p, slot);
        if (slot >= p.slotCount) p.slotCount = slot + 1;
      } else {
        // "Invalid summons disappear and refund their exact original cost."
        this.idStack.push('');
        setBank(p, side, p.bank[side] + cost);
      }
      this.idStack.push(p.pendIds[i] ?? '');
      p.pendIds[i] = '';
      removePending(p, side, s);
    }
    p.ordNext = ordBase + arrivals;
    return count;
  }

  private makeResign(p: PackedState, u: Undo): void {
    const base = openRecord(u, AKind.RESIGN, p);
    closeRecord(u, base);
    p.result = p.side === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
    p.reason = Reason.RESIGNATION;
  }

  /**
   * `completeUpkeep(state, keepUnitIds)` under Phasing (`turn.ts:63-68`):
   * `settleUpkeep` releases the unkept tier-2+, pays the kept rent, then
   * `checkVictory` may end the game as `upkeep-elimination`. That is ALL: unlike
   * Standard's `finishTurnStart`, the Phasing branch neither heals, nor resets
   * actions, nor auto-advances — the mover stays in Prepare and ends it itself.
   */
  private makePayUpkeep(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    if (keep === undefined) throw new Error('make PAY_UPKEEP: no keep-set table');
    const index = paA(a);
    const side = p.side;

    const base = openRecord(u, AKind.PAY_UPKEEP, p);
    const paidSlot = u.top++;
    const releasedCountSlot = u.top++;

    let paid = 0;
    let released = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
      const def = p.defId[slot];
      if (keepSetHas(keep, index, slot)) {
        paid += this.cat.upkeep[def];
        continue;
      }
      if (this.cat.tier[def] === 1) continue;
      const s = p.sq[slot];
      u.w[u.top++] = slot;
      u.w[u.top++] = s;
      released++;
      unlinkSquare(this.cat, p, slot, s);
      subMaterial(this.cat, p, slot);
      p.sq[slot] = DEAD;
    }
    u.w[paidSlot] = paid;
    u.w[releasedCountSlot] = released;

    setUpkeepPending(p, 0);
    setBank(p, side, p.bank[side] - paid);

    closeRecord(u, base);

    // `completeUpkeep` runs the full `checkVictory` (turn.ts:64), which looks at
    // BOTH sides — releasing your last unit is not the only way a settled board
    // can be terminal.
    const whiteAlive = unitCount(p, 0);
    const blackAlive = unitCount(p, 1);
    if (whiteAlive === 0 || blackAlive === 0) {
      p.result =
        whiteAlive === 0 && blackAlive === 0 ? Result.DRAW : whiteAlive === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
      p.reason = Reason.UPKEEP_ELIMINATION;
      return;
    }
    // `turn.phase` is already Prepare (`isLegalKeepSet` demands it) and nothing
    // resets it, so settling upkeep is the moment the home-checkmate gate opens.
    this.resolveHomeCheckmate(p);
  }

  /**
   * `endTurn`'s Phasing branch (`turn.ts:103-115`): the mover mines once, then
   * settles its OWN upkeep, then stands in Prepare. It STOPS at the phase
   * boundary — no clock, no handover, no healing (all of which belong to
   * `END_PLACE`). The pre-transition mate check `applyAction` performs at
   * `simulate.ts:28-31` is dead under Phasing, because `resolveHomeCheckmate`
   * refuses to adjudicate outside Prepare (`homeCheckmate.ts:170`) and
   * `END_ACTION` is legal only in ACT; the mate is picked up by the ordinary
   * `resolveHomeCheckmate` at the END of this method, with the phase now Prepare.
   */
  private makeEndAction(p: PackedState, u: Undo): void {
    const mover = p.side;
    const base = openRecord(u, AKind.END_ACTION, p);
    u.w[u.top++] = mover;
    u.w[u.top++] = p.actions;
    const incomeSlot = u.top++;
    const paidSlot = u.top++;
    u.w[paidSlot] = 0;
    const takeCountSlot = u.top++;

    // 1. income (mining.ts:18-34), simultaneous over the mover's units. Pending
    //    summons never mine: they are not units.
    let income = 0;
    let takes = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== mover) continue;
      const mine = this.cat.mine[p.defId[slot]];
      if (mine === 0) continue;
      const reserve = p.reserve[s];
      const take = mine < reserve ? mine : reserve;
      if (take === 0) continue;
      u.w[u.top++] = s;
      u.w[u.top++] = take;
      takes++;
      income += take;
      setReserve(p, s, reserve - take);
    }
    u.w[incomeSlot] = income;
    u.w[takeCountSlot] = takes;
    setBank(p, mover, p.bank[mover] + income);
    p.gained[mover] += income;

    // 2. Prepare, with the action budget spent (`actionsRemaining: 0`, turn.ts:107).
    setPhase(p, 0);
    setActions(p, 0);

    // 3. the mover's own upkeep, out of income it has just collected. Pending
    //    summons incur none.
    let due = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== mover) continue;
      due += this.cat.upkeep[p.defId[slot]];
    }
    if (due > p.bank[mover] || p.reviewUpkeep[mover] === 1) {
      closeRecord(u, base);
      setUpkeepPending(p, 1);
      // An `upkeepPending` node cannot be a mate: `resolveHomeCheckmate` bails
      // on it (homeCheckmate.ts:169) — "an invading piece must survive its own
      // end-of-action upkeep before Phasing can award immediate checkmate".
      return;
    }

    // Automatic affordable payment keeps every unit, so nothing is released —
    // but `completeUpkeep` still runs the full `checkVictory` over BOTH sides
    // (turn.ts:64), and on a position that was already empty for one side (the
    // fuzzer and the random suites reach those; legal play does not) that is
    // where the `upkeep-elimination` terminal is recorded.
    setBank(p, mover, p.bank[mover] - due);
    u.w[paidSlot] = due;
    closeRecord(u, base);
    const whiteAlive = unitCount(p, 0);
    const blackAlive = unitCount(p, 1);
    if (whiteAlive === 0 || blackAlive === 0) {
      p.result = whiteAlive === 0 && blackAlive === 0 ? Result.DRAW : whiteAlive === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
      p.reason = Reason.UPKEEP_ELIMINATION;
      return;
    }
    this.resolveHomeCheckmate(p);
  }

  /**
   * `resetUnitActions` (board.ts:267-294) for `side`: heal, clear the attack
   * history and the placement/promotion marks, restore `canActThisTurn`.
   * Appends `(slot, damage, atkCount, uflags)` restore words to `u` and
   * returns how many it wrote.
   */
  private resetUnitActions(p: PackedState, side: Side, u: Undo): number {
    let restores = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
      const damage = p.damage[slot];
      const atkCount = p.atkCount[slot];
      const flags = p.uflags[slot];
      if (damage === 0 && atkCount === 0 && flags === F_CAN_ACT) continue;
      u.w[u.top++] = slot;
      u.w[u.top++] = damage;
      u.w[u.top++] = atkCount;
      u.w[u.top++] = flags;
      restores++;
      setDamage(p, slot, 0);
      setUnitTurnState(p, slot, 0, F_CAN_ACT);
    }
    return restores;
  }

  // Standard's `finishPlacement` / `canActInPlacePhase` auto-advance is GONE:
  // under Phasing `finishPlacement` returns the state untouched
  // (`simulate.ts:118-121`) and `canActInPlacePhase` is never consulted, because
  // "preparation always ends explicitly, even when nothing is affordable".

  /** `side` holds the enemy corner — `getHomeOccupier(board, side)` (victory.ts:103-106). */
  private occupiesEnemyCorner(p: PackedState, side: Side): boolean {
    const occupant = p.pieceAt[CORNER[1 - side]];
    return occupant !== NO_SLOT && p.owner[occupant] === side;
  }

  /** The `resolveHomeCheckmate` short-circuit (homeCheckmate.ts:168-176), DESIGN §3.4. */
  needsProof(p: PackedState): boolean {
    return p.phase === 0 && needsProof(p);
  }

  /** `true` when the mover's occupation is an unanswerable checkmate. */
  private provesHomeCheckmate(p: PackedState): boolean {
    if (p.proverMode === 0) {
      if (this.occupiesEnemyCorner(p, 0) || this.occupiesEnemyCorner(p, 1)) {
        throw new Error('proverMode 0 requires an unoccupied enemy corner on both sides (DESIGN §3.4)');
      }
      return false;
    }
    // Phasing adjudicates ONLY in Prepare (homeCheckmate.ts:170): "an invading
    // piece must survive its own end-of-action upkeep before Phasing can award
    // immediate home-checkmate". `needsProof` already excludes `upkeepPending`.
    if (p.phase !== 0) return false;
    if (!needsProof(p)) return false;
    // `proverMode = 1` runs only the admissible damage bound
    // (`enoughPossibleDamage`, homeCheckmate.ts:27-49): its FAILURE proves the
    // mate, and because the bound is optimistic this can only ever UNDER-claim
    // one. `proverMode = 2` runs the full packed replica of the prover.
    if (p.proverMode === 1) return !damageBound(p, p.side, this.proverScratch, 0);
    this.fullProverCalls++;
    const verdict = homeVerdict(p, p.side, PROOF_NODES, this.proverScratch, 0);
    if (verdict === HomeVerdict.UNKNOWN) this.cappedProverCalls++;
    return verdict === HomeVerdict.MATE;
  }

  private resolveHomeCheckmate(p: PackedState): void {
    if (!this.provesHomeCheckmate(p)) return;
    p.result = p.side === 0 ? Result.WHITE_WIN : Result.BLACK_WIN;
    p.reason = Reason.HOME_CHECKMATE;
  }

  /** Exact inverse of the matching `make`. */
  unmake(p: PackedState, u: Undo): void {
    const length = u.w[u.top - 1];
    const base = u.top - length;
    const kind = u.w[base];
    p.result = u.w[base + 1] as PackedState['result'];
    p.reason = u.w[base + 2] as PackedState['reason'];
    let r = base + 3;
    switch (kind) {
      case AKind.MOVE: {
        const slot = u.w[r++];
        const from = u.w[r++];
        const cost = u.w[r++];
        const to = p.sq[slot];
        unlinkSquare(this.cat, p, slot, to);
        p.sq[slot] = from;
        linkSquare(this.cat, p, slot, from);
        setActions(p, p.actions + cost);
        break;
      }
      case AKind.ATTACK: {
        const slot = u.w[r++];
        const victim = u.w[r++];
        const oldDamage = u.w[r++];
        const oldFlags = u.w[r++];
        const oldCount = u.w[r++];
        const oldClock = u.w[r++];
        const oldProgress = u.w[r++];
        const target = u.w[r++];
        setActions(p, p.actions + 1);
        if (p.sq[victim] === DEAD) {
          p.sq[victim] = target;
          p.damage[victim] = oldDamage;
          linkSquare(this.cat, p, victim, target);
          addMaterial(this.cat, p, victim);
        } else {
          setDamage(p, victim, oldDamage);
        }
        setUnitTurnState(p, slot, oldCount, oldFlags);
        setClock(p, oldClock);
        setProgress(p, oldProgress as 0 | 1);
        break;
      }
      case AKind.BUY: {
        const s = u.w[r++];
        const cost = u.w[r++];
        const pendOrdNextBefore = u.w[r++];
        removePending(p, p.side, s);
        p.pendOrdNext = pendOrdNextBefore;
        setBank(p, p.side, p.bank[p.side] + cost);
        break;
      }
      case AKind.PROMOTE: {
        const slot = u.w[r++];
        const oldDef = u.w[r++];
        const oldFlags = u.w[r++];
        const cost = u.w[r++];
        const s = p.sq[slot];
        unlinkSquare(this.cat, p, slot, s);
        p.defId[slot] = oldDef;
        p.uflags[slot] = oldFlags;
        linkSquare(this.cat, p, slot, s);
        p.materialCc[p.owner[slot]] -= cost * CC;
        setBank(p, p.side, p.bank[p.side] + cost);
        break;
      }
      case AKind.END_PLACE: {
        const mover = u.w[r++] as Side;
        const actionsBefore = u.w[r++];
        const clockBefore = u.w[r++];
        const progressBefore = u.w[r++] as 0 | 1;
        const turnNumberBefore = u.w[r++];
        const slotCountBefore = u.w[r++];
        const ordNextBefore = u.w[r++];
        const pendN = u.w[r++];
        const pendBase = r;
        r += pendN * 11;
        const restores = u.w[r++];
        this.undoResetUnitActions(p, u, r, restores);
        const next = (1 - mover) as Side;
        // Reverse the arrivals/refunds, and the two id-stack pushes each made.
        for (let i = pendN - 1; i >= 0; i--) {
          const at = pendBase + i * 11;
          const s = u.w[at];
          const def = u.w[at + 1];
          const cost = u.w[at + 2];
          const slot = u.w[at + 3];
          const idx = next * PEND_STRIDE + s;
          p.pendIds[idx] = this.idStack.pop() ?? '';
          const displacedId = this.idStack.pop() ?? '';
          if (slot >= 0) {
            unlinkSquare(this.cat, p, slot, s);
            subMaterial(this.cat, p, slot);
            p.sq[slot] = DEAD;
            p.defId[slot] = u.w[at + 4];
            p.owner[slot] = u.w[at + 5];
            p.damage[slot] = u.w[at + 6];
            p.atkCount[slot] = u.w[at + 7];
            p.uflags[slot] = u.w[at + 8];
            p.ord[slot] = u.w[at + 9];
            p.originIds[slot] = displacedId;
          } else {
            setBank(p, next, p.bank[next] - cost);
          }
          addPending(p, next, s, def, cost, u.w[at + 10]);
        }
        p.ordNext = ordNextBefore;
        p.slotCount = slotCountBefore;
        setSide(p, mover);
        setPhase(p, 0);
        setActions(p, actionsBefore);
        setClock(p, clockBefore);
        setProgress(p, progressBefore);
        p.turnNumber = turnNumberBefore;
        break;
      }
      case AKind.RESIGN:
        break;
      case AKind.PAY_UPKEEP: {
        const paid = u.w[r++];
        const released = u.w[r++];
        const releaseBase = r;
        for (let i = released - 1; i >= 0; i--) {
          const slot = u.w[releaseBase + i * 2];
          const s = u.w[releaseBase + i * 2 + 1];
          p.sq[slot] = s;
          linkSquare(this.cat, p, slot, s);
          addMaterial(this.cat, p, slot);
        }
        setBank(p, p.side, p.bank[p.side] + paid);
        setUpkeepPending(p, 1);
        break;
      }
      case AKind.END_ACTION: {
        const mover = u.w[r++] as Side;
        const actionsBefore = u.w[r++];
        const income = u.w[r++];
        const paid = u.w[r++];
        const takes = u.w[r++];
        const takeBase = r;
        // The mover pays its OWN upkeep under Phasing, so `paid` comes back to
        // the same side the income went to.
        if (paid !== 0) setBank(p, mover, p.bank[mover] + paid);
        for (let i = takes - 1; i >= 0; i--) {
          const s = u.w[takeBase + i * 2];
          const amount = u.w[takeBase + i * 2 + 1];
          setReserve(p, s, p.reserve[s] + amount);
        }
        setBank(p, mover, p.bank[mover] - income);
        p.gained[mover] -= income;
        setUpkeepPending(p, 0);
        setPhase(p, 1);
        setActions(p, actionsBefore);
        break;
      }
      default:
        throw new Error(`unmake: unknown record kind ${kind}`);
    }
    u.top = base;
  }

  private undoResetUnitActions(p: PackedState, u: Undo, base: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      const at = base + i * 4;
      const slot = u.w[at];
      setDamage(p, slot, u.w[at + 1]);
      setUnitTurnState(p, slot, u.w[at + 2], u.w[at + 3]);
    }
  }

  // --- maintenance ---------------------------------------------------------

  /**
   * Recompute every derived field from the unit/board arrays and the
   * `pendDef`/`pendCost` planes (DESIGN §4.4). `pendBB`, `pendCount` and
   * `pendCostSum` are derived, so `pack` writes only the two planes.
   */
  rehash(p: PackedState): void {
    p.pieceAt.fill(NO_SLOT);
    p.occ.fill(0);
    p.occBy.fill(0);
    p.occTier.fill(0);
    p.pendBB.fill(0);
    p.pendCount.fill(0);
    p.pendCostSum.fill(0);
    for (let i = 0; i < 2 * PEND_STRIDE; i++) {
      if (p.pendDef[i] === 0) continue;
      const side = (i / PEND_STRIDE) | 0;
      const s = i % PEND_STRIDE;
      p.pendBB[side * 4 + (s >>> 5)] |= 1 << (s & 31);
      p.pendCount[side] += 1;
      p.pendCostSum[side] += p.pendCost[i];
    }
    p.materialCc[0] = 0;
    p.materialCc[1] = 0;
    p.pstSumCc[0] = 0;
    p.pstSumCc[1] = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD) continue;
      const owner = p.owner[slot];
      const def = p.defId[slot];
      const word = s >>> 5;
      const bit = 1 << (s & 31);
      p.pieceAt[s] = slot;
      p.occ[word] |= bit;
      p.occBy[owner * 4 + word] |= bit;
      p.occTier[(this.cat.tier[def] - 1) * 4 + word] |= bit;
      p.materialCc[owner] += this.cat.cost[def] * CC;
      p.pstSumCc[owner] += PST_MINE[def * RESERVE_VALUES + p.reserve[s]];
    }
    p.occHash = recomputeOccHash(p);
    const kpos = recomputeKpos(p);
    p.kposLo = kpos.lo;
    p.kposHi = kpos.hi;
    const kturn = recomputeKturn(p);
    p.kturnLo = kturn.lo;
    p.kturnHi = kturn.hi;
  }

  /**
   * Drops the arrival id-displacement stack. Call ONLY with an empty matching
   * `Undo` stack: a forward-only driver (the differential fuzzer, `unpack`
   * tooling) resets both once per applied action, while a search unwinds them
   * in lock step and never calls this.
   */
  resetUndoScratch(): void {
    this.idStack.length = 0;
  }

  /** ET §8.6 invariants (DESIGN §3.4). Throws on the first violation. */
  check(p: PackedState): void {
    let reserveTotal = 0;
    let initialTotal = 0;
    for (let s = 0; s < BOARD; s++) {
      reserveTotal += p.reserve[s];
      initialTotal += p.initialReserve[s];
      const slot = p.pieceAt[s];
      if (slot !== NO_SLOT && p.sq[slot] !== s) throw new Error(`check: pieceAt[${s}] = ${slot} but sq[${slot}] = ${p.sq[slot]}`);
    }
    if (reserveTotal + p.gained[0] + p.gained[1] !== initialTotal) {
      throw new Error(`check: conservation broken (${reserveTotal} + ${p.gained[0]} + ${p.gained[1]} !== ${initialTotal})`);
    }
    const occ = bbNew();
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD) continue;
      if (s >= BOARD) throw new Error(`check: slot ${slot} off board at ${s}`);
      if (p.pieceAt[s] !== slot) throw new Error(`check: sq[${slot}] = ${s} but pieceAt[${s}] = ${p.pieceAt[s]}`);
      const def = p.defId[slot];
      if (p.damage[slot] >= this.cat.def[def]) throw new Error(`check: slot ${slot} damage ${p.damage[slot]} >= def ${this.cat.def[def]}`);
      if (p.atkCount[slot] > this.cat.tier[def]) throw new Error(`check: slot ${slot} atkCount ${p.atkCount[slot]} > tier ${this.cat.tier[def]}`);
      occ[s >>> 5] |= 1 << (s & 31);
    }
    for (let w = 0; w < 4; w++) {
      if (occ[w] !== p.occ[w]) throw new Error(`check: occ word ${w} inconsistent`);
      if ((p.occBy[w] & p.occBy[4 + w]) !== 0) throw new Error(`check: occBy lanes overlap at word ${w}`);
      if (((p.occBy[w] | p.occBy[4 + w]) >>> 0) !== (p.occ[w] >>> 0)) throw new Error(`check: occBy does not partition occ at word ${w}`);
    }
    if (p.actions < 0 || p.actions > ACTIONS_PER_TURN) throw new Error(`check: actions ${p.actions} out of range`);
    if (p.clock < 0 || p.clock > MAX_CLOCK) throw new Error(`check: clock ${p.clock} out of range`);
    if (p.bank[0] < 0 || p.bank[1] < 0) throw new Error('check: negative bank');
    if (bbCount(occ) !== unitCount(p, 0) + unitCount(p, 1)) throw new Error('check: occupancy count mismatch');

    // The canonical array order (M2-STATUS §2.6): every living slot carries a
    // distinct birth sequence below the counter. A duplicate would make
    // `unpack`'s and the prover's sort order depend on the tie-break — which is
    // slot order, the very thing this plane exists to stop being load-bearing.
    let live = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD) continue;
      const ord = p.ord[slot];
      if (ord < 0 || ord >= p.ordNext) throw new Error(`check: ord[${slot}] ${ord} outside 0..${p.ordNext - 1}`);
      ORD_SEEN[live++] = ord;
    }
    insertionSort(ORD_SEEN, live, (x, y) => x - y);
    for (let i = 1; i < live; i++) {
      if (ORD_SEEN[i] === ORD_SEEN[i - 1]) throw new Error(`check: two living slots share ord ${ORD_SEEN[i]}`);
    }
    let pendLive = 0;
    for (let i = 0; i < 2 * PEND_STRIDE; i++) {
      if (p.pendDef[i] === 0) continue;
      const ord = p.pendOrd[i];
      if (ord < 0 || ord >= p.pendOrdNext) throw new Error(`check: pendOrd[${i}] ${ord} outside 0..${p.pendOrdNext - 1}`);
      ORD_SEEN[pendLive++] = ord;
    }
    insertionSort(ORD_SEEN, pendLive, (x, y) => x - y);
    for (let i = 1; i < pendLive; i++) {
      if (ORD_SEEN[i] === ORD_SEEN[i - 1]) throw new Error(`check: two commitments share pendOrd ${ORD_SEEN[i]}`);
    }

    // Pending summons: the plane, the bitboard and the two counters agree, and
    // every stored cost is still the catalogue cost `pack` admitted.
    const pend = bbNew();
    for (let side = 0; side < 2; side++) {
      let count = 0;
      let costSum = 0;
      bbZero(pend);
      for (let s = 0; s < BOARD; s++) {
        const def = p.pendDef[side * PEND_STRIDE + s];
        if (def === 0) continue;
        if (def - 1 >= DEF_ID.length || this.cat.tier[def - 1] !== 1) throw new Error(`check: pending ${side}.${s} is not a tier-1 definition`);
        const cost = p.pendCost[side * PEND_STRIDE + s];
        if (cost !== this.cat.cost[def - 1]) throw new Error(`check: pending ${side}.${s} cost ${cost} !== catalogue ${this.cat.cost[def - 1]}`);
        pend[s >>> 5] |= 1 << (s & 31);
        count++;
        costSum += cost;
      }
      for (let w = 0; w < 4; w++) {
        if (pend[w] !== p.pendBB[side * 4 + w]) throw new Error(`check: pendBB word ${w} inconsistent for side ${side}`);
      }
      if (count !== p.pendCount[side]) throw new Error(`check: pendCount[${side}] ${p.pendCount[side]} !== ${count}`);
      if (costSum !== p.pendCostSum[side]) throw new Error(`check: pendCostSum[${side}] ${p.pendCostSum[side]} !== ${costSum}`);
    }

    // The incremental keys against a from-scratch recompute. `Kpos` now carries
    // the `pend` plane, so a commitment that `make` XORed but `unmake` forgot
    // (or vice versa) shows up here rather than as a silent TT collision.
    const kpos = recomputeKpos(p);
    if (p.kposLo !== kpos.lo || p.kposHi !== kpos.hi) {
      throw new Error(`check: Kpos ${p.kposLo}.${p.kposHi} !== recomputed ${kpos.lo}.${kpos.hi}`);
    }
    const kturn = recomputeKturn(p);
    if (p.kturnLo !== kturn.lo || p.kturnHi !== kturn.hi) {
      throw new Error(`check: Kturn ${p.kturnLo}.${p.kturnHi} !== recomputed ${kturn.lo}.${kturn.hi}`);
    }
    if (p.occHash !== recomputeOccHash(p)) throw new Error('check: occHash !== recomputed');
  }

  /** The fuzzer's 25-field comparison surface; square-keyed, slot-order independent. */
  digest(p: PackedState): string {
    const board: string[] = [];
    for (let s = 0; s < BOARD; s++) {
      const slot = p.pieceAt[s];
      if (slot === NO_SLOT) continue;
      board.push(`${s}.${p.owner[slot]}.${p.defId[slot]}.${p.damage[slot]}.${p.atkCount[slot]}.${p.uflags[slot] & UFLAGS_MASK}`);
    }
    // Commitments, side-then-square ascending: `side.sq.def.cost`. Sorted by
    // construction, which is what makes the surface buy-order independent —
    // the canonical `pendingSummons` array is in buy order and must not show.
    const pend: string[] = [];
    for (let side = 0; side < 2; side++) {
      for (let s = 0; s < BOARD; s++) {
        const def = p.pendDef[side * PEND_STRIDE + s];
        if (def !== 0) pend.push(`${side}.${s}.${def - 1}.${p.pendCost[side * PEND_STRIDE + s]}`);
      }
    }
    const reserve: string[] = new Array<string>(BOARD);
    for (let s = 0; s < BOARD; s++) reserve[s] = String(p.reserve[s]);
    return [
      board.join(','),
      pend.join(','),
      reserve.join(''),
      p.kposLo,
      p.kposHi,
      p.kturnLo,
      p.kturnHi,
      p.occHash,
      p.bank[0],
      p.bank[1],
      p.gained[0],
      p.gained[1],
      p.side,
      p.phase,
      p.actions,
      p.turnNumber,
      p.upkeepPending,
      p.clock,
      p.progress,
      p.handicap,
      p.victoryHome,
      p.drawRuleOn,
      `${p.reviewUpkeep[0]}${p.reviewUpkeep[1]}`,
      `${p.result}.${p.reason}`,
      `${p.materialCc[0]}.${p.materialCc[1]}.${p.pstSumCc[0]}.${p.pstSumCc[1]}`,
    ].join('|');
  }

}

/**
 * The canonical ORDER of a packed state, as a comparable string: the living
 * units' squares in `board.units` order, then the commitments as `side.square`
 * in `pendingSummons` order.
 *
 * RANK-NORMALISED deliberately. `pack` numbers the birth sequence from 0 while
 * an incrementally reached state numbers from wherever its arrivals landed, so
 * two states that agree on ORDER disagree on the raw sequence VALUES, and the
 * contract is the order. A square identifies a living unit uniquely (two never
 * share one) and `(side, square)` identifies a commitment uniquely
 * (`hasPendingSummon`, summoning.ts:5-7), so these two lists are the canonical
 * arrays with everything the square-keyed comparisons already cover stripped
 * out. `digest` stays order-BLIND — the search is entitled to transpose
 * buy-order permutations — and this is the separate surface that is not.
 */
export function orderKey(p: PackedState): string {
  const slots: number[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD) slots.push(slot);
  slots.sort((a, b) => p.ord[a] - p.ord[b]);
  const pend: number[] = [];
  for (let i = 0; i < 2 * PEND_STRIDE; i++) if (p.pendDef[i] !== 0) pend.push(i);
  pend.sort((a, b) => p.pendOrd[a] - p.pendOrd[b]);
  return `${slots.map(slot => p.sq[slot]).join(',')}|${pend
    .map(i => `${(i / PEND_STRIDE) | 0}.${i % PEND_STRIDE}`)
    .join(',')}`;
}

// --- helpers -----------------------------------------------------------------

const REASON_OF: Readonly<Record<string, Reason>> = {
  elimination: Reason.ELIMINATION,
  'upkeep-elimination': Reason.UPKEEP_ELIMINATION,
  'home-occupation': Reason.HOME_OCCUPATION,
  'home-checkmate': Reason.HOME_CHECKMATE,
  inactivity: Reason.INACTIVITY,
  resignation: Reason.RESIGNATION,
  timeout: Reason.NONE,
};

const REASON_NAME: readonly GameState['victoryReason'][] = [
  undefined,
  'elimination',
  'upkeep-elimination',
  'home-occupation',
  'home-checkmate',
  'inactivity',
  'resignation',
];

/** `ADJ_LIST` slot indices in ascending-square order: up, left, right, down. */
const ASCENDING_ADJ = [0, 2, 3, 1] as const;

/** The lowest reusable slot, or -1. A side can hold at most 100 units, so a
 * 128-slot table never runs out in a legal position. */
function lowestDeadSlot(p: PackedState): Slot {
  for (let i = 0; i < MAX_SLOTS; i++) if (p.sq[i] === DEAD) return i;
  return -1;
}

function isAdjacentSquare(a: Square, b: Square): boolean {
  const base = a * 4;
  return ADJ_LIST[base] === b || ADJ_LIST[base + 1] === b || ADJ_LIST[base + 2] === b || ADJ_LIST[base + 3] === b;
}

/** Opens an undo record: `[KIND, oldResult, oldReason, ...]`; returns its base. */
function openRecord(u: Undo, kind: number, p: PackedState): number {
  const base = u.top;
  u.w[u.top++] = kind;
  u.w[u.top++] = p.result;
  u.w[u.top++] = p.reason;
  return base;
}

/**
 * Closes an undo record with its own length. DESIGN §3.4 tabulates the payload
 * with `KIND` first; a trailing length word is the one addition, and it is what
 * lets `unmake(p, u)` find a variable-length record's base with only the stack
 * pointer in hand (`PAY_UPKEEP` and `END_ACTION` are both variable-length).
 */
function closeRecord(u: Undo, base: number): void {
  u.w[u.top] = u.top - base + 1;
  u.top++;
}

function insertionSort(a: Int32Array, n: number, compare: (x: number, y: number) => number): void {
  for (let i = 1; i < n; i++) {
    const value = a[i];
    let j = i - 1;
    while (j >= 0 && compare(a[j], value) > 0) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = value;
  }
}


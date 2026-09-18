/**
 * The packed replica of the canonical rules engine (DESIGN §3.1, §3.4, §4.4).
 *
 * `Replica` is a byte-for-byte mirror of `src/game` + `src/ai/simulate.ts`
 * over `PackedState`:
 *
 *   - `pack`/`unpack` cross the boundary in both directions;
 *   - `isLegal` reproduces `legality.ts:16-47`;
 *   - `genActions`/`genPlace`/`genKeepSets` reproduce `src/ai/moves.ts`
 *     `generateAllActions` (expanded to multi-action MOVEs, DESIGN §4.4);
 *   - `make`/`unmake` reproduce `applyAction` (`simulate.ts:25`) — including
 *     the five rule terminals, the automatic upkeep at the turn boundary and
 *     the `finishPlacement` auto-advance — while maintaining the incremental
 *     `Kpos`/`Kturn`/`occHash` keys and the `materialCc`/`pstSumCc` stage-0
 *     sums, and while allocating nothing per node.
 *
 * Everything is keyed BY SQUARE (DESIGN F10 §3.3), so a slot is nothing but a
 * handle: buy-order permutations transpose, and `digest` — the fuzzer's
 * comparison surface — is slot-order independent by construction.
 *
 * The home-checkmate gate is fully packed as of M10: `make` calls
 * `tactics/prover.ts` — `homeVerdict` at `proverMode = 2`, the admissible
 * `damageBound` alone at `proverMode = 1` (DESIGN §3.4). The canonical
 * `analyzeHomeDefense` survives only as M10's differential gate, so `make`
 * no longer unpacks anything. See `docs/hard-ai/design/DEVIATIONS.md` under
 * M5 and M10.
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
  Reason,
  Result,
  UFLAGS_MASK,
  type PackedState,
  type Side,
  type Slot,
  type Square,
} from '../types';
import type { GameState, PlayerId, Unit, Cell } from '../../../game/types';
import { INITIAL_RESOURCE_LAYERS } from '../../../game/board';
import { MAX_RESOURCE_RESERVE } from '../../../game/resourceMap';
import { getAttackCount } from '../../../game/combat';
import { HomeVerdict, PROOF_NODES, damageBound, homeVerdict, needsProof } from '../tactics/prover';
import { Scratch, bbCount, bbNew, bbNext } from './bits';
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
  zPiece,
  zReserve,
  zUflags,
} from './zobrist';
import { createDistanceCache, moveCost, type DistanceCache, type ReachMemo } from './movement';
import { isLegalSpawn, newSpawnInfo, spawnInfo, type SpawnInfo } from './spawn';
import { PST_MINE, RENT_PV, RESERVE_VALUES } from './income';

export { DEAD, F_CAN_ACT, F_LAST_KILLED, F_PLACED, F_PROMOTED, MAX_SLOTS, MAX_TURN_ACTIONS, NO_SLOT } from '../types';
export type { PackedState } from '../types';

/** `inactivityPlies` is clamped into the Zobrist `clock` plane's domain (DESIGN §3.1). */
export const MAX_CLOCK = 10;
/** `resolveInactivityDraw` fires at this many quiet plies (inactivity.ts:3). */
export const INACTIVITY_LIMIT = 10;
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

/** DESIGN §3.4: one `Int32Array(8192)` per search, with a stack pointer. */
export const UNDO_WORDS = 8192;

export function newUndo(): Undo {
  return { w: new Int32Array(UNDO_WORDS), top: 0 };
}

/**
 * Undo record kinds. The seven action kinds reuse their `AKind` value; `HOME_MATE`
 * is the `END_ACTION` that the home-checkmate gate resolved before the turn
 * boundary ran (`simulate.ts:28-31`), which mutates nothing but `result`/`reason`.
 */
const U_HOME_MATE = 8;

export function allocState(): PackedState {
  return {
    sq: new Uint8Array(MAX_SLOTS).fill(DEAD),
    defId: new Uint8Array(MAX_SLOTS),
    owner: new Uint8Array(MAX_SLOTS),
    damage: new Uint8Array(MAX_SLOTS),
    atkCount: new Uint8Array(MAX_SLOTS),
    uflags: new Uint8Array(MAX_SLOTS),
    slotCount: 0,
    pieceAt: new Uint8Array(BOARD).fill(NO_SLOT),
    occ: new Uint32Array(4),
    occBy: new Uint32Array(8),
    occTier: new Uint32Array(12),
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
  };
}

export function copyState(dst: PackedState, src: PackedState): void {
  dst.sq.set(src.sq);
  dst.defId.set(src.defId);
  dst.owner.set(src.owner);
  dst.damage.set(src.damage);
  dst.atkCount.set(src.atkCount);
  dst.uflags.set(src.uflags);
  dst.pieceAt.set(src.pieceAt);
  dst.occ.set(src.occ);
  dst.occBy.set(src.occBy);
  dst.occTier.set(src.occTier);
  dst.reserve.set(src.reserve);
  dst.initialReserve.set(src.initialReserve);
  dst.bank.set(src.bank);
  dst.gained.set(src.gained);
  dst.reviewUpkeep.set(src.reviewUpkeep);
  dst.materialCc.set(src.materialCc);
  dst.pstSumCc.set(src.pstSumCc);
  dst.slotCount = src.slotCount;
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

// --- the replica -------------------------------------------------------------

export class Replica {
  readonly cat: Catalog;
  /** BFS distance cache shared by `isLegal`, `genActions` and `make`. */
  readonly dist: DistanceCache;
  private readonly spawn: SpawnInfo = newSpawnInfo();
  private readonly spawnScratch: SpawnInfo = newSpawnInfo();
  /**
   * `originIds` entries displaced by a BUY into a reused dead slot. Strings
   * cannot live in the `Int32Array` undo stack; `make`/`unmake` are strictly
   * LIFO-paired on one `Replica`, exactly like the undo stack itself.
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
    out.originIds.length = 0;

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
      out.originIds[i] = u.id;
    }
    out.slotCount = units.length;

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
    const units: Unit[] = [];
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD) continue;
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

    return {
      actionsPerTurn: ACTIONS_PER_TURN,
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
        return s < BOARD && isLegalSpawn(p, side, s);
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

  /** Place phase: BUY (defId ascending, square ascending), PROMOTE, `END_PLACE`. */
  genPlace(p: PackedState, out: Int32Array): number {
    if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 0) return 0;
    let n = 0;
    const side = p.side;
    const cash = p.bank[side];
    spawnInfo(p, side, this.spawn);
    // `generatePlaceActions` iterates UNIT_DEFINITIONS order, not cost order.
    for (let def = 0; def < DEF_ID.length; def++) {
      if (this.cat.tier[def] !== 1 || this.cat.cost[def] > cash) continue;
      for (let s = bbNext(this.spawn.legal, -1); s >= 0; s = bbNext(this.spawn.legal, s)) {
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
      p.progress = 1;
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

  private makeBuy(p: PackedState, a: PA, u: Undo): void {
    const def = paA(a);
    const s = paB(a);
    const side = p.side;
    let slot = -1;
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (p.sq[i] === DEAD) {
        slot = i;
        break;
      }
    }
    if (slot < 0) throw new Error('make BUY: no free slot');

    // A reused dead slot still carries the per-unit fields of whatever died or
    // was released there. `unmake` of that earlier ATTACK/PAY_UPKEEP resurrects
    // the unit by writing `sq` back and calling `linkSquare`, which reads
    // `defId`/`owner`/`damage`/`atkCount`/`uflags` straight out of the slot — so
    // this BUY's undo must put them back exactly. (DESIGN §3.4's BUY row does
    // not list them; see DEVIATIONS.md under M5.)
    const base = openRecord(u, AKind.BUY, p);
    u.w[u.top++] = slot;
    u.w[u.top++] = this.cat.cost[def];
    u.w[u.top++] = p.phase;
    u.w[u.top++] = p.actions;
    u.w[u.top++] = p.slotCount;
    u.w[u.top++] = p.defId[slot];
    u.w[u.top++] = p.owner[slot];
    u.w[u.top++] = p.damage[slot];
    u.w[u.top++] = p.atkCount[slot];
    u.w[u.top++] = p.uflags[slot];
    closeRecord(u, base);

    this.idStack.push(p.originIds[slot] ?? '');
    p.originIds[slot] = '';
    p.sq[slot] = s;
    p.defId[slot] = def;
    p.owner[slot] = side;
    p.damage[slot] = 0;
    p.atkCount[slot] = 0;
    p.uflags[slot] = F_CAN_ACT | F_PLACED;
    linkSquare(this.cat, p, slot, s);
    addMaterial(this.cat, p, slot);
    if (slot >= p.slotCount) p.slotCount = slot + 1;
    setBank(p, side, p.bank[side] - this.cat.cost[def]);
    this.finishPlacement(p);
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
    u.w[u.top++] = p.phase;
    u.w[u.top++] = p.actions;
    closeRecord(u, base);

    const s = p.sq[slot];
    unlinkSquare(this.cat, p, slot, s);
    p.defId[slot] = this.cat.nextDef[oldDef];
    p.uflags[slot] |= F_PROMOTED;
    linkSquare(this.cat, p, slot, s);
    p.materialCc[p.owner[slot]] += cost * CC;
    setBank(p, side, p.bank[side] - cost);
    this.finishPlacement(p);
    this.resolveHomeCheckmate(p);
  }

  private makeEndPlace(p: PackedState, u: Undo): void {
    const base = openRecord(u, AKind.END_PLACE, p);
    u.w[u.top++] = p.actions;
    closeRecord(u, base);
    setPhase(p, 1);
    setActions(p, ACTIONS_PER_TURN);
    this.resolveHomeCheckmate(p);
  }

  private makeResign(p: PackedState, u: Undo): void {
    const base = openRecord(u, AKind.RESIGN, p);
    closeRecord(u, base);
    p.result = p.side === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
    p.reason = Reason.RESIGNATION;
  }

  private makePayUpkeep(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    if (keep === undefined) throw new Error('make PAY_UPKEEP: no keep-set table');
    const index = paA(a);
    const side = p.side;

    const base = openRecord(u, AKind.PAY_UPKEEP, p);
    const paidSlot = u.top++;
    u.w[u.top++] = p.phase;
    u.w[u.top++] = p.actions;
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

    // `completeUpkeep` runs the full `checkVictory` (turn.ts:53-56), which looks
    // at BOTH sides — releasing your last unit is not the only way a settled
    // board can be terminal.
    const restoreCountSlot = u.top++;
    const whiteAlive = unitCount(p, 0);
    const blackAlive = unitCount(p, 1);
    if (whiteAlive === 0 || blackAlive === 0) {
      u.w[restoreCountSlot] = 0;
      closeRecord(u, base);
      p.result =
        whiteAlive === 0 && blackAlive === 0 ? Result.DRAW : whiteAlive === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
      p.reason = Reason.UPKEEP_ELIMINATION;
      return;
    }
    const restores = this.resetUnitActions(p, side, u);
    u.w[restoreCountSlot] = restores;
    closeRecord(u, base);

    setPhase(p, 0);
    setActions(p, ACTIONS_PER_TURN);
    if (!this.canActInPlacePhase(p, side)) {
      setPhase(p, 1);
      setActions(p, ACTIONS_PER_TURN);
    }
    this.resolveHomeCheckmate(p);
  }

  private makeEndAction(p: PackedState, u: Undo): void {
    // `applyAction` adjudicates an existing occupation BEFORE the boundary
    // runs (simulate.ts:28-31): a proven mate ends the game at the action.
    if (this.provesHomeCheckmate(p)) {
      const base = openRecord(u, U_HOME_MATE, p);
      closeRecord(u, base);
      p.result = p.side === 0 ? Result.WHITE_WIN : Result.BLACK_WIN;
      p.reason = Reason.HOME_CHECKMATE;
      return;
    }

    const mover = p.side;
    const base = openRecord(u, AKind.END_ACTION, p);
    u.w[u.top++] = mover;
    u.w[u.top++] = p.phase;
    u.w[u.top++] = p.actions;
    u.w[u.top++] = p.clock;
    u.w[u.top++] = p.progress;
    u.w[u.top++] = p.turnNumber;
    u.w[u.top++] = p.upkeepPending;
    const incomeSlot = u.top++;
    const paidSlot = u.top++;
    u.w[paidSlot] = 0;
    const takeCountSlot = u.top++;

    // 1. income (mining.ts:18-34), simultaneous over the mover's units.
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

    // 2-3. quiet-turn clock, then the inactivity draw (turn.ts:96-100).
    const plies = p.progress === 1 ? 0 : p.clock + 1;
    setClock(p, plies);
    p.progress = 0;
    if (p.drawRuleOn === 1 && plies >= INACTIVITY_LIMIT) {
      u.w[u.top++] = 0;
      closeRecord(u, base);
      p.result = Result.DRAW;
      p.reason = Reason.INACTIVITY;
      return;
    }

    // 4-5. hand off, then `startTurn` for the incoming side (turn.ts:19-34).
    const next = (1 - mover) as Side;
    if (next === 0) p.turnNumber += 1;

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
    const whiteAlive = unitCount(p, 0);
    const blackAlive = unitCount(p, 1);
    if (whiteAlive === 0 || blackAlive === 0) {
      u.w[u.top++] = 0;
      closeRecord(u, base);
      // `startTurn` leaves the turn state untouched on an elimination.
      p.result = whiteAlive === 0 && blackAlive === 0 ? Result.DRAW : whiteAlive === 0 ? Result.BLACK_WIN : Result.WHITE_WIN;
      p.reason = Reason.ELIMINATION;
      return;
    }

    setUpkeepPending(p, 1);
    setSide(p, next);
    setPhase(p, 0);
    setActions(p, ACTIONS_PER_TURN);

    let due = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== next) continue;
      due += this.cat.upkeep[p.defId[slot]];
    }
    if (due > p.bank[next] || p.reviewUpkeep[next] === 1) {
      u.w[paidSlot] = 0;
      u.w[u.top++] = 0;
      closeRecord(u, base);
      return;
    }

    // Automatic affordable payment keeps every unit, so nothing is released.
    setUpkeepPending(p, 0);
    setBank(p, next, p.bank[next] - due);
    u.w[paidSlot] = due;
    const restoreCountSlot = u.top++;
    u.w[restoreCountSlot] = this.resetUnitActions(p, next, u);
    closeRecord(u, base);

    if (!this.canActInPlacePhase(p, next)) {
      setPhase(p, 1);
      setActions(p, ACTIONS_PER_TURN);
    }
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

  /** `finishPlacement` (simulate.ts:118-120) after a BUY or PROMOTE. */
  private finishPlacement(p: PackedState): void {
    if (this.canActInPlacePhase(p, p.side)) return;
    setPhase(p, 1);
    setActions(p, ACTIONS_PER_TURN);
  }

  /** `canActInPlacePhase` (turn.ts:141-145). */
  private canActInPlacePhase(p: PackedState, side: Side): boolean {
    if (p.upkeepPending === 1) return true;
    const cash = p.bank[side];
    let affordable = false;
    for (let i = 0; i < this.cat.tier1.length; i++) {
      if (this.cat.cost[this.cat.tier1[i]] <= cash) {
        affordable = true;
        break;
      }
    }
    if (affordable) {
      spawnInfo(p, side, this.spawn);
      if (this.spawn.area > 0) return true;
    }
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
      if (this.canPromote(p, slot, cash)) return true;
    }
    return false;
  }

  /** `side` holds the enemy corner — `getHomeOccupier(board, side)` (victory.ts:103-106). */
  private occupiesEnemyCorner(p: PackedState, side: Side): boolean {
    const occupant = p.pieceAt[CORNER[1 - side]];
    return occupant !== NO_SLOT && p.owner[occupant] === side;
  }

  /** The `resolveHomeCheckmate` short-circuit (homeCheckmate.ts:173-176), DESIGN §3.4. */
  needsProof(p: PackedState): boolean {
    return needsProof(p);
  }

  /** `true` when the mover's occupation is an unanswerable checkmate. */
  private provesHomeCheckmate(p: PackedState): boolean {
    if (p.proverMode === 0) {
      if (this.occupiesEnemyCorner(p, 0) || this.occupiesEnemyCorner(p, 1)) {
        throw new Error('proverMode 0 requires an unoccupied enemy corner on both sides (DESIGN §3.4)');
      }
      return false;
    }
    if (!needsProof(p)) return false;
    // `proverMode = 1` runs only the admissible damage bound
    // (`enoughPossibleDamage`, homeCheckmate.ts:27-49): its FAILURE proves the
    // mate, and because the bound is optimistic this can only ever UNDER-claim
    // one. `proverMode = 2` runs the full packed replica of the prover.
    if (p.proverMode === 1) return !damageBound(p, p.side, this.proverScratch, 0);
    this.fullProverCalls++;
    return homeVerdict(p, p.side, PROOF_NODES, this.proverScratch, 0) === HomeVerdict.MATE;
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
        p.progress = oldProgress as 0 | 1;
        break;
      }
      case AKind.BUY: {
        const slot = u.w[r++];
        const cost = u.w[r++];
        const phaseBefore = u.w[r++] as 0 | 1;
        const actionsBefore = u.w[r++];
        const slotCountBefore = u.w[r++];
        const defBefore = u.w[r++];
        const ownerBefore = u.w[r++];
        const damageBefore = u.w[r++];
        const atkCountBefore = u.w[r++];
        const flagsBefore = u.w[r++];
        setPhase(p, phaseBefore);
        setActions(p, actionsBefore);
        const s = p.sq[slot];
        unlinkSquare(this.cat, p, slot, s);
        subMaterial(this.cat, p, slot);
        p.sq[slot] = DEAD;
        p.defId[slot] = defBefore;
        p.owner[slot] = ownerBefore;
        p.damage[slot] = damageBefore;
        p.atkCount[slot] = atkCountBefore;
        p.uflags[slot] = flagsBefore;
        setBank(p, p.side, p.bank[p.side] + cost);
        p.slotCount = slotCountBefore;
        p.originIds[slot] = this.idStack.pop() ?? '';
        break;
      }
      case AKind.PROMOTE: {
        const slot = u.w[r++];
        const oldDef = u.w[r++];
        const oldFlags = u.w[r++];
        const cost = u.w[r++];
        const phaseBefore = u.w[r++] as 0 | 1;
        const actionsBefore = u.w[r++];
        setPhase(p, phaseBefore);
        setActions(p, actionsBefore);
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
        const actionsBefore = u.w[r++];
        setPhase(p, 0);
        setActions(p, actionsBefore);
        break;
      }
      case AKind.RESIGN:
      case U_HOME_MATE:
        break;
      case AKind.PAY_UPKEEP: {
        const paid = u.w[r++];
        const phaseBefore = u.w[r++] as 0 | 1;
        const actionsBefore = u.w[r++];
        const released = u.w[r++];
        const releaseBase = r;
        r += released * 2;
        const restores = u.w[r++];
        this.undoResetUnitActions(p, u, r, restores);
        for (let i = released - 1; i >= 0; i--) {
          const slot = u.w[releaseBase + i * 2];
          const s = u.w[releaseBase + i * 2 + 1];
          p.sq[slot] = s;
          linkSquare(this.cat, p, slot, s);
          addMaterial(this.cat, p, slot);
        }
        setBank(p, p.side, p.bank[p.side] + paid);
        setUpkeepPending(p, 1);
        setPhase(p, phaseBefore);
        setActions(p, actionsBefore);
        break;
      }
      case AKind.END_ACTION: {
        const mover = u.w[r++] as Side;
        const phaseBefore = u.w[r++] as 0 | 1;
        const actionsBefore = u.w[r++];
        const clockBefore = u.w[r++];
        const progressBefore = u.w[r++] as 0 | 1;
        const turnNumberBefore = u.w[r++];
        const upkeepBefore = u.w[r++] as 0 | 1;
        const income = u.w[r++];
        const paid = u.w[r++];
        const takes = u.w[r++];
        const takeBase = r;
        r += takes * 2;
        const restores = u.w[r++];
        this.undoResetUnitActions(p, u, r, restores);
        const next = (1 - mover) as Side;
        if (paid !== 0) setBank(p, next, p.bank[next] + paid);
        for (let i = takes - 1; i >= 0; i--) {
          const s = u.w[takeBase + i * 2];
          const amount = u.w[takeBase + i * 2 + 1];
          setReserve(p, s, p.reserve[s] + amount);
        }
        setBank(p, mover, p.bank[mover] - income);
        p.gained[mover] -= income;
        setUpkeepPending(p, upkeepBefore);
        setSide(p, mover);
        setPhase(p, phaseBefore);
        setActions(p, actionsBefore);
        setClock(p, clockBefore);
        p.progress = progressBefore;
        p.turnNumber = turnNumberBefore;
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

  /** Recompute every derived field from the unit/board arrays (DESIGN §4.4). */
  rehash(p: PackedState): void {
    p.pieceAt.fill(NO_SLOT);
    p.occ.fill(0);
    p.occBy.fill(0);
    p.occTier.fill(0);
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
   * Drops the BUY id-displacement stack. Call ONLY with an empty matching
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
  }

  /** The fuzzer's 24-field comparison surface; square-keyed, slot-order independent. */
  digest(p: PackedState): string {
    const board: string[] = [];
    for (let s = 0; s < BOARD; s++) {
      const slot = p.pieceAt[s];
      if (slot === NO_SLOT) continue;
      board.push(`${s}.${p.owner[slot]}.${p.defId[slot]}.${p.damage[slot]}.${p.atkCount[slot]}.${p.uflags[slot] & UFLAGS_MASK}`);
    }
    const reserve: string[] = new Array<string>(BOARD);
    for (let s = 0; s < BOARD; s++) reserve[s] = String(p.reserve[s]);
    return [
      board.join(','),
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


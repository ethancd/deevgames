/**
 * Square-keyed two-tier Zobrist hashing (DESIGN §3.3, §4.4-style recompute
 * helpers in §3.3). Two uint32 lanes per key; 64-bit integer types are
 * banned under `src/ai/hard/**` (DESIGN §2).
 *
 * Everything is keyed BY SQUARE, never by slot (JF §2.3), so buy-order
 * permutations transpose:
 *
 *   Kpos  = piece ⊕ pend ⊕ reserve ⊕ damage ⊕ side ⊕ clock ⊕ bank
 *           ⊕ upkeepPending ⊕ rules ⊕ handicap      (macro TT, book, suites)
 *   Kturn = Kpos ⊕ phase ⊕ actions ⊕ atkCount ⊕ uflags ⊕ progress
 *                                                            (within-turn TT)
 *   occHash = XOR over occupied squares of piece[white][def 0][sq], lane 0
 *             (owner/def independent; keys the BFS distance cache)
 *
 * Reserves are in `Kpos` because they deplete monotonically (mining.ts:25-28);
 * the clock is in `Kpos` because SU §8.1 makes it part of the position; damage
 * is in `Kpos` because an `upkeepPending` node carries the previous turn's
 * damage (turn.ts:30-33) and is otherwise zero (JF §0).
 *
 * `recompute*` walk the whole state from scratch. They are the debug-assertion
 * target for the incremental keys `make`/`unmake` maintain (M5), not hot-path
 * code, so they may allocate the returned `Key`.
 */
import { DEAD, MAX_SLOTS, PEND_STRIDE, UFLAGS_MASK, type Key, type PackedState, type Side, type Square } from '../types';
import { seededRandom } from '../../runtime';
import { INACTIVITY_LIMIT } from '../../../game/inactivity';
import { BOARD } from './tables';
import { NDEF } from './catalog';

/** "MUJU" — identical on every client, so keys are portable across machines. */
export const ZOBRIST_SEED = 0x4d554a55;

/** Max reserve is 16, so a cell takes one of 17 values (resourceMap.ts:5). */
const RESERVE_VALUES = 17;
/** damage 0..4 (max DEF 5 = metal_3; RE §1.7b). */
const DAMAGE_VALUES = 5;
/**
 * atkCount 0..4 (combat.ts `canAttack`). Under `muju-phasing-4` (2026-09-23,
 * Cleave has no tier cap) a unit can make four attacks in a turn — one per
 * shared action — where the tier cap stopped it at three. Split, like the
 * clock plane, into a FROZEN per-square prefix (`atkCount` 0..3, drawn at the
 * plane's original position) and an APPENDED tail (`atkCount` 4, one key per
 * square, drawn last of all), so every key of a position whose counts are all
 * <= 3 is bit-identical to the one it had under `muju-phasing-3`.
 */
const ATKCOUNT_VALUES = 5;
/** The frozen prefix: 4 values per square, a HISTORICAL constant. */
const ATKCOUNT_LEGACY_VALUES = 4;
/** uflags is a 4-bit mask. */
const UFLAGS_VALUES = UFLAGS_MASK + 1;
/** actionsRemaining 0..4. */
const ACTION_VALUES = 5;
/**
 * `inactivityPlies` 0..`INACTIVITY_LIMIT` — 21 values under `muju-phasing-2`
 * (amendment A4, archived), 11 under `muju-phasing-1` AND under
 * `muju-phasing-3` (owner decision 2026-09-22, the KILL CLOCK: the limit
 * returns to 10, though the verdict at the limit no longer does — see
 * `core/state.ts makeEndPlace`). Split into a FROZEN prefix and an APPENDED
 * tail so a longer clock can never disturb the keys a shorter one drew; see
 * `CLOCK_LEGACY_VALUES` and `buildZobrist`. With `CLOCK_VALUES` back at 11,
 * `CLOCK_EXTRA_VALUES` is 0 and every key is once again exactly the frozen
 * 11-key prefix — bit-identical to `muju-phasing-1` and to this plane before
 * A4, by construction, not by re-derivation.
 */
const CLOCK_VALUES = INACTIVITY_LIMIT + 1;
/**
 * The clock plane's frozen prefix: the 11 keys (`clock` 0..10) drawn at the
 * plane's original position in the RNG stream, back when the limit was 10.
 * This is a HISTORICAL constant, never derived from `INACTIVITY_LIMIT` — the
 * whole point is that it does not move when the limit does.
 */
const CLOCK_LEGACY_VALUES = 11;
/** The clock keys a longer limit would add, drawn LAST, after `pend` and
 * `progress`. Zero under both `muju-phasing-1` and the current
 * `muju-phasing-3` (`CLOCK_VALUES === CLOCK_LEGACY_VALUES`); was 10 under the
 * archived `muju-phasing-2`. */
const CLOCK_EXTRA_VALUES = Math.max(0, CLOCK_VALUES - CLOCK_LEGACY_VALUES);
/** blackCrystalHandicap 0..20 (rules.ts:3). */
const HANDICAP_VALUES = 21;
/** `victoryHome`, `drawRuleOn`, `reviewUpkeep[0]`, `reviewUpkeep[1]` — 4 flags x 2 values. */
const RULE_FLAGS = 4;

export interface ZobristTables {
  /** [2 owners * 18 defs * 100 squares * 2 lanes]. */
  piece: Uint32Array;
  /** [100 * 17 * 2]. */
  reserve: Uint32Array;
  /** [100 * 5 * 2] keyed BY SQUARE; damage 0 hashes to nothing. */
  damage: Uint32Array;
  /**
   * [100 * 5 * 2], indexed by (square, count). INTERLEAVED, not drawn in one
   * run: per square, counts 0..3 are the words the plane drew at its original
   * position and count 4 is the appended word drawn after the clock
   * extension. See `buildZobrist` and `interleaveAtkCount`.
   */
  atkCount: Uint32Array;
  /** [100 * 16 * 2]. */
  uflags: Uint32Array;
  /** [2] one key, xored when the side to move is black. */
  side: Uint32Array;
  /** [2] one key, xored when `phase === place`. */
  phase: Uint32Array;
  /** [5 * 2]. */
  actions: Uint32Array;
  /**
   * [(`INACTIVITY_LIMIT` + 1) * 2], indexed by `clock` — so 21 keys under
   * `muju-phasing-2`. The array is CONCATENATED, not drawn in one run: entries
   * 0..10 are the words the plane drew at its original position in the stream
   * and entries 11.. are appended words drawn after `pend` and `progress`. See
   * `buildZobrist`.
   */
  clock: Uint32Array;
  /** [2 * 64 * 2] `bank & 63`. */
  bankLo: Uint32Array;
  /** [2 * 16 * 2] `min(15, bank >>> 6)`. */
  bankHi: Uint32Array;
  /** [2] one key, xored when `upkeepPending`. */
  upkeep: Uint32Array;
  /** [8 * 2] four rule flags x two values. */
  rules: Uint32Array;
  /** [21 * 2]. */
  handicap: Uint32Array;
  /**
   * [2 owners * 18 defs * 100 squares * 2 lanes] — Phasing pending summons,
   * keyed by (side, DEFINITION, square). The paid cost is NOT hashed: it is a
   * function of the definition (`pack` rejects any other combination), so
   * hashing it would only duplicate information.
   *
   * Filled LAST so every earlier plane keeps the words it drew before M2: a
   * position with no commitment has the very same `Kpos` it had under Standard.
   */
  pend: Uint32Array;
  /**
   * [2] one key, xored into `Kturn` when `progressThisTurn` is set.
   *
   * WHY IT NEEDS A KEY AT ALL. `progress` is within-turn state, so it belongs to
   * `Kturn` and not to `Kpos`; the question is whether anything else in `Kturn`
   * already implies it. Under Standard it effectively did: `progress` is set by a
   * capture, and a capture leaves `atkCount`/`uflags` evidence on the killer,
   * which `Kturn` hashes. Under PHASING the evidence can be ERASED inside the
   * same turn — the killer is a tier-2+ body that `PAY_UPKEEP` releases during
   * the very Prepare that follows its kill, taking its squares, its `atkCount`
   * and its `F_LAST_KILLED` off the board with it. Two reachable Prepare states
   * can then agree on `Kpos` and on every `Kturn` extra and still differ in
   * `progress`, and their `END_PLACE` successors differ: one hands off with the
   * inactivity clock reset to 0, the other with it incremented. A within-turn TT
   * that shared an entry between them would answer with the wrong clock.
   *
   * Appended AFTER `pend`, so every plane above — `pend` included — keeps the
   * words it already drew and every key of a position with `progress === 0` is
   * bit-identical to the one it had before this plane existed. In particular
   * every MACRO-boundary key is unchanged: `progress` is 0 at a hand-off by
   * construction (`turn.ts:120-124` clears it).
   */
  progress: Uint32Array;
}

function fill(rng: () => number, keys: number): Uint32Array {
  const out = new Uint32Array(keys * 2);
  for (let i = 0; i < out.length; i++) out[i] = (rng() * 0x100000000) >>> 0;
  return out;
}

/** Per square, the 4 frozen words then the 1 appended word. */
function interleaveAtkCount(legacy: Uint32Array, extra: Uint32Array): Uint32Array {
  const out = new Uint32Array(BOARD * ATKCOUNT_VALUES * 2);
  for (let s = 0; s < BOARD; s++) {
    out.set(legacy.subarray(s * ATKCOUNT_LEGACY_VALUES * 2, (s + 1) * ATKCOUNT_LEGACY_VALUES * 2), s * ATKCOUNT_VALUES * 2);
    out.set(extra.subarray(s * 2, s * 2 + 2), (s * ATKCOUNT_VALUES + ATKCOUNT_LEGACY_VALUES) * 2);
  }
  return out;
}

/** `[head, tail]` as one plane. Draw order is the caller's; this only lays out. */
function concatPlane(head: Uint32Array, tail: Uint32Array): Uint32Array {
  if (tail.length === 0) return head;
  const out = new Uint32Array(head.length + tail.length);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

/**
 * Deterministic for a given seed: `seededRandom` (src/ai/runtime.ts:3-6) is a
 * pure integer PRNG, and the tables are filled in a fixed order, so two builds
 * with the same seed are bit-identical on every machine.
 *
 * DRAW ORDER IS APPEND-ONLY and is the contract, not the field order of the
 * returned object. Every plane below draws from `rng` in the order written
 * here; anything new goes at the END so no earlier plane's words move. `pend`
 * (M2) and `progress` (M3) were appended that way, and the CLOCK EXTENSION
 * archived `muju-phasing-2` (amendment A4: limit 10 -> 20) added is appended
 * after both. `muju-phasing-3` (owner decision 2026-09-22, the KILL CLOCK)
 * returns the limit to 10, so `CLOCK_EXTRA_VALUES` is 0 and `fill(rng, 0)`
 * draws nothing — the extension slot stays in the draw order but is now empty.
 *
 * The clock plane is therefore drawn in TWO pieces: its frozen 11-key prefix
 * (`clock` 0..10) stays where it always was, and (archived, under
 * `muju-phasing-2` only) ten more keys for `clock` 11..20 would be drawn last
 * of all and concatenated onto it. Consequence — the one this arrangement
 * exists for — every key, and so every `Kpos`/`Kturn`, of a position whose
 * clock is <= 10 is BIT-IDENTICAL under `muju-phasing-1`, `muju-phasing-2` and
 * `muju-phasing-3` alike. `tests/ai/hard/zobrist.test.ts` redraws the stream
 * and proves it. `muju-phasing-4` (2026-09-23) appends one more plane the same
 * way: the fourth-attack key per square, drawn after the clock extension and
 * interleaved into `atkCount` (see `ATKCOUNT_VALUES`).
 */
export function buildZobrist(seed: number = ZOBRIST_SEED): ZobristTables {
  const rng = seededRandom(seed);
  const piece = fill(rng, 2 * NDEF * BOARD);
  const reserve = fill(rng, BOARD * RESERVE_VALUES);
  const damage = fill(rng, BOARD * DAMAGE_VALUES);
  const atkCountLegacy = fill(rng, BOARD * ATKCOUNT_LEGACY_VALUES);
  const uflags = fill(rng, BOARD * UFLAGS_VALUES);
  const side = fill(rng, 1);
  const phase = fill(rng, 1);
  const actions = fill(rng, ACTION_VALUES);
  const clockLegacy = fill(rng, Math.min(CLOCK_VALUES, CLOCK_LEGACY_VALUES));
  const bankLo = fill(rng, 2 * 64);
  const bankHi = fill(rng, 2 * 16);
  const upkeep = fill(rng, 1);
  const rules = fill(rng, RULE_FLAGS * 2);
  const handicap = fill(rng, HANDICAP_VALUES);
  // APPEND-ONLY: every plane above must keep drawing the same words it drew
  // before the `pend` plane existed, so `pend` goes last (DESIGN M2 item C) —
  // `progress`, appended after it for the same reason, goes later still, and
  // the clock plane's A4 extension goes last of all.
  const pend = fill(rng, 2 * NDEF * BOARD);
  const progress = fill(rng, 1);
  const clockExtra = fill(rng, CLOCK_EXTRA_VALUES);
  // `muju-phasing-4` (2026-09-23): the fourth-attack key per square, appended
  // after everything above so no earlier word moves.
  const atkCountExtra = fill(rng, BOARD * (ATKCOUNT_VALUES - ATKCOUNT_LEGACY_VALUES));
  return {
    piece,
    reserve,
    damage,
    atkCount: interleaveAtkCount(atkCountLegacy, atkCountExtra),
    uflags,
    side,
    phase,
    actions,
    clock: concatPlane(clockLegacy, clockExtra),
    bankLo,
    bankHi,
    upkeep,
    rules,
    handicap,
    pend,
    progress,
  };
}

/** Built once at module load with `ZOBRIST_SEED`. */
export const Z: ZobristTables = buildZobrist(ZOBRIST_SEED);

// --- index helpers (exported so `make`/`unmake` can XOR the same words) ---

export function zPiece(owner: Side, def: number, s: Square): number {
  return ((owner * NDEF + def) * BOARD + s) * 2;
}
export function zReserve(s: Square, value: number): number {
  return (s * RESERVE_VALUES + value) * 2;
}
export function zDamage(s: Square, value: number): number {
  return (s * DAMAGE_VALUES + value) * 2;
}
export function zAtkCount(s: Square, value: number): number {
  return (s * ATKCOUNT_VALUES + value) * 2;
}
export function zUflags(s: Square, value: number): number {
  return (s * UFLAGS_VALUES + value) * 2;
}
export function zActions(value: number): number {
  return value * 2;
}
/**
 * `clock` 0..`INACTIVITY_LIMIT`. One flat index over the concatenated plane:
 * 0..10 land in the frozen prefix and 11.. in the appended block, which is why
 * callers need not know the plane was drawn in two pieces.
 */
export function zClock(value: number): number {
  return value * 2;
}
export function zBankLo(side: Side, bank: number): number {
  return (side * 64 + (bank & 63)) * 2;
}
export function zBankHi(side: Side, bank: number): number {
  return (side * 16 + Math.min(15, bank >>> 6)) * 2;
}
export function zRule(flagIndex: number, value: number): number {
  return (flagIndex * 2 + value) * 2;
}
export function zHandicap(value: number): number {
  return value * 2;
}
/** `pend[side][def][sq]`; `def` is the DEFINITION, not `pendDef`'s `def + 1`. */
export function zPend(side: Side, def: number, s: Square): number {
  return ((side * NDEF + def) * BOARD + s) * 2;
}

/** Scratch accumulator so `recompute*` never allocates per XOR. */
let accLo = 0;
let accHi = 0;

function xorKey(table: Uint32Array, index: number): void {
  accLo = (accLo ^ table[index]) >>> 0;
  accHi = (accHi ^ table[index + 1]) >>> 0;
}

/** Bank is clamped into the table's domain; banks above 1023 all share the top `bankHi` key. */
function xorBank(p: PackedState): void {
  for (let s = 0; s < 2; s++) {
    const side = s as Side;
    const bank = p.bank[s] < 0 ? 0 : p.bank[s];
    xorKey(Z.bankLo, zBankLo(side, bank));
    xorKey(Z.bankHi, zBankHi(side, bank));
  }
}

function xorKposParts(p: PackedState): void {
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD) continue;
    xorKey(Z.piece, zPiece(p.owner[slot] as Side, p.defId[slot], s));
    const damage = p.damage[slot];
    if (damage !== 0) xorKey(Z.damage, zDamage(s, damage));
  }
  // Phasing pending summons. `pendDef` is dense over the 200-entry plane, so a
  // position without commitments costs 200 loads and XORs nothing at all —
  // which is exactly why its key is bit-identical to the pre-M2 one.
  for (let i = 0; i < 2 * PEND_STRIDE; i++) {
    const def = p.pendDef[i];
    if (def !== 0) xorKey(Z.pend, zPend(((i / PEND_STRIDE) | 0) as Side, def - 1, i % PEND_STRIDE));
  }
  for (let s = 0; s < BOARD; s++) xorKey(Z.reserve, zReserve(s, p.reserve[s]));
  if (p.side === 1) xorKey(Z.side, 0);
  xorKey(Z.clock, zClock(p.clock));
  xorBank(p);
  if (p.upkeepPending === 1) xorKey(Z.upkeep, 0);
  xorKey(Z.rules, zRule(0, p.victoryHome));
  xorKey(Z.rules, zRule(1, p.drawRuleOn));
  xorKey(Z.rules, zRule(2, p.reviewUpkeep[0] ? 1 : 0));
  xorKey(Z.rules, zRule(3, p.reviewUpkeep[1] ? 1 : 0));
  xorKey(Z.handicap, zHandicap(p.handicap));
}

function xorKturnExtras(p: PackedState): void {
  if (p.phase === 0) xorKey(Z.phase, 0);
  if (p.progress === 1) xorKey(Z.progress, 0);
  xorKey(Z.actions, zActions(p.actions));
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD) continue;
    xorKey(Z.atkCount, zAtkCount(s, p.atkCount[slot]));
    xorKey(Z.uflags, zUflags(s, p.uflags[slot] & UFLAGS_MASK));
  }
}

export function recomputeKpos(p: PackedState): Key {
  accLo = 0;
  accHi = 0;
  xorKposParts(p);
  return { lo: accLo, hi: accHi };
}

export function recomputeKturn(p: PackedState): Key {
  accLo = 0;
  accHi = 0;
  xorKposParts(p);
  xorKturnExtras(p);
  return { lo: accLo, hi: accHi };
}

export function recomputeOccHash(p: PackedState): number {
  let h = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD) continue;
    h = (h ^ Z.piece[zPiece(0, 0, s)]) >>> 0;
  }
  return h;
}

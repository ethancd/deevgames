/** Current live-unit strikes and next-Act paid-arrival projections.
 * Every arrival is validated on the original board, then the complete batch
 * becomes blocking occupancy for every projected mover. No unpaid purchase
 * or hypothetical promotion contributes a strike. */
import { DEAD, F_CAN_ACT, F_LAST_KILLED, MAX_SLOTS, NO_SLOT, PEND_STRIDE, type Centi, type PackedState, type Side } from '../types';
import {
  bbDilate,
  bbNew,
  bbNext,
  bbOr,
  bbSet,
  bbZero,
  type BB,
} from '../core/bits';
import { activeCatalog, type Catalog } from '../core/catalog';
import { nextActProjection } from '../core/spawn';
import { bfsFrom } from '../core/movement';
import { BOARD } from '../core/tables';
import type { NodeTables } from './context';

const SC_DIST = new Int8Array(BOARD);
const SC_SET = bbNew();
const SC_DILATED = bbNew();
const SC_PENDING = bbNew();
const SC_OCC = bbNew();

/** Move actions a striker is assumed to have when the map is built (DESIGN §5.1). */
export const STRIKE_MOVE_ACTIONS = 3;

/** `nearestOwner`'s "no unit of this side can stand here" cost. */
export const UNREACHABLE = 255;

/** Existing bodies only. Current horizon respects spent attacks; nextAct
 * resets attack availability and uses occupancy after all valid paid arrivals.
 * `actions` is a move budget (one further action is reserved for the hit). */
export function strikeArea(
  p: PackedState, side: Side, t: NodeTables, actions: number, out: BB,
  horizon: 'current' | 'nextAct' = 'current',
): BB {
  bbZero(out);
  if (horizon === 'current' && side === p.side && (p.phase === 0 || p.actions < 1)) return out;
  const cat = activeCatalog();
  const moves = Math.max(0, actions);
  if (horizon === 'nextAct') {
    nextActProjection(p, side, SC_PENDING, SC_OCC);
  }
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (horizon === 'current') {
      const flags = p.uflags[slot];
      if ((flags & F_CAN_ACT) === 0 || p.atkCount[slot] >= cat.tier[p.defId[slot]] ||
          (p.atkCount[slot] > 0 && (flags & F_LAST_KILLED) === 0)) continue;
    }
    if (horizon === 'nextAct') bfsFrom(SC_OCC, s, SC_DIST);
    const dist = horizon === 'nextAct' ? SC_DIST : t.dist.get(p, s);
    ballInto(SC_SET, dist, cat.spd[p.defId[slot]] * moves);
    bbDilate(SC_DILATED, SC_SET);
    bbOr(out, out, SC_DILATED);
  }
  return out;
}

/** Legacy field name: ONLY already-paid, valid pending arrivals at their next
 * Act. Bank and hypothetical new buys are irrelevant. No state is changed. */
export function strikeIfBoughtArea(p: PackedState, side: Side, _t: NodeTables, out: BB): BB {
  bbZero(out);
  const cat = activeCatalog();
  nextActProjection(p, side, SC_PENDING, SC_OCC);
  const base = side * PEND_STRIDE;
  for (let q = bbNext(SC_PENDING, -1); q >= 0; q = bbNext(SC_PENDING, q)) {
    const def = p.pendDef[base + q] - 1;
    bfsFrom(SC_OCC, q, SC_DIST);
    ballInto(SC_SET, SC_DIST, cat.spd[def] * STRIKE_MOVE_ACTIONS);
    bbDilate(SC_DILATED, SC_SET);
    bbOr(out, out, SC_DILATED);
  }
  return out;
}

/** Exposure uses one consistent next-Act board for both existing bodies and
 * paid arrivals. `strike` remains the separate current-Act map. */
export function refreshExposure(t: NodeTables): void {
  bbOr(t.exposure[0], t.strikeNext[1], t.strikeIfBought[1]);
  bbOr(t.exposure[1], t.strikeNext[0], t.strikeIfBought[0]);
}

/**
 * For every square: which unit of `side` reaches it most cheaply, and at what
 * cost in actions. `outSlot[q]` is `NO_SLOT` and `outCost[q]` is `UNREACHABLE`
 * when no unit of `side` can stand on `q`; a unit's own square costs 0. Ties
 * go to the lowest slot.
 */
export function nearestOwner(
  p: PackedState,
  side: Side,
  t: NodeTables,
  outSlot: Uint8Array,
  outCost: Uint8Array,
): void {
  outSlot.fill(NO_SLOT);
  outCost.fill(UNREACHABLE);
  const cat = activeCatalog();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const from = p.sq[slot];
    if (from === DEAD || p.owner[slot] !== side) continue;
    const speed = cat.spd[p.defId[slot]];
    const dist = t.dist.get(p, from);
    for (let q = 0; q < BOARD; q++) {
      const d = dist[q];
      if (d < 0 || (speed === 0 && d > 0)) continue;
      const cost = d === 0 ? 0 : ((d + speed - 1) / speed) | 0;
      if (cost < outCost[q]) {
        outCost[q] = cost;
        outSlot[q] = slot;
      }
    }
  }
}

/**
 * Σ `material[defId]` over `side`'s living units standing inside
 * `t.exposure[side]` — the material the enemy can already reach this turn
 * (DESIGN §4.9). `material` is indexed by `DefId` and is the caller's prior
 * (`cost × 100` in `gen`/`tables`; `eval` passes its own weights).
 */
export function exposedValueCc(p: PackedState, side: Side, t: NodeTables, material: Int32Array): Centi {
  const mask = t.exposure[side];
  let total = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if ((mask[s >>> 5] & (1 << (s & 31))) === 0) continue;
    total += material[p.defId[slot]];
  }
  return total;
}

/**
 * `dst = {q : 0 <= dist[q] <= limit}`. Sources (distance 0) are kept, which is
 * F22's `∪ {pos}`; occupied non-source squares carry `-1` from the BFS and are
 * dropped, exactly as `getMovementRange` drops them.
 */
function ballInto(dst: BB, dist: Int8Array, limit: number): void {
  bbZero(dst);
  for (let q = 0; q < BOARD; q++) {
    const d = dist[q];
    if (d >= 0 && d <= limit) bbSet(dst, q);
  }
}

/**
 * The distinct speeds among `side`'s living units, lowest first, written into
 * `out` (length >= 3) and returned as a count. Exported for the M6 oracle and
 * for M12's ordering code, which both want to know how many BFS a strike map
 * costs before paying for it.
 */
export function unitSpeeds(p: PackedState, side: Side, out: Int8Array, cat: Catalog = activeCatalog()): number {
  let mask = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const speed = cat.spd[p.defId[slot]];
    if (speed >= 0 && speed < 32) mask |= 1 << speed;
  }
  let count = 0;
  for (let speed = 0; speed < 32; speed++) if ((mask & (1 << speed)) !== 0) out[count++] = speed;
  return count;
}

/** Squares of `mask`, ascending, appended to `out`; returns the count. Test/tooling helper. */
export function maskSquares(mask: BB, out: Int32Array): number {
  let n = 0;
  for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) out[n++] = s;
  return n;
}

/**
 * Strike maps and exposure (DESIGN §4.9, §5.1, §5.2).
 *
 * `strike[side]` is the AREA a side can attack this turn, not the perimeter
 * `getAttackFrontier` returns (DESIGN F22): a unit of speed `s` with `a` move
 * actions can stand on any square within BFS distance `s·a` of its own square
 * (or stay put) and then attack any orthogonal neighbour of where it stands,
 * so its contribution is `dilate(reach(u, s, a) ∪ {u.sq})`. The M6 oracle is
 * exactly that, per unit, through the canonical `getMovementRange`.
 *
 * A single multi-source BFS per distinct speed computes the whole side's map:
 * BFS from a set returns `min` over the sources of the single-source distance
 * over the same `~occ` graph, and every source is seeded at 0 whether or not
 * its own square is occupied — so the multi-source ball is the union of the
 * per-unit balls, square for square. Four speeds exist (Yan 0, Sjor/Muju 1,
 * Hi/Göl 2, Radi 3), so a side costs at most four BFS.
 *
 * `strikeIfBought` is the same construction with the side's legal spawn mask
 * as the source set and `3 · speed` as the radius, one BFS shared by every
 * affordable tier-1 definition (the balls are nested in speed, so the largest
 * affordable speed dominates). DESIGN §5.2 writes the pre-dilate set as
 * `{q : 0 < minDist[q] ≤ 3s}`; this module uses `0 ≤ minDist[q]`, i.e. it
 * KEEPS the spawn squares themselves, because a unit bought on `q` and never
 * moved still attacks `q`'s neighbours. That is F22's `∪ {pos}` convention
 * applied to a purchase, it makes the multi-source result equal the brute-force
 * union over spawn squares exactly (the two differ only on `L` itself), and it
 * errs towards a superset for a mask whose consumers ask "is this square
 * safe?". See `docs/hard-ai/design/DEVIATIONS.md` under M6.
 *
 * Nothing here allocates: the BFS distance field, the speed buckets and the
 * intermediate masks are module-level scratch (the engine is single-threaded
 * and none of these functions is reentrant).
 */
import { DEAD, MAX_SLOTS, NO_SLOT, type Centi, type PackedState, type Side } from '../types';
import {
  bbDilate,
  bbIsEmpty,
  bbNew,
  bbNext,
  bbOr,
  bbSet,
  bbZero,
  type BB,
} from '../core/bits';
import { activeCatalog, type Catalog } from '../core/catalog';
import { newSpawnInfo, spawnInfo } from '../core/spawn';
import { BOARD } from '../core/tables';
import type { NodeTables } from './context';

/** Speeds are 1..3 in the shipped catalogue; the extra buckets are a guard. */
const SPEED_BUCKETS = 8;

const SC_SRC: BB[] = Array.from({ length: SPEED_BUCKETS }, () => bbNew());
const SC_DIST = new Int8Array(BOARD);
const SC_SET = bbNew();
const SC_DILATED = bbNew();
const SC_SPAWN = newSpawnInfo();

/** Move actions a striker is assumed to have when the map is built (DESIGN §5.1). */
export const STRIKE_MOVE_ACTIONS = 3;

/** `nearestOwner`'s "no unit of this side can stand here" cost. */
export const UNREACHABLE = 255;

/**
 * `out = ∪ over living units u of side of dilate(reach(u, spd[u], actions) ∪ {u.sq})`
 * — every square `side` can attack this turn given `actions` move actions.
 *
 * `actions` is a MOVE budget, not a turn budget: the level-1 map uses 3 (three
 * moves and the attack). `actions <= 0` degenerates to `dilate(own units)`,
 * which is exactly right: a unit that cannot move still attacks its
 * neighbours.
 */
export function strikeArea(p: PackedState, side: Side, t: NodeTables, actions: number, out: BB): BB {
  bbZero(out);
  const cat = activeCatalog();
  const moves = actions > 0 ? actions : 0;

  let used = 0;
  for (let i = 0; i < SPEED_BUCKETS; i++) bbZero(SC_SRC[i]);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const speed = cat.spd[p.defId[slot]];
    const bucket = speed >= 0 && speed < SPEED_BUCKETS ? speed : SPEED_BUCKETS - 1;
    bbSet(SC_SRC[bucket], s);
    used |= 1 << bucket;
  }
  if (used === 0) return out;

  for (let speed = 0; speed < SPEED_BUCKETS; speed++) {
    if ((used & (1 << speed)) === 0) continue;
    t.dist.multi(p, SC_SRC[speed], SC_DIST);
    ballInto(SC_SET, SC_DIST, speed * moves);
    bbDilate(SC_DILATED, SC_SET);
    bbOr(out, out, SC_DILATED);
  }
  return out;
}

/**
 * `out` = every square `side` could attack this turn with a unit it has not
 * bought yet: `∪ over affordable tier-1 d, over legal spawn squares q of
 * dilate(reach(q, spd[d], 3) ∪ {q})` (DESIGN §5.2).
 *
 * The side's legal spawn mask is recomputed here rather than read from
 * `t.spawn`, because DESIGN §4.8 runs `threat.ts` BEFORE `spawn.ts` inside
 * `buildTables`.
 */
export function strikeIfBoughtArea(p: PackedState, side: Side, t: NodeTables, out: BB): BB {
  bbZero(out);
  const cat = activeCatalog();
  const bank = p.bank[side];

  let best = 0;
  for (let i = 0; i < cat.tier1.length; i++) {
    const def = cat.tier1[i];
    if (cat.cost[def] > bank) continue;
    const speed = cat.spd[def];
    if (speed > best) best = speed;
  }
  if (best === 0) return out;

  spawnInfo(p, side, SC_SPAWN);
  if (bbIsEmpty(SC_SPAWN.legal)) return out;

  t.dist.multi(p, SC_SPAWN.legal, SC_DIST);
  ballInto(SC_SET, SC_DIST, best * STRIKE_MOVE_ACTIONS);
  bbDilate(out, SC_SET);
  return out;
}

/**
 * `t.exposure[s] = t.strike[1-s] | t.strikeIfBought[1-s]` for both sides
 * (DESIGN §4.8). Additive to §4.9's list: `buildTables` and the tests both
 * need the level-1 step that turns the two strike maps into exposure, and it
 * belongs with the maps it derives from.
 */
export function refreshExposure(t: NodeTables): void {
  bbOr(t.exposure[0], t.strike[1], t.strikeIfBought[1]);
  bbOr(t.exposure[1], t.strike[0], t.strikeIfBought[0]);
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

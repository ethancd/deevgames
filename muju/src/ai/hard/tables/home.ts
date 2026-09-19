/** Home reach at the next Act, and delayed Prepare commitment intent.
 * Paid arrivals are validated together on the original board. The projection
 * assumes surviving live bodies and no intervening opponent reply; it is a
 * geometric threat estimate, never a dispatchable future MOVE or win proof. */
import { DEAD, MAX_SLOTS, NO_SLOT, PEND_STRIDE, Result, type PackedState, type Side } from '../types';
import { bbNew, bbNext } from '../core/bits';
import { BOARD, CORNER, CORNER_NEIGHBOURS } from '../core/tables';
import { bfsFrom, moveCost } from '../core/movement';
import { isLegalSpawn, newSpawnInfo, spawnInfo, nextActProjection } from '../core/spawn';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { AKind, PA_NONE, paMake } from '../core/action';
import { ACTIONS_PER_TURN } from '../core/state';
import type { NodeTables } from './context';

export interface HomeSafety {
  actionsToCorner: number;
  turnsToCorner: number;
  /** Legacy name: the nearest threat is an already-paid pending arrival. */
  buyThreat: 0 | 1;
  rescuers: number;
  plug: 0 | 1;
  occupied: 0 | 1;
}
export const HOME_NEVER = 127;
export function newHomeSafety(): HomeSafety {
  return { actionsToCorner: HOME_NEVER, turnsToCorner: HOME_NEVER, buyThreat: 0, rescuers: 0, plug: 0, occupied: 0 };
}

const PENDING = bbNew();
const PROJECTED_OCC = bbNew();
const PRECEDING_ENEMY = bbNew();
const DIST = new Int8Array(BOARD);
const SPAWN = newSpawnInfo();
const THREAT = { actions: HOME_NEVER, defId: -1, pending: 0 as 0 | 1 };

function nearestThreat(p: PackedState, defender: Side, cat: Catalog): typeof THREAT {
  const attacker = (1 - defender) as Side;
  const corner = CORNER[defender];
  THREAT.actions = HOME_NEVER;
  THREAT.defId = -1;
  THREAT.pending = 0;
  if (p.pieceAt[corner] !== NO_SLOT) return THREAT;
  nextActProjection(p, attacker, PENDING, PROJECTED_OCC);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== attacker) continue;
    bfsFrom(PROJECTED_OCC, p.sq[slot], DIST);
    const cost = moveCost(DIST, corner, cat.spd[p.defId[slot]]);
    if (cost > 0 && cost < THREAT.actions) {
      THREAT.actions = cost;
      THREAT.defId = p.defId[slot];
    }
  }
  const base = attacker * PEND_STRIDE;
  for (let q = bbNext(PENDING, -1); q >= 0; q = bbNext(PENDING, q)) {
    const def = p.pendDef[base + q] - 1;
    bfsFrom(PROJECTED_OCC, q, DIST);
    const cost = moveCost(DIST, corner, cat.spd[def]);
    if (cost > 0 && cost <= THREAT.actions) {
      THREAT.actions = cost;
      THREAT.defId = def;
      THREAT.pending = 1;
    }
  }
  return THREAT;
}

export function homeSafety(p: PackedState, _t: NodeTables, side: Side, out: HomeSafety): HomeSafety {
  const cat = activeCatalog();
  const threat = nearestThreat(p, side, cat);
  out.actionsToCorner = threat.actions;
  out.turnsToCorner = threat.actions >= HOME_NEVER ? HOME_NEVER : Math.ceil(threat.actions / ACTIONS_PER_TURN);
  out.buyThreat = threat.pending;
  out.rescuers = 0;
  if (threat.defId >= 0) {
    for (const q of CORNER_NEIGHBOURS[side]) {
      const slot = p.pieceAt[q];
      if (slot !== NO_SLOT && p.owner[slot] === side && cat.power[powerIndex(side, p.defId[slot], threat.defId)] > 0) {
        out.rescuers++;
      }
    }
  }
  const occupant = p.pieceAt[CORNER[side]];
  out.plug = occupant !== NO_SLOT && p.owner[occupant] === side ? 1 : 0;
  out.occupied = occupant !== NO_SLOT && p.owner[occupant] !== side ? 1 : 0;
  return out;
}

export function minTurnsToCorner(p: PackedState, _t: NodeTables, attacker: Side): number {
  const threat = nearestThreat(p, (1 - attacker) as Side, activeCatalog());
  return threat.actions >= HOME_NEVER ? HOME_NEVER : Math.ceil(threat.actions / ACTIONS_PER_TURN);
}

/** Stable buffer shape: [BUY, PA_NONE, PA_NONE]. The generator completes the
 * rest of Prepare. No not-yet-existing slot is predicted or moved. */
export const HOME_RACE_LINE_LEN = 3;

/** Legal Prepare commitments with a next-Act geometric route to the enemy
 * corner in four moves, conditional on survival and no intervening reply.
 * Existing own pending squares cannot receive another commitment. The output
 * is commitment intent, never an immediate tactical win line. */
export function homeRaceAvailable(p: PackedState, _t: NodeTables, side: Side, out: Int32Array): number {
  out.fill(PA_NONE);
  const capacity = (out.length / HOME_RACE_LINE_LEN) | 0;
  if (capacity <= 0 || p.result !== Result.ONGOING || p.side !== side || p.phase !== 0 || p.upkeepPending === 1) return 0;
  const corner = CORNER[1 - side];
  if (p.pieceAt[corner] !== NO_SLOT) return 0;
  const cat = activeCatalog();
  nextActProjection(p, side, PENDING, PROJECTED_OCC, PRECEDING_ENEMY);
  spawnInfo(p, side, SPAWN);
  let n = 0;
  const base = side * PEND_STRIDE;
  for (const def of cat.tier1) {
    if (cat.cost[def] > p.bank[side]) continue;
    for (let q = bbNext(SPAWN.legal, -1); q >= 0 && n < capacity; q = bbNext(SPAWN.legal, q)) {
      if (p.pendDef[base + q] !== 0 || !isLegalSpawn(p, side, q, PRECEDING_ENEMY)) continue;
      // BFS ignores its own origin, so adding the prospective body there
      // would not change its path. Every other arrival already blocks it.
      bfsFrom(PROJECTED_OCC, q, DIST);
      const cost = moveCost(DIST, corner, cat.spd[def]);
      if (cost <= 0 || cost > ACTIONS_PER_TURN) continue;
      out[n++ * HOME_RACE_LINE_LEN] = paMake(AKind.BUY, def, q, 0);
    }
    if (n >= capacity) break;
  }
  return n;
}

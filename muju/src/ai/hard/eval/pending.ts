/** Phasing pending assets and bounded tactical diagnostics.
 * No generator imports, probabilities, hypothetical purchases or promotions.
 * Movement exposure uses the actual pass-forecast intervening Act, including
 * releases and arrivals. It considers one surviving root-live enemy mover,
 * no captures or multi-unit combinations. Arrivals block paths but are not
 * movers. A mover must be retainable from current cash plus exact finite
 * one-move income; no second forecast or full terminal counterproof is run.
 * ArrivalThreat is an optimistic kill-table differential, not a complete proof.
 * All work is bounded by the board, slots, commitments and the existing kill DP.
 */
import { CC, DEAD, F_CAN_ACT, MAX_SLOTS, PEND_STRIDE, type PackedState, type Side } from '../types';
import { bbHas, bbIntersects, type Scratch } from '../core/bits';
import { BOARD, RECT } from '../core/tables';
import { activeCatalog, type Catalog } from '../core/catalog';
import { bfsFrom, moveCost } from '../core/movement';
import { isLegalSpawn } from '../core/spawn';
import { ACTIONS_PER_TURN } from '../core/state';
import { KILL_IMPOSSIBLE, KILL_MAX_LANES, killTable, newKillTable, type KillOpts } from '../tables/kill';
import type { NodeTables } from '../tables/context';

export interface PendingDiagnostics {
  /** Exact principal plus risk-selected service, cc; difference before truncation. */
  valueCc: Float64Array;
  /** One bit per side*100+square: 1 excludes service, never refundable principal. */
  risk: Uint8Array;
  /** Root-live victim catalogue principal unique to paid-arrival attackers. */
  arrivalThreatCc: Int32Array;
  /** Root slot identities counted by ArrivalThreat, for disjoint legacy diagnostics. */
  arrivalDependentVictims: Uint8Array;
  /** Maximum denied service across mutually exclusive one-mover endpoints. */
  disruptPressureCc: Float64Array;
}
export function newPendingDiagnostics(): PendingDiagnostics {
  return { valueCc: new Float64Array(2), risk: new Uint8Array(2 * PEND_STRIDE), arrivalThreatCc: new Int32Array(2), arrivalDependentVictims: new Uint8Array(MAX_SLOTS), disruptPressureCc: new Float64Array(2) };
}

const DIST = new Int8Array(BOARD), EXCLUDED = new Uint8Array(MAX_SLOTS);
const ALL = newKillTable(), LIVE_ONLY = newKillTable();
const KILL_OPTIONS: KillOpts = { horizon: 'current', actionBudget: ACTIONS_PER_TURN, crystalBudget: 0, allowBuys: false, allowPromotes: false, maxLanes: KILL_MAX_LANES };

/** The forecast may reuse a dead slot for an arrival; a slot alone is not an identity. */
function rootLive(root: PackedState, snapshot: PackedState, slot: number): boolean {
  return root.sq[slot] !== DEAD && snapshot.sq[slot] !== DEAD && snapshot.ord[slot] === root.ord[slot];
}

/** Necessary cash to retain this mover at the ensuing bill. The owner may
 * prioritize it and release other renters; using total army rent would wrongly
 * reject a legal keep. No other movement/attack or future mining is assumed. */
function moverCanPay(window: PackedState, mover: number, destination: number, cat: Catalog): boolean {
  const due = cat.upkeep[window.defId[mover]];
  if (due === 0) return true;
  const side = window.owner[mover];
  let cash = window.bank[side];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (window.sq[slot] === DEAD || window.owner[slot] !== side) continue;
    const square = slot === mover ? destination : window.sq[slot];
    cash += Math.min(cat.mine[window.defId[slot]], window.reserve[square]);
  }
  return cash >= due;
}

/** Every surviving supporting rectangle must be intruded; target occupation
 * also voids the commitment. Existing enemy occupancy is held fixed because a
 * currently valid supporting rectangle cannot contain the mover's old square. */
function voided(p: PackedState, victim: Side, q: number, destination: number): boolean {
  if (q === destination) return true;
  const enemyOcc = p.occBy.subarray((1 - victim) * 4, (2 - victim) * 4);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const sq = p.sq[slot];
    if (sq === DEAD || p.owner[slot] !== victim) continue;
    const rectangle = RECT[victim][sq];
    if (bbHas(rectangle, q) && !bbIntersects(rectangle, enemyOcc) && !bbHas(rectangle, destination)) return false;
  }
  return true;
}

function exposure(p: PackedState, t: NodeTables, victim: Side, out: PendingDiagnostics): void {
  const enemy = (1 - victim) as Side, base = victim * PEND_STRIDE;
  for (let q = 0; q < BOARD; q++) if (p.pendDef[base + q] !== 0 && t.econ[victim].pendingArrival[q] !== 1) out.risk[base + q] = 1;

  // Actual chronology includes outgoing release, preceding paid arrivals and
  // incoming healing/reset. A settled enemy Prepare has no intervening Act.
  const window = t.econ[victim].pendingEnemyAct;
  if (window === null || window.actions <= 0) return;
  const budget = window.actions;
  const cat = activeCatalog();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const from = window.sq[slot];
    if (!rootLive(p, window, slot) || window.owner[slot] !== enemy || (window.uflags[slot] & F_CAN_ACT) === 0) continue;
    bfsFrom(window.occ, from, DIST);
    for (let destination = 0; destination < BOARD; destination++) {
      const cost = moveCost(DIST, destination, cat.spd[window.defId[slot]]);
      if (cost <= 0 || cost > budget || !moverCanPay(window, slot, destination, cat)) continue;
      let deniedCc = 0;
      for (let q = 0; q < BOARD; q++) {
        if (p.pendDef[base + q] === 0 || t.econ[victim].pendingArrival[q] !== 1 || !isLegalSpawn(window, victim, q) || !voided(window, victim, q, destination)) continue;
        out.risk[base + q] = 1;
        // Pressure never credits a commitment already invalid on the live board.
        if (isLegalSpawn(p, victim, q)) deniedCc += t.econ[victim].pendingServicePVcc[q];
      }
      out.disruptPressureCc[enemy] = Math.max(out.disruptPressureCc[enemy], deniedCc);
    }
  }
}

/** Caller supplies completed chronological economy tables. Output is reusable;
 * the module scratch is synchronous/non-reentrant like the kill/BFS modules. */
export function pendingDiagnostics(p: PackedState, t: NodeTables, sc: Scratch, ply: number, out: PendingDiagnostics): PendingDiagnostics {
  out.valueCc.fill(0); out.risk.fill(0); out.arrivalThreatCc.fill(0); out.arrivalDependentVictims.fill(0); out.disruptPressureCc.fill(0);
  for (let side = 0; side < 2; side++) {
    const owner = side as Side;
    if (p.pendCount[owner] === 0) continue;
    exposure(p, t, owner, out);
    for (let q = 0; q < BOARD; q++) {
      const index = owner * PEND_STRIDE + q;
      if (p.pendDef[index] !== 0) out.valueCc[owner] += CC * p.pendCost[index] + (out.risk[index] ? 0 : t.econ[owner].pendingServicePVcc[q]);
    }
    const arrived = t.econ[owner].pendingOwnAct;
    if (arrived === null) continue; // Terminal precedence is authoritative.
    EXCLUDED.fill(0);
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (arrived.sq[slot] !== DEAD && arrived.owner[slot] === owner && !rootLive(p, arrived, slot)) EXCLUDED[slot] = 1;
    }
    // Both comparisons see precisely the same real incoming Act. Suppressing
    // newly arrived attacker identities does not remove their blocking bodies.
    KILL_OPTIONS.excludedAttackerSlots = undefined;
    killTable(arrived, t, owner, KILL_OPTIONS, sc, ply, ALL);
    KILL_OPTIONS.excludedAttackerSlots = EXCLUDED;
    killTable(arrived, t, owner, KILL_OPTIONS, sc, ply, LIVE_ONLY);
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (rootLive(p, arrived, slot) && p.owner[slot] !== owner && ALL.entry[slot].minActions < KILL_IMPOSSIBLE && LIVE_ONLY.entry[slot].minActions >= KILL_IMPOSSIBLE) {
        out.arrivalThreatCc[owner] += ALL.entry[slot].valueCc;
        out.arrivalDependentVictims[slot] = 1;
      }
    }
  }
  return out;
}

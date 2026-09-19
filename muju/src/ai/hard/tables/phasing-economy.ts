/**
 * M6's conditional pass-only forecast. This is a lifecycle simulation, not a
 * relocation/optimal-play claim. Only root-live service, actually paid rent and
 * released root-live principal enter livePV; root commitments own their service.
 * All Q16 sums are exact safe JS integers. Consumers subtract sides BEFORE
 * truncating; no 32-bit coercion is valid for these totals.
 */
import { DEAD, MAX_SLOTS, PEND_STRIDE, Result, type PackedState, type Side } from '../types';
import { activeCatalog } from '../core/catalog';
import { AKind, keepSetAdd, keepSetReset, newKeepSetTable, paMake } from '../core/action';
import { allocState, copyState, newUndo, Replica, type Undo } from '../core/state';
import { GAMMA_Q16, upkeepDue } from '../core/income';
import { ECON_HORIZON, type EconResult } from './economy';

export const ECON_MAX_PHASE_ACTIONS = 48;
export interface EconomyBill {
  side: Side;
  /** 0 only for the root's already-mined unpaid Prepare. */
  ordinal: number;
  cashBeforeIncome: number;
  income: number;
  liveIncome: number;
  pendingIncome: { square: number; amount: number }[];
  cashBeforeRent: number;
  fullArmyDue: number;
  paidRent: number;
  releasedIds: string[];
  releasedPrincipal: number;
  cashAfterRent: number;
}
export interface EconomyArrival {
  side: Side;
  square: number;
  cost: number;
  arrived: boolean;
  cashBefore: number;
  cashAfter: number;
}
export interface EconomyForecast {
  steps: number;
  stop: 'horizon' | 'terminal';
  result: PackedState['result'];
  reason: PackedState['reason'];
  finalBank: [number, number];
  proverCalls: number;
  cappedProverCalls: number;
  /** Optional exact diagnostics, not a rounded score. */
  bills: EconomyBill[];
  arrivals: EconomyArrival[];
}
export class PhasingEconomyProofCutoff extends Error {
  constructor(readonly proverCalls: number, readonly cappedProverCalls: number) {
    super(`Phasing economy forecast veto: ${cappedProverCalls} capped home proofs in ${proverCalls} calls`);
    this.name = 'PhasingEconomyProofCutoff';
  }
}

// Private, non-reentrant scratch; the prover does not enter table building.
// Every make has a matching unmake, including failures, to unwind Replica's
// string-ID stack. Separate Undo records avoid a horizon-sized fixed-stack bet.
const position = allocState();
const undos: Undo[] = [];
const keep = newKeepSetTable();
const rootOrd = new Int32Array(MAX_SLOTS);
const rootIds: string[] = [];
const rentSlots: number[] = [];
let replica: Replica | undefined;
let busy = false;
type PendingWindow = 'pendingEnemyAct' | 'pendingOwnAct';
const windows = new WeakMap<EconResult, Partial<Record<PendingWindow, PackedState>>>();
/** Storage belongs to the result object, never aliases the simulated position. */
function captureWindow(p: PackedState, out: EconResult, field: PendingWindow): void {
  let store = windows.get(out);
  if (store === undefined) { store = {}; windows.set(out, store); }
  const copy = store[field] ?? (store[field] = allocState());
  copyState(copy, p);
  out[field] = copy;
}

function reset(out: EconResult): void {
  out.livePVQ16 = out.livePVcc = 0;
  out.pendingServicePVQ16.fill(0);
  out.pendingServicePVcc.fill(0);
  out.pendingArrival.fill(0);
  out.pendingEnemyAct = out.pendingOwnAct = null;
  out.firstBillReached = false;
  out.requiredReserve = out.rentShortfall = out.incomeClosures = 0;
  out.forecastProverCalls = out.cappedProverCalls = 0;
  out.income.fill(0); out.upkeep.fill(0);
  out.stream = out.relocationDebt = out.waste = 0;
  out.turnsToInsolvency = ECON_HORIZON + 1;
}

/** Canonical defaultUpkeepAction(false): cost descending, then board square. */
function defaultKeep(p: PackedState, rep: Replica): void {
  keepSetReset(keep);
  keep.count = 1;
  rentSlots.length = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== p.side) continue;
    if (rep.cat.upkeep[p.defId[slot]] === 0) keepSetAdd(keep, 0, slot);
    else rentSlots.push(slot);
  }
  rentSlots.sort((a, b) => rep.cat.cost[p.defId[b]] - rep.cat.cost[p.defId[a]] || p.sq[a] - p.sq[b]);
  let cash = p.bank[p.side];
  for (const slot of rentSlots) {
    const due = rep.cat.upkeep[p.defId[slot]];
    if (due <= cash) { keepSetAdd(keep, 0, slot); cash -= due; }
  }
}

/**
 * Fills BOTH sides because arrivals, release and terminal precedence alternate.
 * Production uses diagnostics=false; the same arithmetic retains exact event
 * receipts when requested by the independent authored-reference checks.
 * Throws on a cap, illegal policy transition or exhausted structural bound.
 */
export function phasingEconomy(
  root: PackedState,
  out: [EconResult, EconResult],
  diagnostics = false,
): EconomyForecast {
  if (busy) throw new Error('Phasing economy forecast is not reentrant');
  busy = true;
  const cat = activeCatalog();
  if (replica === undefined || replica.cat !== cat) replica = new Replica(cat);
  const rep = replica;
  const callsBefore = rep.fullProverCalls, capsBefore = rep.cappedProverCalls;
  let made = 0;
  reset(out[0]); reset(out[1]);
  copyState(position, root);
  // The forecast describes real adjudication, even when a caller's diagnostic
  // replica was configured with a weaker proof mode.
  position.proverMode = 2;
  rootOrd.fill(-1);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (root.sq[slot] !== DEAD) rootOrd[slot] = root.ord[slot];
    rootIds[slot] = root.originIds[slot] || `root-slot-${slot}`;
  }
  const bills: EconomyBill[] = [], arrivals: EconomyArrival[] = [];
  let pendingBill: EconomyBill | null = null;
  try {
    while (position.result === Result.ONGOING &&
      !(out[0].incomeClosures >= ECON_HORIZON && out[1].incomeClosures >= ECON_HORIZON && position.upkeepPending === 0)) {
      // Capture only while this owner's root batch is still unresolved. In
      // particular enemy Prepare hands straight to our arrivals, so a later
      // enemy Act must not be mistaken for an intervening movement opportunity.
      const victim = (1 - position.side) as Side;
      if (position.phase === 1 && position.upkeepPending === 0 && position.pendCount[victim] > 0 &&
        out[victim].pendingEnemyAct === null) captureWindow(position, out[victim], 'pendingEnemyAct');
      if (made >= ECON_MAX_PHASE_ACTIONS) throw new Error('Phasing economy forecast exhausted its phase-action bound');
      const side = position.side, e = out[side];
      const kind = position.upkeepPending ? AKind.PAY_UPKEEP : position.phase === 1 ? AKind.END_ACTION : AKind.END_PLACE;
      let event: EconomyBill | null = pendingBill;
      if (kind === AKind.END_ACTION || (kind === AKind.PAY_UPKEEP && event === null)) {
        const ordinal = kind === AKind.END_ACTION ? ++e.incomeClosures : 0;
        if (ordinal > ECON_HORIZON) throw new Error('Phasing economy closure imbalance');
        event = { side, ordinal, cashBeforeIncome: position.bank[side], income: 0, liveIncome: 0,
          pendingIncome: [], cashBeforeRent: 0, fullArmyDue: upkeepDue(position, side),
          paidRent: 0, releasedIds: [], releasedPrincipal: 0, cashAfterRent: 0 };
        if (kind === AKind.END_ACTION) {
          for (let slot = 0; slot < MAX_SLOTS; slot++) {
            const square = position.sq[slot];
            if (square === DEAD || position.owner[slot] !== side) continue;
            const mining = cat.mine[position.defId[slot]];
            const take = Math.min(mining, position.reserve[square]);
            event.income += take;
            e.waste += mining - take;
            if (position.ord[slot] === rootOrd[slot]) event.liveIncome += take;
            else {
              // There is no movement/purchase/promotion in this policy: a new
              // body's current square identifies its original root commitment.
              if (root.pendDef[side * PEND_STRIDE + square] === 0 || cat.upkeep[position.defId[slot]] !== 0)
                throw new Error('Phasing economy lost root commitment identity');
              e.pendingServicePVQ16[square] += GAMMA_Q16[ordinal] * take * 100;
              if (diagnostics && take !== 0) event.pendingIncome.push({ square, amount: take });
            }
          }
          e.income[ordinal - 1] = event.income;
          e.upkeep[ordinal - 1] = event.fullArmyDue;
        }
        event.cashBeforeRent = event.cashBeforeIncome + event.income;
        e.livePVQ16 += GAMMA_Q16[ordinal] * event.liveIncome * 100;
        if (!e.firstBillReached) {
          e.firstBillReached = true;
          e.requiredReserve = Math.max(0, event.fullArmyDue - event.income);
          e.rentShortfall = Math.max(0, e.requiredReserve - event.cashBeforeIncome);
        }
        if (event.fullArmyDue > event.cashBeforeRent && e.turnsToInsolvency === ECON_HORIZON + 1)
          e.turnsToInsolvency = ordinal;
      }
      if (kind === AKind.PAY_UPKEEP) defaultKeep(position, rep);
      const action = paMake(kind);
      if (!rep.isLegal(position, action, keep)) throw new Error('Phasing economy generated an illegal pass-only action');
      const oldBank: [number, number] = [position.bank[0], position.bank[1]];
      const next = (1 - side) as Side;
      // Snapshot only commitments which this handoff could resolve.
      const pending = kind === AKind.END_PLACE ? Array.from({ length: 100 }, (_, square) =>
        position.pendDef[next * PEND_STRIDE + square] ? square : -1).filter(square => square >= 0) : [];
      const beforeLive = kind === AKind.PAY_UPKEEP ? Array.from({ length: MAX_SLOTS }, (_, slot) =>
        position.sq[slot] !== DEAD && position.owner[slot] === side ? slot : -1).filter(slot => slot >= 0) : [];
      const undo = undos[made] ?? (undos[made] = newUndo());
      rep.make(position, action, undo, keep);
      made++;
      if (rep.cappedProverCalls !== capsBefore)
        throw new PhasingEconomyProofCutoff(rep.fullProverCalls - callsBefore, rep.cappedProverCalls - capsBefore);
      if (position.bank[0] < 0 || position.bank[1] < 0) throw new Error('Phasing economy entered debt');
      if (kind !== AKind.END_PLACE && event !== null) {
        if (position.upkeepPending) pendingBill = event;
        else {
          event.cashAfterRent = position.bank[side];
          event.paidRent = event.cashBeforeRent - event.cashAfterRent;
          for (const slot of beforeLive) {
            if (position.sq[slot] !== DEAD) continue;
            if (position.ord[slot] !== rootOrd[slot]) throw new Error('Phasing economy released a pending-origin body');
            event.releasedPrincipal += cat.cost[position.defId[slot]];
            if (diagnostics) event.releasedIds.push(rootIds[slot]);
          }
          e.livePVQ16 -= GAMMA_Q16[event.ordinal] * (event.paidRent + event.releasedPrincipal) * 100;
          if (diagnostics) { event.releasedIds.sort(); event.pendingIncome.sort((a, b) => a.square - b.square); bills.push(event); }
          pendingBill = null;
        }
      }
      for (const square of pending) {
        const i = next * PEND_STRIDE + square;
        if (position.pendDef[i] !== 0) continue; // terminal before arrival
        const slot = position.pieceAt[square];
        const arrived = slot >= 0 && slot < MAX_SLOTS && position.owner[slot] === next && position.ord[slot] !== rootOrd[slot];
        out[next].pendingArrival[square] = arrived ? 1 : 2;
        if (diagnostics) arrivals.push({ side: next, square, cost: root.pendCost[i], arrived,
          cashBefore: oldBank[next], cashAfter: position.bank[next] });
      }
      if (kind === AKind.END_PLACE && pending.length > 0 && position.result === Result.ONGOING &&
        position.side === next && position.phase === 1 && position.pendCount[next] === 0 && out[next].pendingOwnAct === null)
        captureWindow(position, out[next], 'pendingOwnAct');
    }
    return { steps: made, stop: position.result === Result.ONGOING ? 'horizon' : 'terminal',
      result: position.result, reason: position.reason, finalBank: [position.bank[0], position.bank[1]],
      proverCalls: rep.fullProverCalls - callsBefore, cappedProverCalls: rep.cappedProverCalls - capsBefore, bills, arrivals };
  } finally {
    for (const e of out) {
      e.livePVcc = e.livePVQ16 / 65536;
      e.stream = Math.trunc(e.livePVcc);
      for (let square = 0; square < 100; square++) e.pendingServicePVcc[square] = e.pendingServicePVQ16[square] / 65536;
      e.forecastProverCalls = rep.fullProverCalls - callsBefore;
      e.cappedProverCalls = rep.cappedProverCalls - capsBefore;
    }
    while (made > 0) rep.unmake(position, undos[--made]);
    busy = false;
  }
}

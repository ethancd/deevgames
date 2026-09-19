/**
 * Independent canonical reference for M6. No packed state/table calculation,
 * corpus loader, or implicit CLI execution. Call only with an authored state.
 * Real applyAction transitions determine mining, legal payment, release,
 * arrivals and terminal precedence; canonical receipts provide cash attribution.
 */
import type { GameState } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { getHomeOccupier, getOpponent } from '../../../src/game/victory';
import { defaultUpkeepAction, upkeepDue } from '../../../src/game/upkeep';
import { getUnitDefinition } from '../../../src/game/units';

export interface CanonicalEconomySide {
  livePVQ16: number;
  livePVcc: number;
  pendingServicePVQ16: number[];
  pendingServicePVcc: number[];
  pendingArrival: number[];
  pendingEnemyAct: GameState | null;
  pendingOwnAct: GameState | null;
  firstBillReached: boolean;
  requiredReserve: number;
  rentShortfall: number;
  incomeClosures: number;
  income: number[];
  upkeep: number[];
  waste: number;
  turnsToInsolvency: number;
}
export interface CanonicalEconomyBill {
  side: 0 | 1;
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
const players = ['white', 'black'] as const;
// Independent literal declaration of the approved six-closure convention.
const discount = [65536, 58982, 53084, 47776, 42998, 38698, 34829];
const horizon = 6, maxSteps = 48;
function emptySide(): CanonicalEconomySide {
  return { livePVQ16: 0, livePVcc: 0, pendingServicePVQ16: Array(100).fill(0),
    pendingServicePVcc: Array(100).fill(0), pendingArrival: Array(100).fill(0),
    pendingEnemyAct: null, pendingOwnAct: null,
    firstBillReached: false, requiredReserve: 0, rentShortfall: 0, incomeClosures: 0,
    income: Array(horizon).fill(0), upkeep: Array(horizon).fill(0), waste: 0, turnsToInsolvency: horizon + 1 };
}

/** Detect the exact canonical gate before applyAction hides UNKNOWN as ongoing. */
function proofResolved(candidate: GameState): boolean {
  const invader = candidate.turn.currentPlayer;
  if (candidate.phase !== 'playing' || candidate.upkeepPending || candidate.turn.phase !== 'place' ||
    candidate.victoryRule === 'elimination' || !getHomeOccupier(candidate.board, invader) ||
    getHomeOccupier(candidate.board, getOpponent(invader))) return false;
  const evidence = analyzeHomeDefenseEvidence(candidate, invader, transitionWithoutCheckmate);
  if (evidence.result === 'unknown' || evidence.cutoffReason !== null)
    throw new Error(`Canonical economy forecast veto: home proof ${evidence.result}/${evidence.cutoffReason}`);
  return true;
}

export function canonicalPhasingEconomy(root: GameState) {
  if (root.ruleset !== 'phasing' || root.phase === 'setup') throw new Error('Canonical economy requires an explicit Phasing game root');
  const side: [CanonicalEconomySide, CanonicalEconomySide] = [emptySide(), emptySide()];
  const live = new Map(root.board.units.map(u => [u.id, u]));
  const committed = new Map((root.pendingSummons ?? []).map(q => [q.id, q]));
  let state = root, steps = 0, proverCalls = 0;
  const bills: CanonicalEconomyBill[] = [];
  const arrivals: { side: 0 | 1; square: number; cost: number; arrived: boolean; cashBefore: number; cashAfter: number }[] = [];
  let pendingBill: CanonicalEconomyBill | null = null;
  while (state.phase !== 'victory' && !(side.every(e => e.incomeClosures >= horizon) && !state.upkeepPending)) {
    const waiting = state.turn.currentPlayer === 'white' ? 1 : 0;
    if (state.turn.phase === 'action' && !state.upkeepPending && side[waiting].pendingEnemyAct === null &&
      (state.pendingSummons ?? []).some(q => q.owner === players[waiting])) side[waiting].pendingEnemyAct = state;
    if (steps >= maxSteps) throw new Error('Canonical economy phase-action bound exhausted');
    const player = state.turn.currentPlayer, s = (player === 'white' ? 0 : 1) as 0 | 1, e = side[s];
    const action: AIAction = state.upkeepPending ? defaultUpkeepAction(state, false) :
      state.turn.phase === 'action' ? { type: 'END_ACTION_PHASE' } : { type: 'END_PLACE_PHASE' };
    let event: CanonicalEconomyBill | null = pendingBill;
    if (action.type === 'END_ACTION_PHASE' || (action.type === 'PAY_UPKEEP' && event === null)) {
      const ordinal = action.type === 'END_ACTION_PHASE' ? ++e.incomeClosures : 0;
      if (ordinal > horizon) throw new Error('Canonical economy closure imbalance');
      event = { side: s, ordinal, cashBeforeIncome: state.players[player].resources,
        income: 0, liveIncome: 0, pendingIncome: [], cashBeforeRent: 0, fullArmyDue: upkeepDue(state, player),
        paidRent: 0, releasedIds: [], releasedPrincipal: 0, cashAfterRent: 0 };
    }
    const candidate = transitionWithoutCheckmate(state, action);
    if (candidate === state) throw new Error('Canonical economy policy action was rejected');
    if (proofResolved(candidate)) proverCalls++;
    const next = applyAction(state, action);
    if (next === state) throw new Error('Canonical economy transition did not progress');
    steps++;
    if (action.type === 'END_ACTION_PHASE' && event !== null) {
      const receipt = next.lastIncome;
      if (!receipt || receipt === state.lastIncome || receipt.player !== player) throw new Error('Canonical economy lost an income receipt');
      event.income = receipt.total;
      for (const take of receipt.takes) {
        e.waste += getUnitDefinition(take.definitionId).mining - take.amount;
        if (live.has(take.unitId)) event.liveIncome += take.amount;
        else {
          const q = committed.get(take.unitId);
          if (!q || q.owner !== player || getUnitDefinition(q.definitionId).tier !== 1)
            throw new Error('Canonical economy lost root commitment attribution');
          const square = q.position.x + 10 * q.position.y;
          e.pendingServicePVQ16[square] += discount[event.ordinal] * take.amount * 100;
          if (take.amount !== 0) event.pendingIncome.push({ square, amount: take.amount });
        }
      }
      e.income[event.ordinal - 1] = event.income;
      e.upkeep[event.ordinal - 1] = event.fullArmyDue;
      e.livePVQ16 += discount[event.ordinal] * event.liveIncome * 100;
    }
    if (event !== null && action.type !== 'END_PLACE_PHASE') {
      event.cashBeforeRent = event.cashBeforeIncome + event.income;
      if (!e.firstBillReached) {
        e.firstBillReached = true;
        e.requiredReserve = Math.max(0, event.fullArmyDue - event.income);
        e.rentShortfall = Math.max(0, e.requiredReserve - event.cashBeforeIncome);
      }
      if (event.fullArmyDue > event.cashBeforeRent && e.turnsToInsolvency === horizon + 1) e.turnsToInsolvency = event.ordinal;
      if (next.upkeepPending) pendingBill = event;
      else {
        const receipt = next.lastUpkeep;
        if (!receipt || receipt === state.lastUpkeep || receipt.player !== player) throw new Error('Canonical economy lost an upkeep receipt');
        event.paidRent = receipt.paid;
        event.releasedIds = receipt.released.map(u => u.id).sort();
        for (const released of receipt.released) {
          const original = live.get(released.id);
          if (!original) throw new Error('Canonical economy released a non-root-live body');
          event.releasedPrincipal += getUnitDefinition(original.definitionId).cost;
        }
        event.cashAfterRent = next.players[player].resources;
        if (event.cashAfterRent !== event.cashBeforeRent - event.paidRent) throw new Error('Canonical economy cash ledger mismatch');
        e.livePVQ16 -= discount[event.ordinal] * (event.paidRent + event.releasedPrincipal) * 100;
        event.pendingIncome.sort((a, b) => a.square - b.square);
        bills.push(event); pendingBill = null;
      }
    }
    if (action.type === 'END_PLACE_PHASE' && next.lastSummoning !== state.lastSummoning && next.lastSummoning) {
      const receipt = next.lastSummoning;
      const incoming = (receipt.player === 'white' ? 0 : 1) as 0 | 1;
      if (next.phase === 'playing' && next.turn.phase === 'action' && receipt.summoned.length + receipt.disrupted.length > 0)
        side[incoming].pendingOwnAct = next;
      for (const q of [...receipt.summoned, ...receipt.disrupted].sort((a, b) =>
        a.position.y - b.position.y || a.position.x - b.position.x)) {
        const square = q.position.x + 10 * q.position.y, arrived = receipt.summoned.some(a => a.id === q.id);
        side[incoming].pendingArrival[square] = arrived ? 1 : 2;
        arrivals.push({ side: incoming, square, cost: q.cost, arrived,
          cashBefore: state.players[receipt.player].resources, cashAfter: next.players[receipt.player].resources });
      }
    }
    for (const p of players) if (next.players[p].resources < 0) throw new Error('Canonical economy entered debt');
    state = next;
  }
  for (const e of side) {
    e.livePVcc = e.livePVQ16 / 65536;
    e.pendingServicePVcc = e.pendingServicePVQ16.map(value => value / 65536);
  }
  return { side, state, steps, proverCalls, stop: state.phase === 'victory' ? 'terminal' as const : 'horizon' as const,
    finalBank: players.map(p => state.players[p].resources), bills, arrivals };
}

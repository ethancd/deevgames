import type { AIAction } from '../../src/ai/types';
import { isPhasing } from '../../src/game/rules';
import { applyAction } from '../../src/ai/simulate';
import { getAdjacentPositions, getCell, getUnitAt } from '../../src/game/board';
import { projectedIncome, getTotalBoardResources, unitEndOfTurnTake } from '../../src/game/mining';
import { findPath, getMovementRange } from '../../src/game/movement';
import { getUnitDefinition } from '../../src/game/units';
import { unitUpkeep, upkeepDue } from '../../src/game/upkeep';
import type { GameState, PlayerId, Unit } from '../../src/game/types';
import { square, squares } from '../notation';
import type { AnalysisInput } from './schema';
import { selectedUnits } from './geometry';

const players = ['white', 'black'] as const;
interface ForecastFailure { player: PlayerId; afterOwnHarvests: number; treasury: number; due: number; shortfall: number }
export interface Checkpoint { player: PlayerId; turn: number; kind: 'harvest' | 'upkeep' | 'summon_refund'; amount: number; treasury: number }
/** A financial projection, stopped at the first impossible retention or terminal
 * result. No annualized harvest, fabricated future income, or insolvent army. */
export function economyForecast(source: GameState, horizon = 12) {
  let state = source;
  const checkpoints: Checkpoint[] = [];
  const completed = { white: 0, black: 0 };
  let failure: ForecastFailure | null = null;
  let stop = source.phase === 'playing' ? 'horizon' : `terminal:${source.victoryReason ?? source.phase}`;
  const step = (action: AIAction) => {
    const before = state;
    state = applyAction(state, action);
    if (state.lastIncome && state.lastIncome !== before.lastIncome) {
      const income = state.lastIncome;
      completed[income.player]++;
      checkpoints.push({ player: income.player, turn: income.turnNumber, kind: 'harvest', amount: income.total,
        treasury: before.players[income.player].resources + income.total });
    }
    if (state.lastUpkeep && state.lastUpkeep !== before.lastUpkeep) {
      const payment = state.lastUpkeep;
      checkpoints.push({ player: payment.player, turn: payment.turnNumber, kind: 'upkeep', amount: payment.paid,
        treasury: state.players[payment.player].resources });
    }
    if (state.lastSummoning && state.lastSummoning !== before.lastSummoning) {
      const result = state.lastSummoning, refunded = result.disrupted.reduce((total, summon) => total + summon.cost, 0);
      if (refunded) checkpoints.push({ player: result.player, turn: result.turnNumber, kind: 'summon_refund',
        amount: refunded, treasury: state.players[result.player].resources });
    }
    if (state.phase !== 'playing') stop = `terminal:${state.victoryReason ?? state.phase}`;
  };
  const payPending = () => {
    if (state.phase !== 'playing' || !state.upkeepPending) return true;
    const player = state.turn.currentPlayer, due = upkeepDue(state, player), treasury = state.players[player].resources;
    if (due > treasury) {
      failure = { player, afterOwnHarvests: completed[player], treasury, due, shortfall: due - treasury };
      stop = 'upkeep_shortfall'; return false;
    }
    step({ type: 'PAY_UPKEEP', keepUnitIds: state.board.units.filter(u => u.owner === player).map(u => u.id) });
    return true;
  };
  for (let ply = 0; ply < horizon * 2 && state.phase === 'playing'; ply++) {
    if (isPhasing(state)) {
      if (state.turn.phase === 'action') step({ type: 'END_ACTION_PHASE' });
      if (!payPending()) break;
      if (state.phase === 'playing') step({ type: 'END_PLACE_PHASE' });
    } else {
      if (!payPending()) break;
      if (state.phase !== 'playing') break;
      if (state.turn.phase === 'place') step({ type: 'END_PLACE_PHASE' });
      if (state.phase === 'playing') step({ type: 'END_ACTION_PHASE' });
      // Detect the incoming shortfall even at the horizon boundary.
      if (state.phase === 'playing' && state.upkeepPending && upkeepDue(state, state.turn.currentPlayer) > state.players[state.turn.currentPlayer].resources) {
        payPending(); break;
      }
    }
  }
  return { assumptions: 'Stay in place; no new spending, captures or releases; existing public summons resolve/refund normally; retain every unit while affordable. Stop both ledgers at the first shortfall, terminal result or horizon.',
    horizon, stop, failure: failure as ForecastFailure | null, completed, checkpoints };
}

export function economyHeadlines(s: GameState, forecast = economyForecast(s)) {
  return Object.fromEntries(players.map(player => {
    const next = forecast.checkpoints.find(c => c.player === player), due = upkeepDue(s, player);
    const immediateUpkeep = isPhasing(s) ? s.turn.currentPlayer === player && !!s.upkeepPending : s.turn.currentPlayer !== player || s.upkeepPending;
    const available = s.players[player].resources + (immediateUpkeep ? 0 : projectedIncome(s, player));
    return [player, { treasury: s.players[player].resources, harvest: projectedIncome(s, player), upkeep: due,
      harvestTrend: forecast.checkpoints.filter(c => c.player === player && c.kind === 'harvest').slice(0, 3).map(c => c.amount),
      next: next ? `${next.kind}:${next.treasury}` : forecast.stop,
      nextUpkeepShortfall: isPhasing(s)
        ? forecast.checkpoints.some(c => c.player === player && c.kind === 'upkeep') ? 0 : forecast.failure?.player === player ? forecast.failure.shortfall : null
        : Math.max(0, due - available),
      shortfallIn: forecast.failure?.player === player ? forecast.failure.afterOwnHarvests : null }];
  }));
}

export function minerDetail(s: GameState, u: Unit, horizon: number, relocation: boolean, actions: number, limit: number) {
  const def = getUnitDefinition(u.definitionId), reserve = getCell(s.board, u.position)!.resourceLayers;
  const next = unitEndOfTurnTake(u, getCell(s.board, u.position)!);
  const adjacent = getAdjacentPositions(u.position).filter(p => !getUnitAt(s.board, p) && getCell(s.board, p)!.resourceLayers > 0)
    .map(p => ({ square: square(p), reserve: getCell(s.board, p)!.resourceLayers, next: Math.min(def.mining, getCell(s.board, p)!.resourceLayers), actionCost: 1 }));
  const destinations = relocation && def.mining ? getMovementRange(u.position, def.speed, actions, s.board)
    .filter(p => getCell(s.board, p.position)!.resourceLayers > 0).map(p => {
      const deposit = getCell(s.board, p.position)!.resourceLayers;
      return { square: square(p.position), actionCost: actions - p.actionsRemaining,
        path: squares(findPath(u.position, p.position, s.board, 100)!), next: Math.min(def.mining, deposit),
        incrementalHarvest: Math.min(deposit, horizon * def.mining) - Math.min(reserve, horizon * def.mining),
        reserve: deposit, tacticallyChecked: false };
    }).sort((a, b) => b.incrementalHarvest - a.incrementalHarvest || a.actionCost - b.actionCost || a.square.localeCompare(b.square)) : [];
  return { id: u.id, square: square(u.position), mining: def.mining, reserve, next,
    harvestsLeft: def.mining ? Math.ceil(reserve / def.mining) : 0, upkeep: unitUpkeep(u), economicallyIdle: next === 0,
    emptyAfterHarvest: reserve > 0 && reserve <= def.mining, adjacent,
    ...(relocation ? { relocations: destinations.slice(0, limit), relocationCount: destinations.length,
      relocationAssumptions: `Independent routes on the fixed board; ${horizon} own harvests; excludes tactics and game termination; movement eligibility must be checked in the chosen turn.` } : {}) };
}

export function economy(s: GameState, input: AnalysisInput) {
  const forecast = economyForecast(s, input.horizon);
  const regions = input.targets.regions ?? [{ from: { x: 0, y: 0 }, to: { x: 4, y: 4 } },
    { from: { x: 5, y: 0 }, to: { x: 9, y: 4 } }, { from: { x: 0, y: 5 }, to: { x: 4, y: 9 } }, { from: { x: 5, y: 5 }, to: { x: 9, y: 9 } }];
  const units = selectedUnits(s, input);
  return { headline: economyHeadlines(s, forecast), forecast,
    historicalLastHarvest: s.lastIncome ? { player: s.lastIncome.player, turn: s.lastIncome.turnNumber, total: s.lastIncome.total } : null,
    upkeepDecisionUnits: Object.fromEntries(players.map(p => [p, s.board.units.filter(u => u.owner === p && unitUpkeep(u) > 0).map(u => u.id)])),
    totalRemaining: getTotalBoardResources(s.board),
    regions: regions.map(r => ({ region: `${square(r.from)}:${square(r.to)}`, remaining: s.board.cells.flat().filter(c =>
      c.position.x >= Math.min(r.from.x, r.to.x) && c.position.x <= Math.max(r.from.x, r.to.x) &&
      c.position.y >= Math.min(r.from.y, r.to.y) && c.position.y <= Math.max(r.from.y, r.to.y)).reduce((n, c) => n + c.resourceLayers, 0) })),
    reachableReserves: Object.fromEntries(players.map(player => {
      const positions = new Map<string, number>();
      for (const u of s.board.units.filter(u => u.owner === player && getUnitDefinition(u.definitionId).mining > 0)) {
        for (const p of [u.position, ...getMovementRange(u.position, getUnitDefinition(u.definitionId).speed, input.actions, s.board).map(p => p.position)])
          positions.set(square(p), getCell(s.board, p)!.resourceLayers);
      }
      return [player, { actionsPerMiner: input.actions, remaining: [...positions.values()].reduce((a, b) => a + b, 0),
        assumption: 'Union of independent miner routes; fixed occupancy; excludes a joint shared-AP plan.' }];
    })),
    units: units.map(u => minerDetail(s, u, Math.min(input.horizon, 4), input.detail === 'full', input.actions, input.limit)) };
}

import type { GameState } from '../../src/game/types';
import type { RoomAction } from '../../src/online/types';
import { applyAction } from '../../src/ai/simulate';
import { projectedIncome, getTotalBoardResources } from '../../src/game/mining';
import { upkeepDue } from '../../src/game/upkeep';
import { getAllSpawnPositions } from '../../src/game/spawning';
import { getUnitDefinition } from '../../src/game/units';
import { getMoveCost } from '../../src/game/movement';
import { describeAction, square } from '../notation';
import { simulateSequence } from './core';

export function exchange(before: GameState, actions: RoomAction[]) {
  const { state: after, applied } = simulateSequence(before, actions);
  let s = before, ap = 0, crystals = 0, upkeep = 0;
  for (const action of applied) {
    if (action.type === 'MOVE') {
      const u = s.board.units.find(u => u.id === action.unitId)!;
      ap += getMoveCost(u.position, action.to, getUnitDefinition(u.definitionId).speed, s.board)!;
    } else if (action.type === 'ATTACK') ap++;
    const next = applyAction(s, action), actor = s.turn.currentPlayer;
    if (action.type === 'BUY_UNIT' || action.type === 'PROMOTE_UNIT') crystals += s.players[actor].resources - next.players[actor].resources;
    if (action.type === 'PAY_UPKEEP') upkeep += s.players[actor].resources - next.players[actor].resources;
    s = next;
  }
  return { proof: 'proven_possible', witness: applied.map(describeAction), actionsSpent: ap, crystalsSpent: crystals, chosenUpkeepPaid: upkeep,
    captured: before.board.units.filter(u => u.owner !== before.turn.currentPlayer && !after.board.units.some(v => v.id === u.id))
      .map(u => ({ id: u.id, definitionId: u.definitionId, catalogueValue: getUnitDefinition(u.definitionId).cost })),
    released: before.board.units.filter(u => u.owner === before.turn.currentPlayer && !after.board.units.some(v => v.id === u.id)).map(u => u.id),
    players: Object.fromEntries((['white', 'black'] as const).map(player => [player, {
      treasury: [before.players[player].resources, after.players[player].resources],
      upkeep: [upkeepDue(before, player), upkeepDue(after, player)],
      forecastHarvest: [projectedIncome(before, player), projectedIncome(after, player)],
      spawnCount: [getAllSpawnPositions(player, before.board).length, getAllSpawnPositions(player, after.board).length],
    }])),
    boardReserves: [getTotalBoardResources(before.board), getTotalBoardResources(after.board)],
    finalPositions: after.board.units.filter(u => {
      const old = before.board.units.find(v => v.id === u.id);
      return !old || old.position.x !== u.position.x || old.position.y !== u.position.y || old.definitionId !== u.definitionId;
    }).map(u => `${u.id}@${square(u.position)} ${u.definitionId}`),
    result: after.phase === 'victory' ? { winner: after.winner, reason: after.victoryReason } : null,
    interpretation: 'Accounting only. Catalogue capture value is not a trade verdict; any searched reply is reported separately.' };
}

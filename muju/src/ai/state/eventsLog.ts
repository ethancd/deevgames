import type { GameState, PlayerId } from '../../game/types';
import { getUnitDefinition } from '../../game/units';
import { getUnitById } from '../../game/board';
import type { GameEvent } from './events';

function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === 'player' ? 'ai' : 'player';
}

export function collectObservedEvents(
  prevState: GameState | null,
  nextState: GameState,
  asPlayer: PlayerId
): GameEvent[] {
  const events: GameEvent[] = [];
  const opponent = getOpponent(asPlayer);

  if (!prevState) {
    return events;
  }

  // Mining detection: minedDepth increase with opponent unit present
  for (let y = 0; y < nextState.board.cells.length; y++) {
    for (let x = 0; x < nextState.board.cells[y].length; x++) {
      const prevCell = prevState.board.cells[y][x];
      const nextCell = nextState.board.cells[y][x];

      if (nextCell.minedDepth > prevCell.minedDepth) {
        const unit = nextState.board.units.find(
          (u) => u.position.x === x && u.position.y === y && u.owner === opponent
        );
        if (unit) {
          events.push({
            type: 'MINE',
            playerId: opponent,
            amount: nextCell.minedDepth - prevCell.minedDepth,
            position: { x, y },
          });
        }
      }
    }
  }

  // Placement detection: unit present in next but not previous
  for (const unit of nextState.board.units) {
    if (unit.owner !== opponent) continue;
    const prevUnit = getUnitById(prevState.board, unit.id);
    if (!prevUnit) {
      const def = getUnitDefinition(unit.definitionId);
      events.push({
        type: 'PLACE',
        playerId: opponent,
        definitionId: unit.definitionId,
        position: unit.position,
        cost: def.cost,
      });
    }
  }

  // Promotion detection: same unit id with different definitionId
  for (const prevUnit of prevState.board.units) {
    if (prevUnit.owner !== opponent) continue;
    const nextUnit = getUnitById(nextState.board, prevUnit.id);
    if (!nextUnit) continue;
    if (nextUnit.definitionId !== prevUnit.definitionId) {
      const prevDef = getUnitDefinition(prevUnit.definitionId);
      const nextDef = getUnitDefinition(nextUnit.definitionId);
      events.push({
        type: 'PROMOTE',
        playerId: opponent,
        fromDefinitionId: prevUnit.definitionId,
        toDefinitionId: nextUnit.definitionId,
        cost: nextDef.cost - prevDef.cost,
      });
    }
  }

  if (prevState.turn.currentPlayer !== nextState.turn.currentPlayer) {
    events.push({ type: 'TURN_END', playerId: prevState.turn.currentPlayer });
  }

  return events;
}

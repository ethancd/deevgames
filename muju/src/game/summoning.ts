import type { GameState, PlayerId, Position } from './types';
import { isValidSpawnPosition, getAllSpawnPositions } from './spawning';
import { createUnitFromDefinition } from './building';

export function hasPendingSummon(state: GameState, player: PlayerId, position: Position): boolean {
  return (state.pendingSummons ?? []).some(s => s.owner === player && s.position.x === position.x && s.position.y === position.y);
}

export function getPurchasePositions(state: GameState, player: PlayerId): Position[] {
  return getAllSpawnPositions(player, state.board).filter(p => !hasPendingSummon(state, player, p));
}

/** Check all commitments against the same arrival board: arrivals cannot anchor
 * one another. Any current valid rectangle suffices; a disrupted summon refunds
 * its original price, once. Temporary intrusion during the reply is irrelevant. */
export function resolveSummons(state: GameState, player: PlayerId): GameState {
  const pending = state.pendingSummons ?? [];
  const own = pending.filter(s => s.owner === player);
  const summoned = own.filter(s => isValidSpawnPosition(s.position, player, state.board));
  const disrupted = own.filter(s => !summoned.includes(s));
  return { ...state,
    pendingSummons: pending.filter(s => s.owner !== player),
    lastSummoning: { player, turnNumber: state.turn.turnNumber, summoned, disrupted },
    board: { ...state.board, units: [...state.board.units, ...summoned.map(s => ({
      ...createUnitFromDefinition(s.definitionId, player, s.position, s.id),
      // Promotion is allowed at the end of the arrival turn in Phasing.
      placedThisTurn: false,
    }))] },
    players: { ...state.players, [player]: { ...state.players[player],
      resources: state.players[player].resources + disrupted.reduce((sum, s) => sum + s.cost, 0) } },
  };
}

import type { BoardState, Cell, GameState, IncomeTake, PlayerId, Unit } from './types';
import { BOARD_SIZE, getCell } from './board';
import { getUnitDefinition } from './units';

export function reserveTake(mining: number, reserve: number): number { return Math.min(mining, reserve); }

/** The entire mining rule, independent of actions and turn flags. */
export function unitEndOfTurnTake(unit: Unit, cell: Cell): number {
  return reserveTake(getUnitDefinition(unit.definitionId).mining, cell.resourceLayers);
}

export function projectedIncome(state: GameState, player: PlayerId): number {
  return state.board.units.filter(u => u.owner === player)
    .reduce((sum, u) => sum + unitEndOfTurnTake(u, getCell(state.board, u.position)!), 0);
}

/** Immutable, simultaneous income for the mover. Call once at the turn boundary. */
export function endOfTurnIncome(state: GameState, player: PlayerId): { state: GameState; takes: IncomeTake[]; total: number } {
  const takes = state.board.units.filter(u => u.owner === player).map(u => ({
    unitId: u.id, definitionId: u.definitionId, position: { ...u.position },
    amount: unitEndOfTurnTake(u, getCell(state.board, u.position)!),
  }));
  const total = takes.reduce((sum, t) => sum + t.amount, 0);
  const byCell = new Map(takes.map(t => [t.position.y * BOARD_SIZE + t.position.x, t.amount]));
  const cells = state.board.cells.map(row => row.map(cell => {
    const amount = byCell.get(cell.position.y * BOARD_SIZE + cell.position.x) ?? 0;
    return amount ? { ...cell, resourceLayers: cell.resourceLayers - amount } : cell;
  }));
  const me = state.players[player];
  return { total, takes, state: { ...state, board: { ...state.board, cells },
    players: { ...state.players, [player]: { ...me, resources: me.resources + total, resourcesGained: me.resourcesGained + total } },
    lastIncome: { player, turnNumber: state.turn.turnNumber, total, takes },
  } };
}

export function getTotalBoardResources(board: BoardState): number {
  return board.cells.flat().reduce((sum, cell) => sum + cell.resourceLayers, 0);
}

/** Total reserves accessible eventually to a miner, with no depth restriction. */
export function getReachableResources(unit: Unit, board: BoardState): number {
  return getUnitDefinition(unit.definitionId).mining > 0 ? getTotalBoardResources(board) : 0;
}

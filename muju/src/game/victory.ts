import type { BoardState, PlayerId } from './types';
import { getPlayerUnits } from './board';

/**
 * Victory condition: A player wins when their opponent has no pieces on the board.
 * Without pieces, the opponent has no anchor for spawning, so even with a build queue
 * they cannot deploy new units.
 */

export type GameResult =
  | { status: 'ongoing' }
  | { status: 'victory'; winner: PlayerId }
  | { status: 'draw' }; // Included for completeness, unlikely in this game

/**
 * Check if a player has been eliminated (has no units left)
 */
export function isPlayerEliminated(board: BoardState, player: PlayerId): boolean {
  const units = getPlayerUnits(board, player);
  return units.length === 0;
}

/**
 * Get the number of units a player has
 */
export function getUnitCount(board: BoardState, player: PlayerId): number {
  return getPlayerUnits(board, player).length;
}

/**
 * Check the current game state and determine if there's a winner
 */
export function checkVictory(board: BoardState): GameResult {
  const whiteUnits = getPlayerUnits(board, 'white');
  const blackUnits = getPlayerUnits(board, 'black');

  // If both players have no units, it's a draw (shouldn't happen normally)
  if (whiteUnits.length === 0 && blackUnits.length === 0) {
    return { status: 'draw' };
  }

  // If white has no units, black wins
  if (whiteUnits.length === 0) {
    return { status: 'victory', winner: 'black' };
  }

  // If black has no units, white wins
  if (blackUnits.length === 0) {
    return { status: 'victory', winner: 'white' };
  }

  // Game continues
  return { status: 'ongoing' };
}

/**
 * Get the opponent of a player
 */
export function getOpponent(player: PlayerId): PlayerId {
  return player === 'white' ? 'black' : 'white';
}

/**
 * Check if a specific player has won
 */
export function hasWon(board: BoardState, player: PlayerId): boolean {
  const result = checkVictory(board);
  return result.status === 'victory' && result.winner === player;
}

/**
 * Check if a specific player has lost
 */
export function hasLost(board: BoardState, player: PlayerId): boolean {
  const result = checkVictory(board);
  return result.status === 'victory' && result.winner !== player;
}

/**
 * Check if the game is still ongoing
 */
export function isGameOngoing(board: BoardState): boolean {
  const result = checkVictory(board);
  return result.status === 'ongoing';
}

/**
 * Get game summary for display
 */
export function getGameSummary(board: BoardState): {
  whiteUnits: number;
  blackUnits: number;
  result: GameResult;
} {
  return {
    whiteUnits: getUnitCount(board, 'white'),
    blackUnits: getUnitCount(board, 'black'),
    result: checkVictory(board),
  };
}

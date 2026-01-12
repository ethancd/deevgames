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
  const playerUnits = getPlayerUnits(board, 'player');
  const aiUnits = getPlayerUnits(board, 'ai');

  // If both players have no units, it's a draw (shouldn't happen normally)
  if (playerUnits.length === 0 && aiUnits.length === 0) {
    return { status: 'draw' };
  }

  // If player has no units, AI wins
  if (playerUnits.length === 0) {
    return { status: 'victory', winner: 'ai' };
  }

  // If AI has no units, player wins
  if (aiUnits.length === 0) {
    return { status: 'victory', winner: 'player' };
  }

  // Game continues
  return { status: 'ongoing' };
}

/**
 * Get the opponent of a player
 */
export function getOpponent(player: PlayerId): PlayerId {
  return player === 'player' ? 'ai' : 'player';
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
  playerUnits: number;
  aiUnits: number;
  result: GameResult;
} {
  return {
    playerUnits: getUnitCount(board, 'player'),
    aiUnits: getUnitCount(board, 'ai'),
    result: checkVictory(board),
  };
}

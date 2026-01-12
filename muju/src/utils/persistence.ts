import type { GameState } from '../game/types';

// Bump this when GameState structure changes incompatibly
const SCHEMA_VERSION = 1;

const STORAGE_KEY = 'elemental-tactics-save';

interface PersistedState {
  schemaVersion: number;
  timestamp: number;
  state: GameState;
}

/**
 * Save game state to localStorage
 */
export function saveGameState(state: GameState): void {
  try {
    const persisted: PersistedState = {
      schemaVersion: SCHEMA_VERSION,
      timestamp: Date.now(),
      state,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (e) {
    // localStorage might be full or disabled
    console.warn('Failed to save game state:', e);
  }
}

/**
 * Load game state from localStorage
 * Returns null if no valid save exists or schema version mismatches
 */
export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const persisted: PersistedState = JSON.parse(raw);

    // Version mismatch - start fresh
    if (persisted.schemaVersion !== SCHEMA_VERSION) {
      console.log('Schema version mismatch, starting fresh game');
      clearGameState();
      return null;
    }

    // Basic validation - check required fields exist
    if (!validateGameState(persisted.state)) {
      console.log('Invalid saved state, starting fresh game');
      clearGameState();
      return null;
    }

    return persisted.state;
  } catch (e) {
    console.warn('Failed to load game state:', e);
    clearGameState();
    return null;
  }
}

/**
 * Clear saved game state
 */
export function clearGameState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear game state:', e);
  }
}

/**
 * Basic validation of game state structure
 */
function validateGameState(state: unknown): state is GameState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Record<string, unknown>;

  // Check top-level required fields
  if (!s.phase || !s.board || !s.players || !s.turn) return false;

  // Check board has cells and units
  const board = s.board as Record<string, unknown>;
  if (!Array.isArray(board.cells) || !Array.isArray(board.units)) return false;

  // Check players structure
  const players = s.players as Record<string, unknown>;
  if (!players.player || !players.ai) return false;

  // Check turn structure
  const turn = s.turn as Record<string, unknown>;
  if (typeof turn.currentPlayer !== 'string' || typeof turn.phase !== 'string') return false;

  return true;
}

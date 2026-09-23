import { LEGACY_INACTIVITY_LIMIT, resolveInactivityDraw } from '../game/inactivity';
import type { GameState, PlayerId } from '../game/types';
import { getActionsPerTurn, isActionsPerTurn, isBlackCrystalHandicap, isRuleset } from '../game/rules';
import { startHistory, type LocalGameHistory } from '../game/analysis';
import { DEFAULT_AI_PACE, isAIPace, type AIPace } from '../ai/turnTime';

// v7: explicit ruleset and public pending summons. v5/v6 saves remain readable as Standard.
// v8 (rules revision `muju-phasing-2`, 2026-09-19): the inactivity draw is twenty
// quiet plies instead of ten. The version exists so a resumed save is never judged
// under a clock its players did not agree to: see `loadGameState`.
// v9 (2026-09-21): Standard retired. A save whose `state.ruleset` is not
// `'phasing'` is archived, never resumed — the rules it was played under are no
// longer implemented as a playable turn, and resuming it would be exactly the
// silent reinterpretation the content DAG's `persistence` node forbids. The
// payload is MOVED byte-for-byte to `RETIRED_STORAGE_KEY`, never deleted and
// never rewritten, and stays readable through `loadRetiredSave` /
// `loadRetiredHistory` so the analysis screen can show the game. "Never deleted"
// covers a save this build can read and recognise: a schema outside
// `READABLE_SCHEMA_VERSIONS`, or a payload that is not a game at all, is still
// cleared exactly as it was before schema 9 — there is nothing there to review.
// v10 (rules revision `muju-phasing-3`, 2026-09-22): the KILL CLOCK. Ten
// kill-free plies end the game on mined totals (a tie draws) instead of twenty
// plies drawing outright. A save written under an earlier schema is adjudicated
// once under the clock it was RECORDED with, then — if it is still playing —
// restarted at 0 for the live kill clock, exactly as v8 did the last time this
// clock's meaning changed. See `loadGameState`.
// v11 (rules revision `muju-phasing-4`, 2026-09-23): Cleave has no tier cap.
// Owner decision: an unfinished v10 save resumes under the new rule as it
// stands — kill clock included, since the clock did not change — and is
// restamped v11. Its stored unit fields mean the same thing under both
// revisions, so nothing is adjudicated or rewritten.
export const SCHEMA_VERSION = 11;

/** The schema that first recorded the kill clock (`muju-phasing-3`). */
const KILL_CLOCK_SCHEMA = 10;

/** The schema that first recorded the twenty-ply draw clock (`muju-phasing-2`); schema 5-7 (`muju-phasing-1`) counted ten plies to a draw instead. */
const TWENTY_PLY_CLOCK_SCHEMA = 8;

/** `muju-phasing-1` (schema 5-7): ten quiet plies drew the game outright. This is
 * numerically the same as the live kill clock's own `INACTIVITY_LIMIT`, but a
 * different rule with a different verdict, so it is pinned explicitly here rather
 * than reusing a constant whose default verdict is now `mined-total`. */
export const PHASING_1_DRAW_LIMIT = 10;

/** Every save schema this build still reads. Anything else starts a fresh game. */
const READABLE_SCHEMA_VERSIONS: readonly number[] = [5, 6, 7, TWENTY_PLY_CLOCK_SCHEMA, 9, KILL_CLOCK_SCHEMA, SCHEMA_VERSION];

const STORAGE_KEY = 'elemental-tactics-save';
/**
 * Where a retired-rules save is kept. Written once, by `loadGameState`, with the
 * bytes it found under `STORAGE_KEY`; never written again while it is occupied,
 * and never written by play, by `saveGameState` or by a preference edit.
 */
export const RETIRED_STORAGE_KEY = 'elemental-tactics-save-retired';

export interface PersistedState {
  schemaVersion: number;
  timestamp: number;
  state: GameState;
  history?: LocalGameHistory;
  /** Per-seat thinking time. Absent in every save written before paces
   * existed, and — being a preference rather than part of the position — never
   * a reason to reject a save, so it stays out of `validateGameState`. */
  aiPace?: Record<PlayerId, AIPace>;
}

/**
 * Save game state to localStorage
 */
export function saveGameState(state: GameState, history?: LocalGameHistory, aiPace = keptAIPace()): void {
  try {
    const persisted: PersistedState = {
      schemaVersion: SCHEMA_VERSION,
      timestamp: Date.now(),
      state,
      history,
      aiPace,
    };
    // Keep the latest position resumable even when a long score fills storage.
    for (;;) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); break; }
      catch (error) {
        if (!persisted.history || persisted.history.frames.length <= 1) throw error;
        persisted.history = { complete: false, frames: persisted.history.frames.slice(Math.ceil(persisted.history.frames.length / 2)) };
      }
    }
  } catch (e) {
    // localStorage might be full or disabled
    console.warn('Failed to save game state:', e);
  }
}

/** Older saves can still be analyzed from their first available position. */
export function loadGameHistory(): LocalGameHistory | null {
  const state = loadGameState();
  if (!state) return null;
  try {
    const history = (JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedState).history;
    if (history && typeof history.complete === 'boolean' && Array.isArray(history.frames) && history.frames.length &&
      history.frames.every(frame => frame && typeof frame.label === 'string' && typeof frame.turn === 'string' && validateGameState(frame.state))) return history;
  } catch { /* The current saved position remains useful without its score. */ }
  return startHistory(state, false);
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
    if (!READABLE_SCHEMA_VERSIONS.includes(persisted.schemaVersion)) {
      console.log('Schema version mismatch, starting fresh game');
      clearGameState();
      return null;
    }

    // Permissively first, and before the retirement gate: only a payload that is
    // recognisably a game is worth archiving. A truncated or half-written save has no
    // `ruleset` either, so archiving before this check would move garbage into the
    // retired slot — unreadable there, and occupying the one slot the real retired
    // game needs. Those are cleared exactly as they were before schema 9.
    if (!validateGameState(persisted.state, true)) {
      console.log('Invalid saved state, starting fresh game');
      clearGameState();
      return null;
    }

    // Standard was retired on 2026-09-21. A save recorded under it is moved to the
    // retired slot and reported as "no saved game": it is never resumed, because the
    // turn it was played with no longer exists, and never deleted, because it is the
    // only copy. A pre-v7 save has no `ruleset` at all, which meant Standard.
    if (persisted.state.ruleset !== 'phasing') {
      archiveRetiredSave(raw);
      return null;
    }

    // Strictly now: a Phasing save is about to be resumed, so it must satisfy the
    // playable-state rules (four actions a turn) and not merely the permissive ones.
    if (!validateGameState(persisted.state)) {
      console.log('Invalid saved state, starting fresh game');
      clearGameState();
      return null;
    }

    // A save written before v10 counted its clock under an earlier rule: schema 5-7
    // (`muju-phasing-1`) drew outright at ten quiet plies; schema 8-9
    // (`muju-phasing-2`) drew outright at twenty. Each is adjudicated once under the
    // limit and verdict it was RECORDED with — a game that had already drawn keeps
    // that result — and a position that is still playing restarts its clock at 0 for
    // the live kill clock, instead of carrying a count whose meaning changed twice
    // over. It never revives a finished game. A v10 or v11 save uses the live kill
    // clock directly (`legacyClock` is null); a v10 save only picks up the
    // uncapped Cleave chain (`muju-phasing-4`) from its next attack.
    const legacyClock = persisted.schemaVersion < TWENTY_PLY_CLOCK_SCHEMA ? { limit: PHASING_1_DRAW_LIMIT, verdict: 'draw' as const }
      : persisted.schemaVersion < KILL_CLOCK_SCHEMA ? { limit: LEGACY_INACTIVITY_LIMIT, verdict: 'draw' as const }
      : null;
    const adjudicated = resolveInactivityDraw({ ...persisted.state, actionsPerTurn: getActionsPerTurn(persisted.state) },
      legacyClock?.limit, legacyClock?.verdict);
    const state = legacyClock && adjudicated.phase === 'playing' && (adjudicated.inactivityPlies ?? 0) !== 0
      ? { ...adjudicated, inactivityPlies: 0 } : adjudicated;
    // Stamp the revision once, keeping the score, so the restart cannot repeat.
    if (persisted.schemaVersion < SCHEMA_VERSION) saveGameState(state, persisted.history);
    return state;
  } catch (e) {
    console.warn('Failed to load game state:', e);
    clearGameState();
    return null;
  }
}

/**
 * Move a retired-rules payload out of the playable slot without changing a byte
 * of it. The retired slot is written at most once: if it is already occupied the
 * original stays where it is and the main slot is left alone too, because
 * overwriting either one would destroy the only copy of a game somebody played.
 */
function archiveRetiredSave(raw: string): void {
  try {
    if (localStorage.getItem(RETIRED_STORAGE_KEY) !== null) {
      console.log('A retired-rules save is already archived; leaving this one untouched.');
      return;
    }
    localStorage.setItem(RETIRED_STORAGE_KEY, raw);
    // Only after the bytes are safely under the retired key.
    localStorage.removeItem(STORAGE_KEY);
    console.log('Standard rules were retired; this save was archived for review.');
  } catch (e) {
    // A save we could not move is a save we do not touch.
    console.warn('Failed to archive the retired-rules save:', e);
  }
}

/**
 * The archived retired-rules save, for review only. Its state is never resumed
 * and never re-simulated: `AnalysisScreen` disables "Explore from here" for it.
 */
export function loadRetiredSave(): PersistedState | null {
  try {
    const raw = localStorage.getItem(RETIRED_STORAGE_KEY);
    if (!raw) return null;
    const persisted: PersistedState = JSON.parse(raw);
    // Permissive on purpose: an archive is evidence, not a position to play from.
    return validateGameState(persisted.state, true) ? persisted : null;
  } catch (e) {
    console.warn('Failed to read the retired-rules save:', e);
    return null;
  }
}

/** The archived game's score, so a retired game can still be paged through. */
export function loadRetiredHistory(): LocalGameHistory | null {
  const persisted = loadRetiredSave();
  if (!persisted) return null;
  const history = persisted.history;
  if (history && typeof history.complete === 'boolean' && Array.isArray(history.frames) && history.frames.length &&
    history.frames.every(frame => frame && typeof frame.label === 'string' && typeof frame.turn === 'string' && validateGameState(frame.state, true))) return history;
  return startHistory(persisted.state, false);
}

/** Each seat's stored pace, dropping anything `isAIPace` does not recognise. */
function readStoredAIPace(): Partial<Record<PlayerId, AIPace>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as PersistedState).aiPace : undefined;
    if (!stored || typeof stored !== 'object') return {};
    return { white: isAIPace(stored.white) ? stored.white : undefined, black: isAIPace(stored.black) ? stored.black : undefined };
  } catch {
    // A save we cannot read at all is `loadGameState`'s problem, not the pace's.
    return {};
  }
}

/** What a save that does not mention the pace should keep, or nothing. */
function keptAIPace(): Record<PlayerId, AIPace> | undefined {
  const stored = readStoredAIPace();
  return stored.white && stored.black ? { white: stored.white, black: stored.black } : undefined;
}

/**
 * Per-seat thinking time for the saved game. A missing or invalid value falls
 * back to `DEFAULT_AI_PACE`, which is also what every pre-pace save means.
 */
export function loadAIPace(): Record<PlayerId, AIPace> {
  const stored = readStoredAIPace();
  return { white: stored.white ?? DEFAULT_AI_PACE, black: stored.black ?? DEFAULT_AI_PACE };
}

/**
 * Record the chosen paces on the current save. The position itself is written
 * by `saveGameState`, which preserves whatever pace is already stored, so a
 * game only has to patch this field once when it starts.
 */
export function saveAIPace(aiPace: Record<PlayerId, AIPace>): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...(JSON.parse(raw) as PersistedState), aiPace }));
  } catch (e) {
    console.warn('Failed to save AI thinking time:', e);
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
function validateGameState(state: unknown, legacy = false): state is GameState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Record<string, unknown>;

  // Check top-level required fields
  if (!s.phase || !s.board || !s.players || !s.turn) return false;
  if (s.actionsPerTurn !== undefined && !(isActionsPerTurn(s.actionsPerTurn) || (legacy && s.actionsPerTurn === 6))) return false;

  if (s.ruleset !== undefined && !isRuleset(s.ruleset)) return false;
  if (s.pendingSummons !== undefined && (!Array.isArray(s.pendingSummons) || s.pendingSummons.some((p: any) =>
    !p || typeof p.id !== 'string' || !['white', 'black'].includes(p.owner) ||
    !['fire_1','lightning_1','water_1','shadow_1','plant_1','metal_1'].includes(p.definitionId) ||
    !Number.isInteger(p.cost) || p.cost < 0 || !p.position || !Number.isInteger(p.position.x) || !Number.isInteger(p.position.y) ||
    p.position.x < 0 || p.position.x > 9 || p.position.y < 0 || p.position.y > 9))) return false;

  if (s.blackCrystalHandicap !== undefined && !isBlackCrystalHandicap(s.blackCrystalHandicap)) return false;

  // Check board has cells and units
  const board = s.board as Record<string, unknown>;
  if (!Array.isArray(board.cells) || !Array.isArray(board.units)) return false;

  // Check players structure
  const players = s.players as Record<string, unknown>;
  if (!players.white || !players.black) return false;

  // Check turn structure
  const turn = s.turn as Record<string, unknown>;
  if (typeof turn.currentPlayer !== 'string' || typeof turn.phase !== 'string') return false;
  if (!Number.isInteger(turn.actionsRemaining) || (turn.actionsRemaining as number) < 0 ||
    (turn.actionsRemaining as number) > (legacy ? (s.actionsPerTurn as number ?? 6) : 4)) return false;

  return true;
}

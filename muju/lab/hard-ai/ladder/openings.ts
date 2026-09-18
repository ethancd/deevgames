/**
 * Opening-position input for the ladder (EPIC-PLAN E0.4).
 *
 * An openings file is JSONL, one object per line:
 *
 *   {"id": "<stable id>", "actions": [<OpeningAction>, ...]}
 *
 * The ACTION-LIST form is the only form accepted. A position is named by the
 * moves that reach it from the canonical initial state, so every opening is
 * reachable by legal play through the shipped rules — `applyOpening` replays it
 * through `src/game/legality`'s `isLegalAction`, `src/ai/simulate`'s
 * `applyAction` and the harness invariant check, and refuses anything illegal,
 * refused by the simulator, invariant-breaking, or that ends the game. A raw
 * `{id, state}` form is deliberately NOT supported: a hand-written state can
 * encode a position no game can reach (or a silently rebalanced one), and
 * EPIC-PLAN E1 forbids manufacturing variety that way.
 *
 * WHY `OpeningAction` AND NOT `AIAction`. `createUnit` mints unit ids from
 * `Date.now()` and `Math.random()` (`src/game/board.ts`), so the ids in one
 * process's initial state exist in no other. An `AIAction` that names a unit by
 * id is therefore not portable and could never be written down in a file. An
 * `OpeningAction` names the unit by the square it stands on (`from`, and `keep`
 * for upkeep) and is resolved against the live position as the opening is
 * replayed; everything else matches `AIAction` field for field.
 *
 * `blackCrystalHandicap` is part of the initial state, so an opening is
 * validated once per handicap the run uses: an action legal without a handicap
 * is not automatically legal with one.
 *
 * THE REPLAY OWNS ITS RULES. `setElementGraph`, `setUpkeepVariant` and
 * `setCombatHandicap` are module globals (`src/game/*`), installed by
 * `harness/runner.ts#playGame` for the duration of a game and restored after
 * it. An opening is replayed BEFORE its game starts, so `withOpeningRules`
 * installs and restores the same three globals around the replay the way
 * `playGame` does. Without that an ATTACK or an upkeep payment in an opening
 * would resolve under whatever the previous game happened to leave behind —
 * invisible while every run uses the shipped defaults, wrong the moment one
 * does not. Callers that name no rules get `DEFAULT_MATCH_OPTIONS`, which is
 * what `playGame` would install for a game whose `MatchOptions` name none.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createInitialGameState } from '../../../src/game/board';
import { isLegalAction } from '../../../src/game/legality';
import { applyAction } from '../../../src/ai/simulate';
import { checkInvariants } from '../../harness/invariants';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../../src/game/combat';
import { DEFAULT_MATCH_OPTIONS, type MatchOptions } from '../../harness/types';
import type { AIAction } from '../../../src/ai/types';
import type { GameState, Position } from '../../../src/game/types';

/** The id used when a run is given no `--openings` file: every pair starts from the canonical initial state. */
export const INITIAL_OPENING_ID = 'initial';

/**
 * The only shape an opening id may take. The id is the first field of every
 * `pairId` and, through `worker.ts#replayFileName`, a PATH SEGMENT of every
 * replay filename: the E0 verifier ran a file whose id was `../../escaped` and
 * the run wrote its replays two directories above `--out`. Letters, digits,
 * `_` and `-` cannot contain a separator or a `..` segment on any platform, so
 * the escape is structurally impossible rather than filtered case by case. 64
 * characters is long enough for the generated ids the opening books use
 * (`open-<n>`) and short enough that the filename stays portable.
 */
export const OPENING_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** A file-portable action: unit references are board squares, never generated ids (see the module doc). */
export type OpeningAction =
  | { type: 'MOVE'; from: Position; to: Position }
  | { type: 'ATTACK'; from: Position; targetPosition: Position }
  | { type: 'PROMOTE_UNIT'; from: Position }
  | { type: 'BUY_UNIT'; definitionId: string; position: Position }
  | { type: 'PAY_UPKEEP'; keep: Position[] }
  | { type: 'END_PLACE_PHASE' }
  | { type: 'END_ACTION_PHASE' };

export interface OpeningSpec {
  /** Stable, unique-within-the-file identifier; becomes the first field of every `pairId`. */
  id: string;
  /** Actions replayed from the canonical initial state to reach this opening. Empty means the initial state itself. */
  actions: readonly OpeningAction[];
}

export const INITIAL_OPENING: OpeningSpec = { id: INITIAL_OPENING_ID, actions: [] };

export interface OpeningsFile {
  /** Path as given on the command line (absolute once resolved by the caller). */
  path: string;
  /** sha256 of the file's bytes, recorded in the run manifest. */
  sha256: string;
  openings: OpeningSpec[];
}

function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as { x?: unknown; y?: unknown };
  return Number.isInteger(p.x) && Number.isInteger(p.y);
}

/** Structural validation of one row's action. Throws with `where` prefixed. */
export function parseOpeningAction(value: unknown, where: string): OpeningAction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where}: action must be an object`);
  const a = value as Record<string, unknown>;
  const need = (cond: boolean, msg: string): void => { if (!cond) throw new Error(`${where}: ${msg}`); };
  switch (a.type) {
    case 'MOVE':
      need(isPosition(a.from) && isPosition(a.to), 'MOVE needs integer {from} and {to} squares');
      return { type: 'MOVE', from: a.from as Position, to: a.to as Position };
    case 'ATTACK':
      need(isPosition(a.from) && isPosition(a.targetPosition), 'ATTACK needs integer {from} and {targetPosition} squares');
      return { type: 'ATTACK', from: a.from as Position, targetPosition: a.targetPosition as Position };
    case 'PROMOTE_UNIT':
      need(isPosition(a.from), 'PROMOTE_UNIT needs an integer {from} square');
      return { type: 'PROMOTE_UNIT', from: a.from as Position };
    case 'BUY_UNIT':
      need(typeof a.definitionId === 'string' && isPosition(a.position), 'BUY_UNIT needs a definitionId and an integer {position} square');
      return { type: 'BUY_UNIT', definitionId: a.definitionId as string, position: a.position as Position };
    case 'PAY_UPKEEP':
      need(Array.isArray(a.keep) && a.keep.every(isPosition), 'PAY_UPKEEP needs a "keep" array of integer squares');
      return { type: 'PAY_UPKEEP', keep: a.keep as Position[] };
    case 'END_PLACE_PHASE':
      return { type: 'END_PLACE_PHASE' };
    case 'END_ACTION_PHASE':
      return { type: 'END_ACTION_PHASE' };
    case 'RESIGN':
      throw new Error(`${where}: RESIGN is not an opening action; an opening must leave a playable position`);
    default:
      throw new Error(`${where}: unknown action type ${JSON.stringify(a.type)}`);
  }
}

/**
 * Parses an openings JSONL document. Throws with the offending line number on
 * a malformed row, a missing/duplicate id, or an unusable action.
 */
export function parseOpenings(text: string, source: string): OpeningSpec[] {
  const openings: OpeningSpec[] = [];
  const seen = new Set<string>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const where = `${source}:${i + 1}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`openings: ${where}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`openings: ${where}: each row must be an object {id, actions}`);
    }
    const row = parsed as { id?: unknown; actions?: unknown; state?: unknown };
    if (row.state !== undefined) {
      throw new Error(`openings: ${where}: the {id, state} form is not supported; give {id, actions} from the canonical initial state`);
    }
    if (typeof row.id !== 'string' || row.id.trim() === '') throw new Error(`openings: ${where}: "id" must be a non-empty string`);
    if (row.id.includes(':')) throw new Error(`openings: ${where}: opening id "${row.id}" must not contain ":" (it is the pairId separator)`);
    if (!OPENING_ID_RE.test(row.id)) {
      throw new Error(
        `openings: ${where}: opening id "${row.id}" must match ${String(OPENING_ID_RE)} ` +
          '(the id is a path segment of every replay filename; "../.." and "/" would write outside the run directory)',
      );
    }
    if (seen.has(row.id)) throw new Error(`openings: ${where}: duplicate opening id "${row.id}"`);
    if (!Array.isArray(row.actions)) throw new Error(`openings: ${where}: "actions" must be an array`);
    const actions = row.actions.map((a, k) => parseOpeningAction(a, `openings: ${where}: actions[${k}]`));
    seen.add(row.id);
    openings.push({ id: row.id, actions });
  }
  if (openings.length === 0) throw new Error(`openings: ${source}: file contains no openings`);
  return openings;
}

export interface OpeningStateOptions {
  blackCrystalHandicap?: number;
  actionsPerTurn?: GameState['actionsPerTurn'];
  resourceLayout?: readonly number[];
  /** Advantage graph installed for the replay; defaults to `DEFAULT_MATCH_OPTIONS.elementGraph`. */
  elementGraph?: MatchOptions['elementGraph'];
  /** Upkeep variant installed for the replay; defaults to `'shipped'`. */
  upkeep?: MatchOptions['upkeep'];
  /** Per-seat combat ATK handicap installed for the replay; defaults to `DEFAULT_MATCH_OPTIONS.handicap`. */
  handicap?: MatchOptions['handicap'];
}

/**
 * Runs `fn` with the three rules globals set to the rules this opening is meant
 * to be replayed under, restoring the shipped defaults afterwards exactly as
 * `playGame`'s `finally` does (see the module doc). Exported so the invariant
 * "an opening is never replayed under a leftover rule set" can be tested
 * directly.
 */
export function withOpeningRules<T>(options: OpeningStateOptions, fn: () => T): T {
  const handicap = options.handicap ?? DEFAULT_MATCH_OPTIONS.handicap;
  setUpkeepVariant(options.upkeep ?? DEFAULT_MATCH_OPTIONS.upkeep ?? 'shipped');
  setElementGraph(options.elementGraph ?? DEFAULT_MATCH_OPTIONS.elementGraph);
  setCombatHandicap('white', handicap.white);
  setCombatHandicap('black', handicap.black);
  try {
    return fn();
  } finally {
    setUpkeepVariant('shipped');
    setElementGraph('double-thick');
    resetCombatHandicap();
  }
}

/** The canonical initial state an opening (and every game) starts from. */
export function initialStateFor(options: OpeningStateOptions = {}): GameState {
  return createInitialGameState(options.resourceLayout, options.actionsPerTurn, options.blackCrystalHandicap);
}

function unitIdAt(state: GameState, pos: Position, where: string): string {
  const unit = state.board.units.find(u => u.position.x === pos.x && u.position.y === pos.y);
  if (!unit) throw new Error(`${where}: no unit stands on (${pos.x}, ${pos.y}) in this position`);
  return unit.id;
}

/** Binds an `OpeningAction`'s square references to the ids the live position uses. */
export function resolveOpeningAction(state: GameState, action: OpeningAction, where: string): AIAction {
  switch (action.type) {
    case 'MOVE': return { type: 'MOVE', unitId: unitIdAt(state, action.from, where), to: action.to };
    case 'ATTACK': return { type: 'ATTACK', unitId: unitIdAt(state, action.from, where), targetPosition: action.targetPosition };
    case 'PROMOTE_UNIT': return { type: 'PROMOTE_UNIT', unitId: unitIdAt(state, action.from, where) };
    case 'BUY_UNIT': return { type: 'BUY_UNIT', definitionId: action.definitionId, position: action.position };
    case 'PAY_UPKEEP': return { type: 'PAY_UPKEEP', keepUnitIds: action.keep.map(p => unitIdAt(state, p, where)) };
    case 'END_PLACE_PHASE': return { type: 'END_PLACE_PHASE' };
    case 'END_ACTION_PHASE': return { type: 'END_ACTION_PHASE' };
  }
}

/**
 * Replays `opening` from the canonical initial state through the shipped
 * legality check and simulator, under `options`' rules (`withOpeningRules`),
 * returning the opening position. Throws on the first action that names an
 * empty square, is illegal for the side to move, that the simulator refuses (a
 * no-op), that ends the game, or that leaves the board violating a harness
 * invariant.
 */
export function applyOpening(opening: OpeningSpec, options: OpeningStateOptions = {}): GameState {
  return withOpeningRules(options, () => replayOpening(opening, options));
}

function replayOpening(opening: OpeningSpec, options: OpeningStateOptions): GameState {
  let state = initialStateFor(options);
  for (let i = 0; i < opening.actions.length; i++) {
    const where = `opening "${opening.id}" action ${i} (${opening.actions[i].type})`;
    if (state.phase === 'victory') {
      throw new Error(`${where}: the opening has already ended the game; an opening must leave a playable position`);
    }
    const action = resolveOpeningAction(state, opening.actions[i], where);
    const actor = state.turn.currentPlayer;
    if (!isLegalAction(state, action, actor)) {
      throw new Error(`${where}: illegal for ${actor} in this position; openings must be legal-by-replay`);
    }
    const next = applyAction(state, action);
    if (next === state) {
      throw new Error(`${where}: the simulator refused it (no-op); openings must be legal-by-replay`);
    }
    state = next;
    checkInvariants(state, where);
  }
  if (state.phase === 'victory') {
    throw new Error(`opening "${opening.id}": the opening has already ended the game; an opening must leave a playable position`);
  }
  return state;
}

/** `applyOpening` for its side effect only — used to reject a bad openings file before any game is played. */
export function validateOpening(opening: OpeningSpec, options: OpeningStateOptions = {}): void {
  applyOpening(opening, options);
}

/** Validates every opening against every handicap the run will use. */
export function validateOpenings(openings: readonly OpeningSpec[], handicaps: readonly number[]): void {
  for (const opening of openings) {
    for (const handicap of handicaps) {
      try {
        validateOpening(opening, { blackCrystalHandicap: handicap });
      } catch (err) {
        throw new Error(`openings: at handicap ${handicap}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Reads, hashes and parses an openings file. Validation against the run's handicaps is the caller's job (`validateOpenings`). */
export function loadOpenings(filePath: string): OpeningsFile {
  if (!fs.existsSync(filePath)) throw new Error(`openings: file not found: ${filePath}`);
  const bytes = fs.readFileSync(filePath);
  return { path: filePath, sha256: sha256(bytes), openings: parseOpenings(bytes.toString('utf8'), filePath) };
}

// ---------------------------------------------------------------------------
// Additive helpers for the E0 opening generator (lab/hard-ai/ladder/openings/).
// Nothing above this line changed; these are new exports only.
// ---------------------------------------------------------------------------

/**
 * Inverse of `resolveOpeningAction`: rewrites a live `AIAction` into the
 * file-portable, square-based `OpeningAction` form. `state` must be the
 * position the action was chosen in, because the unit ids are looked up there.
 * Throws when an id names no unit on the board, which is the only way the
 * rewrite can be wrong.
 */
export function actionToOpeningAction(state: GameState, action: AIAction, where: string): OpeningAction {
  const posOf = (unitId: string): Position => {
    const unit = state.board.units.find(u => u.id === unitId);
    if (!unit) throw new Error(`${where}: no unit with id ${unitId} stands on the board in this position`);
    return { x: unit.position.x, y: unit.position.y };
  };
  switch (action.type) {
    case 'MOVE': return { type: 'MOVE', from: posOf(action.unitId), to: { x: action.to.x, y: action.to.y } };
    case 'ATTACK': return { type: 'ATTACK', from: posOf(action.unitId), targetPosition: { x: action.targetPosition.x, y: action.targetPosition.y } };
    case 'PROMOTE_UNIT': return { type: 'PROMOTE_UNIT', from: posOf(action.unitId) };
    case 'BUY_UNIT': return { type: 'BUY_UNIT', definitionId: action.definitionId, position: { x: action.position.x, y: action.position.y } };
    case 'PAY_UPKEEP': return { type: 'PAY_UPKEEP', keep: action.keepUnitIds.map(posOf) };
    case 'END_PLACE_PHASE': return { type: 'END_PLACE_PHASE' };
    case 'END_ACTION_PHASE': return { type: 'END_ACTION_PHASE' };
    case 'RESIGN': throw new Error(`${where}: RESIGN is not an opening action; an opening must leave a playable position`);
  }
}

/**
 * A process-independent fingerprint of a POSITION.
 *
 * `createUnit` mints unit ids from `Date.now()` and `Math.random()`
 * (`src/game/board.ts`), so two runs of the same opening produce states that
 * differ in every id and agree on everything a player can see. The digest
 * therefore drops ids entirely: units are canonicalised by square and sorted,
 * and `attackedThisTurn` — a list of ids — contributes only its length. What
 * is left is the board, the reserves, both banks, and whose turn it is. Two
 * openings with the same digest reach the same playable position and are
 * duplicates for the ladder's purposes, whatever actions got them there.
 *
 * It is a diagnostic, not a rules object: nothing in a game reads it.
 */
export function gameplayDigest(state: GameState): string {
  const units = state.board.units
    .map(u => ({
      d: u.definitionId,
      o: u.owner,
      x: u.position.x,
      y: u.position.y,
      m: u.hasMoved,
      a: u.hasAttacked,
      c: u.canActThisTurn,
      dmg: u.damageTaken,
      pp: u.promotedThisPlacement === true,
      pt: u.placedThisTurn === true,
      lk: u.lastAttackKilled === true,
      at: u.attackedThisTurn?.length ?? 0,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.o < b.o ? -1 : a.o > b.o ? 1 : 0) || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const canonical = {
    phase: state.phase,
    winner: state.winner,
    turn: {
      currentPlayer: state.turn.currentPlayer,
      phase: state.turn.phase,
      actionsRemaining: state.turn.actionsRemaining,
      turnNumber: state.turn.turnNumber,
    },
    upkeepPending: state.upkeepPending === true,
    inactivityPlies: state.inactivityPlies ?? 0,
    progressThisTurn: state.progressThisTurn === true,
    players: {
      white: { resources: state.players.white.resources, gained: state.players.white.resourcesGained },
      black: { resources: state.players.black.resources, gained: state.players.black.resourcesGained },
    },
    cells: state.board.cells.map(row => row.map(c => c.resourceLayers)),
    units,
  };
  return sha256(JSON.stringify(canonical));
}

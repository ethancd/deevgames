/**
 * Canonical reconstruction of a lab replay (EPIC-PLAN §4 E1.1/E1.4).
 *
 * A `muju-lab-replay-v2` file carries the opening it started from, the whole
 * `GameRecord` as `meta`, and one snapshot per ply. Nothing in it is a state
 * the analyser may trust: the snapshots have no unit ids, the recorded actions
 * name ids from a DIFFERENT process, and a replay that no longer reproduces its
 * own result is worthless evidence. So this module rebuilds the game from the
 * opening through the CANONICAL engine (`src/game/legality.ts isLegalAction`
 * then `src/ai/simulate.ts applyAction`), compares every rebuilt position
 * against the recorded snapshot, and refuses the file on the first
 * disagreement.
 *
 * THE ID PROBLEM. `src/game/board.ts createUnit` stamps the six starting units
 * with `${owner}_${definitionId}_${Date.now()}_${random}`, so their ids differ
 * between the recorded game and this one; units BOUGHT during play get
 * `src/ai/simulate.ts nextUnitId`'s deterministic `unit-<side>-<turn>-<n>` and
 * match exactly. The six nondeterministic ids are therefore remapped by the
 * `(owner, original definitionId)` pair their own id string spells out —
 * unique per side because `STARTING_UNITS` is `['fire_1','water_1','plant_1']`
 * — and an ambiguous or unresolvable id is a hard error, never a guess. A
 * PROMOTE does not change a unit's id, so the defId inside the id string stays
 * the STARTING one on both sides of the map, which is exactly what makes the
 * pairing stable.
 *
 * THE LOOP. `lab/harness/runner.ts playGame` is the authority on what actually
 * happened between two snapshots, and two of its behaviours are invisible in
 * the step list: an action the simulator refuses is a NO-OP that still consumes
 * a ply and still writes a step, and three consecutive no-ops make the runner
 * inject a phase end that is NOT recorded as a step. Both are reproduced here,
 * and — this is the part that is easy to get wrong — in the runner's ORDER:
 * apply, then the no-op guard and its injection, and only then the snapshot.
 * The recorded snapshot is therefore the position after any injection, so a
 * reconstruction that compares before it fails every replay containing one.
 *
 * Nothing in this module reads or writes the run it is analysing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { checkVictory } from '../../../src/game/victory';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../../src/game/combat';
import { createInitialGameState } from '../../../src/game/board';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { DEFAULT_MATCH_OPTIONS, type GameRecord, type MatchOptions, type ReplayStep, type WinType } from '../../harness/types';
import { applyOpening, type OpeningSpec } from '../ladder/openings';

export const REPLAY_SCHEMA = 'muju-lab-replay-v2';

/** The on-disk shape `lab/hard-ai/ladder/worker.ts` writes: a `ReplayFile`
 * with the run's `OpeningSpec` appended so a loss analysis never has to guess
 * which opening produced the first snapshot. */
export interface StoredReplay {
  schema: string;
  meta: GameRecord;
  steps: ReplayStep[];
  opening?: OpeningSpec;
}

export interface LoadedReplay {
  path: string;
  /** `<pairId>-<orientation>` as `ladder/worker.ts replayFileName` spells it. */
  fileId: string;
  stored: StoredReplay;
  meta: GameRecord;
  options: MatchOptions;
  opening: OpeningSpec;
}

/** One whole turn of one seat, as the hard bot adapter sees it: the state it
 * searched from, the actions it actually dispatched, the position they left. */
export interface ReconstructedTurn {
  /** 0-based index among THIS seat's turns, so it indexes `players[side].turnMs`. */
  seatTurnIndex: number;
  turnNumber: number;
  side: PlayerId;
  startState: GameState;
  endState: GameState;
  /** Applied actions, with unit ids rewritten into this process's id space. */
  actions: AIAction[];
  /** The same actions exactly as the file records them. */
  recordedActions: AIAction[];
  startPly: number;
  endPly: number;
  /** The turn left the game over. */
  terminal: boolean;
  /** An action the simulator refused (`applyAction` returned its input). */
  noops: number;
}

export interface Reconstruction {
  /** The position the opening left; the first snapshot must equal it. */
  openingState: GameState;
  finalState: GameState;
  plies: number;
  winner: PlayerId | null;
  turns: ReconstructedTurn[];
  bySide: Record<PlayerId, ReconstructedTurn[]>;
  /** Diagnostics that did not invalidate the reconstruction. */
  notes: string[];
}

export class ReplayMismatch extends Error {}

function fail(where: string, detail: string): never {
  throw new ReplayMismatch(`${where}: ${detail}`);
}

// --- rules globals ----------------------------------------------------------

/**
 * `lab/harness/runner.ts playGame`'s rules prologue and its `finally`, copied
 * rather than imported: `playGame` is a whole game loop and this module needs
 * only the three module-global knobs it installs. Every reconstruction AND
 * every adviser search must run under them, because the packed replica reads
 * the same globals the canonical engine does.
 *
 * DO NOT NEST. The restore puts back the SHIPPED defaults, not the caller's
 * rules — exactly as `playGame`'s does — so an inner call returning inside an
 * outer one leaves the REST of the outer body running under the defaults.
 * `reconstruct` wraps itself, which is why `analyzeReplay` runs it before
 * opening its own scope rather than inside it.
 *
 * AN ASYNC `fn` KEEPS THE RULES UNTIL ITS PROMISE SETTLES. A plain
 * `try { return fn(); } finally { restore(); }` is wrong for an `async` callback:
 * such a callback runs only as far as its first `await` before handing back a
 * pending promise, so the `finally` would fire there and every later
 * continuation — in `analyzeReplay`'s case every adviser and production search
 * after the first — would run under the shipped defaults instead of the game's
 * rules. Latent while a run uses the defaults (E0/E1.1 do: `double-thick`,
 * `shipped` upkeep, combat handicap 0/0), wrong the moment one does not. So a
 * thenable result carries the restore on its own settlement instead, and a
 * synchronous one still restores on return as before.
 */
export function withMatchRules<T>(options: MatchOptions, fn: () => T): T {
  setUpkeepVariant(options.upkeep ?? 'shipped');
  setElementGraph(options.elementGraph);
  setCombatHandicap('white', options.handicap.white);
  setCombatHandicap('black', options.handicap.black);
  const restore = (): void => {
    setUpkeepVariant('shipped');
    setElementGraph('double-thick');
    resetCombatHandicap();
  };
  let deferred = false;
  try {
    const result = fn();
    if (typeof (result as { then?: unknown } | null)?.then === 'function') {
      deferred = true;
      return (result as unknown as Promise<unknown>).finally(restore) as unknown as T;
    }
    return result;
  } finally {
    if (!deferred) restore();
  }
}

// --- loading ----------------------------------------------------------------

export function loadReplay(file: string): LoadedReplay {
  const text = fs.readFileSync(file, 'utf8');
  let stored: StoredReplay;
  try {
    stored = JSON.parse(text) as StoredReplay;
  } catch (err) {
    fail(file, `not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (stored.schema !== REPLAY_SCHEMA) fail(file, `schema is ${String(stored.schema)}, expected ${REPLAY_SCHEMA}`);
  if (!Array.isArray(stored.steps) || stored.steps.length === 0) fail(file, 'no steps');
  if (stored.meta === undefined || stored.meta === null) fail(file, 'no meta');
  const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...(stored.meta.options ?? {}) };
  const opening: OpeningSpec = stored.opening ?? { id: 'initial', actions: [] };
  return {
    path: path.resolve(file),
    fileId: path.basename(file).replace(/\.json$/i, ''),
    stored,
    meta: stored.meta,
    options,
    opening,
  };
}

/** The seat a `hard@*` engine played, or null when neither seat was one. */
export function hardSeat(meta: GameRecord): PlayerId | null {
  const white = meta.players.white.bot ?? '';
  const black = meta.players.black.bot ?? '';
  const whiteHard = white.startsWith('hard@');
  const blackHard = black.startsWith('hard@');
  if (whiteHard && blackHard) return null; // hard-v-hard: the caller must say which seat
  if (whiteHard) return 'white';
  if (blackHard) return 'black';
  return null;
}

/** `hard@lab` -> `lab`. The analyser resolves its production config from the
 * seat's own bot name so the "cheap list" is the list that seat's engine saw. */
export function hardProfileOf(botName: string): string | null {
  return botName.startsWith('hard@') ? botName.slice('hard@'.length) : null;
}

// --- snapshots --------------------------------------------------------------

interface UnitLine {
  o: PlayerId;
  d: string;
  x: number;
  y: number;
  dmg: number;
}

/** `lab/harness/runner.ts snapshotStep`'s unit/cell/resource projection, copied
 * so a rebuilt position can be compared with a recorded one field for field. */
function projectUnits(state: GameState): UnitLine[] {
  return state.board.units.map(u => ({ o: u.owner, d: u.definitionId, x: u.position.x, y: u.position.y, dmg: u.damageTaken }));
}

function sortUnits(units: readonly UnitLine[]): string[] {
  return units.map(u => `${u.o}|${u.d}|${u.x},${u.y}|${u.dmg}`).sort();
}

function projectCells(state: GameState): number[] {
  return state.board.cells.flat().map(cell => cell.resourceLayers);
}

function compareSnapshot(state: GameState, step: ReplayStep, where: string): void {
  const live = sortUnits(projectUnits(state));
  const recorded = sortUnits(step.units as readonly UnitLine[]);
  if (live.length !== recorded.length || live.some((u, i) => u !== recorded[i])) {
    fail(where, `units diverged\n  rebuilt : ${live.join(' ')}\n  recorded: ${recorded.join(' ')}`);
  }
  const cells = projectCells(state);
  if (cells.length !== step.cells.length || cells.some((c, i) => c !== step.cells[i])) {
    fail(where, 'board reserves diverged from the recorded snapshot');
  }
  for (const p of ['white', 'black'] as PlayerId[]) {
    const ps = state.players[p];
    const rec = step.res[p];
    if (ps.resources !== rec.r || ps.resourcesGained !== rec.g) {
      fail(where, `${p} resources diverged: rebuilt r=${ps.resources} g=${ps.resourcesGained}, recorded r=${rec.r} g=${rec.g}`);
    }
  }
  if (state.turn.turnNumber !== step.turn) fail(where, `turn number diverged: rebuilt ${state.turn.turnNumber}, recorded ${step.turn}`);
  if (state.turn.phase !== step.phase) fail(where, `phase diverged: rebuilt ${state.turn.phase}, recorded ${step.phase}`);
  if (state.turn.actionsRemaining !== step.actionsRemaining) {
    fail(where, `actionsRemaining diverged: rebuilt ${state.turn.actionsRemaining}, recorded ${step.actionsRemaining}`);
  }
}

// --- unit-id remapping ------------------------------------------------------

/** `${owner}_${definitionId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`. */
const STAMPED_ID = /^(white|black)_(.+)_\d{8,}_[a-z0-9]+$/;

export function buildIdMap(state: GameState, where: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const unit of state.board.units) {
    const m = STAMPED_ID.exec(unit.id);
    if (m === null) continue; // deterministic `unit-<side>-<turn>-<n>`: no remap needed
    const key = `${m[1]}|${m[2]}`;
    if (map.has(key)) fail(where, `two starting units share the id key ${key}; the replay cannot be remapped unambiguously`);
    map.set(key, unit.id);
  }
  return map;
}

function translateId(recorded: string, map: Map<string, string>, where: string): string {
  const m = STAMPED_ID.exec(recorded);
  if (m === null) return recorded;
  const key = `${m[1]}|${m[2]}`;
  const live = map.get(key);
  if (live === undefined) fail(where, `recorded unit id ${recorded} has no counterpart in the rebuilt position`);
  return live;
}

export function translateAction(action: AIAction, map: Map<string, string>, where: string): AIAction {
  switch (action.type) {
    case 'MOVE':
      return { type: 'MOVE', unitId: translateId(action.unitId, map, where), to: action.to };
    case 'ATTACK':
      return { type: 'ATTACK', unitId: translateId(action.unitId, map, where), targetPosition: action.targetPosition };
    case 'PROMOTE_UNIT':
      return { type: 'PROMOTE_UNIT', unitId: translateId(action.unitId, map, where) };
    case 'PAY_UPKEEP':
      return { type: 'PAY_UPKEEP', keepUnitIds: action.keepUnitIds.map(id => translateId(id, map, where)) };
    default:
      return action;
  }
}

// --- the reconstruction -----------------------------------------------------

/** Rule-based outcomes the canonical engine reaches on its own; the runner's
 * `adjudication`/`timeout`/`invariant-violation` verdicts come from the loop,
 * not from the rules, so they are reported but not asserted. */
const RULE_WIN_TYPES: readonly WinType[] = ['home-checkmate', 'home-occupation', 'elimination', 'inactivity', 'upkeep-elimination', 'resignation'];

function derivedWinner(state: GameState): PlayerId | null {
  if (state.phase === 'victory') return state.winner;
  const vic = checkVictory(state.board);
  return vic.status === 'victory' ? vic.winner : null;
}

/**
 * Rebuilds every position of `replay` through the canonical engine and returns
 * the per-turn segmentation. Throws `ReplayMismatch` on the first divergence
 * from the recorded snapshots, and on a final winner/ply count that disagrees
 * with `meta`.
 */
export function reconstruct(replay: LoadedReplay): Reconstruction {
  return withMatchRules(replay.options, () => reconstructInner(replay));
}

function reconstructInner(replay: LoadedReplay): Reconstruction {
  const { options, meta, opening } = replay;
  const notes: string[] = [];

  // `playGame` builds its start position exactly this way: the opening replayed
  // from the canonical initial state, or that state itself.
  let state =
    opening.actions.length === 0
      ? createInitialGameState(options.resourceLayout, options.actionsPerTurn, options.blackCrystalHandicap)
      : applyOpening(opening, {
          blackCrystalHandicap: options.blackCrystalHandicap,
          actionsPerTurn: options.actionsPerTurn,
          resourceLayout: options.resourceLayout,
          elementGraph: options.elementGraph,
          upkeep: options.upkeep,
          handicap: options.handicap,
        });
  state.victoryRule = options.victoryRule;
  state.inactivityRule = options.inactivityRule;

  const openingState = state;
  const idMap = buildIdMap(state, `${replay.fileId}: opening position`);
  compareSnapshot(state, replay.stored.steps[0], `${replay.fileId}: ply 0 (opening position)`);

  const turns: ReconstructedTurn[] = [];
  const bySide: Record<PlayerId, ReconstructedTurn[]> = { white: [], black: [] };
  let open: { turnNumber: number; side: PlayerId; startState: GameState; startPly: number; actions: AIAction[]; recorded: AIAction[]; noops: number } | null = null;
  const lastTurnKey: Record<PlayerId, string> = { white: '', black: '' };
  let consecutiveNoops = 0;
  let ply = 0;

  const closeTurn = (endState: GameState, endPly: number): void => {
    if (open === null) return;
    const turn: ReconstructedTurn = {
      seatTurnIndex: bySide[open.side].length,
      turnNumber: open.turnNumber,
      side: open.side,
      startState: open.startState,
      endState,
      actions: open.actions,
      recordedActions: open.recorded,
      startPly: open.startPly,
      endPly,
      terminal: endState.phase === 'victory',
      noops: open.noops,
    };
    turns.push(turn);
    bySide[open.side].push(turn);
    open = null;
  };

  for (let i = 1; i < replay.stored.steps.length; i++) {
    const step = replay.stored.steps[i];
    const where = `${replay.fileId}: ply ${step.ply} (${step.player} ${step.action?.type ?? 'null'})`;
    if (step.action === null) fail(where, 'a step past ply 0 carries no action');
    if (state.phase === 'victory') fail(where, 'the rebuilt game was already over');
    const player = state.turn.currentPlayer;
    if (player !== step.player) fail(where, `the rebuilt position has ${player} to move, the replay records ${step.player}`);

    // `runner.ts` opens a new per-turn bucket the first time a seat is on move
    // for a turn number; that bucket index is what `players[side].turnMs`
    // is keyed by, and it is the turn the hard adapter searches once for.
    const turnKey = `${state.turn.turnNumber}`;
    if (lastTurnKey[player] !== turnKey) {
      lastTurnKey[player] = turnKey;
      closeTurn(state, ply);
      open = { turnNumber: state.turn.turnNumber, side: player, startState: state, startPly: ply, actions: [], recorded: [], noops: 0 };
    }

    const recorded = step.action;
    const action = translateAction(recorded, idMap, where);
    const legal = isLegalAction(state, action, player);
    const before = state;
    const after = applyAction(state, action);
    const applied = after !== before;
    if (!legal && applied) fail(where, 'the canonical engine applied an action it reported illegal');
    if (legal && !applied) fail(where, 'the canonical engine refused an action it reported legal');
    if (!applied) {
      // `runner.ts`'s no-op path: the ply and the step still happen.
      notes.push(`${where}: the simulator refused this action (recorded as a no-op by the run too)`);
      if (open !== null) open.noops++;
    }
    state = after;
    ply++;
    if (open !== null) {
      open.actions.push(action);
      open.recorded.push(recorded);
    }

    // ORDER MATTERS. `lab/harness/runner.ts` applies the action (:266), runs its
    // no-op guard and its unrecorded phase-end injection (:274-286), and only
    // THEN snapshots (:348). So the recorded snapshot is the position AFTER any
    // injection, and comparing before it fails every replay that contains one.
    if (!applied) {
      consecutiveNoops++;
      if (consecutiveNoops >= 3) {
        state = applyAction(state, state.turn.phase === 'place' ? { type: 'END_PLACE_PHASE' } : { type: 'END_ACTION_PHASE' });
        consecutiveNoops = 0;
        notes.push(`${where}: three consecutive no-ops; the runner's unrecorded phase end was reproduced`);
      }
    } else {
      consecutiveNoops = 0;
    }

    compareSnapshot(state, step, where);
  }
  closeTurn(state, ply);

  if (ply !== meta.plies) fail(replay.fileId, `rebuilt ${ply} plies, meta records ${meta.plies}`);
  const winner = derivedWinner(state);
  if (RULE_WIN_TYPES.includes(meta.winType) && winner !== meta.winner) {
    fail(replay.fileId, `rebuilt winner ${String(winner)}, meta records ${String(meta.winner)} by ${meta.winType}`);
  }
  if (!RULE_WIN_TYPES.includes(meta.winType)) {
    notes.push(`winType "${meta.winType}" is decided by the harness loop, not by the rules; the winner was not asserted`);
  }
  if (state.turn.turnNumber !== meta.turns) {
    notes.push(`rebuilt final turn number ${state.turn.turnNumber} vs meta.turns ${meta.turns}`);
  }

  return { openingState, finalState: state, plies: ply, winner, turns, bySide, notes };
}

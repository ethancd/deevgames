import type { AIAction } from '../ai/types';
import { applyAction } from '../ai/simulate';
import { boardSize, createEmptyBoard, getStartCorner, getUnitById } from '../game/board';
import { findAttackApproach, findPath } from '../game/movement';
import { endOfTurnIncome } from '../game/mining';
import { getUnitDefinition } from '../game/units';
import type { GameState, PlayerId, Position, Unit } from '../game/types';

/**
 * Puzzle scenarios: the wordless onboarding and the Puzzles list share this format.
 * A new puzzle is one more `Scenario` object. Positions are hand-built like
 * `createMicroGameState`; moves are only ever played through `applyAction`.
 * `tests/onboarding/scenarios.test.ts` recomputes every cost from the live
 * catalogue, so a stat change that breaks a puzzle fails CI.
 */
export interface ScenarioPiece { id: string; owner: PlayerId; type: string; x: number; y: number; inert?: boolean }
export type ScenarioGoal =
  | { kind: 'move'; to: Position }
  | { kind: 'kill'; target: string }
  | { kind: 'invade' };
export interface Scenario {
  id: string;
  size: number;
  hideHomeMarkers: boolean;
  /** The one piece the player moves; every other piece is scenery or a target. */
  active: string;
  pieces: ScenarioPiece[];
  reserves: { x: number; y: number; crystals: number }[];
  goal: ScenarioGoal;
  /** `title` is the word's spelling inside the assembled game title (ASCII, SPEC §7). */
  reveal: { word: string; title: string; type: string };
  /** Crystals already banked; nothing on screen shows them. */
  banks?: Partial<Record<PlayerId, number>>;
  /** Screen-reader narration for each step. */
  narration: { piece: string; target: string; done: string };
}

const MUJU: Scenario = {
  id: 'muju', size: 3, hideHomeMarkers: true, active: 'muju',
  pieces: [{ id: 'muju', owner: 'white', type: 'plant_1', x: 0, y: 0 }],
  reserves: [{ x: 2, y: 2, crystals: 8 }],
  goal: { kind: 'move', to: { x: 2, y: 2 } },
  reveal: { word: 'Muju', title: 'Muju', type: 'plant_1' },
  narration: { piece: 'Tap the Muju in the top-left corner.', target: 'Tap the crystals in the far corner to move there.', done: 'The Muju mined three crystals.' },
};

/** The only crystals in the tutorial are the 8 on the Muju's square in puzzle 1;
 * what it leaves behind fades with the 3×3, and the larger boards start empty.
 * Three pieces in all: the Muju walks, the black Honō eats it, the Irumbu invades. */
const HONO: Scenario = {
  id: 'hono', size: 6, hideHomeMarkers: true, active: 'hono',
  pieces: [
    { id: 'muju', owner: 'white', type: 'plant_1', x: 2, y: 2 },
    { id: 'hono', owner: 'black', type: 'fire_2', x: 5, y: 5 },
  ],
  reserves: [],
  goal: { kind: 'kill', target: 'muju' },
  reveal: { word: 'Honō', title: 'Hono', type: 'fire_2' },
  narration: { piece: 'Now you play Black. Tap the black Honō.', target: 'Tap the white Muju to attack it.', done: 'Fire burns plant. The Muju is eliminated.' },
};

/** The 10×10 keeps the 6×6 exactly in its top-left corner. */
const IRUMBU: Scenario = {
  id: 'irumbu', size: 10, hideHomeMarkers: false, active: 'irumbu',
  pieces: [
    { id: 'hono', owner: 'black', type: 'fire_2', x: 2, y: 3, inert: true },
    { id: 'irumbu', owner: 'white', type: 'metal_3', x: 9, y: 1 },
  ],
  reserves: [],
  // The invader must survive its own upkeep (tier 3: 2 crystals) before `#` is
  // awarded; with no crystals left to mine, White starts with exactly that.
  banks: { white: 2 },
  goal: { kind: 'invade' },
  reveal: { word: 'Irumbu', title: 'Irumbu', type: 'metal_3' },
  narration: { piece: 'Now you play White again. Tap the Irumbu.', target: 'Tap the black home in the bottom-right corner to invade it.', done: 'Checkmate. The Honō cannot hurt the Irumbu, so the black home is lost.' },
};

export const SCENARIOS: readonly Scenario[] = [MUJU, HONO, IRUMBU];
export const scenarioById = (id: string) => SCENARIOS.find(s => s.id === id);
export const unitId = (piece: Pick<ScenarioPiece, 'id' | 'owner'>) => `tutorial-${piece.owner}-${piece.id}`;

/** The active piece's side to move with four actions, empty banks, no kill clock. Never persisted. */
export function buildScenarioState(scenario: Scenario): GameState {
  const { size } = scenario;
  const board = createEmptyBoard(size);
  // `createEmptyBoard` fills every square; a scenario's reserves are the only crystals.
  for (const row of board.cells) for (const cell of row) cell.resourceLayers = 0;
  for (const { x, y, crystals } of scenario.reserves) board.cells[y][x].resourceLayers = crystals;
  board.initialResourceLayers = board.cells.flat().map(cell => cell.resourceLayers);
  board.units = scenario.pieces.map((piece): Unit => ({
    id: unitId(piece), definitionId: piece.type, owner: piece.owner, position: { x: piece.x, y: piece.y },
    hasMoved: false, hasAttacked: false, lastAttackKilled: false, canActThisTurn: true, damageTaken: 0, promotedThisPlacement: false,
  }));
  const player = (id: PlayerId) => ({ id, resources: scenario.banks?.[id] ?? 0, startCorner: getStartCorner(id, size), resourcesGained: 0, resourcesUpkeep: 0 });
  return {
    ruleset: 'phasing', actionsPerTurn: 4, pendingSummons: [], blackCrystalHandicap: 0,
    inactivityRule: 'off', inactivityPlies: 0, progressThisTurn: false,
    phase: 'playing', board, players: { white: player('white'), black: player('black') },
    turn: { currentPlayer: scenario.pieces.find(p => p.id === scenario.active)!.owner, phase: 'action', actionsRemaining: 4, turnNumber: 1 },
    winner: null, selectedUnit: null, validMoves: [], validAttacks: [],
  };
}

export const activeUnitId = (scenario: Scenario) => unitId(scenario.pieces.find(p => p.id === scenario.active)!);
export const targetUnitId = (scenario: Scenario) => scenario.goal.kind === 'kill'
  ? unitId(scenario.pieces.find(p => p.id === (scenario.goal as { target: string }).target)!) : null;

/** The square the player taps to finish: a destination, the prey, or the enemy home. */
export function goalSquare(scenario: Scenario): Position {
  const { goal } = scenario;
  if (goal.kind === 'move') return goal.to;
  if (goal.kind === 'invade') return getStartCorner('black', scenario.size);
  const prey = scenario.pieces.find(p => p.id === goal.target)!;
  return { x: prey.x, y: prey.y };
}

/** Split a path into speed-sized hops; each hop is one MOVE costing one action. */
export function hopsAlong(path: Position[], speed: number): Position[] {
  const hops: Position[] = [];
  for (let i = speed - 1; i < path.length; i += speed) hops.push(path[i]);
  if (path.length && (path.length % speed)) hops.push(path[path.length - 1]);
  return hops;
}

/** The scripted line for a scenario: the hops, then the strike or turn end. */
export function scenarioPlan(state: GameState, scenario: Scenario): { path: Position[]; actions: AIAction[] } {
  const unit = getUnitById(state.board, activeUnitId(scenario))!;
  const { speed } = getUnitDefinition(unit.definitionId);
  const budget = state.turn.actionsRemaining;
  let path: Position[] | null;
  if (scenario.goal.kind === 'kill') {
    const target = getUnitById(state.board, targetUnitId(scenario)!)!;
    path = findAttackApproach(unit, target, state.board, budget);
  } else {
    path = findPath(unit.position, goalSquare(scenario), state.board, budget * speed);
  }
  if (!path) throw new Error(`Scenario ${scenario.id} has no route`);
  const actions: AIAction[] = hopsAlong(path, speed).map(to => ({ type: 'MOVE', unitId: unit.id, to }));
  if (scenario.goal.kind === 'kill') actions.push({ type: 'ATTACK', unitId: unit.id, targetPosition: goalSquare(scenario) });
  return { path, actions };
}

/** Squares on the route where the active piece may stop and still win: tapping a
 * lit gold dot moves there. With exact budgets (speed 2, four actions) this keeps
 * only the stops that waste nothing. */
export function scenarioStops(state: GameState, scenario: Scenario): Position[] {
  const { path } = scenarioPlan(state, scenario);
  const unit = activeUnitId(scenario);
  return path.filter(to => {
    const next = applyAction(state, { type: 'MOVE', unitId: unit, to });
    if (next === state) return false;
    try { return scenarioPlan(next, scenario).actions.length <= next.turn.actionsRemaining; } catch { return false; }
  });
}

/** Play the scripted line through the real reducer; throws if any step is illegal. */
export function playScenario(scenario: Scenario): { frames: GameState[]; final: GameState; mined: number; checkmate: boolean } {
  let state = buildScenarioState(scenario);
  const frames: GameState[] = [];
  for (const action of scenarioPlan(state, scenario).actions) {
    const next = applyAction(state, action);
    if (next === state) throw new Error(`Scenario ${scenario.id}: illegal ${action.type}`);
    frames.push(state = next);
  }
  const { final, mined, checkmate } = finishScenario(state, scenario);
  return { frames, final, mined, checkmate };
}

/** Puzzle 1 ends with the real mining rule; puzzle 3 asks the real checkmate prover. */
export function finishScenario(state: GameState, scenario: Scenario): { final: GameState; mined: number; checkmate: boolean } {
  if (scenario.goal.kind === 'move') {
    const income = endOfTurnIncome(state, state.turn.currentPlayer);
    return { final: income.state, mined: income.total, checkmate: false };
  }
  if (scenario.goal.kind === 'invade') {
    const verdict = applyAction(state, { type: 'END_ACTION_PHASE' });
    return { final: state, mined: 0, checkmate: verdict.phase === 'victory' && verdict.victoryReason === 'home-checkmate' && verdict.winner === 'white' };
  }
  return { final: state, mined: 0, checkmate: false };
}

export const isOnBoard = (state: GameState, position: Position) => position.x >= 0 && position.y >= 0 && position.x < boardSize(state.board) && position.y < boardSize(state.board);

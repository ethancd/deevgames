import type { AIAction } from '../ai/types';
import { applyAction } from '../ai/simulate';
import { boardSize, createEmptyBoard, getStartCorner, getUnitById } from '../game/board';
import { findAttackApproach, findPath } from '../game/movement';
import { endOfTurnIncome } from '../game/mining';
import { UNEQUAL_ROUTES_MAP } from '../game/resourceMap';
import { getUnitDefinition } from '../game/units';
import type { Element, GameState, PlayerId, Position, Unit } from '../game/types';

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
  reveal: { word: string; title: string; glyphElement: Element; type: string };
  /** Screen-reader narration for each step. */
  narration: { piece: string; target: string; done: string };
}

const cellsOf = (size: number, layout: (x: number, y: number) => number) =>
  Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size), crystals: layout(i % size, Math.floor(i / size)) }))
    .filter(cell => cell.crystals > 0);

const MUJU: Scenario = {
  id: 'muju', size: 3, hideHomeMarkers: true, active: 'muju',
  pieces: [{ id: 'muju', owner: 'white', type: 'plant_1', x: 0, y: 0 }],
  reserves: [{ x: 2, y: 2, crystals: 8 }],
  goal: { kind: 'move', to: { x: 2, y: 2 } },
  reveal: { word: 'Muju', title: 'Muju', glyphElement: 'plant', type: 'plant_1' },
  narration: { piece: 'Tap the Muju in the top-left corner.', target: 'Tap the crystals in the far corner to move there.', done: 'The Muju mined three crystals.' },
};

/** After puzzle 1 the far corner holds 8 − 3 = 5; the 6×6 adds a few reserves of its own. */
const HONO_RESERVES = [{ x: 2, y: 2, crystals: 5 }, { x: 5, y: 0, crystals: 4 }, { x: 0, y: 5, crystals: 4 }, { x: 4, y: 4, crystals: 4 }, { x: 5, y: 5, crystals: 8 }];
const HONO: Scenario = {
  id: 'hono', size: 6, hideHomeMarkers: false, active: 'hono',
  pieces: [
    { id: 'muju', owner: 'white', type: 'plant_1', x: 2, y: 2, inert: true },
    { id: 'hono', owner: 'white', type: 'fire_2', x: 1, y: 1 },
    { id: 'prey', owner: 'black', type: 'plant_1', x: 4, y: 4 },
  ],
  reserves: HONO_RESERVES,
  goal: { kind: 'kill', target: 'prey' },
  reveal: { word: 'Honō', title: 'Hono', glyphElement: 'fire', type: 'fire_2' },
  narration: { piece: 'Tap the Honō.', target: 'Tap the black Muju to attack it.', done: 'Fire burns plant. The black Muju is eliminated.' },
};

/** The 10×10 keeps the 6×6 exactly in its top-left corner and the real map everywhere else. */
const IRUMBU: Scenario = {
  id: 'irumbu', size: 10, hideHomeMarkers: false, active: 'irumbu',
  pieces: [
    { id: 'muju', owner: 'white', type: 'plant_1', x: 2, y: 2, inert: true },
    { id: 'hono', owner: 'white', type: 'fire_2', x: 4, y: 3, inert: true },
    { id: 'irumbu', owner: 'white', type: 'metal_3', x: 9, y: 1 },
    { id: 'guard', owner: 'black', type: 'plant_1', x: 8, y: 9 },
    { id: 'hi', owner: 'black', type: 'fire_1', x: 2, y: 8 },
  ],
  reserves: cellsOf(10, (x, y) => x < 6 && y < 6 ? HONO_RESERVES.find(c => c.x === x && c.y === y)?.crystals ?? 0 : UNEQUAL_ROUTES_MAP[y * 10 + x]),
  goal: { kind: 'invade' },
  reveal: { word: 'Irumbu', title: 'Irumbu', glyphElement: 'metal', type: 'metal_3' },
  narration: { piece: 'Tap the Irumbu.', target: 'Tap the black home in the bottom-right corner to invade it.', done: 'Checkmate. The Irumbu holds the black home and nothing can remove it.' },
};

export const SCENARIOS: readonly Scenario[] = [MUJU, HONO, IRUMBU];
export const scenarioById = (id: string) => SCENARIOS.find(s => s.id === id);
export const unitId = (piece: Pick<ScenarioPiece, 'id' | 'owner'>) => `tutorial-${piece.owner}-${piece.id}`;

/** White to move with four actions, Black's bank empty, no kill clock. Never persisted. */
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
  const player = (id: PlayerId) => ({ id, resources: 0, startCorner: getStartCorner(id, size), resourcesGained: 0, resourcesUpkeep: 0 });
  return {
    ruleset: 'phasing', actionsPerTurn: 4, pendingSummons: [], blackCrystalHandicap: 0,
    inactivityRule: 'off', inactivityPlies: 0, progressThisTurn: false,
    phase: 'playing', board, players: { white: player('white'), black: player('black') },
    turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: 4, turnNumber: 1 },
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
    const income = endOfTurnIncome(state, 'white');
    return { final: income.state, mined: income.total, checkmate: false };
  }
  if (scenario.goal.kind === 'invade') {
    const verdict = applyAction(state, { type: 'END_ACTION_PHASE' });
    return { final: state, mined: 0, checkmate: verdict.phase === 'victory' && verdict.victoryReason === 'home-checkmate' && verdict.winner === 'white' };
  }
  return { final: state, mined: 0, checkmate: false };
}

export const isOnBoard = (state: GameState, position: Position) => position.x >= 0 && position.y >= 0 && position.x < boardSize(state.board) && position.y < boardSize(state.board);

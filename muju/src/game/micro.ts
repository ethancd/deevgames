import type { GameState, PlayerId, Position, Unit } from './types';
import { addUnit, createEmptyBoard, createUnit, getStartCorner } from './board';
import { getAttackCount } from './combat';
import { isMicro } from './rules';
import MICRO_MAP_SOURCE from './maps/micro-muju-default.json';

/**
 * MICRO MUJU, rules revision `micro-muju-1` (2026-09-24): a subtractive variant
 * of Prime's Phasing turn. Everything not listed here is Prime, unchanged:
 * pieces keep their canonical stats, prices and interactions.
 *
 * - 6×6 board, homes A1 (White) and F6 (Black), the default map below.
 * - Only Hi, Sjór and Muju (tier 1) may start, be summoned or arrive; no promotion.
 * - Two shared actions per turn. Each creature attacks at most once per turn,
 *   even after a kill (no Cleave). Movement may repeat while actions remain.
 * - No kill clock and no clock-dependent checkmate suppression: nothing ends
 *   the game except home occupation, home checkmate, elimination or resignation.
 *
 * The limits are enforced in `isLegalAction`, not only by hidden controls.
 */
export const MICRO_RULES_REVISION = 'micro-muju-1';
export const MICRO_TITLE = 'MICRO MUJU';
export const MICRO_BOARD_SIZE = 6;
export const MICRO_ACTIONS_PER_TURN = 2 as const;
export const MICRO_CATALOGUE: readonly string[] = Object.freeze(['fire_1', 'water_1', 'plant_1']);

/** Row-major, index = y * 6 + x; the first six values are A1–F1. */
export const MICRO_MAP: readonly number[] = Object.freeze([...MICRO_MAP_SOURCE]);
if (MICRO_MAP.length !== MICRO_BOARD_SIZE * MICRO_BOARD_SIZE || MICRO_MAP.some(n => !Number.isInteger(n) || n < 0)) {
  throw new Error('Invalid MICRO MUJU map');
}
export const MICRO_MAP_RESOURCES = MICRO_MAP.reduce((sum, n) => sum + n, 0);

/** Hi, Sjór, Muju: White B1, B2, A2; Black E6, E5, F5. */
const MICRO_OPENING: Record<PlayerId, { definitionId: string; position: Position }[]> = {
  white: [
    { definitionId: 'fire_1', position: { x: 1, y: 0 } },
    { definitionId: 'water_1', position: { x: 1, y: 1 } },
    { definitionId: 'plant_1', position: { x: 0, y: 1 } },
  ],
  black: [
    { definitionId: 'fire_1', position: { x: 4, y: 5 } },
    { definitionId: 'water_1', position: { x: 4, y: 4 } },
    { definitionId: 'plant_1', position: { x: 5, y: 4 } },
  ],
};

export const isMicroPiece = (definitionId: string): boolean => MICRO_CATALOGUE.includes(definitionId);

/** Micro has no Cleave: once a creature has attacked this turn it is done attacking. */
export function microAttackSpent(state: Pick<GameState, 'variant'>, unit: Unit): boolean {
  return isMicro(state) && getAttackCount(unit) > 0;
}

export function createMicroGameState(): GameState {
  let board = createEmptyBoard(MICRO_BOARD_SIZE);
  board.initialResourceLayers = [...MICRO_MAP];
  for (const row of board.cells) for (const cell of row) cell.resourceLayers = MICRO_MAP[cell.position.y * MICRO_BOARD_SIZE + cell.position.x];
  for (const player of ['white', 'black'] as const) {
    for (const { definitionId, position } of MICRO_OPENING[player]) board = addUnit(board, createUnit(definitionId, player, { ...position }, true));
  }
  const player = (id: PlayerId) => ({ id, resources: 0, startCorner: getStartCorner(id, MICRO_BOARD_SIZE), resourcesGained: 0, resourcesUpkeep: 0 });
  return {
    variant: 'micro',
    rulesRevision: MICRO_RULES_REVISION,
    ruleset: 'phasing',
    actionsPerTurn: MICRO_ACTIONS_PER_TURN,
    pendingSummons: [],
    blackCrystalHandicap: 0,
    // No kill clock in Micro. The counter fields stay at their inert defaults.
    inactivityRule: 'off',
    inactivityPlies: 0, progressThisTurn: false,
    phase: 'playing',
    board,
    players: { white: player('white'), black: player('black') },
    turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: MICRO_ACTIONS_PER_TURN, turnNumber: 1 },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

/** Square name for this board, e.g. A1 or F6. */
export const squareName = (p: Position): string => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;

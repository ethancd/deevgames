import { createEmptyBoard, getStartCorner } from '../game/board';
import { getUnitDefinition } from '../game/units';
import type { GameState, PendingSummon, PlayerId, Unit } from '../game/types';
import { nameSquare, parseBoard, squareOf, typeOf } from './notation';
import type { PuzzleSpec, Square } from './types';

export const heroOf = (spec: PuzzleSpec): PlayerId => spec.side ?? 'white';
export const enemyOf = (spec: PuzzleSpec): PlayerId => heroOf(spec) === 'white' ? 'black' : 'white';
export const turnsOf = (spec: PuzzleSpec): number => spec.turns ?? 1;

/** A starting piece keeps this id all puzzle long, so goals can name it by its starting square. */
export const pieceId = (owner: PlayerId, square: Square) => `p-${owner}-${square}`;

const idCache = new WeakMap<PuzzleSpec, Map<string, string>>();
/** The id of the piece that starts on `square` (either side). */
export function pieceIdAt(spec: PuzzleSpec, square: Square): string {
  let ids = idCache.get(spec);
  if (!ids) {
    ids = new Map(parseBoard(spec.board).pieces.map(p => [nameSquare(p), pieceId(p.owner, nameSquare(p))]));
    idCache.set(spec, ids);
  }
  const id = ids.get(nameSquare(squareOf(square)));
  if (!id) throw new Error(`${spec.id}: no piece starts on ${square}`);
  return id;
}

/**
 * The puzzle's starting position: Phasing, four actions, no kill clock, no
 * handicap, every reserve exactly as drawn. Never persisted.
 */
export function buildPuzzleState(spec: PuzzleSpec): GameState {
  const parsed = parseBoard(spec.board);
  const { size } = parsed;
  const board = createEmptyBoard(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) board.cells[y][x].resourceLayers = parsed.reserves[y][x];
  board.initialResourceLayers = board.cells.flat().map(cell => cell.resourceLayers);
  const hero = heroOf(spec);
  board.units = parsed.pieces.map((p): Unit => ({
    id: pieceId(p.owner, nameSquare(p)), definitionId: p.type, owner: p.owner, position: { x: p.x, y: p.y },
    hasMoved: p.spent, hasAttacked: false, lastAttackKilled: false, canActThisTurn: !p.spent,
    damageTaken: p.owner === hero ? 0 : p.damage, promotedThisPlacement: false, placedThisTurn: false, attackedThisTurn: [],
  }));
  const pendingSummons: PendingSummon[] = (spec.pending ?? []).map((p, i) => {
    const owner = p.owner ?? heroOf(spec);
    const definitionId = typeOf(p.type);
    return { id: `pending-${owner}-${i}`, owner, definitionId, position: squareOf(p.at), cost: getUnitDefinition(definitionId).cost };
  });
  const player = (id: PlayerId) => ({ id, resources: spec.banks?.[id] ?? 0, startCorner: getStartCorner(id, size), resourcesGained: 0, resourcesUpkeep: 0 });
  const prepare = !!spec.prepare;
  return {
    ruleset: 'phasing', actionsPerTurn: 4, pendingSummons, blackCrystalHandicap: 0,
    inactivityRule: 'off', inactivityPlies: 0, progressThisTurn: false,
    ...(spec.homes ? {} : { victoryRule: 'elimination' as const }),
    ...(spec.reviewUpkeep ? { reviewUpkeep: { [hero]: true } } : {}),
    phase: 'playing', board, players: { white: player('white'), black: player('black') },
    turn: { currentPlayer: hero, phase: prepare ? 'place' : 'action', actionsRemaining: prepare ? 0 : spec.actions ?? 4, turnNumber: 1 },
    winner: null, selectedUnit: null, validMoves: [], validAttacks: [],
  };
}

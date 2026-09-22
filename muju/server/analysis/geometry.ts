import type { GameState, PlayerId, Position, Unit } from '../../src/game/types';
import { getAdjacentPositions, getStartCorner, getUnitAt } from '../../src/game/board';
import { getAllSpawnPositions, getSpawnRectangle, getSpawnZone } from '../../src/game/spawning';
import { findPath, getMovementRange } from '../../src/game/movement';
import { getUnitDefinition } from '../../src/game/units';
import { square, squares } from '../notation';
import type { AnalysisInput } from './schema';
import { WorkBudget } from './core';

const equal = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
export function spawnGeometry(s: GameState, player: PlayerId) {
  const anchors = s.board.units.filter(u => u.owner === player).map(u => {
    const rectangle = getSpawnRectangle(getStartCorner(player), u.position);
    return { id: u.id, square: square(u.position), rectangle,
      blockedBy: s.board.units.filter(e => e.owner !== player && rectangle.some(p => equal(e.position, p))).map(e => e.id),
      spawn: getSpawnZone(u, player, s.board) };
  });
  return { player, squares: squares(getAllSpawnPositions(player, s.board)), count: getAllSpawnPositions(player, s.board).length,
    homeBlocked: !!getUnitAt(s.board, getStartCorner(player)) && getUnitAt(s.board, getStartCorner(player))!.owner !== player,
    anchors: anchors.map(a => ({ id: a.id, square: a.square, blockedBy: a.blockedBy, count: a.spawn.length, squares: squares(a.spawn) })) };
}

/** Exact set cover on the currently unblocked rectangles, with a shared budget.
 * Occupancy geometry only: a covering set is not a claim that units can reach it. */
export function blockingSet(s: GameState, player: PlayerId, budget: WorkBudget) {
  const rectangles = s.board.units.filter(u => u.owner === player).map(u => getSpawnRectangle(getStartCorner(player), u.position))
    .filter(r => !s.board.units.some(u => u.owner !== player && r.some(p => equal(p, u.position))));
  const full = (1n << BigInt(rectangles.length)) - 1n;
  const candidates = s.board.cells.flat().map(c => c.position).filter(p => !getUnitAt(s.board, p)).map(p => ({ p,
    mask: rectangles.reduce((mask, r, i) => r.some(q => equal(p, q)) ? mask | (1n << BigInt(i)) : mask, 0n) })).filter(c => c.mask);
  const singles = candidates.filter(c => c.mask === full);
  if (!full || singles.length) return { status: 'proven_possible', minimum: full ? 1 : 0, squares: full ? square(singles[0].p) : '',
    singleSquares: squares(singles.map(c => c.p)), optimality: 'proven', assumption: 'Fixed board; empty squares only; routes not checked.' };
  if (candidates.reduce((mask, c) => mask | c.mask, 0n) !== full) return { status: 'proven_impossible', minimum: null, reason: 'An unblocked anchor has no empty square in its rectangle.' };
  let best = candidates.map(c => c.p), complete = true;
  const seen = new Map<bigint, number>();
  const visit = (mask: bigint, selected: Position[]) => {
    if (mask === full) { if (selected.length < best.length) best = selected; return; }
    if (selected.length >= best.length || (seen.get(mask) ?? Infinity) <= selected.length) return;
    if (!budget.spend()) { complete = false; return; }
    seen.set(mask, selected.length);
    const i = rectangles.findIndex((_, i) => !(mask & (1n << BigInt(i))));
    for (const c of candidates.filter(c => c.mask & (1n << BigInt(i)))) {
      visit(mask | c.mask, [...selected, c.p]); if (!complete) break;
    }
  };
  visit(0n, []);
  return { status: 'proven_possible', minimum: complete ? best.length : null, bestFoundSize: best.length,
    squares: squares(best), optimality: complete ? 'proven' : 'best_found', assumption: 'Fixed board; empty squares only; routes not checked.' };
}

export function inRegions(p: Position, input: AnalysisInput) {
  return !input.targets.regions?.length || input.targets.regions.some(r => p.x >= Math.min(r.from.x, r.to.x) &&
    p.x <= Math.max(r.from.x, r.to.x) && p.y >= Math.min(r.from.y, r.to.y) && p.y <= Math.max(r.from.y, r.to.y));
}
export function selectedUnits(s: GameState, input: AnalysisInput) {
  return s.board.units.filter(u => (input.targets.unitIds?.length ? input.targets.unitIds.includes(u.id)
    : input.targets.squares?.length ? input.targets.squares.some(p => equal(p, u.position)) : u.owner === input.player) && inRegions(u.position, input));
}
export function reach(s: GameState, input: AnalysisInput) {
  return selectedUnits(s, input).map(u => {
    const budget = u.owner === s.turn.currentPlayer && s.phase === 'playing' && !s.upkeepPending && u.canActThisTurn ? Math.min(input.actions, s.turn.actionsRemaining) : 0;
    const destinations = getMovementRange(u.position, getUnitDefinition(u.definitionId).speed, budget, s.board).filter(p => inRegions(p.position, input));
    return { id: u.id, actions: budget, byCost: Object.fromEntries([1, 2, 3, 4].map(cost => [cost,
      squares(destinations.filter(p => budget - p.actionsRemaining === cost).map(p => p.position))])),
      homeReachable: destinations.some(p => equal(p.position, getStartCorner(u.owner === 'white' ? 'black' : 'white'))),
      ...(input.detail === 'full' ? { paths: destinations.map(p => ({ square: square(p.position),
        path: squares(findPath(u.position, p.position, s.board, 100)!) })) } : {}) };
  });
}

function components(s: GameState, removed?: string) {
  const free = new Map(s.board.cells.flat().map(c => [square(c.position), c.position]));
  for (const u of s.board.units) free.delete(square(u.position));
  if (removed) free.delete(removed);
  const result: Position[][] = [];
  while (free.size) {
    const start = free.values().next().value!;
    const queue = [start]; free.delete(square(start));
    for (let i = 0; i < queue.length; i++) for (const p of getAdjacentPositions(queue[i])) {
      if (free.delete(square(p))) queue.push(p);
    }
    result.push(queue);
  }
  return result;
}
export function mobility(s: GameState, input: AnalysisInput) {
  const units = selectedUnits(s, input);
  const vacated = new Map(s.board.units.map(blocker => [blocker.id, { ...s.board, units: s.board.units.filter(u => u.id !== blocker.id) }]));
  const warnings = units.map(u => {
    const exits = getAdjacentPositions(u.position).filter(p => !getUnitAt(s.board, p));
    const blockers = getAdjacentPositions(u.position).map(p => getUnitAt(s.board, p)).filter((b): b is Unit => !!b);
    const range = getMovementRange(u.position, getUnitDefinition(u.definitionId).speed, input.actions, s.board).length;
    const friendly = [...blockers.filter(b => b.owner === u.owner), ...s.board.units.filter(b => b.owner === u.owner && b.id !== u.id && !blockers.includes(b))];
    return { id: u.id, trapped: !exits.length, exits: squares(exits), reachableCount: range,
      friendlyBlockers: friendly.map(b => ({ id: b.id, adjacent: blockers.includes(b),
        extraReachIfVacated: getMovementRange(u.position, getUnitDefinition(u.definitionId).speed, input.actions, vacated.get(b.id)!).length - range }))
        .filter(b => b.adjacent || b.extraReachIfVacated > 0),
      enemyBlockers: blockers.filter(b => b.owner !== u.owner).map(b => b.id) };
  });
  const regions = components(s);
  const entrances = s.board.cells.flat().filter(c => !getUnitAt(s.board, c.position) && components(s, square(c.position)).length > regions.length).map(c => c.position);
  return { assumptions: 'Fixed occupancy; geometric exits ignore turn flags; vacating a blocker is an independent what-if, not a verified sequence.', units: warnings,
    regions: regions.filter(r => r.some(p => inRegions(p, input))).map(r => ({ size: r.length, squares: squares(r) })),
    singleEntrances: squares(entrances.filter(p => inRegions(p, input))) };
}

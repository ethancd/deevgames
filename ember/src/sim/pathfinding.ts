/**
 * EMBER — pathfinding (src/sim/pathfinding.ts).
 *
 * A* over the 8-connected passable grid (Chebyshev metric, matching the
 * distance metric used everywhere else in EMBER — glow radius, scent range,
 * observation radius). Diagonal steps are disallowed when they would cut
 * through a wall corner (both orthogonal flanking tiles impassable).
 *
 * Determinism: ties in the open set are broken by (lowest f, then lowest
 * row-major grid index), and neighbor expansion always walks DIRS8 in a
 * fixed order — so findPath(world, from, to, cautious) is a pure function
 * of its inputs.
 */

import type { Vec, WorldState } from '../core/types';
import { DIRS8, chebyshev, idx, inBounds, isPassable } from './grid';

function canStepDiagonal(world: WorldState, from: Vec, d: Vec): boolean {
  if (d.x === 0 || d.y === 0) return true;
  const flankA: Vec = { x: from.x + d.x, y: from.y };
  const flankB: Vec = { x: from.x, y: from.y + d.y };
  return isPassable(world, flankA) && isPassable(world, flankB);
}

/** Passable, corner-safe 8-neighbors of `pos`. Shared by findPath and the
 *  worldgen connectivity check so the guarantee matches what findPath can
 *  actually traverse. */
export function neighbors8(world: WorldState, pos: Vec): Vec[] {
  const out: Vec[] = [];
  for (const d of DIRS8) {
    const p: Vec = { x: pos.x + d.x, y: pos.y + d.y };
    if (!inBounds(p, world.width, world.height)) continue;
    if (!isPassable(world, p)) continue;
    if (!canStepDiagonal(world, pos, d)) continue;
    out.push(p);
  }
  return out;
}

const WATER_ADJ_OFFSETS: Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function isAdjacentToWater(world: WorldState, pos: Vec): boolean {
  for (const d of WATER_ADJ_OFFSETS) {
    const p: Vec = { x: pos.x + d.x, y: pos.y + d.y };
    if (!inBounds(p, world.width, world.height)) continue;
    if (world.tiles[idx(p, world.width)] === 'water') return true;
  }
  return false;
}

/** Cost of stepping ONTO tile `pos`. cautious=true makes tiles near the
 *  wolf's current position, and tiles adjacent to water, more expensive —
 *  A* will route around them when a cheaper detour exists. */
function stepCost(world: WorldState, pos: Vec, cautious: boolean): number {
  let cost = 1;
  if (!cautious) return cost;
  const dWolf = chebyshev(pos, world.wolf.pos);
  if (dWolf <= 4) cost += (5 - dWolf) * 1.5;
  if (isAdjacentToWater(world, pos)) cost += 2;
  return cost;
}

/** A* path from `from` to `to`, exclusive of `from`, inclusive of `to`.
 *  Returns [] if already at `to`, if `to` is impassable, or if unreachable. */
export function findPath(
  world: WorldState,
  from: Vec,
  to: Vec,
  cautious: boolean,
): Vec[] {
  if (from.x === to.x && from.y === to.y) return [];
  if (!isPassable(world, to)) return [];
  if (!isPassable(world, from)) return [];

  const w = world.width;
  const key = (p: Vec) => p.y * w + p.x;
  const startKey = key(from);
  const goalKey = key(to);

  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open = new Set<number>();

  gScore.set(startKey, 0);
  fScore.set(startKey, chebyshev(from, to));
  open.add(startKey);

  while (open.size > 0) {
    let currentKey = -1;
    let bestF = Infinity;
    for (const k of open) {
      const f = fScore.get(k) ?? Infinity;
      if (currentKey === -1 || f < bestF || (f === bestF && k < currentKey)) {
        bestF = f;
        currentKey = k;
      }
    }

    if (currentKey === goalKey) {
      const path: Vec[] = [];
      let cur = currentKey;
      while (cur !== startKey) {
        path.push({ x: cur % w, y: Math.floor(cur / w) });
        const p = cameFrom.get(cur);
        if (p === undefined) break;
        cur = p;
      }
      path.reverse();
      return path;
    }

    open.delete(currentKey);
    const curPos: Vec = { x: currentKey % w, y: Math.floor(currentKey / w) };
    for (const n of neighbors8(world, curPos)) {
      const nKey = key(n);
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost(world, n, cautious);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + chebyshev(n, to));
        open.add(nKey);
      }
    }
  }

  return [];
}

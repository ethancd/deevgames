/**
 * EMBER — observation (src/sim/observe.ts).
 *
 * observe() builds the raw list of everything within Chebyshev `radius` of
 * `from`: entities (wolf, deadwood, sunpatches) and notable terrain (den
 * tiles, water-edge tiles — the shoreline, not the whole pond interior).
 * Always returns deep copies: never a live reference into WorldState, so a
 * pilot (or anything downstream) cannot mutate ground truth through what it
 * was merely shown.
 *
 * Sort order is deterministic: distance ascending, then a stable secondary
 * key (entity id where one exists, else a position-derived key) ascending —
 * so two observe() calls over an unchanged world always produce byte-equal
 * output, regardless of iteration/object-creation order internally.
 */

import type { Observation, Vec, WorldState } from '../core/types';
import { chebyshev, idx, inBounds } from './grid';

interface Candidate {
  obs: Observation;
  sortId: string;
}

const EDGE_OFFSETS: Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function observe(world: WorldState, from: Vec, radius: number): Observation[] {
  const cands: Candidate[] = [];

  const dWolf = chebyshev(from, world.wolf.pos);
  if (dWolf <= radius) {
    cands.push({
      obs: {
        kind: 'entity',
        what: 'wolf',
        pos: { x: world.wolf.pos.x, y: world.wolf.pos.y },
        distance: dWolf,
        detail: { state: world.wolf.state },
      },
      sortId: 'wolf',
    });
  }

  for (const dw of world.deadwood) {
    const d = chebyshev(from, dw.pos);
    if (d > radius) continue;
    cands.push({
      obs: {
        kind: 'entity',
        what: 'deadwood',
        pos: { x: dw.pos.x, y: dw.pos.y },
        distance: d,
        detail: { id: dw.id, fuel: dw.fuel },
      },
      sortId: `deadwood:${dw.id}`,
    });
  }

  for (const sp of world.sunpatches) {
    const d = chebyshev(from, sp.pos);
    if (d > radius) continue;
    cands.push({
      obs: {
        kind: 'entity',
        what: 'sunpatch',
        pos: { x: sp.pos.x, y: sp.pos.y },
        distance: d,
        detail: { id: sp.id, active: sp.active },
      },
      sortId: `sunpatch:${sp.id}`,
    });
  }

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.tiles[idx({ x, y }, world.width)] !== 'den') continue;
      const d = chebyshev(from, { x, y });
      if (d > radius) continue;
      cands.push({
        obs: { kind: 'terrain', what: 'den', pos: { x, y }, distance: d },
        sortId: `den:${String(y).padStart(4, '0')}:${String(x).padStart(4, '0')}`,
      });
    }
  }

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.tiles[idx({ x, y }, world.width)] !== 'water') continue;
      const d = chebyshev(from, { x, y });
      if (d > radius) continue;
      let isEdge = false;
      for (const off of EDGE_OFFSETS) {
        const p: Vec = { x: x + off.x, y: y + off.y };
        if (!inBounds(p, world.width, world.height)) continue;
        if (world.tiles[idx(p, world.width)] !== 'water') {
          isEdge = true;
          break;
        }
      }
      if (!isEdge) continue;
      cands.push({
        obs: { kind: 'terrain', what: 'water', pos: { x, y }, distance: d },
        sortId: `water:${String(y).padStart(4, '0')}:${String(x).padStart(4, '0')}`,
      });
    }
  }

  cands.sort((a, b) => {
    if (a.obs.distance !== b.obs.distance) return a.obs.distance - b.obs.distance;
    if (a.sortId < b.sortId) return -1;
    if (a.sortId > b.sortId) return 1;
    return 0;
  });

  return cands.map((c) => c.obs);
}

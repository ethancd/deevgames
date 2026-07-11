/**
 * EMBER — procedural world generation (src/sim/worldgen.ts).
 *
 * generateWorld(seed, rng) builds a 48x32 WorldState deterministically:
 * grass base, clustered pine forest, rock outcrops, one pond, a den region
 * at the map edge, 8-14 deadwood scattered near forest, 4-8 sunpatches on
 * open grass, ember near map center, wolf far from ember.
 *
 * Every placement step draws from a label-stable rng.fork() so reordering
 * or adding future steps doesn't perturb earlier ones. After placement,
 * repairConnectivity() verifies (via the same 8-connected adjacency
 * findPath uses) that ember can reach the den and every deadwood, carving a
 * minimal-cost corridor through obstacles wherever it can't — so the
 * generated world is ALWAYS fully connected, never merely "usually".
 */

import type {
  DeadwoodEntity,
  Rng,
  SunpatchEntity,
  TileType,
  Vec,
  WorldState,
} from '../core/types';
import { GRID_H, GRID_W } from '../core/types';
import { DIRS4, chebyshev, idx, inBounds, isPassable, isDay, setTile, vecEq } from './grid';
import { neighbors8 } from './pathfinding';

// ------------------------------------------------------------- den region

interface DenPlacement {
  anchor: Vec;
  cells: Vec[];
}

function placeDen(world: WorldState, rng: Rng): DenPlacement {
  const { width, height } = world;
  const margin = 4;
  const edge = rng.int(4); // 0 top, 1 right, 2 bottom, 3 left
  let anchor: Vec;
  let inward: Vec;
  let lateral: Vec;

  switch (edge) {
    case 0:
      anchor = { x: margin + rng.int(Math.max(1, width - margin * 2)), y: 0 };
      inward = { x: 0, y: 1 };
      lateral = { x: 1, y: 0 };
      break;
    case 1:
      anchor = { x: width - 1, y: margin + rng.int(Math.max(1, height - margin * 2)) };
      inward = { x: -1, y: 0 };
      lateral = { x: 0, y: 1 };
      break;
    case 2:
      anchor = { x: margin + rng.int(Math.max(1, width - margin * 2)), y: height - 1 };
      inward = { x: 0, y: -1 };
      lateral = { x: 1, y: 0 };
      break;
    default:
      anchor = { x: 0, y: margin + rng.int(Math.max(1, height - margin * 2)) };
      inward = { x: 1, y: 0 };
      lateral = { x: 0, y: 1 };
      break;
  }

  const raw: Vec[] = [
    anchor,
    { x: anchor.x + inward.x, y: anchor.y + inward.y },
    { x: anchor.x + inward.x * 2, y: anchor.y + inward.y * 2 },
    { x: anchor.x + inward.x + lateral.x, y: anchor.y + inward.y + lateral.y },
    { x: anchor.x + inward.x - lateral.x, y: anchor.y + inward.y - lateral.y },
  ];
  const cells = raw.filter((p) => inBounds(p, width, height));
  for (const c of cells) setTile(world, c, 'den');
  return { anchor, cells };
}

// ------------------------------------------------------------- terrain blobs

/** Random-walk blob painter: only overwrites tiles whose current type is in
 *  `allowedFrom`, so earlier placements (den, other terrain) are never
 *  clobbered by later ones. */
function paintBlob(
  world: WorldState,
  rng: Rng,
  start: Vec,
  steps: number,
  tile: TileType,
  allowedFrom: TileType[],
): void {
  let cur: Vec = { x: start.x, y: start.y };
  for (let i = 0; i < steps; i++) {
    if (inBounds(cur, world.width, world.height)) {
      const t = world.tiles[idx(cur, world.width)];
      if (allowedFrom.includes(t)) setTile(world, cur, tile);
    }
    const dir = DIRS4[rng.int(DIRS4.length)];
    const next: Vec = { x: cur.x + dir.x, y: cur.y + dir.y };
    cur = inBounds(next, world.width, world.height) ? next : cur;
  }
}

function placeForestClusters(world: WorldState, rng: Rng): void {
  const count = 3 + rng.int(3); // 3-5 clusters
  for (let i = 0; i < count; i++) {
    const cx = 3 + rng.int(Math.max(1, world.width - 6));
    const cy = 3 + rng.int(Math.max(1, world.height - 6));
    const steps = 70 + rng.int(60);
    paintBlob(world, rng, { x: cx, y: cy }, steps, 'forest', ['grass']);
  }
}

function placeRockOutcrops(world: WorldState, rng: Rng): void {
  const count = 2 + rng.int(3); // 2-4 outcrops
  for (let i = 0; i < count; i++) {
    const cx = 2 + rng.int(Math.max(1, world.width - 4));
    const cy = 2 + rng.int(Math.max(1, world.height - 4));
    const steps = 12 + rng.int(18);
    paintBlob(world, rng, { x: cx, y: cy }, steps, 'rock', ['grass']);
  }
}

function placePond(world: WorldState, rng: Rng): void {
  const cx = 6 + rng.int(Math.max(1, world.width - 12));
  const cy = 6 + rng.int(Math.max(1, world.height - 12));
  const steps = 25 + rng.int(20);
  paintBlob(world, rng, { x: cx, y: cy }, steps, 'water', ['grass']);
}

// ------------------------------------------------------------- ember / wolf

function nearestPassable(world: WorldState, from: Vec): Vec {
  if (isPassable(world, from)) return from;
  const maxR = Math.max(world.width, world.height);
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p: Vec = { x: from.x + dx, y: from.y + dy };
        if (inBounds(p, world.width, world.height) && isPassable(world, p)) return p;
      }
    }
  }
  // Should be unreachable on a real map (mostly grass), but never throw.
  return { x: 0, y: 0 };
}

function placeEmberStart(world: WorldState, rng: Rng): Vec {
  const center: Vec = { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) };
  const jx = rng.int(5) - 2; // -2..2
  const jy = rng.int(5) - 2;
  return nearestPassable(world, { x: center.x + jx, y: center.y + jy });
}

function placeWolfStart(world: WorldState, rng: Rng, emberPos: Vec): Vec {
  let maxDist = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const p: Vec = { x, y };
      if (!isPassable(world, p)) continue;
      const d = chebyshev(p, emberPos);
      if (d > maxDist) maxDist = d;
    }
  }
  const threshold = Math.floor(maxDist * 0.6);
  const candidates: Vec[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const p: Vec = { x, y };
      if (!isPassable(world, p)) continue;
      if (chebyshev(p, emberPos) >= threshold) candidates.push(p);
    }
  }
  if (candidates.length === 0) {
    return nearestPassable(world, { x: world.width - 1, y: world.height - 1 });
  }
  return candidates[rng.int(candidates.length)];
}

// ------------------------------------------------------------- entities

function placeDeadwood(world: WorldState, rng: Rng): DeadwoodEntity[] {
  const forestTiles: Vec[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.tiles[idx({ x, y }, world.width)] === 'forest') forestTiles.push({ x, y });
    }
  }

  const count = 8 + rng.int(7); // 8-14
  const result: DeadwoodEntity[] = [];
  const used = new Set<string>();
  const maxAttempts = Math.max(count * 40, 200);

  for (let attempts = 0; result.length < count && attempts < maxAttempts; attempts++) {
    let p: Vec;
    if (forestTiles.length > 0) {
      const base = forestTiles[rng.int(forestTiles.length)];
      p = { x: base.x + (rng.int(5) - 2), y: base.y + (rng.int(5) - 2) };
    } else {
      p = { x: rng.int(world.width), y: rng.int(world.height) };
    }
    if (!inBounds(p, world.width, world.height)) continue;
    if (!isPassable(world, p)) continue;
    if (vecEq(p, world.ember.pos) || vecEq(p, world.wolf.pos)) continue;
    const key = `${p.x},${p.y}`;
    if (used.has(key)) continue;
    used.add(key);
    result.push({ id: `deadwood-${result.length}`, pos: p, fuel: 0.6 + rng.next() * 0.4 });
  }
  return result;
}

function isNearForest(world: WorldState, p: Vec, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const q: Vec = { x: p.x + dx, y: p.y + dy };
      if (!inBounds(q, world.width, world.height)) continue;
      if (world.tiles[idx(q, world.width)] === 'forest') return true;
    }
  }
  return false;
}

function placeSunpatches(world: WorldState, rng: Rng): SunpatchEntity[] {
  const openTiles: Vec[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const p: Vec = { x, y };
      if (world.tiles[idx(p, world.width)] !== 'grass') continue;
      if (isNearForest(world, p, 2)) continue;
      openTiles.push(p);
    }
  }

  const count = Math.min(4 + rng.int(5), openTiles.length); // 4-8
  const result: SunpatchEntity[] = [];
  const used = new Set<string>();
  const dayNow = isDay(0);
  const maxAttempts = Math.max(openTiles.length * 4, 200);

  for (let attempts = 0; result.length < count && attempts < maxAttempts && openTiles.length > 0; attempts++) {
    const p = openTiles[rng.int(openTiles.length)];
    const key = `${p.x},${p.y}`;
    if (used.has(key)) continue;
    if (vecEq(p, world.ember.pos) || vecEq(p, world.wolf.pos)) continue;
    used.add(key);
    result.push({ id: `sunpatch-${result.length}`, pos: p, active: dayNow });
  }
  return result;
}

// ------------------------------------------------------------- connectivity

function bfsReachable(world: WorldState, from: Vec, to: Vec): boolean {
  if (vecEq(from, to)) return true;
  const w = world.width;
  const h = world.height;
  const seen = new Uint8Array(w * h);
  const startKey = idx(from, w);
  const goalKey = idx(to, w);
  seen[startKey] = 1;
  const queue: number[] = [startKey];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === goalKey) return true;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const n of neighbors8(world, { x: cx, y: cy })) {
      const nk = idx(n, w);
      if (!seen[nk]) {
        seen[nk] = 1;
        queue.push(nk);
      }
    }
  }
  return seen[goalKey] === 1;
}

/** Dijkstra over the FULL grid (4-directional), where passable tiles cost 1
 *  and impassable tiles cost a large-but-finite penalty — so a path always
 *  exists, and it prefers to route through as little impassable terrain as
 *  possible. Used only to find what to carve; not exposed as findPath. */
function cheapestCorridor(world: WorldState, from: Vec, to: Vec): Vec[] {
  const w = world.width;
  const h = world.height;
  const n = w * h;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  const startKey = idx(from, w);
  const goalKey = idx(to, w);
  dist[startKey] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    visited[u] = 1;
    if (u === goalKey) break;
    const ux = u % w;
    const uy = Math.floor(u / w);
    for (const d of DIRS4) {
      const nx = ux + d.x;
      const ny = uy + d.y;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      const t = world.tiles[ni];
      const stepCost = t === 'rock' || t === 'water' ? 50 : 1;
      const nd = dist[u] + stepCost;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = u;
      }
    }
  }

  if (dist[goalKey] === Infinity) return [];
  const path: Vec[] = [];
  let cur = goalKey;
  while (cur !== startKey) {
    path.push({ x: cur % w, y: Math.floor(cur / w) });
    const p = prev[cur];
    if (p === -1) break;
    cur = p;
  }
  path.reverse();
  return path;
}

/** Guarantees ember can reach the den and every deadwood tile. Carves a
 *  minimal corridor of grass through obstacles for any target that isn't
 *  already reachable. Mutates world.tiles in place. */
function repairConnectivity(world: WorldState): void {
  const targets: Vec[] = [world.denPos, ...world.deadwood.map((d) => d.pos)];
  for (const target of targets) {
    if (bfsReachable(world, world.ember.pos, target)) continue;
    const corridor = cheapestCorridor(world, world.ember.pos, target);
    for (const p of corridor) {
      if (!isPassable(world, p)) setTile(world, p, 'grass');
    }
  }
}

// ------------------------------------------------------------- entry point

export function generateWorld(seed: number, rng: Rng): WorldState {
  const width = GRID_W;
  const height = GRID_H;
  const tiles: TileType[] = new Array(width * height).fill('grass');

  const world: WorldState = {
    seed,
    tick: 0,
    width,
    height,
    tiles,
    denPos: { x: 0, y: 0 },
    deadwood: [],
    sunpatches: [],
    wolf: { pos: { x: 0, y: 0 }, state: 'PATROL', stateTicks: 0 },
    weather: 'clear',
    ember: { pos: { x: 0, y: 0 } },
  };

  const den = placeDen(world, rng.fork('den'));
  world.denPos = den.anchor;

  placeForestClusters(world, rng.fork('forest'));
  placeRockOutcrops(world, rng.fork('rock'));
  placePond(world, rng.fork('pond'));

  world.ember.pos = placeEmberStart(world, rng.fork('ember'));
  world.wolf.pos = placeWolfStart(world, rng.fork('wolf-start'), world.ember.pos);

  world.deadwood = placeDeadwood(world, rng.fork('deadwood'));
  world.sunpatches = placeSunpatches(world, rng.fork('sunpatch'));

  repairConnectivity(world);

  return world;
}

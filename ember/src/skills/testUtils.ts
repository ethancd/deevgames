/**
 * EMBER — test-only fixtures for src/skills/ specs. Not part of the pinned
 * contract; used only by *.test.ts files inside this directory.
 */

import { createBody } from '../body';
import { createEventLog } from '../core/eventLog';
import { createRng } from '../core/rng';
import type {
  BodyState,
  DeadwoodEntity,
  EventLog,
  Rng,
  SkillCtx,
  SunpatchEntity,
  TileType,
  Vec,
  WolfEntity,
  WorldState,
} from '../core/types';

/** A small, entirely-grass, fully in-bounds world so tests don't have to
 *  fight terrain. Individual tiles can be overridden via `tileOverrides`. */
export function makeWorld(overrides?: Partial<WorldState> & { tileOverrides?: { pos: Vec; tile: TileType }[] }): WorldState {
  const width = overrides?.width ?? 10;
  const height = overrides?.height ?? 10;
  const tiles: TileType[] = new Array(width * height).fill('grass');
  const wolf: WolfEntity = overrides?.wolf ?? {
    pos: { x: 9, y: 9 },
    state: 'PATROL',
    stateTicks: 0,
  };
  const world: WorldState = {
    seed: 1,
    tick: 0,
    width,
    height,
    tiles,
    denPos: { x: 0, y: 0 },
    deadwood: [],
    sunpatches: [],
    wolf,
    weather: 'clear',
    ember: { pos: { x: 5, y: 5 } },
    ...overrides,
  };
  for (const o of overrides?.tileOverrides ?? []) {
    world.tiles[o.pos.y * world.width + o.pos.x] = o.tile;
  }
  return world;
}

export function makeDeadwood(overrides?: Partial<DeadwoodEntity>): DeadwoodEntity {
  return { id: 'dw-1', pos: { x: 5, y: 6 }, fuel: 0.5, ...overrides };
}

export function makeSunpatch(overrides?: Partial<SunpatchEntity>): SunpatchEntity {
  return { id: 'sp-1', pos: { x: 5, y: 6 }, active: true, ...overrides };
}

export function makeBody(overrides?: Partial<BodyState>): BodyState {
  return createBody(overrides);
}

export function freshLog(): EventLog {
  return createEventLog();
}

export function freshRng(seed = 1): Rng {
  return createRng(seed);
}

export function makeCtx(overrides?: {
  world?: WorldState;
  body?: BodyState;
  rng?: Rng;
  log?: EventLog;
  tick?: number;
}): SkillCtx {
  const world = overrides?.world ?? makeWorld();
  return {
    world,
    body: overrides?.body ?? makeBody(),
    rng: overrides?.rng ?? freshRng(),
    log: overrides?.log ?? freshLog(),
    tick: overrides?.tick ?? world.tick,
  };
}

/**
 * EMBER — test-only helpers for src/body/ specs. Not part of the pinned
 * contract; used only by *.test.ts files inside this directory.
 */

import { createEventLog } from '../core/eventLog';
import type { EventLog, WolfEntity, WorldState } from '../core/types';

export function makeWorld(overrides?: Partial<WorldState>): WorldState {
  const wolf: WolfEntity = overrides?.wolf ?? {
    pos: { x: 0, y: 0 },
    state: 'PATROL',
    stateTicks: 0,
  };
  return {
    seed: 1,
    tick: 0,
    width: 4,
    height: 4,
    tiles: [],
    denPos: { x: 0, y: 0 },
    deadwood: [],
    sunpatches: [],
    wolf,
    weather: 'clear',
    ember: { pos: { x: 1, y: 1 } },
    ...overrides,
  };
}

export function freshLog(): EventLog {
  return createEventLog();
}

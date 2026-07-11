/**
 * EMBER — world tick (src/sim/stepWorld.ts).
 *
 * stepWorld(world, rng, log, emberGlow) advances the world by exactly one
 * tick: it increments world.tick, then runs (in order) day/night boundary
 * detection, weather, sunpatch activation, deadwood regrowth, and the wolf
 * FSM. All world.* events for this tick are stamped with the POST-increment
 * tick value.
 */

import type { EventLog, Rng, WorldState } from '../core/types';
import { isDay } from './grid';
import { stepWeather } from './weather';
import { stepWolf } from './wolf';

/** Deadwood is "large slow fuel" — regrows to full over roughly 2500 ticks. */
const DEADWOOD_REGROW_PER_TICK = 0.0004;

export function stepWorld(world: WorldState, rng: Rng, log: EventLog, emberGlow: number): void {
  const prevTick = world.tick;
  world.tick = prevTick + 1;
  const tick = world.tick;

  const wasDay = isDay(prevTick);
  const nowDay = isDay(tick);
  if (nowDay !== wasDay) {
    log.append({
      tick,
      topic: nowDay ? 'world.day.start' : 'world.night.start',
      payload: {},
    });
  }

  stepWeather(world, rng, log);

  for (const sp of world.sunpatches) {
    sp.active = nowDay;
  }

  for (const dw of world.deadwood) {
    if (dw.fuel < 1) dw.fuel = Math.min(1, dw.fuel + DEADWOOD_REGROW_PER_TICK);
  }

  stepWolf(world, rng, log, emberGlow);
}

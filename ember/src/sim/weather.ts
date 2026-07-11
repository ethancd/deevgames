/**
 * EMBER — weather (src/sim/weather.ts).
 *
 * Rain events are computed as a PURE function of (seed via rng.fork, tick)
 * rather than tracked with a hidden mutable countdown — this keeps stepWorld
 * fully deterministic and replay-safe without needing to stash extra state
 * outside the pinned WorldState shape.
 *
 * Time is divided into fixed blocks. Each block independently rolls (via a
 * label-stable fork off 'weather') whether it contains a rain event, and if
 * so, a start offset + duration within the block (30-80 ticks, per PLAN
 * §2/§3: "a few per day, each ~30-80 ticks"). world.weather is recomputed
 * every tick from this pure schedule; a world.weather.rain_start /
 * rain_end event is emitted only on the tick the value actually changes.
 */

import type { EventLog, Rng, WorldState, Weather } from '../core/types';

const BLOCK_TICKS = 160; // ~3 blocks/day at DAY_TICKS=480 -> "a few" rain rolls/day
const RAIN_PROBABILITY = 0.65;
const RAIN_MIN_TICKS = 30;
const RAIN_MAX_TICKS = 80; // exclusive upper bound of the roll range

function weatherAtTick(rng: Rng, tick: number): Weather {
  const block = Math.floor(tick / BLOCK_TICKS);
  const blockRng = rng.fork('weather').fork(`block:${block}`);
  const occurs = blockRng.next() < RAIN_PROBABILITY;
  if (!occurs) return 'clear';

  const maxStart = Math.max(1, BLOCK_TICKS - RAIN_MAX_TICKS);
  const startOffset = blockRng.int(maxStart);
  const duration = RAIN_MIN_TICKS + blockRng.int(RAIN_MAX_TICKS - RAIN_MIN_TICKS);
  const localTick = tick - block * BLOCK_TICKS;
  return localTick >= startOffset && localTick < startOffset + duration ? 'rain' : 'clear';
}

/** Recompute world.weather for the current world.tick and emit a transition
 *  event if it changed from the previous tick's value. */
export function stepWeather(world: WorldState, rng: Rng, log: EventLog): void {
  const prev = world.weather;
  const next = weatherAtTick(rng, world.tick);
  if (next !== prev) {
    log.append({
      tick: world.tick,
      topic: next === 'rain' ? 'world.weather.rain_start' : 'world.weather.rain_end',
      payload: { weather: next },
    });
  }
  world.weather = next;
}

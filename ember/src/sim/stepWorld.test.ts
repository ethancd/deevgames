import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { createEventLog } from '../core/eventLog';
import { DAY_TICKS } from '../core/types';
import type { WorldState } from '../core/types';
import { generateWorld } from './worldgen';
import { stepWorld } from './stepWorld';
import { isDay } from './grid';

function freshWorld(seed = 42): WorldState {
  return generateWorld(seed, createRng(seed));
}

describe('isDay', () => {
  it('is true for the first half of the day cycle, false for the second', () => {
    expect(isDay(0)).toBe(true);
    expect(isDay(DAY_TICKS / 2 - 1)).toBe(true);
    expect(isDay(DAY_TICKS / 2)).toBe(false);
    expect(isDay(DAY_TICKS - 1)).toBe(false);
  });

  it('wraps across multiple day cycles', () => {
    expect(isDay(DAY_TICKS)).toBe(true);
    expect(isDay(DAY_TICKS + DAY_TICKS / 2)).toBe(false);
    expect(isDay(3 * DAY_TICKS + 10)).toBe(true);
  });
});

describe('stepWorld', () => {
  it('advances world.tick by exactly one per call', () => {
    const world = freshWorld();
    const rng = createRng(1);
    const log = createEventLog();
    expect(world.tick).toBe(0);
    stepWorld(world, rng, log, 5);
    expect(world.tick).toBe(1);
    stepWorld(world, rng, log, 5);
    expect(world.tick).toBe(2);
  });

  it('emits world.day.start / world.night.start exactly at the day/night boundary', () => {
    const world = freshWorld();
    const rng = createRng(1);
    const log = createEventLog();
    for (let i = 0; i < DAY_TICKS; i++) stepWorld(world, rng, log, 5);
    const dayEvents = log.byTopic('world.day.start');
    const nightEvents = log.byTopic('world.night.start');
    expect(nightEvents.length).toBe(1);
    expect(nightEvents[0].tick).toBe(DAY_TICKS / 2);
    // One full cycle brings us back to tick DAY_TICKS, which is the start of a new day.
    expect(dayEvents.length).toBe(1);
    expect(dayEvents[0].tick).toBe(DAY_TICKS);
  });

  it('sunpatches are active only during the day', () => {
    const world = freshWorld();
    const rng = createRng(1);
    const log = createEventLog();
    // Step to just past the day->night boundary.
    for (let i = 0; i < DAY_TICKS / 2 + 1; i++) stepWorld(world, rng, log, 5);
    expect(isDay(world.tick)).toBe(false);
    for (const sp of world.sunpatches) expect(sp.active).toBe(false);

    // Step through to the next day boundary.
    for (let i = 0; i < DAY_TICKS / 2; i++) stepWorld(world, rng, log, 5);
    expect(isDay(world.tick)).toBe(true);
    for (const sp of world.sunpatches) expect(sp.active).toBe(true);
  });

  it('deadwood fuel regrows over time (never exceeding 1)', () => {
    const world = freshWorld();
    world.deadwood[0].fuel = 0.1;
    const rng = createRng(1);
    const log = createEventLog();
    for (let i = 0; i < 5000; i++) stepWorld(world, rng, log, 5);
    expect(world.deadwood[0].fuel).toBeGreaterThan(0.1);
    expect(world.deadwood[0].fuel).toBeLessThanOrEqual(1);
  });

  it('deadwood already at full fuel does not exceed 1', () => {
    const world = freshWorld();
    world.deadwood[0].fuel = 1;
    const rng = createRng(1);
    const log = createEventLog();
    for (let i = 0; i < 100; i++) stepWorld(world, rng, log, 5);
    expect(world.deadwood[0].fuel).toBe(1);
  });

  it('weather transitions occur a few times per day and each event lasts 30-80 ticks', () => {
    const world = freshWorld(77);
    const rng = createRng(77);
    const log = createEventLog();
    const days = 3;
    for (let i = 0; i < DAY_TICKS * days; i++) stepWorld(world, rng, log, 5);

    const starts = log.byTopic('world.weather.rain_start');
    const ends = log.byTopic('world.weather.rain_end');
    expect(starts.length).toBe(ends.length);
    // "a few per day" over `days` days — sanity bound, not an exact count.
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.length).toBeLessThan(days * 5);

    for (let i = 0; i < starts.length; i++) {
      const duration = ends[i].tick - starts[i].tick;
      expect(duration).toBeGreaterThanOrEqual(30);
      expect(duration).toBeLessThanOrEqual(80);
    }
  });

  it('weather schedule is deterministic for a given seed', () => {
    const w1 = freshWorld(9);
    const w2 = freshWorld(9);
    const log1 = createEventLog();
    const log2 = createEventLog();
    const rng1 = createRng(9);
    const rng2 = createRng(9);
    for (let i = 0; i < DAY_TICKS * 2; i++) {
      stepWorld(w1, rng1, log1, 5);
      stepWorld(w2, rng2, log2, 5);
    }
    expect(log1.serialize()).toBe(log2.serialize());
    expect(w1.weather).toBe(w2.weather);
  });

  it('every emitted event this tick carries the post-increment tick number', () => {
    const world = freshWorld(5);
    const rng = createRng(5);
    const log = createEventLog();
    const before = log.all().length;
    stepWorld(world, rng, log, 5);
    const newEvents = log.all().slice(before);
    for (const e of newEvents) expect(e.tick).toBe(world.tick);
  });
});

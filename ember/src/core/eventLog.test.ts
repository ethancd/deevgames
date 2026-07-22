import { describe, expect, it } from 'vitest';
import { createEventLog } from './eventLog';
import type { SimEvent } from './types';

describe('createEventLog', () => {
  it('append + all(): returns events in append order', () => {
    const log = createEventLog();
    const e1: SimEvent = { tick: 0, topic: 'world.tick', payload: { a: 1 } };
    const e2: SimEvent = { tick: 1, topic: 'body.fuel', payload: { fuel: 0.5 } };
    log.append(e1);
    log.append(e2);
    expect(log.all()).toEqual([e1, e2]);
  });

  it('all() reflects subsequent appends (live view over the log)', () => {
    const log = createEventLog();
    log.append({ tick: 0, topic: 'world.tick', payload: null });
    const before = log.all().length;
    log.append({ tick: 1, topic: 'world.tick', payload: null });
    expect(log.all().length).toBe(before + 1);
  });

  it('byTopic: matches exact topic and dot-nested sub-topics only', () => {
    const log = createEventLog();
    log.append({ tick: 0, topic: 'world.wolf.attack', payload: 1 });
    log.append({ tick: 1, topic: 'world.wolf.patrol', payload: 2 });
    log.append({ tick: 2, topic: 'world.weather', payload: 3 });
    log.append({ tick: 3, topic: 'body.fuel', payload: 4 });
    log.append({ tick: 4, topic: 'worldwide.unrelated', payload: 5 });

    const world = log.byTopic('world');
    expect(world.map((e) => e.topic)).toEqual([
      'world.wolf.attack',
      'world.wolf.patrol',
      'world.weather',
    ]);

    const wolf = log.byTopic('world.wolf');
    expect(wolf.map((e) => e.topic)).toEqual([
      'world.wolf.attack',
      'world.wolf.patrol',
    ]);

    const exact = log.byTopic('body.fuel');
    expect(exact.map((e) => e.payload)).toEqual([4]);
  });

  it('byTopic returns empty array when nothing matches', () => {
    const log = createEventLog();
    log.append({ tick: 0, topic: 'body.fuel', payload: null });
    expect(log.byTopic('skill')).toEqual([]);
  });

  it('serialize(): identical event sequences produce identical output', () => {
    const logA = createEventLog();
    const logB = createEventLog();
    const events: SimEvent[] = [
      { tick: 0, topic: 'world.tick', payload: { weather: 'rain', tick: 0 } },
      { tick: 1, topic: 'body.fuel', payload: { fuel: 0.42, mode: 'EXPLORE' } },
    ];
    for (const e of events) {
      logA.append(e);
      logB.append(e);
    }
    expect(logA.serialize()).toBe(logB.serialize());
  });

  it('serialize(): is stable regardless of payload key insertion order', () => {
    const logA = createEventLog();
    const logB = createEventLog();
    logA.append({
      tick: 5,
      topic: 'body.step',
      payload: { fuel: 0.1, heat: 0.2, mode: 'CONSERVE' },
    });
    logB.append({
      tick: 5,
      topic: 'body.step',
      payload: { mode: 'CONSERVE', heat: 0.2, fuel: 0.1 },
    });
    expect(logA.serialize()).toBe(logB.serialize());
  });

  it('serialize(): differs when event content differs', () => {
    const logA = createEventLog();
    const logB = createEventLog();
    logA.append({ tick: 0, topic: 'world.tick', payload: { a: 1 } });
    logB.append({ tick: 0, topic: 'world.tick', payload: { a: 2 } });
    expect(logA.serialize()).not.toBe(logB.serialize());
  });

  it('serialize(): stable across repeated calls (idempotent)', () => {
    const log = createEventLog();
    log.append({ tick: 0, topic: 'world.tick', payload: { nested: { z: 1, a: 2 } } });
    log.append({ tick: 1, topic: 'skill.done', payload: [3, 2, 1] });
    expect(log.serialize()).toBe(log.serialize());
  });

  it('serialize(): empty log produces empty string', () => {
    const log = createEventLog();
    expect(log.serialize()).toBe('');
  });
});

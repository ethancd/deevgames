import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { createEventLog } from '../core/eventLog';
import { WOLF_STALK_GLOW } from '../core/types';
import type { EventLog, WorldState } from '../core/types';
import { stepWolf } from './wolf';

function openWorld(w = 30, h = 20): WorldState {
  return {
    seed: 1,
    tick: 0,
    width: w,
    height: h,
    tiles: new Array(w * h).fill('grass'),
    denPos: { x: 0, y: 0 },
    deadwood: [],
    sunpatches: [],
    wolf: { pos: { x: 25, y: 15 }, state: 'PATROL', stateTicks: 0 },
    weather: 'clear',
    ember: { pos: { x: 5, y: 5 } },
  };
}

function tick(world: WorldState, log: EventLog, glow: number, rng = createRng(1)): void {
  world.tick += 1;
  stepWolf(world, rng, log, glow);
}

describe('wolf FSM', () => {
  it('stays in PATROL when the ember is bright, even if nearby', () => {
    const world = openWorld();
    world.wolf.pos = { x: 8, y: 5 };
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW + 1);
    expect(world.wolf.state).toBe('PATROL');
  });

  it('stays in PATROL when the ember is dim but out of scent range', () => {
    const world = openWorld();
    world.wolf.pos = { x: 25, y: 15 }; // far away
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW - 1);
    expect(world.wolf.state).toBe('PATROL');
  });

  it('PATROL -> STALK when glow is below threshold and ember is within scent range', () => {
    const world = openWorld();
    world.wolf.pos = { x: 10, y: 5 };
    world.ember.pos = { x: 5, y: 5 }; // distance 5, within ~12
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('STALK');
    expect(log.byTopic('world.wolf.stalk_start').length).toBe(1);
  });

  it('STALK approaches roughly 1 tile per 2 ticks', () => {
    const world = openWorld();
    world.wolf.pos = { x: 15, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'STALK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    const startDist = Math.abs(world.wolf.pos.x - world.ember.pos.x);
    for (let i = 0; i < 6; i++) tick(world, log, WOLF_STALK_GLOW - 0.5);
    const endDist = Math.max(
      Math.abs(world.wolf.pos.x - world.ember.pos.x),
      Math.abs(world.wolf.pos.y - world.ember.pos.y),
    );
    // 6 ticks at "1 step per 2 ticks" => 3 steps closer.
    expect(startDist - endDist).toBe(3);
  });

  it('STALK -> ATTACK when adjacent to the ember', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'STALK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('ATTACK');
    expect(log.byTopic('world.wolf.attack_start').length).toBe(1);
  });

  it('ATTACK emits world.wolf.attack with damage near 0.12 while adjacent and dim', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'ATTACK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW - 0.5);
    const attacks = log.byTopic('world.wolf.attack').filter((e) => e.topic === 'world.wolf.attack');
    expect(attacks.length).toBe(1);
    const payload = attacks[0].payload as { damage: number };
    expect(payload.damage).toBeGreaterThan(0.08);
    expect(payload.damage).toBeLessThan(0.16);
    expect(world.wolf.state).toBe('ATTACK');
  });

  it('ATTACK -> STALK when the ember steps out of adjacency', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 9, y: 5 }; // not adjacent
    world.wolf.state = 'ATTACK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('STALK');
  });

  it('STALK -> FLEE when emberGlow recovers above the stalk threshold', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'STALK';
    world.wolf.stateTicks = 3;
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW + 0.1);
    expect(world.wolf.state).toBe('FLEE');
    expect(world.wolf.stateTicks).toBeGreaterThan(0);
    expect(log.byTopic('world.wolf.flee_start').length).toBe(1);
  });

  it('ATTACK -> FLEE when emberGlow recovers above the stalk threshold', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'ATTACK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    tick(world, log, WOLF_STALK_GLOW + 0.1);
    expect(world.wolf.state).toBe('FLEE');
  });

  it('STALK/ATTACK -> FLEE when a flare reflex event appears in the log this tick', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'ATTACK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    world.tick = 10;
    log.append({ tick: 10, topic: 'reflex.flare', payload: {} });
    stepWolf(world, createRng(1), log, WOLF_STALK_GLOW - 0.5); // glow still low
    expect(world.wolf.state).toBe('FLEE');
  });

  it('does NOT flee from a stale flare event outside the lookback window', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'ATTACK';
    world.wolf.stateTicks = 0;
    const log = createEventLog();
    log.append({ tick: 1, topic: 'reflex.flare', payload: {} });
    world.tick = 50;
    stepWolf(world, createRng(1), log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('ATTACK');
  });

  it('FLEE moves away from the ember and lasts exactly stateTicks ticks, then returns to PATROL', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    world.wolf.state = 'FLEE';
    world.wolf.stateTicks = 3;
    const log = createEventLog();
    const rng = createRng(1);

    const startDist = Math.max(
      Math.abs(world.wolf.pos.x - world.ember.pos.x),
      Math.abs(world.wolf.pos.y - world.ember.pos.y),
    );
    world.tick += 1;
    stepWolf(world, rng, log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('FLEE');
    const afterOneStep = Math.max(
      Math.abs(world.wolf.pos.x - world.ember.pos.x),
      Math.abs(world.wolf.pos.y - world.ember.pos.y),
    );
    expect(afterOneStep).toBeGreaterThanOrEqual(startDist);

    world.tick += 1;
    stepWolf(world, rng, log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('FLEE');

    world.tick += 1;
    stepWolf(world, rng, log, WOLF_STALK_GLOW - 0.5);
    expect(world.wolf.state).toBe('PATROL');
    expect(world.wolf.stateTicks).toBe(0);
    expect(log.byTopic('world.wolf.patrol_resume').length).toBe(1);
  });

  it('wolf FSM transitions are deterministic for identical (seed, sequence) input', () => {
    function run(): { states: string[]; serialized: string } {
      const world = openWorld();
      world.wolf.pos = { x: 15, y: 5 };
      world.ember.pos = { x: 5, y: 5 };
      const log = createEventLog();
      const rng = createRng(123);
      const states: string[] = [];
      for (let i = 0; i < 200; i++) {
        world.tick += 1;
        stepWolf(world, rng, log, WOLF_STALK_GLOW - 0.5);
        states.push(world.wolf.state);
      }
      return { states, serialized: log.serialize() };
    }
    const a = run();
    const b = run();
    expect(a.states).toEqual(b.states);
    expect(a.serialized).toBe(b.serialized);
  });

  it('never mutates world.ember (only reads it)', () => {
    const world = openWorld();
    world.wolf.pos = { x: 6, y: 5 };
    world.ember.pos = { x: 5, y: 5 };
    const log = createEventLog();
    const emberBefore = JSON.stringify(world.ember);
    tick(world, log, WOLF_STALK_GLOW - 0.5);
    expect(JSON.stringify(world.ember)).toBe(emberBefore);
  });
});

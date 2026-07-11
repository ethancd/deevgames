import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { Exertion } from '../core/types';
import { DEFEND_ENTER, DEFEND_EXIT, FATIGUE_DEBT_THRESHOLD } from './constants';
import { createBody, stepBody } from './index';
import { freshLog, makeWorld } from './testUtils';

const idle: Exertion = { effort: 0 };
const moving: Exertion = { effort: 1 };
const resting: Exertion = { effort: 0, resting: true };

describe('createBody', () => {
  it('defaults land inside every viable band, mode EXPLORE, high stability', () => {
    const body = createBody();
    expect(body.mode).toBe('EXPLORE');
    expect(body.stability).toBeGreaterThan(0.9);
    expect(body.debts.fatigue).toBe(0);
    expect(body.fuel).toBeGreaterThan(0);
    expect(body.fuel).toBeLessThanOrEqual(1);
  });

  it('honors overrides and still derives stability from them', () => {
    const body = createBody({ fuel: 0.1, heat: 0.1 });
    expect(body.fuel).toBeCloseTo(0.1);
    expect(body.heat).toBeCloseTo(0.1);
    // both fuel and heat are now well outside their viable bands -> low stability
    expect(body.stability).toBeLessThan(0.9);
  });
});

describe('stepBody fuel dynamics', () => {
  it('idle warm fuel drain empties in ~400 ticks', () => {
    const body = createBody({ fuel: 1 });
    const world = makeWorld({ tick: 0, weather: 'clear' }); // fixed day tick
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 400; i++) stepBody(body, world, idle, rng, log);
    expect(body.fuel).toBeLessThan(0.05);
    expect(body.fuel).toBeGreaterThanOrEqual(0);
  });

  it('sustained full-effort movement empties fuel roughly twice as fast (~200 ticks)', () => {
    const body = createBody({ fuel: 1 });
    const world = makeWorld({ tick: 0, weather: 'clear' });
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) stepBody(body, world, moving, rng, log);
    expect(body.fuel).toBeLessThan(0.05);
  });

  it('cold (night, unsheltered) burns fuel faster than the same idle activity by day', () => {
    const warmBody = createBody({ fuel: 1 });
    const coldBody = createBody({ fuel: 1 });
    const warmWorld = makeWorld({ tick: 0, weather: 'clear' }); // day
    const coldWorld = makeWorld({ tick: 300, weather: 'clear' }); // night (>240)
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      stepBody(warmBody, warmWorld, idle, rng, log);
      stepBody(coldBody, coldWorld, idle, rng, log);
    }
    expect(coldBody.fuel).toBeLessThan(warmBody.fuel);
  });
});

describe('stepBody heat dynamics', () => {
  it('unsheltered night heat leaves the viable band within roughly 120 ticks', () => {
    const body = createBody({ heat: 0.7 });
    const world = makeWorld({ tick: 300, weather: 'clear' }); // fixed night tick
    const log = freshLog();
    const rng = createRng(1);
    let crossedAt = -1;
    for (let i = 0; i < 200 && crossedAt < 0; i++) {
      stepBody(body, world, idle, rng, log);
      const crossed = log
        .all()
        .some((e) => e.topic === 'body.var.crossed' && (e.payload as any).var === 'heat');
      if (crossed) crossedAt = i + 1;
    }
    expect(crossedAt).toBeGreaterThan(60);
    expect(crossedAt).toBeLessThan(180);
  });

  it('shelter recovers heat instead of draining it at night', () => {
    const body = createBody({ heat: 0.5 });
    const world = makeWorld({ tick: 300, weather: 'clear' });
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 20; i++) {
      stepBody(body, world, { effort: 0, sheltered: true }, rng, log);
    }
    expect(body.heat).toBeGreaterThan(0.5);
  });
});

describe('stepBody fatigue + debt', () => {
  it('resting recovers most fatigue within ~60 ticks', () => {
    const body = createBody({ fatigue: 0.8 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 60; i++) stepBody(body, world, resting, rng, log);
    expect(body.fatigue).toBeLessThan(0.15);
  });

  it('debt accrues past the 0.85 threshold and survives one long rest', () => {
    const body = createBody({ fatigue: 0.5 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    // grind fatigue up past the debt threshold and hold it there
    for (let i = 0; i < 400; i++) stepBody(body, world, moving, rng, log);
    expect(body.fatigue).toBeGreaterThan(FATIGUE_DEBT_THRESHOLD - 0.01);
    expect(body.debts.fatigue).toBeGreaterThan(0);

    const debtBeforeRest = body.debts.fatigue;
    // a single "long" rest (matches the ~60-tick full-fatigue-clear window)
    for (let i = 0; i < 60; i++) stepBody(body, world, resting, rng, log);

    // ordinary fatigue recovers, but debt lingers because it recovers
    // FATIGUE_DEBT_RECOVERY_DIVISOR times slower than plain fatigue
    expect(body.debts.fatigue).toBeGreaterThan(0);
    expect(body.debts.fatigue).toBeLessThan(debtBeforeRest);
    // and fatigue cannot rest below the remaining debt floor
    expect(body.fatigue).toBeGreaterThanOrEqual(body.debts.fatigue - 1e-9);
  });

  it('emits a body.debt.accrued event when debt actually increases', () => {
    const body = createBody({ fatigue: 0.9 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    stepBody(body, world, moving, rng, log);
    const debtEvents = log.byTopic('body.debt.accrued');
    expect(debtEvents.length).toBeGreaterThan(0);
  });
});

describe('stepBody damage', () => {
  it('does not repair while active, only while resting, and slowly', () => {
    const body = createBody({ damage: 0.5 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 20; i++) stepBody(body, world, idle, rng, log);
    expect(body.damage).toBeCloseTo(0.5, 5);

    const beforeRest = body.damage;
    for (let i = 0; i < 20; i++) stepBody(body, world, resting, rng, log);
    expect(body.damage).toBeLessThan(beforeRest);
    // "slowly": 20 ticks of repair shouldn't clear much
    expect(body.damage).toBeGreaterThan(beforeRest - 0.1);
  });

  it('applies exertion.damageDelta directly (e.g. a wolf attack)', () => {
    const body = createBody({ damage: 0 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    stepBody(body, world, { effort: 0.9, damageDelta: 0.3 }, rng, log);
    expect(body.damage).toBeCloseTo(0.3, 5);
  });
});

describe('stepBody activation + DEFEND mode hysteresis', () => {
  function stalkingWorld(tick: number) {
    return makeWorld({ tick, wolf: { pos: { x: 0, y: 0 }, state: 'STALK', stateTicks: 1 } });
  }
  function calmWorld(tick: number) {
    return makeWorld({ tick, wolf: { pos: { x: 0, y: 0 }, state: 'PATROL', stateTicks: 1 } });
  }

  it('spikes toward ~0.9 within a few ticks of a STALK/ATTACK event, decays with hysteresis afterward', () => {
    const body = createBody({ activation: 0 });
    const log = freshLog();
    const rng = createRng(1);
    let tick = 0;
    for (let i = 0; i < 3; i++, tick++) stepBody(body, stalkingWorld(tick), idle, rng, log);
    expect(body.activation).toBeGreaterThan(0.85);

    // threat gone: activation should now decay tick over tick
    const afterSpike = body.activation;
    stepBody(body, calmWorld(tick), idle, rng, log);
    expect(body.activation).toBeLessThan(afterSpike);
  });

  it('enters DEFEND at a higher activation (rising) than it exits at (falling)', () => {
    const body = createBody({ activation: 0 });
    const log = freshLog();
    const rng = createRng(1);
    let tick = 0;
    let enteredAtActivation = -1;
    // rising path: repeated threat spikes until DEFEND triggers
    while (body.mode !== 'DEFEND' && tick < 20) {
      stepBody(body, stalkingWorld(tick), idle, rng, log);
      tick++;
    }
    expect(body.mode).toBe('DEFEND');
    enteredAtActivation = body.activation;
    expect(enteredAtActivation).toBeGreaterThanOrEqual(DEFEND_ENTER);

    // falling path: no more threat, let activation decay tick by tick and
    // record the activation value at the moment DEFEND is finally exited.
    let exitedAtActivation = -1;
    for (let i = 0; i < 400 && body.mode === 'DEFEND'; i++, tick++) {
      stepBody(body, calmWorld(tick), idle, rng, log);
      if (body.mode !== 'DEFEND') exitedAtActivation = body.activation;
    }
    expect(body.mode).not.toBe('DEFEND');
    expect(exitedAtActivation).toBeGreaterThanOrEqual(0);
    expect(exitedAtActivation).toBeLessThan(DEFEND_EXIT + 1e-6);
    // the core hysteresis claim: exit happens at a strictly lower
    // activation than the rising path needed to enter.
    expect(exitedAtActivation).toBeLessThan(enteredAtActivation);
    expect(DEFEND_EXIT).toBeLessThan(DEFEND_ENTER);
  });

  it('emits body.mode.entered on every mode transition', () => {
    const body = createBody({ activation: 0 });
    const log = freshLog();
    const rng = createRng(1);
    let tick = 0;
    while (body.mode !== 'DEFEND' && tick < 20) {
      stepBody(body, stalkingWorld(tick), idle, rng, log);
      tick++;
    }
    const modeEvents = log.byTopic('body.mode.entered');
    expect(modeEvents.length).toBeGreaterThan(0);
    expect((modeEvents[modeEvents.length - 1].payload as any).mode).toBe('DEFEND');
  });
});

describe('stepBody CONSERVE mode', () => {
  it('enters CONSERVE when fuel is deviant and exits once fuel recovers past the exit threshold', () => {
    const body = createBody({ fuel: 0.5 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    for (let i = 0; i < 300 && body.mode !== 'CONSERVE'; i++) stepBody(body, world, idle, rng, log);
    expect(body.mode).toBe('CONSERVE');

    for (let i = 0; i < 50; i++) {
      stepBody(body, world, { effort: 0, fuelDelta: 0.05 }, rng, log);
    }
    expect(body.mode).not.toBe('CONSERVE');
  });
});

describe('determinism', () => {
  it('same inputs + seed produce byte-identical event logs', () => {
    function run() {
      const body = createBody({ fuel: 0.4, fatigue: 0.7, activation: 0.2 });
      const world = makeWorld({ tick: 250 });
      const log = freshLog();
      const rng = createRng(42);
      for (let i = 0; i < 100; i++) {
        world.tick = 250 + i;
        stepBody(body, world, { effort: i % 3 === 0 ? 0.9 : 0.2 }, rng, log);
      }
      return { body, serialized: log.serialize() };
    }
    const a = run();
    const b = run();
    expect(a.serialized).toBe(b.serialized);
    expect(a.body).toEqual(b.body);
  });
});

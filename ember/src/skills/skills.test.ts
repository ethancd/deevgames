import { describe, expect, it } from 'vitest';
import type { SkillCtx, SkillName, SkillTickResult, Vec } from '../core/types';
import {
  CONSUME_TICKS,
  FLEE_DURATION,
  FOCUS_DURATION,
  GATHER_TICKS,
  WAIT_DURATION,
} from './constants';
import { SKILLS } from './skills';
import { freshLog, makeBody, makeCtx, makeDeadwood, makeSunpatch, makeWorld } from './testUtils';

function runUntilTerminal(
  ctx: SkillCtx,
  exec: { tick(ctx: SkillCtx): SkillTickResult },
  maxTicks = 50,
): SkillTickResult[] {
  const results: SkillTickResult[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const r = exec.tick(ctx);
    results.push(r);
    if (r.status !== 'running') break;
  }
  return results;
}

describe('move_to', () => {
  it('happy path: walks to an adjacent-reachable dest and reports done, direct style effort 0.6', () => {
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } } });
    const ctx = makeCtx({ world });
    const dest: Vec = { x: 5, y: 7 };
    expect(SKILLS.move_to.precondition({ dest, style: 'direct' }, ctx)).toBe(true);
    const exec = SKILLS.move_to.start({ dest, style: 'direct' }, ctx);

    let steps = 0;
    let last: SkillTickResult | null = null;
    for (let i = 0; i < 20; i++) {
      const r = exec.tick(ctx);
      last = r;
      if (r.moveTo) {
        world.ember.pos = r.moveTo; // simulate the engine applying moveTo
        steps++;
        expect(r.exertion.effort).toBeCloseTo(0.6);
      }
      if (r.status !== 'running') break;
    }
    expect(last?.status).toBe('done');
    expect(steps).toBeGreaterThan(0);
    expect(world.ember.pos).toEqual(dest);
  });

  it('cautious style uses effort 0.4', () => {
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } } });
    const ctx = makeCtx({ world });
    const dest: Vec = { x: 5, y: 6 };
    const exec = SKILLS.move_to.start({ dest, style: 'cautious' }, ctx);
    const r = exec.tick(ctx);
    expect(r.exertion.effort).toBeCloseTo(0.4);
  });

  it('precondition fails on an impassable destination', () => {
    const world = makeWorld({
      tileOverrides: [{ pos: { x: 5, y: 6 }, tile: 'rock' }],
    });
    const ctx = makeCtx({ world });
    const result = SKILLS.move_to.precondition({ dest: { x: 5, y: 6 } }, ctx);
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/not passable/);
  });

  it('precondition fails on missing/mistyped params', () => {
    const ctx = makeCtx();
    expect(SKILLS.move_to.precondition({}, ctx)).not.toBe(true);
    expect(SKILLS.move_to.precondition({ dest: 'nope' }, ctx)).not.toBe(true);
    expect(SKILLS.move_to.precondition({ dest: { x: Number.NaN, y: 1 } }, ctx)).not.toBe(true);
  });
});

describe('gather', () => {
  it('happy path: adjacent deadwood with fuel accumulates an internal buffer and completes without mutating world', () => {
    const dw = makeDeadwood({ id: 'dw-1', pos: { x: 5, y: 6 }, fuel: 0.5 });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, deadwood: [dw] });
    const log = freshLog();
    const ctx = makeCtx({ world, log, tick: 0 });
    expect(SKILLS.gather.precondition({ target: 'dw-1' }, ctx)).toBe(true);

    const exec = SKILLS.gather.start({ target: 'dw-1' }, ctx);
    const results = runUntilTerminal(ctx, exec, GATHER_TICKS + 2);
    expect(results.length).toBe(GATHER_TICKS);
    expect(results.at(-1)?.status).toBe('done');
    for (const r of results) expect(r.exertion.fuelDelta ?? 0).toBe(0);

    // Audited rule: gather never mutates world state.
    expect(dw.fuel).toBe(0.5);
    expect(log.byTopic('skill.gather.complete').length).toBe(1);
  });

  it('precondition fails when the target deadwood is depleted', () => {
    const dw = makeDeadwood({ id: 'dw-1', pos: { x: 5, y: 6 }, fuel: 0 });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, deadwood: [dw] });
    const ctx = makeCtx({ world });
    const result = SKILLS.gather.precondition({ target: 'dw-1' }, ctx);
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/no fuel left/);
  });

  it('precondition fails when stability is too low', () => {
    const dw = makeDeadwood({ id: 'dw-1', pos: { x: 5, y: 6 }, fuel: 0.5 });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, deadwood: [dw] });
    const body = makeBody({ fuel: 0.01, heat: 0.01, damage: 0.9, fatigue: 0.95, activation: 0.9 });
    const ctx = makeCtx({ world, body });
    expect(body.stability).toBeLessThan(0.15);
    const result = SKILLS.gather.precondition({ target: 'dw-1' }, ctx);
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/stability too low/);
  });
});

describe('consume', () => {
  it('happy path: adjacent active sunpatch applies a positive fuelDelta each tick', () => {
    const sp = makeSunpatch({ id: 'sp-1', pos: { x: 5, y: 6 }, active: true });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, sunpatches: [sp] });
    const log = freshLog();
    const ctx = makeCtx({ world, log, tick: 0 });
    expect(SKILLS.consume.precondition({ item: 'sp-1' }, ctx)).toBe(true);

    const exec = SKILLS.consume.start({ item: 'sp-1' }, ctx);
    const results = runUntilTerminal(ctx, exec, CONSUME_TICKS + 2);
    expect(results.length).toBe(CONSUME_TICKS);
    for (const r of results) expect(r.exertion.fuelDelta ?? 0).toBeGreaterThan(0);
    expect(results.at(-1)?.status).toBe('done');
    expect(sp.active).toBe(true); // never mutated
    expect(log.byTopic('skill.consume.complete').length).toBe(1);
  });

  it('precondition fails when the sunpatch is inactive (night)', () => {
    const sp = makeSunpatch({ id: 'sp-1', pos: { x: 5, y: 6 }, active: false });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, sunpatches: [sp] });
    const ctx = makeCtx({ world });
    const result = SKILLS.consume.precondition({ item: 'sp-1' }, ctx);
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/inactive/);
  });

  it('precondition fails when the item is not adjacent', () => {
    const sp = makeSunpatch({ id: 'sp-1', pos: { x: 9, y: 9 }, active: true });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, sunpatches: [sp] });
    const ctx = makeCtx({ world });
    const result = SKILLS.consume.precondition({ item: 'sp-1' }, ctx);
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/not adjacent/);
  });
});

describe('rest', () => {
  it('happy path: resting=true, effort 0, done after `duration` ticks', () => {
    const ctx = makeCtx();
    expect(SKILLS.rest.precondition({ duration: 3 }, ctx)).toBe(true);
    const exec = SKILLS.rest.start({ duration: 3 }, ctx);
    const results = runUntilTerminal(ctx, exec, 10);
    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.exertion.effort).toBe(0);
      expect(r.exertion.resting).toBe(true);
    }
    expect(results.at(-1)?.status).toBe('done');
  });

  it('precondition fails on non-positive or NaN duration', () => {
    const ctx = makeCtx();
    expect(SKILLS.rest.precondition({ duration: 0 }, ctx)).not.toBe(true);
    expect(SKILLS.rest.precondition({ duration: -5 }, ctx)).not.toBe(true);
    expect(SKILLS.rest.precondition({ duration: Number.NaN }, ctx)).not.toBe(true);
    expect(SKILLS.rest.precondition({}, ctx)).not.toBe(true);
  });
});

describe('shelter', () => {
  it('happy path: pathfinds to the den, then rests sheltered', () => {
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, denPos: { x: 5, y: 3 } });
    const ctx = makeCtx({ world });
    expect(SKILLS.shelter.precondition({}, ctx)).toBe(true);
    const exec = SKILLS.shelter.start({}, ctx);

    let sheltered = false;
    for (let i = 0; i < 20 && !sheltered; i++) {
      const r = exec.tick(ctx);
      expect(r.status).toBe('running');
      if (r.moveTo) world.ember.pos = r.moveTo;
      if (r.exertion.sheltered) sheltered = true;
    }
    expect(sheltered).toBe(true);
    expect(world.ember.pos).toEqual(world.denPos);
  });

  it('precondition fails when the den is unreachable', () => {
    const width = 6;
    const height = 6;
    const tileOverrides = [];
    // Wall off row y=3 entirely so the den (below the wall) is unreachable.
    for (let x = 0; x < width; x++) tileOverrides.push({ pos: { x, y: 3 }, tile: 'rock' as const });
    const world = makeWorld({
      width,
      height,
      ember: { pos: { x: 2, y: 1 } },
      denPos: { x: 2, y: 5 },
      tileOverrides,
    });
    const ctx = makeCtx({ world });
    const result = SKILLS.shelter.precondition({}, ctx);
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/no path to the den/);
  });
});

describe('flee', () => {
  it('happy path: moves away from `from` at effort 0.9 and eventually completes', () => {
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, width: 20, height: 20 });
    const ctx = makeCtx({ world });
    const from: Vec = { x: 4, y: 5 };
    expect(SKILLS.flee.precondition({ from }, ctx)).toBe(true);
    const exec = SKILLS.flee.start({ from }, ctx);

    let moved = false;
    let last: SkillTickResult | null = null;
    for (let i = 0; i < FLEE_DURATION + 2; i++) {
      const r = exec.tick(ctx);
      last = r;
      if (r.moveTo) {
        world.ember.pos = r.moveTo;
        moved = true;
        expect(r.exertion.effort).toBeCloseTo(0.9);
      }
      if (r.status === 'done') break;
    }
    expect(moved).toBe(true);
    expect(last?.status).toBe('done');
    // Fled in the +x direction, away from `from`.
    expect(world.ember.pos.x).toBeGreaterThan(5);
  });

  it('precondition fails on a missing/mistyped `from`', () => {
    const ctx = makeCtx();
    expect(SKILLS.flee.precondition({}, ctx)).not.toBe(true);
    expect(SKILLS.flee.precondition({ from: 'wolf' }, ctx)).not.toBe(true);
  });
});

describe('focus', () => {
  it('happy path: idles at effort 0.1 for FOCUS_DURATION ticks then completes', () => {
    const ctx = makeCtx();
    expect(SKILLS.focus.precondition({ region: 'fuel' }, ctx)).toBe(true);
    const exec = SKILLS.focus.start({ region: 'fuel' }, ctx);
    const results = runUntilTerminal(ctx, exec, FOCUS_DURATION + 2);
    expect(results.length).toBe(FOCUS_DURATION);
    for (const r of results) expect(r.exertion.effort).toBeCloseTo(0.1);
    expect(results.at(-1)?.status).toBe('done');
  });

  it('precondition fails on an unknown region', () => {
    const ctx = makeCtx();
    expect(SKILLS.focus.precondition({ region: 'stability' }, ctx)).not.toBe(true);
    expect(SKILLS.focus.precondition({ region: 'mood' }, ctx)).not.toBe(true);
    expect(SKILLS.focus.precondition({}, ctx)).not.toBe(true);
  });
});

describe('wait', () => {
  it('happy path: effort 0 for a fixed short duration then completes', () => {
    const ctx = makeCtx();
    expect(SKILLS.wait.precondition({}, ctx)).toBe(true);
    const exec = SKILLS.wait.start({}, ctx);
    const results = runUntilTerminal(ctx, exec, WAIT_DURATION + 2);
    expect(results.length).toBe(WAIT_DURATION);
    for (const r of results) expect(r.exertion.effort).toBe(0);
    expect(results.at(-1)?.status).toBe('done');
  });

  it('precondition fails when `flare` is present but not boolean', () => {
    const ctx = makeCtx();
    const result = SKILLS.wait.precondition({ flare: 'yes' }, ctx);
    expect(result).not.toBe(true);
  });

  it('the flare-flagged variant (reflex carrier) is a single-tick fuel burst', () => {
    const ctx = makeCtx();
    const exec = SKILLS.wait.start({ flare: true }, ctx);
    const r = exec.tick(ctx);
    expect(r.status).toBe('done');
    expect(r.exertion.effort).toBe(1);
    expect(r.exertion.fuelDelta).toBeLessThan(0);
  });
});

// --------------------------------------------------------- mode consequences
//
// Permanent regression test for a fixed audit finding: mode consequences
// were decorative except for perceptionRadius — no SkillDef's estCost() or
// precondition() ever read ctx.body.mode, so DEFEND and EXPLORE produced
// byte-identical cost estimates. Every estCost() now scales by
// MODE_COST_MULT (src/skills/constants.ts), so at least one (in practice,
// every) skill's forecast genuinely differs by mode.

describe('mode-conditioned action costs (PLAN §2/§3)', () => {
  const REPRESENTATIVE_PARAMS: Record<SkillName, Record<string, unknown>> = {
    move_to: { dest: { x: 5, y: 8 }, style: 'direct' },
    gather: { target: 'dw-1' },
    consume: { item: 'dw-1' },
    rest: { duration: 20 },
    shelter: {},
    flee: { from: { x: 4, y: 5 } },
    focus: { region: 'fuel' },
    wait: {},
  };

  it('estCost() differs between DEFEND and EXPLORE for at least one skill (was: zero mismatches)', () => {
    const dw = makeDeadwood({ id: 'dw-1', pos: { x: 5, y: 6 }, fuel: 0.5 });
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } }, deadwood: [dw] });
    const log = freshLog();
    const rng = makeCtx().rng;

    const exploreBody = makeBody({
      fuel: 0.6,
      heat: 0.6,
      damage: 0.1,
      fatigue: 0.2,
      activation: 0.5,
      mode: 'EXPLORE',
    });
    const defendBody = { ...exploreBody, mode: 'DEFEND' as const };

    const exploreCtx: SkillCtx = { world, body: exploreBody, rng, log, tick: 0 };
    const defendCtx: SkillCtx = { world, body: defendBody, rng, log, tick: 0 };

    let mismatches = 0;
    for (const name of Object.keys(SKILLS) as SkillName[]) {
      const def = SKILLS[name];
      const params = REPRESENTATIVE_PARAMS[name];
      const exploreCost = JSON.stringify(def.estCost(params, exploreCtx));
      const defendCost = JSON.stringify(def.estCost(params, defendCtx));
      if (exploreCost !== defendCost) mismatches++;
    }
    expect(mismatches).toBeGreaterThan(0);
  });

  it('move_to costs strictly more fatigue/fuel in DEFEND than EXPLORE for an identical path', () => {
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } } });
    const ctx = makeCtx({ world });
    const params = { dest: { x: 5, y: 8 }, style: 'direct' as const };

    const exploreCost = SKILLS.move_to.estCost(params, {
      ...ctx,
      body: { ...ctx.body, mode: 'EXPLORE' },
    });
    const defendCost = SKILLS.move_to.estCost(params, {
      ...ctx,
      body: { ...ctx.body, mode: 'DEFEND' },
    });

    expect(Math.abs(defendCost.fatigue ?? 0)).toBeGreaterThan(Math.abs(exploreCost.fatigue ?? 0));
    expect(Math.abs(defendCost.fuel ?? 0)).toBeGreaterThan(Math.abs(exploreCost.fuel ?? 0));
  });
});

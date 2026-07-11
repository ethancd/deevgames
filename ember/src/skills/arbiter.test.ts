import { describe, expect, it } from 'vitest';
import type { Intent } from '../core/types';
import { validateIntent } from './arbiter';
import { makeCtx, makeDeadwood, makeWorld } from './testUtils';

describe('validateIntent', () => {
  it('accepts a well-formed, feasible intent and returns its SkillDef', () => {
    const ctx = makeCtx();
    const intent: Intent = {
      goal: 'idle a moment',
      skill: 'wait',
      params: {},
      interruptConditions: [],
    };
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.def.name).toBe('wait');
  });

  it('rejects an unknown skill name', () => {
    const ctx = makeCtx();
    const intent = {
      goal: 'do the impossible',
      skill: 'teleport',
      params: {},
      interruptConditions: [],
    } as unknown as Intent;
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown skill/);
  });

  it('rejects missing params', () => {
    const ctx = makeCtx();
    const intent = {
      goal: 'go somewhere',
      skill: 'move_to',
      interruptConditions: [],
    } as unknown as Intent;
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/params must be an object/);
  });

  it('rejects mistyped params (params is an array, not an object)', () => {
    const ctx = makeCtx();
    const intent = {
      goal: 'go somewhere',
      skill: 'move_to',
      params: [1, 2, 3],
      interruptConditions: [],
    } as unknown as Intent;
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(false);
  });

  it('rejects NaN/out-of-range numeric params (rest duration)', () => {
    const ctx = makeCtx();
    const intent: Intent = {
      goal: 'sleep it off',
      skill: 'rest',
      params: { duration: Number.NaN },
      interruptConditions: [],
    };
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/finite number/);
  });

  it('rejects a convincing-but-impossible intent: gather from a real deadwood id that is out of reach', () => {
    const dw = makeDeadwood({ id: 'dw-far', pos: { x: 9, y: 9 }, fuel: 0.8 });
    const world = makeWorld({ ember: { pos: { x: 0, y: 0 } }, deadwood: [dw] });
    const ctx = makeCtx({ world });
    // The pilot names a real target that genuinely exists in the world (not
    // a hallucinated id) — but it is nowhere near the ember, so this must
    // still be rejected on precondition, not accepted "by description".
    const intent: Intent = {
      goal: 'gather the deadwood I can see on the horizon',
      skill: 'gather',
      params: { target: 'dw-far' },
      interruptConditions: [],
    };
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not adjacent/);
  });

  it('rejects a convincing-but-impossible intent: move_to a destination behind rock', () => {
    const world = makeWorld({
      ember: { pos: { x: 5, y: 5 } },
      tileOverrides: [{ pos: { x: 5, y: 6 }, tile: 'rock' }],
    });
    const ctx = makeCtx({ world });
    const intent: Intent = {
      goal: 'step onto the outcrop',
      skill: 'move_to',
      params: { dest: { x: 5, y: 6 } },
      interruptConditions: [],
    };
    const result = validateIntent(intent, ctx);
    expect(result.ok).toBe(false);
  });
});

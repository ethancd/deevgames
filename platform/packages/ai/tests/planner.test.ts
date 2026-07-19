import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@deev/core';
import type { GameDef, Seat } from '@deev/core';
import { beamSearchPlans, mergePlans } from '../src/planner.ts';
import type { Plan, TacticalTemplate } from '../src/planner.ts';

interface CounterState {
  pos: number;
  toMove: Seat;
}
type CounterAction = 'inc' | 'end';

const counterDef: GameDef<CounterState, CounterAction, unknown, CounterState> = {
  id: 'fixture-counter',
  version: '1.0.0',
  init: () => ({ pos: 0, toMove: 'A' }),
  seats: () => ['A', 'B'],
  toAct: (s) => [s.toMove],
  legal: () => ['inc', 'end'],
  apply: (s, a) =>
    a === 'inc' ? { pos: s.pos + 1, toMove: s.toMove } : { pos: s.pos, toMove: s.toMove === 'A' ? 'B' : 'A' },
  terminal: () => null,
};

const identityKey = (a: CounterAction) => a;

describe('beamSearchPlans', () => {
  it('extends plans action-by-action while toAct(end) stays [seat] and steps < maxSteps', () => {
    const root = counterDef.init(undefined, mulberry32(1));
    const plans = beamSearchPlans(counterDef, {
      state: root,
      seat: 'A',
      rng: mulberry32(1),
      beamWidth: 2,
      outputPlans: 10,
      maxSteps: () => 3,
      scorePlan: (_plan, _root, end) => end.pos,
      actionKey: identityKey,
    });

    expect(plans[0].actions).toEqual(['inc', 'inc', 'inc']);
    expect(plans[0].score).toBe(3);
    expect(plans[0].id).toBe('inc>inc>inc');
  });

  it('stops extending a branch once toAct cedes the turn, keeping it as a finished candidate', () => {
    const root = counterDef.init(undefined, mulberry32(1));
    const plans = beamSearchPlans(counterDef, {
      state: root,
      seat: 'A',
      rng: mulberry32(1),
      beamWidth: 2,
      outputPlans: 10,
      maxSteps: () => 3,
      scorePlan: (_plan, _root, end) => end.pos,
      actionKey: identityKey,
    });

    const ids = plans.map((p) => p.id);
    expect(ids).toContain('end'); // the immediately-ceding plan survives as finished
    expect(ids).toContain('inc>end');
  });

  it('keeps only the top beamWidth candidates at each depth', () => {
    const root = counterDef.init(undefined, mulberry32(1));
    // beamWidth 1: only the single best partial plan survives each round —
    // 'inc' strictly dominates 'end' in score at every depth here, so the
    // all-inc chain should still be found even with no exploration slack.
    const plans = beamSearchPlans(counterDef, {
      state: root,
      seat: 'A',
      rng: mulberry32(1),
      beamWidth: 1,
      outputPlans: 10,
      maxSteps: () => 3,
      scorePlan: (_plan, _root, end) => end.pos,
      actionKey: identityKey,
    });
    expect(plans[0].actions).toEqual(['inc', 'inc', 'inc']);
  });

  it('includes forced plans from templates, deduped against searched plans', () => {
    const root = counterDef.init(undefined, mulberry32(1));
    const forcedTemplate: TacticalTemplate<CounterState, CounterAction> = {
      name: 'always-suggest-end',
      detect: () => true,
      generate: () => [{ id: 'end', actions: ['end'], score: 999, tags: ['forced'] }],
    };
    const plans = beamSearchPlans(counterDef, {
      state: root,
      seat: 'A',
      rng: mulberry32(1),
      beamWidth: 2,
      outputPlans: 10,
      maxSteps: () => 3,
      scorePlan: (_plan, _root, end) => end.pos,
      actionKey: identityKey,
      templates: [forcedTemplate],
    });
    // The forced 'end' plan (score 999, tag 'forced') wins the dedupe against
    // the searched 'end' plan (score 0) since forced entries are added first.
    const endPlan = plans.find((p) => p.id === 'end');
    expect(endPlan?.score).toBe(999);
    expect(endPlan?.tags).toEqual(['forced']);
  });
});

describe('mergePlans', () => {
  it('dedupes by id keeping forced first, sorts by score desc, and caps at limit', () => {
    const forced: Plan<string>[] = [{ id: 'a', actions: ['a'], score: 1, tags: [] }];
    const searched: Plan<string>[] = [
      { id: 'a', actions: ['a'], score: 5, tags: [] }, // shadowed by forced
      { id: 'b', actions: ['b'], score: 10, tags: [] },
      { id: 'c', actions: ['c'], score: 3, tags: [] },
    ];
    const merged = mergePlans(forced, searched, 10);
    expect(merged.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(merged.find((p) => p.id === 'a')?.score).toBe(1); // forced value kept, not 5
  });

  it('caps at limit', () => {
    const searched: Plan<string>[] = [
      { id: 'a', actions: ['a'], score: 1, tags: [] },
      { id: 'b', actions: ['b'], score: 2, tags: [] },
      { id: 'c', actions: ['c'], score: 3, tags: [] },
    ];
    const merged = mergePlans([], searched, 2);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.id)).toEqual(['c', 'b']);
  });
});

// @vitest-environment node
/**
 * `boundStage2` and the lazy driver (DESIGN §5.12.4, F15).
 *
 * The gate (`lab/hard-ai/bench/run.ts --eval`) measures zero window violations
 * over 100,000 positions × 20 windows. This file pins the two properties that
 * sweep is checking for, directly and on a smaller sample, so a regression is
 * attributable:
 *
 *   1. SOUNDNESS. `boundStage2(p, t, w) >= |stage2(p)|` — the bound really does
 *      dominate the sum of the stage-2 terms it is standing in for. This is the
 *      property the two early exits rest on; if it fails, every conclusion the
 *      search draws from a lazy exit is unsound.
 *   2. AGREEMENT. `evaluate` lands on the same side of every window as `full`,
 *      and returns `full`'s exact value whenever it does not take an exit.
 */
import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../../src/ai/runtime';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { boundStage2 } from '../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS, cloneWeights } from '../../../src/ai/hard/eval/weights';
import { Evaluator, NULL_METER, WORK_CLASS_EVAL1, WORK_CLASS_EVAL2 } from '../../../src/ai/hard/eval/evaluate';
import { buildState, randomState, type StateSpec } from './game-fixture';

// E0.5 timeout budget: slowest test 0.3 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const SC = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const WHITE: Side = 0;

const SPEC: StateSpec = {
  units: [
    { def: 'water_1', owner: 'white', x: 2, y: 2 },
    { def: 'metal_1', owner: 'white', x: 1, y: 3 },
    { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
    { def: 'plant_1', owner: 'black', x: 7, y: 8 },
  ],
  white: 8,
  black: 2,
  current: 'black',
  phase: 'place',
};

function sample(count: number): PackedState[] {
  const rng = seededRandom(90125);
  const out: PackedState[] = [replica.pack(buildState(SPEC))];
  while (out.length < count) {
    const state = randomState(rng, 4 + Math.floor(rng() * 12), { current: 'black', phase: 'place' });
    try {
      out.push(replica.pack(state));
    } catch {
      // not every random board packs
    }
  }
  return out;
}

describe('boundStage2 is a certified bound on the stage-2 terms', () => {
  it('dominates |stage2| on 300 positions, for the default and for a stretched weight vector', () => {
    const stretched = cloneWeights(DEFAULT_WEIGHTS);
    for (let i = 0; i < stretched.w.length; i++) stretched.w[i] *= 3;

    for (const weights of [DEFAULT_WEIGHTS, stretched]) {
      const ev = new Evaluator(replica, weights);
      for (const p of sample(300)) {
        ev.stage0(p, WHITE);
        ev.stage1(p, WHITE, SC, 0);
        const bound = boundStage2(p, ev.lastTables, weights);
        const stage2 = ev.stage2(p, WHITE, SC, 0);
        expect(Number.isInteger(bound)).toBe(true);
        expect(bound).toBeGreaterThanOrEqual(0);
        expect(Math.abs(stage2)).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('is symmetric in root: the same bound serves both seats', () => {
    const ev = new Evaluator(replica);
    for (const p of sample(50)) {
      ev.stage1(p, WHITE, SC, 0);
      const a = boundStage2(p, ev.lastTables, DEFAULT_WEIGHTS);
      ev.stage1(p, 1, SC, 0);
      const b = boundStage2(p, ev.lastTables, DEFAULT_WEIGHTS);
      expect(a).toBe(b);
    }
  });

  it('collapses to zero when every stage-2 weight is zero', () => {
    const zeroed = cloneWeights(DEFAULT_WEIGHTS);
    for (let i = 23; i < zeroed.w.length; i++) zeroed.w[i] = 0;
    const ev = new Evaluator(replica, zeroed);
    const p = replica.pack(buildState(SPEC));
    ev.stage1(p, WHITE, SC, 0);
    expect(boundStage2(p, ev.lastTables, zeroed)).toBe(0);
    expect(ev.stage2(p, WHITE, SC, 0)).toBe(0);
  });
});

describe('Evaluator.evaluate: the lazy driver', () => {
  it('returns full() exactly when the window straddles the score', () => {
    const ev = new Evaluator(replica);
    for (const p of sample(100)) {
      const truth = ev.full(p, WHITE, SC, 0);
      expect(ev.evaluate(p, WHITE, truth - 1_000_000, truth + 1_000_000, SC, 0, NULL_METER)).toBe(truth);
    }
  });

  it('never lands on the wrong side of a window (300 positions × 12 windows)', () => {
    const ev = new Evaluator(replica);
    const rng = seededRandom(31337);
    const scales = [1_500, 12_000, 120_000];
    for (const p of sample(300)) {
      const truth = ev.full(p, WHITE, SC, 0);
      for (let k = 0; k < 12; k++) {
        const scale = scales[k % scales.length];
        const centre = truth + Math.round((rng() * 2 - 1) * scale);
        const half = Math.round(rng() * 3000);
        const alpha = centre - half;
        const beta = centre + half + 1;
        const got = ev.evaluate(p, WHITE, alpha, beta, SC, 0, NULL_METER);
        const sideGot = got <= alpha ? -1 : got >= beta ? 1 : 0;
        const sideTruth = truth <= alpha ? -1 : truth >= beta ? 1 : 0;
        expect(sideGot).toBe(sideTruth);
      }
    }
  });

  it('takes the fail-high and fail-low exits when the bound certifies them', () => {
    const ev = new Evaluator(replica);
    const p = replica.pack(buildState(SPEC));
    const truth = ev.full(p, WHITE, SC, 0);
    ev.stage0(p, WHITE);
    ev.stage1(p, WHITE, SC, 0);
    const bound = boundStage2(p, ev.lastTables, DEFAULT_WEIGHTS);

    const high = ev.evaluate(p, WHITE, truth - 10 * bound - 2, truth - 2 * bound - 1, SC, 0, NULL_METER);
    expect(high).toBeGreaterThanOrEqual(truth - 2 * bound - 1);
    expect(high).not.toBe(truth);

    const low = ev.evaluate(p, WHITE, truth + 2 * bound + 1, truth + 10 * bound + 2, SC, 0, NULL_METER);
    expect(low).toBeLessThanOrEqual(truth + 2 * bound + 1);
    expect(low).not.toBe(truth);
  });

  it('charges EVAL1 on every call and EVAL2 only when stage 2 runs', () => {
    const ev = new Evaluator(replica);
    const p = replica.pack(buildState(SPEC));
    const spent: number[] = [];
    const meter = { spend: (cls: number): void => void spent.push(cls) };

    const truth = ev.full(p, WHITE, SC, 0);
    ev.stage1(p, WHITE, SC, 0);
    const bound = boundStage2(p, ev.lastTables, DEFAULT_WEIGHTS);

    spent.length = 0;
    ev.evaluate(p, WHITE, truth - 1_000_000, truth + 1_000_000, SC, 0, meter);
    expect(spent).toEqual([WORK_CLASS_EVAL1, WORK_CLASS_EVAL2]);

    spent.length = 0;
    ev.evaluate(p, WHITE, truth - 10 * bound - 2, truth - 2 * bound - 1, SC, 0, meter);
    expect(spent).toEqual([WORK_CLASS_EVAL1]);
  });
});

// @vitest-environment node
/**
 * Full-evaluation contract for the Phasing accounting bootstrap.
 *
 * A finite bound for pending escrow, delayed service and chronological release
 * has not been certified. boundStage2 deliberately returns +Infinity, and no
 * alpha/beta window may omit the real stage2 result or its diagnostic failures.
 * These seeded in-memory positions retain the earlier broad arithmetic sweep;
 * they are not historical corpus data or a throughput/strength claim.
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

describe('boundStage2 explicitly withholds an unproved finite certificate', () => {
  it('keeps full stage2 finite and linear over 300 positions with default and stretched weights', () => {
    const stretched = cloneWeights(DEFAULT_WEIGHTS);
    for (let i = 0; i < stretched.w.length; i++) stretched.w[i] *= 3;

    const reference: number[] = [];
    for (const weights of [DEFAULT_WEIGHTS, stretched]) {
      let index = 0;
      const ev = new Evaluator(replica, weights);
      for (const p of sample(300)) {
        ev.stage0(p, WHITE);
        ev.stage1(p, WHITE, SC, 0);
        const bound = boundStage2(p, ev.lastTables, weights);
        const stage2 = ev.stage2(p, WHITE, SC, 0);
        expect(bound).toBe(Number.POSITIVE_INFINITY);
        expect(Number.isFinite(stage2)).toBe(true);
        expect(Number.isInteger(stage2)).toBe(true);
        if (weights === DEFAULT_WEIGHTS) reference.push(stage2);
        else expect(stage2).toBe(3 * reference[index]);
        index++;
      }
      expect(index).toBe(300);
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

  it('computes zero weighted contribution without claiming a finite certificate for the zero vector', () => {
    const zeroed = cloneWeights(DEFAULT_WEIGHTS);
    for (let i = 23; i < zeroed.w.length; i++) zeroed.w[i] = 0;
    const ev = new Evaluator(replica, zeroed);
    const p = replica.pack(buildState(SPEC));
    ev.stage1(p, WHITE, SC, 0);
    expect(boundStage2(p, ev.lastTables, zeroed)).toBe(Number.POSITIVE_INFINITY);
    expect(ev.stage2(p, WHITE, SC, 0)).toBe(0);
  });
});

describe('Evaluator.evaluate: unconditional full evaluation', () => {
  it('returns full() exactly when the window straddles the score', () => {
    const ev = new Evaluator(replica);
    for (const p of sample(100)) {
      const truth = ev.full(p, WHITE, SC, 0);
      expect(ev.evaluate(p, WHITE, truth - 1_000_000, truth + 1_000_000, SC, 0, NULL_METER)).toBe(truth);
    }
  });

  it('equals full and lands on the correct side of every window (300 positions × 12 windows)', () => {
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
        expect(got).toBe(truth);
        const sideGot = got <= alpha ? -1 : got >= beta ? 1 : 0;
        const sideTruth = truth <= alpha ? -1 : truth >= beta ? 1 : 0;
        expect(sideGot).toBe(sideTruth);
      }
    }
  });

  it('computes stage2 even when the finite window is entirely above or below the score', () => {
    const ev = new Evaluator(replica);
    const p = replica.pack(buildState(SPEC));
    const truth = ev.full(p, WHITE, SC, 0);
    const stage2 = vi.spyOn(ev, 'stage2');
    try {
      const high = ev.evaluate(p, WHITE, truth - 1_000_000, truth - 1, SC, 0, NULL_METER);
      expect(high).toBeGreaterThanOrEqual(truth - 1);
      expect(high).toBe(truth);
      const low = ev.evaluate(p, WHITE, truth + 1, truth + 1_000_000, SC, 0, NULL_METER);
      expect(low).toBeLessThanOrEqual(truth + 1);
      expect(low).toBe(truth);
      expect(stage2).toHaveBeenCalledTimes(2);
    } finally { stage2.mockRestore(); }
  });

  it('charges EVAL1 and EVAL2 exactly once per window even with a cached forecast', () => {
    const ev = new Evaluator(replica);
    const p = replica.pack(buildState(SPEC));
    const spent: [number, number][] = [];
    const meter = { spend: (cls: number, n = 1): void => { spent.push([cls, n]); } };
    const truth = ev.full(p, WHITE, SC, 0);
    const forecastCalls = ev.lastTables.economyProverCalls;
    const stage2 = vi.spyOn(ev, 'stage2');
    try {
      for (const [alpha, beta] of [[truth - 1, truth + 1], [truth - 1_000_000, truth - 1], [truth + 1, truth + 1_000_000]]) {
        spent.length = 0;
        expect(ev.evaluate(p, WHITE, alpha, beta, SC, 0, meter)).toBe(truth);
        expect(spent).toEqual([[WORK_CLASS_EVAL1, 1], [WORK_CLASS_EVAL2, 1]]);
        expect(ev.lastTables.economyProverCalls).toBe(forecastCalls);
      }
      expect(stage2).toHaveBeenCalledTimes(3);
    } finally { stage2.mockRestore(); }
  });
});

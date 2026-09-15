// @vitest-environment node
/**
 * Determinism (DESIGN §7.4, §5.11.6, F18).
 *
 * Under a fixed work rung the engine reads no clock at all, has no RNG, and
 * carries nothing from one search into the next — so the same position at the
 * same rung must return the same turn, the same score, the same depth and the
 * same work, from a fresh engine or from a reused one, and whatever else the
 * engine searched first. `lab/hard-ai/verify/determinism.ts` proves the same
 * thing across PROCESSES; this file proves it in one, where a failure is
 * debuggable.
 *
 * `setSeed` is part of the `EngineBot` contract and must be a no-op: a seed
 * that changed the move would make every paired-seed ladder row meaningless.
 */
import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { HardEngine } from '../../../src/ai/hard/engine';
import { WORK_LADDER, WorkMeter, chooseWork, updateProfile } from '../../../src/ai/hard/search/time';
import { buildState } from './game-fixture';

const POSITION = buildState({
  current: 'white',
  phase: 'place',
  actions: 4,
  white: 7,
  black: 6,
  units: [
    { def: 'fire_1', owner: 'white', x: 2, y: 1 },
    { def: 'water_1', owner: 'white', x: 1, y: 3 },
    { def: 'plant_1', owner: 'black', x: 7, y: 8 },
    { def: 'metal_1', owner: 'black', x: 8, y: 6 },
  ],
});

interface Summary {
  endKey: string;
  scoreCc: number;
  depth: number;
  work: number;
  nodes: number;
  actions: string;
}

async function run(engine: HardEngine, work: number, state = POSITION): Promise<Summary> {
  const r = await engine.searchTurn(state, { work });
  return {
    endKey: r.endKey,
    scoreCc: r.scoreCc,
    depth: r.depth,
    work: r.work,
    nodes: r.stats.nodes,
    actions: JSON.stringify(r.actions),
  };
}

describe('a fixed work rung is deterministic', () => {
  it('repeats identically on the same engine', async () => {
    const engine = new HardEngine();
    const a = await run(engine, 60_000);
    const b = await run(engine, 60_000);
    const c = await run(engine, 60_000);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  }, 60_000);

  it('repeats identically on a fresh engine', async () => {
    const a = await run(new HardEngine(), 60_000);
    const b = await run(new HardEngine(), 60_000);
    expect(b).toEqual(a);
  }, 60_000);

  it('does not depend on what the engine searched before', async () => {
    const clean = await run(new HardEngine(), 60_000);
    const dirty = new HardEngine();
    await run(dirty, 80_000, createInitialGameState());
    await run(dirty, 50_000, createInitialGameState());
    expect(await run(dirty, 60_000)).toEqual(clean);
  }, 60_000);

  it('setSeed is a no-op', async () => {
    const a = new HardEngine();
    a.setSeed(1);
    const b = new HardEngine();
    b.setSeed(7);
    expect(await run(b, 60_000)).toEqual(await run(a, 60_000));
  }, 60_000);

  it('a bigger rung spends more work and never less depth', async () => {
    const small = await run(new HardEngine(), 50_000);
    const big = await run(new HardEngine(), 240_000);
    expect(big.work).toBeGreaterThan(small.work);
    expect(big.depth).toBeGreaterThanOrEqual(small.depth);
  }, 60_000);
});

describe('the work meter and the rung ladder', () => {
  it('WorkMeter counts by class and by cost', () => {
    const meter = new WorkMeter(1_000);
    meter.spend(0, 3); // MACRO, 4 units each
    expect(meter.byClass[0]).toBe(3);
    expect(meter.used).toBe(12);
    expect(meter.exhausted()).toBe(false);
    meter.spend(8, 100); // PROVER, 40 units each
    expect(meter.exhausted()).toBe(true);
    meter.reset(50);
    expect(meter.used).toBe(0);
    expect(meter.byClass[0]).toBe(0);
    expect(meter.limit).toBe(50);
  });

  it('chooseWork quantises to a rung and floors at the smallest one', () => {
    expect(chooseWork({ unitsPerMs: 1, samples: 0 }, 1)).toBe(WORK_LADDER[0]);
    expect(chooseWork({ unitsPerMs: 1_000, samples: 0 }, 60)).toBe(50_000);
    expect(chooseWork({ unitsPerMs: 1_000, samples: 0 }, 99)).toBe(50_000);
    expect(chooseWork({ unitsPerMs: 1_000, samples: 0 }, 100)).toBe(100_000);
    expect(chooseWork({ unitsPerMs: 10_000_000, samples: 0 }, 6_000)).toBe(WORK_LADDER[WORK_LADDER.length - 1]);
  });

  it('a 5 % throughput swing cannot move the rung', () => {
    // A target mid-rung, not on a boundary: 300,000 units sits between the
    // 200,000 and 400,000 rungs, which is where quantisation does its work.
    const base = { unitsPerMs: 1_000, samples: 4 };
    const target = 300;
    const chosen = chooseWork(base, target);
    expect(chooseWork({ unitsPerMs: 1_050, samples: 4 }, target)).toBe(chosen);
    expect(chooseWork({ unitsPerMs: 950, samples: 4 }, target)).toBe(chosen);
  });

  it('updateProfile is an EWMA that ignores a search that spent nothing', () => {
    const start = { unitsPerMs: 200, samples: 0 };
    const first = updateProfile(start, 400_000, 1_000);
    expect(first.unitsPerMs).toBe(400); // first sample replaces the prior
    expect(first.samples).toBe(1);
    const second = updateProfile(first, 800_000, 1_000);
    expect(second.unitsPerMs).toBe(500); // 400 + (800 - 400) / 4
    expect(updateProfile(second, 0, 1_000)).toBe(second);
    expect(updateProfile(second, 1_000, 0)).toBe(second);
  });
});

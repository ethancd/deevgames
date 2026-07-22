import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { computeInteroception, createBody, stepBody } from './index';
import { freshLog, makeWorld } from './testUtils';

describe('computeInteroception', () => {
  it('is deterministic: same body/world/attention/seed => identical output', () => {
    const body = createBody({ fuel: 0.4, fatigue: 0.6, activation: 0.3, damage: 0.2 });
    const world = makeWorld();
    const a = computeInteroception(body, world, null, createRng(7));
    const b = computeInteroception(body, world, null, createRng(7));
    expect(a).toEqual(b);
  });

  it('never mutates the BodyState it reads (interoception is read-only)', () => {
    const body = createBody({ fuel: 0.4, fatigue: 0.6, activation: 0.3, damage: 0.2 });
    const before = JSON.stringify(body);
    computeInteroception(body, makeWorld(), 'fuel', createRng(3));
    expect(JSON.stringify(body)).toBe(before);
  });

  it('noise grows with fatigue + damage: high-fatigue/damage readings miss their true bucket far more often', () => {
    // Pick an activation value sitting exactly on a bucket edge so any
    // nonzero noise has a real chance to flip the bucket either way.
    const edgeValue = 0.35; // BUCKET_EDGES[1]
    const lowBody = createBody({ fuel: 0.9, fatigue: 0, damage: 0, activation: edgeValue });
    const highBody = createBody({ fuel: 0.9, fatigue: 0.95, damage: 0.4, activation: edgeValue });

    const trueBucket = 'low'; // 0.35 lands exactly on the low/mid edge; treated as 'low' (< e1 is strict)

    let lowMismatches = 0;
    let highMismatches = 0;
    const trials = 300;
    for (let seed = 0; seed < trials; seed++) {
      const lowReading = computeInteroception(lowBody, makeWorld(), null, createRng(seed)).global
        .activation;
      const highReading = computeInteroception(highBody, makeWorld(), null, createRng(seed))
        .global.activation;
      if (lowReading !== trueBucket) lowMismatches++;
      if (highReading !== trueBucket) highMismatches++;
    }
    expect(highMismatches).toBeGreaterThan(lowMismatches);
  });

  it('focus() raises confidence for the attended region without changing body state', () => {
    const body = createBody({ fuel: 0.5, fatigue: 0.3, damage: 0.1 });
    const world = makeWorld();
    const unfocused = computeInteroception(body, world, null, createRng(5));
    const focused = computeInteroception(body, world, 'fuel', createRng(5));

    const fuelUnfocused = unfocused.salient.find((s) => s.region === 'fuel')!;
    const fuelFocused = focused.salient.find((s) => s.region === 'fuel')!;
    expect(fuelFocused.confidence).toBeGreaterThan(fuelUnfocused.confidence);

    // attention must not perturb some other region's confidence via a
    // shared global side effect beyond the intended one.
    const heatUnfocused = unfocused.salient.find((s) => s.region === 'heat')!;
    const heatFocused = focused.salient.find((s) => s.region === 'heat')!;
    expect(heatFocused.confidence).toBeCloseTo(heatUnfocused.confidence, 5);
  });

  it('capacity derives from fuel and fatigue (low fuel + high fatigue reads low capacity)', () => {
    const depleted = createBody({ fuel: 0.05, fatigue: 0.95, damage: 0 });
    const flush = createBody({ fuel: 0.95, fatigue: 0.05, damage: 0 });
    const depletedReading = computeInteroception(depleted, makeWorld(), null, createRng(11));
    const flushReading = computeInteroception(flush, makeWorld(), null, createRng(11));
    const order: Record<string, number> = {
      very_low: 0,
      low: 1,
      mid: 2,
      high: 3,
      very_high: 4,
    };
    expect(order[depletedReading.global.capacity]).toBeLessThan(
      order[flushReading.global.capacity],
    );
  });

  it('drives report urgency and a predictedTicksToLimit when trending toward the limit', () => {
    const body = createBody({ fuel: 0.5 });
    const world = makeWorld();
    const log = freshLog();
    const rng = createRng(1);
    // build some real drain history via stepBody so recentSlope has data
    for (let i = 0; i < 15; i++) {
      world.tick = i;
      stepBody(body, world, { effort: 1 }, rng, log);
    }
    const intero = computeInteroception(body, world, null, createRng(1));
    const fuelDrive = intero.drives.find((d) => d.drive === 'fuel')!;
    expect(fuelDrive.predictedTicksToLimit).toBeDefined();
    expect(fuelDrive.predictedTicksToLimit as number).toBeGreaterThan(0);
  });

  it('mode shapes salience ordering: DEFEND foregrounds activation first, unlike EXPLORE', () => {
    const defendBody = createBody({ activation: 0.9, mode: 'DEFEND' });
    const exploreBody = createBody({ fuel: 0.9, heat: 0.7, mode: 'EXPLORE' });
    const defendIntero = computeInteroception(defendBody, makeWorld(), null, createRng(2));
    const exploreIntero = computeInteroception(exploreBody, makeWorld(), null, createRng(2));
    expect(defendIntero.salient[0].region).toBe('activation');
    // EXPLORE ranks by deviation; a near-default body's most deviant var is
    // not activation (which is near its comfortable default), so ordering
    // genuinely differs from DEFEND's fixed threat-first ordering.
    expect(exploreIntero.salient.map((s) => s.region)).not.toEqual(
      defendIntero.salient.map((s) => s.region),
    );
  });
});

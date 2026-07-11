/**
 * EMBER — determinism audit, promoted to a permanent test (src/engine/determinism.test.ts).
 *
 * Covers two fixed audit findings:
 *
 *   1. Double-run byte-exact determinism: two independently constructed
 *      Sims, same seed, same (structurally) intent sequence, must produce
 *      byte-identical event logs. (replay.test.ts already covers the
 *      recordedIntents replay path; this file additionally covers two
 *      fully independent LIVE runs with fresh ScriptedPilot instances.)
 *
 *   2. [medium] Shared-pilot cross-contamination: createScriptedPilot()
 *      used to return a Pilot backed by mutable closure state
 *      (visitCounts, believedPos, dirCursor, lastGatherTarget) keyed to
 *      nothing but the closure instance itself. Handing the SAME Pilot
 *      instance to two different Sims and stepping them interleaved used
 *      to cross-contaminate their trajectories — a sim's log stopped being
 *      a pure function of its own (seed, overrides, intent sequence) and
 *      started depending on interleaving with whatever else had stepped
 *      the same pilot object. Fixed by making ScriptedPilot's decide()
 *      keep zero closure state — see src/pilot/scripted.ts's header. This
 *      test reproduces the exact repro from that audit finding and asserts
 *      no divergence.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { createScriptedPilot } from '../pilot/scripted';

describe('determinism: two independent live sims, same seed', () => {
  it('produce byte-identical event logs', async () => {
    const a = createSim({ seed: 20260711, pilot: createScriptedPilot() });
    const b = createSim({ seed: 20260711, pilot: createScriptedPilot() });
    await a.run(400);
    await b.run(400);
    expect(a.log.serialize()).toBe(b.log.serialize());
    expect(a.intents).toEqual(b.intents);
  });
});

describe('determinism: a Pilot instance shared across two interleaved Sims does not cross-contaminate', () => {
  it('matches an isolated baseline run tick-for-tick, even when interleaved with a second sim ' +
    'stepping the exact same Pilot object', async () => {
    const SEED = 4242;
    const TICKS = 200;

    // Isolated baseline: fresh pilot, fresh sim, stepped alone.
    const baseline = createSim({ seed: SEED, pilot: createScriptedPilot() });
    await baseline.run(TICKS);

    // Now the actual audit repro: ONE pilot instance shared by two sims,
    // stepped in an interleaved (alternating) pattern.
    const sharedPilot = createScriptedPilot();
    const simX = createSim({ seed: SEED, pilot: sharedPilot });
    const simY = createSim({ seed: SEED, pilot: sharedPilot });
    for (let i = 0; i < TICKS; i++) {
      await simX.step();
      await simY.step();
    }

    expect(simX.log.serialize()).toBe(baseline.log.serialize());
    expect(simY.log.serialize()).toBe(baseline.log.serialize());
    expect(simX.intents).toEqual(baseline.intents);
    expect(simY.intents).toEqual(baseline.intents);
  });

  it('two sims sharing one pilot, stepped alongside a THIRD sim that hammers the same pilot at ' +
    'twice the rate, still match an isolated baseline exactly', async () => {
    const SEED = 909;
    const TICKS = 150;

    const baseline = createSim({ seed: SEED, pilot: createScriptedPilot() });
    await baseline.run(TICKS);

    const sharedPilot = createScriptedPilot();
    const noisyNeighbor = createSim({ seed: SEED, pilot: sharedPilot });
    const sim = createSim({ seed: SEED, pilot: sharedPilot });
    // Non-uniform interleaving: `noisyNeighbor` steps twice for every one
    // step of `sim`, so any shared-state bleed would show up as `sim`
    // picking up "wear" from a pilot object that's secretly being driven
    // much harder by a sim it has no relationship to.
    for (let i = 0; i < TICKS; i++) {
      await noisyNeighbor.step();
      await noisyNeighbor.step();
      await sim.step();
    }

    expect(sim.log.serialize()).toBe(baseline.log.serialize());
    expect(sim.intents).toEqual(baseline.intents);
  });
});

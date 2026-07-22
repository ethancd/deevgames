/**
 * EMBER — replay determinism test (src/scenarios/replay.test.ts).
 *
 * Runs a sim for 600 ticks with the ScriptedPilot, capturing sim.intents
 * (every pilot output, in order) and log.serialize(). Re-runs the same
 * seed with those intents supplied as `recordedIntents` (replay mode — no
 * pilot consultation should occur) and asserts the two serializations are
 * byte-identical, per PLAN.md's replay rule: "a run is (seed, scenarioId,
 * recordedIntents[])... replays are exact".
 *
 * See also src/engine/determinism.test.ts, which covers two additional
 * determinism properties: two fully independent live runs (no replay
 * involved), and a shared Pilot instance across interleaved Sims.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';

const SEED = 20260711;
const TICKS = 600;

describe('replay determinism', () => {
  it('recordedIntents reproduce a byte-identical event log', async () => {
    const live = createSim({ seed: SEED, pilot: createScriptedPilot() });
    await live.run(TICKS);
    const liveSerialized = live.log.serialize();
    const recordedIntents = [...live.intents];

    expect(recordedIntents.length).toBeGreaterThan(0);

    const replay = createSim({
      seed: SEED,
      pilot: createScriptedPilot(), // must be ignored in favor of recordedIntents
      recordedIntents,
    });
    await replay.run(TICKS);
    const replaySerialized = replay.log.serialize();

    expect(replaySerialized).toBe(liveSerialized);
    expect(replay.intents).toEqual(recordedIntents);
  });
});

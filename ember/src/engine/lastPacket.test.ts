/**
 * EMBER — Sim.lastPacket tests (src/engine/lastPacket.test.ts).
 *
 * Focused coverage for the ONE allowed additive engine change documented in
 * src/ui/contracts.ts's header: `lastPacket: ContextPacket | null` on Sim,
 * updated on every pilot consultation, live or replayed.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { createScriptedPilot } from '../pilot/scripted';

describe('Sim.lastPacket', () => {
  it('starts null and is set after the first pilot consultation', async () => {
    const sim = createSim({ seed: 1, pilot: createScriptedPilot() });
    expect(sim.lastPacket).toBeNull();

    await sim.step();

    expect(sim.lastPacket).not.toBeNull();
    expect(sim.lastPacket?.tick).toBe(sim.world.tick);
  });

  it('updates to a fresh packet on later consultations', async () => {
    const sim = createSim({ seed: 2, pilot: createScriptedPilot() });
    await sim.step();
    const first = sim.lastPacket;

    await sim.run(20);
    const later = sim.lastPacket;

    expect(later).not.toBeNull();
    expect(later).not.toBe(first);
    expect(later!.tick).toBeGreaterThan(first!.tick);
  });

  it('is built from copies, never a live BodyState/WorldState reference', async () => {
    const sim = createSim({ seed: 3, pilot: createScriptedPilot() });
    await sim.step();
    const packet = sim.lastPacket;
    expect(packet).not.toBeNull();
    // structuredClone in buildContextPacket guarantees this, but assert the
    // observable contract directly: mutating the live body must not affect
    // a previously captured packet's frozen-in-time interoception object.
    const beforeGlobal = { ...packet!.interoception.global };
    sim.body.fuel = 0;
    expect(packet!.interoception.global).toEqual(beforeGlobal);
  });

  it('still populates in replay mode fed from recordedIntents', async () => {
    const live = createSim({ seed: 4, pilot: createScriptedPilot() });
    await live.run(20);
    const recorded = live.intents.slice();

    const replay = createSim({
      seed: 4,
      pilot: createScriptedPilot(),
      recordedIntents: recorded,
    });
    expect(replay.lastPacket).toBeNull();

    await replay.step();
    expect(replay.lastPacket).not.toBeNull();

    await replay.run(20);
    expect(replay.lastPacket).not.toBeNull();
    expect(replay.lastPacket?.tick).toBe(replay.world.tick);
  });
});

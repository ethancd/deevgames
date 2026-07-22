/**
 * EMBER — protocol smoke test (src/pilot/protocolSmoke.test.ts).
 *
 * Proves the serialize -> respond -> parse loop is lossless enough to
 * matter: an LLMPilot whose transport deserializes its own serialized
 * packet, asks a plain ScriptedPilot, and wraps the result as an
 * LLMResponseLike tool_use block should survive a long run with
 * ~parity to a plain ScriptedPilot run on the same seed. This is a coarse
 * outcome-level check (not tick-for-tick trajectory equality) — the 2dp
 * rounding in serializePacket is a real, if small, lossy step, so exact
 * trajectory parity isn't the claim being tested; "the wire didn't destroy
 * anything that matters for survival" is.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from '../engine';
import { createScriptedPilot } from './scripted';
import { createLLMPilot } from './llm';
import type { ContextPacket } from '../core/types';
import type { LLMRequest, LLMResponseLike } from './llmContracts';

const SEED = 55;
const TICKS = 600;

describe('protocol smoke: LLMPilot(ScriptedPilot-over-the-wire) vs plain ScriptedPilot', () => {
  it('round-trips through serializePacket without losing survival-relevant information', async () => {
    // The "wire": deserialize our own serialized packet back into a
    // ContextPacket, ask a fresh ScriptedPilot, wrap its Intent exactly as
    // a real Anthropic tool_use response would arrive.
    const wireScriptedPilot = createScriptedPilot();
    const transport = async (req: LLMRequest): Promise<LLMResponseLike> => {
      const packet = JSON.parse(req.userMessage) as ContextPacket;
      const intent = await wireScriptedPilot.decide(packet);
      return {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', name: 'submit_intent', input: intent }],
      };
    };

    const llmPilot = createLLMPilot({ apiKey: 'unused-in-tests', transport });
    const llmSim = createSim({ seed: SEED, pilot: llmPilot });
    await llmSim.run(TICKS);

    const plainSim = createSim({ seed: SEED, pilot: createScriptedPilot() });
    await plainSim.run(TICKS);

    expect(llmSim.world.tick).toBe(TICKS);
    expect(plainSim.world.tick).toBe(TICKS);
    expect(llmSim.intents.length).toBeGreaterThan(0);

    // The loop must never have silently degenerated into constant
    // llm:unavailable fallback — every consultation should have round-
    // tripped a real ScriptedPilot decision.
    const fallbackCount = llmSim.intents.filter((i) => i.goal === 'llm:unavailable').length;
    expect(fallbackCount).toBe(0);

    // Survival parity: empirically (checked across a dozen seeds while
    // authoring this test) the round-trip is lossless enough that the two
    // runs track EXACTLY — same final tile, same final BodyState, same
    // mode — because ScriptedPilot branches only on typed bucket strings
    // and coarse numeric thresholds that the 2dp rounding essentially
    // never perturbs across a threshold in practice. Assert that directly:
    // it's the strongest and least ambiguous statement of "the wire loop
    // didn't lose anything that mattered" available here.
    expect(llmSim.world.ember.pos).toEqual(plainSim.world.ember.pos);
    expect(llmSim.body.mode).toBe(plainSim.body.mode);
    expect(llmSim.body.fuel).toBeCloseTo(plainSim.body.fuel, 5);
    expect(llmSim.body.damage).toBeCloseTo(plainSim.body.damage, 5);
    expect(llmSim.body.fatigue).toBeCloseTo(plainSim.body.fatigue, 5);
    expect(llmSim.body.activation).toBeCloseTo(plainSim.body.activation, 5);
  });
});

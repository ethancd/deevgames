/**
 * EMBER — LLMPilot tests (src/pilot/llm.test.ts).
 *
 * All transports here are hand-fabricated fakes (LLMTransport = (req) =>
 * Promise<LLMResponseLike>) — never the real SDK, never a network call, per
 * the WF3 brief ("There is NO Anthropic API key in this environment. Never
 * attempt live API calls").
 */

import { describe, expect, it, vi } from 'vitest';
import { createLLMPilot } from './llm';
import { createSim } from '../engine';
import { createScriptedPilot } from './scripted';
import type { LLMPilotEvent, LLMRequest, LLMResponseLike } from './llmContracts';

const FAKE_KEY = 'sk-ant-super-secret-do-not-leak-XYZ123';

function noSleep(): (ms: number) => Promise<void> {
  return () => Promise.resolve();
}

function toolUseResponse(input: unknown): LLMResponseLike {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'submit_intent', input }],
  };
}

function collectEvents(): { events: LLMPilotEvent[]; onEvent: (e: LLMPilotEvent) => void } {
  const events: LLMPilotEvent[] = [];
  return { events, onEvent: (e) => events.push(e) };
}

async function realPacket(seed = 1) {
  const sim = createSim({ seed, pilot: createScriptedPilot() });
  await sim.run(9); // PILOT_PERIOD=8 guarantees >=1 consultation by tick 9
  const packet = sim.lastPacket;
  if (!packet) throw new Error('expected a packet');
  return packet;
}

describe('createLLMPilot — valid round trip', () => {
  it('accepts a well-formed tool_use response built from a real ContextPacket', async () => {
    const packet = await realPacket();
    const { events, onEvent } = collectEvents();

    let seenUserMessage = '';
    const transport = vi.fn(async (req: LLMRequest): Promise<LLMResponseLike> => {
      seenUserMessage = req.userMessage;
      return toolUseResponse({
        goal: 'head to fuel',
        skill: 'move_to',
        params: { dest: { x: 5, y: 5 }, style: 'direct' },
        interruptConditions: ['threat_above_0.4'],
        thought: 'onward',
      });
    });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent });
    const intent = await pilot.decide(packet);

    expect(intent.skill).toBe('move_to');
    expect(intent.goal).toBe('head to fuel');
    expect(intent.interruptConditions).toEqual(['threat_above_0.4']);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(seenUserMessage.length).toBeGreaterThan(0);
    expect(JSON.parse(seenUserMessage)).toHaveProperty('tick');

    expect(events.map((e) => e.kind)).toEqual(['consult_start', 'consult_ok']);
  });

  it('caps goal at 120 chars and thought at 60 chars', async () => {
    const packet = await realPacket(2);
    const longGoal = 'g'.repeat(200);
    const longThought = 't'.repeat(100);
    const transport = async (): Promise<LLMResponseLike> =>
      toolUseResponse({
        goal: longGoal,
        skill: 'wait',
        params: { flare: null },
        interruptConditions: ['threat_above_0.3'],
        thought: longThought,
      });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport });
    const intent = await pilot.decide(packet);

    expect(intent.goal.length).toBe(120);
    expect(intent.thought?.length).toBe(60);
  });
});

describe('createLLMPilot — structural (fail-fast) validation', () => {
  const malformed: { name: string; input: unknown }[] = [
    { name: 'unknown skill', input: { goal: 'g', skill: 'teleport', params: {}, interruptConditions: [] } },
    {
      name: 'wrong param type (dest as string)',
      input: {
        goal: 'g',
        skill: 'move_to',
        params: { dest: 'not-a-vec' },
        interruptConditions: [],
      },
    },
    {
      name: 'missing required field (gather.target)',
      input: { goal: 'g', skill: 'gather', params: {}, interruptConditions: [] },
    },
    {
      name: 'interruptConditions not an array',
      input: { goal: 'g', skill: 'wait', params: {}, interruptConditions: 'threat_above_0.3' },
    },
    {
      name: 'missing goal entirely',
      input: { skill: 'wait', params: {}, interruptConditions: [] },
    },
  ];

  for (const { name, input } of malformed) {
    it(`falls back and emits consult_failed for: ${name}`, async () => {
      const packet = await realPacket(3);
      const { events, onEvent } = collectEvents();
      const transport = async (): Promise<LLMResponseLike> => toolUseResponse(input);

      const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent });
      const intent = await pilot.decide(packet);

      expect(intent).toEqual({
        goal: 'llm:unavailable',
        skill: 'wait',
        params: {},
        interruptConditions: ['threat_above_0.3'],
      });
      expect(events.map((e) => e.kind)).toEqual(['consult_start', 'consult_failed']);
    });
  }

  it('falls back when the response has no tool_use block at all', async () => {
    const packet = await realPacket(4);
    const { events, onEvent } = collectEvents();
    const transport = async (): Promise<LLMResponseLike> => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'I decided not to use the tool.' }],
    });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent });
    const intent = await pilot.decide(packet);

    expect(intent.goal).toBe('llm:unavailable');
    expect(events.map((e) => e.kind)).toEqual(['consult_start', 'consult_failed']);
  });
});

describe('createLLMPilot — refusal', () => {
  it('falls back on stop_reason "refusal"', async () => {
    const packet = await realPacket(5);
    const { events, onEvent } = collectEvents();
    const transport = async (): Promise<LLMResponseLike> => ({ stop_reason: 'refusal', content: [] });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent });
    const intent = await pilot.decide(packet);

    expect(intent.goal).toBe('llm:unavailable');
    expect(events.some((e) => e.kind === 'consult_failed' && e.detail === 'refusal')).toBe(true);
  });
});

describe('createLLMPilot — retry on retryable errors', () => {
  it('429 then success => consult_retry then consult_ok, transport called twice', async () => {
    const packet = await realPacket(6);
    const { events, onEvent } = collectEvents();
    let calls = 0;
    const transport = vi.fn(async (): Promise<LLMResponseLike> => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('rate limited') as Error & { status: number };
        err.status = 429;
        throw err;
      }
      return toolUseResponse({
        goal: 'ok now',
        skill: 'wait',
        params: { flare: null },
        interruptConditions: ['threat_above_0.3'],
        thought: null,
      });
    });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent, sleep: noSleep() });
    const intent = await pilot.decide(packet);

    expect(transport).toHaveBeenCalledTimes(2);
    expect(intent.goal).toBe('ok now');
    expect(events.map((e) => e.kind)).toEqual(['consult_start', 'consult_retry', 'consult_ok']);
  });

  it('a persistent 500 retries once then falls back', async () => {
    const packet = await realPacket(7);
    const { events, onEvent } = collectEvents();
    const transport = vi.fn(async (): Promise<LLMResponseLike> => {
      const err = new Error('server error') as Error & { status: number };
      err.status = 500;
      throw err;
    });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent, sleep: noSleep() });
    const intent = await pilot.decide(packet);

    expect(transport).toHaveBeenCalledTimes(2); // 1 try + 1 retry, no more
    expect(intent.goal).toBe('llm:unavailable');
    expect(events.map((e) => e.kind)).toEqual(['consult_start', 'consult_retry', 'consult_failed']);
  });

  it('a non-retryable 400 fails fast with no retry', async () => {
    const packet = await realPacket(8);
    const { events, onEvent } = collectEvents();
    const transport = vi.fn(async (): Promise<LLMResponseLike> => {
      const err = new Error('bad request') as Error & { status: number };
      err.status = 400;
      throw err;
    });

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent, sleep: noSleep() });
    await pilot.decide(packet);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.kind)).toEqual(['consult_start', 'consult_failed']);
  });
});

describe('createLLMPilot — 401 auth latch', () => {
  it('emits auth_error and never calls the transport again', async () => {
    const packet = await realPacket(9);
    const { events, onEvent } = collectEvents();
    const transport = vi.fn(async (): Promise<LLMResponseLike> => {
      const err = new Error('invalid api key') as Error & { status: number };
      err.status = 401;
      throw err;
    });

    const pilot = createLLMPilot({ apiKey: 'bad-key', transport, onEvent, sleep: noSleep() });

    const first = await pilot.decide(packet);
    expect(first.goal).toBe('llm:unavailable');
    expect(transport).toHaveBeenCalledTimes(1);

    const second = await pilot.decide(packet);
    expect(second.goal).toBe('llm:unavailable');
    // still 1 — the latch must prevent a second transport call entirely
    expect(transport).toHaveBeenCalledTimes(1);

    expect(events.filter((e) => e.kind === 'auth_error').length).toBe(2);
  });
});

describe('createLLMPilot — the API key never leaks', () => {
  it('does not appear in onEvent details for a retryable error embedding it', async () => {
    const packet = await realPacket(10);
    const { events, onEvent } = collectEvents();
    const transport = async (): Promise<LLMResponseLike> => {
      const err = new Error(`upstream rejected key ${FAKE_KEY}`) as Error & { status: number };
      err.status = 500;
      throw err;
    };

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent, sleep: noSleep() });
    await pilot.decide(packet);

    for (const e of events) {
      expect(JSON.stringify(e)).not.toContain(FAKE_KEY);
    }
  });

  it('does not appear in onEvent details for a 401 embedding it', async () => {
    const packet = await realPacket(11);
    const { events, onEvent } = collectEvents();
    const transport = async (): Promise<LLMResponseLike> => {
      const err = new Error(`key ${FAKE_KEY} is not authorized`) as Error & { status: number };
      err.status = 401;
      throw err;
    };

    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, onEvent, sleep: noSleep() });
    await pilot.decide(packet);

    for (const e of events) {
      expect(JSON.stringify(e)).not.toContain(FAKE_KEY);
    }
  });

  it('does not appear anywhere in a thrown value if decide() somehow rejects', async () => {
    const packet = await realPacket(12);
    // A transport that throws something bizarre (not error-shaped at all).
    const transport = async (): Promise<LLMResponseLike> => {
      throw `raw string mentioning ${FAKE_KEY}`;
    };
    const pilot = createLLMPilot({ apiKey: FAKE_KEY, transport, sleep: noSleep() });
    // decide() must not throw — it always resolves to a fallback intent.
    const intent = await pilot.decide(packet);
    expect(JSON.stringify(intent)).not.toContain(FAKE_KEY);
  });
});

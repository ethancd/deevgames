/**
 * EMBER — "can the pilot cheat?" mutation-attack audit, promoted to a
 * permanent test (src/engine/anticheat.test.ts).
 *
 * Every case below reproduces a fixed audit finding where a hostile or
 * merely buggy Pilot implementation could crash createSim's step()/run()
 * uncaught (aborting the whole sim), instead of getting a clean
 * `pilot.intent.rejected` + fallback-to-wait. The fix is
 * src/engine/index.ts's sanitizeIntent() (the single choke point ALL pilot
 * output passes through before validateIntent/logging/buildContextPacket
 * ever touch it), plus defense-in-depth hardening in
 * src/skills/arbiter.ts, src/skills/reflexes.ts, and src/skills/params.ts.
 * The last case covers a separate, latent finding: no reentrancy guard on
 * step().
 */

import { describe, expect, it } from 'vitest';
import type { Pilot } from '../core/types';
import { createSim } from './index';

describe('anticheat: malformed interruptConditions never crashes the sim', () => {
  it('null interruptConditions is rejected cleanly, sim keeps running', async () => {
    const intents = [
      { goal: 'x', skill: 'wait', params: {}, interruptConditions: null },
      { goal: 'y', skill: 'wait', params: {}, interruptConditions: [] },
    ];
    let i = 0;
    const pilot: Pilot = { decide: () => intents[Math.min(i++, intents.length - 1)] as never };
    const sim = createSim({ seed: 7, pilot });
    await expect(sim.run(30)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(30);
    expect(sim.log.byTopic('pilot.intent.rejected').length).toBeGreaterThan(0);
  });

  it('a non-array-with-throwing-toString element never reaches RegExp coercion', async () => {
    const evil = {
      toString() {
        throw new Error('evil toString');
      },
    };
    const intents = [
      { goal: 'x', skill: 'wait', params: {}, interruptConditions: [evil] },
      { goal: 'y', skill: 'wait', params: {}, interruptConditions: [] },
    ];
    let i = 0;
    const pilot: Pilot = { decide: () => intents[Math.min(i++, intents.length - 1)] as never };
    const sim = createSim({ seed: 8, pilot });
    await expect(sim.run(30)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(30);
  });

  it('a throwing getter on interruptConditions never crashes the interrupt check on a later tick', async () => {
    const evilIntent: Record<string, unknown> = { goal: 'x', skill: 'wait', params: {} };
    Object.defineProperty(evilIntent, 'interruptConditions', {
      get() {
        throw new Error('evil getter');
      },
      enumerable: true,
    });
    const intents = [evilIntent, { goal: 'y', skill: 'wait', params: {}, interruptConditions: [] }];
    let i = 0;
    const pilot: Pilot = { decide: () => intents[Math.min(i++, intents.length - 1)] as never };
    const sim = createSim({ seed: 9, pilot });
    await expect(sim.run(30)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(30);
  });
});

describe('anticheat: malformed params never crashes precondition()/estCost()', () => {
  it('a throwing getter on a required Vec param (move_to dest) is rejected cleanly', async () => {
    const evilParams: Record<string, unknown> = {};
    Object.defineProperty(evilParams, 'dest', {
      get() {
        throw new Error('evil dest getter');
      },
      enumerable: true,
    });
    const pilot: Pilot = {
      decide: () => ({ goal: 'x', skill: 'move_to', params: evilParams, interruptConditions: [] }),
    };
    const sim = createSim({ seed: 12, pilot });
    await expect(sim.run(10)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(10);
    expect(sim.log.byTopic('pilot.intent.rejected').length).toBeGreaterThan(0);
  });
});

describe('anticheat: non-cloneable intent values never crash buildContextPacket', () => {
  it('a rejected (malformed-in-multiple-ways) intent with a function-valued skill never crashes', async () => {
    const badIntent = {
      goal: 'x',
      skill: { toString: () => 'move_to' },
      params: 'not an object',
      interruptConditions: 'also not an array',
      thought: {},
    };
    const pilot: Pilot = { decide: () => badIntent as never };
    const sim = createSim({ seed: 10, pilot });
    await expect(sim.run(20)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(20);
  });

  it('an otherwise-valid, ACCEPTED intent whose only defect is a function-valued `thought` does ' +
    'not crash on the next tick (thought is dropped, not fatal — narration is non-causal)', async () => {
    const pilot: Pilot = {
      decide: () => ({
        goal: 'fine',
        skill: 'wait',
        params: {},
        interruptConditions: [],
        thought: { poison: () => 'boom' } as unknown as string,
      }),
    };
    const sim = createSim({ seed: 99, pilot });
    await expect(sim.run(20)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(20);
    // The intent WAS accepted (only its non-causal thought was malformed) —
    // confirm that, not just "didn't crash".
    expect(sim.log.byTopic('pilot.intent.accepted').length).toBeGreaterThan(0);
  });

  it('a params object containing a function value is rejected (non-cloneable) rather than crashing', async () => {
    const pilot: Pilot = {
      decide: () => ({
        goal: 'x',
        skill: 'wait',
        params: { poison: () => 'boom' },
        interruptConditions: [],
      }),
    };
    const sim = createSim({ seed: 101, pilot });
    await expect(sim.run(20)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(20);
    expect(sim.log.byTopic('pilot.intent.rejected').length).toBeGreaterThan(0);
  });
});

describe('anticheat: unknown skill names and non-object intents are rejected, not fatal', () => {
  it('a completely non-object pilot output (string) is rejected cleanly', async () => {
    const pilot: Pilot = { decide: () => 'not an intent' as never };
    const sim = createSim({ seed: 11, pilot });
    await expect(sim.run(15)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(15);
  });

  it('null pilot output is rejected cleanly', async () => {
    const pilot: Pilot = { decide: () => null as never };
    const sim = createSim({ seed: 13, pilot });
    await expect(sim.run(15)).resolves.toBeUndefined();
    expect(sim.world.tick).toBe(15);
  });
});

describe('anticheat: reentrant step() is refused loudly rather than silently desyncing tick order', () => {
  it('a Pilot that calls sim.step() from inside its own decide() throws instead of corrupting log ordering', async () => {
    let sim: ReturnType<typeof createSim>;
    const reentrantPilot: Pilot = {
      async decide() {
        await sim.step();
        return { goal: '', skill: 'wait', params: {}, interruptConditions: [] };
      },
    };
    sim = createSim({ seed: 57, pilot: reentrantPilot });
    await expect(sim.run(10)).rejects.toThrow(/re-?entrant/i);
  });
});

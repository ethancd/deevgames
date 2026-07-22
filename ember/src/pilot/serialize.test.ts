/**
 * EMBER — serializePacket tests (src/pilot/serialize.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { serializePacket } from './serialize';
import { createSim } from '../engine';
import { createScriptedPilot } from './scripted';
import type { ContextPacket } from '../core/types';

describe('serializePacket', () => {
  it('serializes two structurally-identical real packets identically', async () => {
    const sim = createSim({ seed: 7, pilot: createScriptedPilot() });
    await sim.run(9); // PILOT_PERIOD is 8 ticks; guarantees at least one consult
    const packet = sim.lastPacket;
    expect(packet).not.toBeNull();

    // A structurally-identical but distinct object (plain JSON round-trip
    // strips any incidental prototype/identity differences) must serialize
    // byte-for-byte the same as the original.
    const clone = JSON.parse(JSON.stringify(packet)) as ContextPacket;
    expect(serializePacket(packet!)).toBe(serializePacket(clone));
  });

  it('serializes the exact same object identically when called twice', async () => {
    const sim = createSim({ seed: 8, pilot: createScriptedPilot() });
    await sim.run(9);
    const packet = sim.lastPacket!;
    expect(serializePacket(packet)).toBe(serializePacket(packet));
  });

  it('is stable across key insertion order (sorted keys)', () => {
    const a: ContextPacket = {
      tick: 1,
      observations: [],
      recentEvents: [],
      activeIntent: null,
      skills: [],
      interoception: {
        global: {
          activation: 'mid',
          capacity: 'mid',
          stability: 'mid',
          temperature: 'mid',
          trend: 'flat',
          confidence: 0.9,
        },
        salient: [],
        drives: [],
        availableRegulation: [],
      },
    };
    // Same data, but built by assigning properties in reverse order.
    const b = {} as ContextPacket;
    (b as unknown as Record<string, unknown>).skills = a.skills;
    (b as unknown as Record<string, unknown>).interoception = a.interoception;
    (b as unknown as Record<string, unknown>).activeIntent = a.activeIntent;
    (b as unknown as Record<string, unknown>).recentEvents = a.recentEvents;
    (b as unknown as Record<string, unknown>).observations = a.observations;
    (b as unknown as Record<string, unknown>).tick = a.tick;

    expect(serializePacket(a)).toBe(serializePacket(b));
  });

  it('rounds numbers to 2 decimal places and produces compact JSON', () => {
    const packet: ContextPacket = {
      tick: 3.14159,
      observations: [{ kind: 'entity', what: 'wolf', pos: { x: 1.004, y: 2.126 }, distance: 4.999 }],
      recentEvents: [],
      activeIntent: null,
      skills: [],
      interoception: {
        global: {
          activation: 'mid',
          capacity: 'mid',
          stability: 'mid',
          temperature: 'mid',
          trend: 'flat',
          confidence: 0.5,
        },
        salient: [],
        drives: [],
        availableRegulation: [],
      },
    };
    const s = serializePacket(packet);

    expect(s).not.toMatch(/\s/); // compact: no whitespace at all
    expect(s).toContain('"tick":3.14');
    expect(s).toContain('"x":1');
    expect(s).toContain('"y":2.13');
    expect(s).toContain('"distance":5');

    // sorted keys: activeIntent < interoception < observations < recentEvents < skills < tick
    const order = ['"activeIntent"', '"interoception"', '"observations"', '"recentEvents"', '"skills"', '"tick"'];
    let lastIdx = -1;
    for (const key of order) {
      const idx = s.indexOf(key);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('drops undefined optional fields (e.g. Intent.thought when absent)', () => {
    const packet: ContextPacket = {
      tick: 0,
      observations: [],
      recentEvents: [],
      activeIntent: {
        status: 'running',
        intent: {
          goal: 'g',
          skill: 'wait',
          params: {},
          interruptConditions: ['threat_above_0.3'],
          // thought intentionally omitted
        },
      },
      skills: [],
      interoception: {
        global: {
          activation: 'mid',
          capacity: 'mid',
          stability: 'mid',
          temperature: 'mid',
          trend: 'flat',
          confidence: 0.5,
        },
        salient: [],
        drives: [],
        availableRegulation: [],
      },
    };
    const s = serializePacket(packet);
    expect(s).not.toContain('thought');
  });

  it('preserves an explicit null (e.g. activeIntent: null) rather than dropping it', () => {
    const packet: ContextPacket = {
      tick: 0,
      observations: [],
      recentEvents: [],
      activeIntent: null,
      skills: [],
      interoception: {
        global: {
          activation: 'mid',
          capacity: 'mid',
          stability: 'mid',
          temperature: 'mid',
          trend: 'flat',
          confidence: 0.5,
        },
        salient: [],
        drives: [],
        availableRegulation: [],
      },
    };
    const s = serializePacket(packet);
    expect(s).toContain('"activeIntent":null');
  });
});

/**
 * EMBER — unit tests for ScriptedPilot (src/pilot/scripted.test.ts).
 *
 * Exercises createScriptedPilot() against hand-built ContextPacket fixtures
 * only — no world/body/engine involved, so these run standalone and green
 * regardless of the rest of the build.
 */

import { describe, expect, it } from 'vitest';
import type {
  ContextPacket,
  Interoception,
  Observation,
  SkillFeasibility,
} from '../core/types';
import { createScriptedPilot } from './scripted';

// ------------------------------------------------------------- fixtures

const ALL_SKILLS: SkillFeasibility[] = (
  ['move_to', 'gather', 'consume', 'rest', 'shelter', 'flee', 'focus', 'wait'] as const
).map((name) => ({ name, feasible: true, estCost: {} }));

function baseInteroception(overrides?: Partial<Interoception>): Interoception {
  return {
    global: {
      activation: 'low',
      capacity: 'high',
      stability: 'high',
      temperature: 'mid',
      trend: 'stable',
      confidence: 0.9,
    },
    salient: [
      { region: 'fuel', qualities: ['bright', 'well-fed'], confidence: 0.9 },
      { region: 'heat', qualities: ['comfortable'], confidence: 0.9 },
      { region: 'damage', qualities: ['unhurt'], confidence: 0.9 },
      { region: 'fatigue', qualities: ['fresh'], confidence: 0.9 },
      { region: 'activation', qualities: ['calm'], confidence: 0.9 },
    ],
    drives: [
      { drive: 'safety', urgency: 0 },
      { drive: 'fuel', urgency: 0 },
      { drive: 'warmth', urgency: 0 },
      { drive: 'rest', urgency: 0 },
    ],
    availableRegulation: ['wait', 'focus', 'move_to', 'gather', 'consume', 'rest', 'shelter', 'flee'],
    ...overrides,
  };
}

function baseCtx(overrides?: Partial<ContextPacket>): ContextPacket {
  return {
    tick: 100,
    observations: [],
    interoception: baseInteroception(),
    activeIntent: null,
    recentEvents: [],
    skills: ALL_SKILLS,
    ...overrides,
  };
}

const wolfObservation: Observation = {
  kind: 'entity',
  what: 'wolf',
  pos: { x: 10, y: 10 },
  distance: 3,
  detail: { state: 'STALK' },
};

const deadwoodObservation: Observation = {
  kind: 'entity',
  what: 'deadwood',
  pos: { x: 5, y: 5 },
  distance: 4,
  detail: { id: 'deadwood-0', fuel: 0.8 },
};

const sunpatchObservation: Observation = {
  kind: 'entity',
  what: 'sunpatch',
  pos: { x: 7, y: 3 },
  distance: 6,
  detail: { id: 'sunpatch-0', active: true },
};

const adjacentDeadwoodObservation: Observation = {
  ...deadwoodObservation,
  distance: 1,
};

const adjacentSunpatchObservation: Observation = {
  ...sunpatchObservation,
  distance: 1,
};

// ---------------------------------------------------------------- priority 1

describe('createScriptedPilot — priority 1: safety', () => {
  it('flees when a wolf is visible', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({ observations: [wolfObservation] });
    const result = pilot.decide(ctx);
    expect(result).not.toBeInstanceOf(Promise);
    const out = result as import('../core/types').Intent;
    expect(out.skill).toBe('flee');
    expect(out.params.from).toEqual(wolfObservation.pos);
    expect(out.interruptConditions.length).toBeGreaterThan(0);
    expect(out.goal.length).toBeGreaterThan(0);
  });

  it('heads to shelter when safety urgency is elevated but the wolf is not currently visible', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [],
      interoception: baseInteroception({
        drives: [
          { drive: 'safety', urgency: 0.8 },
          { drive: 'fuel', urgency: 0 },
          { drive: 'warmth', urgency: 0 },
          { drive: 'rest', urgency: 0 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('shelter');
  });

  it('outranks a simultaneous fuel emergency', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [wolfObservation, deadwoodObservation],
      interoception: baseInteroception({
        global: {
          activation: 'high',
          capacity: 'very_low',
          stability: 'mid',
          temperature: 'mid',
          trend: 'fuel falling',
          confidence: 0.7,
        },
        drives: [
          { drive: 'safety', urgency: 0.9 },
          { drive: 'fuel', urgency: 0.9 },
          { drive: 'warmth', urgency: 0 },
          { drive: 'rest', urgency: 0 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('flee');
  });

  it('falls through to fuel logic when flee/shelter are both infeasible', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [wolfObservation, adjacentDeadwoodObservation],
      skills: ALL_SKILLS.map((s) =>
        s.name === 'flee' || s.name === 'shelter'
          ? { ...s, feasible: false, whyNot: 'stability too low' }
          : s,
      ),
      interoception: baseInteroception({
        global: {
          activation: 'high',
          capacity: 'very_low',
          stability: 'very_low',
          temperature: 'mid',
          trend: 'fuel falling',
          confidence: 0.7,
        },
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('gather');
  });
});

// ---------------------------------------------------------------- priority 2

describe('createScriptedPilot — priority 2: fuel', () => {
  it('heads toward the nearest fuel source when capacity is very low but not yet adjacent', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [sunpatchObservation, deadwoodObservation],
      interoception: baseInteroception({
        global: {
          activation: 'low',
          capacity: 'very_low',
          stability: 'high',
          temperature: 'mid',
          trend: 'fuel falling',
          confidence: 0.8,
        },
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('move_to');
    // deadwood (distance 4) is nearer than sunpatch (distance 6)
    expect(out.params.dest).toEqual(deadwoodObservation.pos);
  });

  it('gathers once adjacent to the nearest fuel source', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [adjacentDeadwoodObservation, adjacentSunpatchObservation],
      interoception: baseInteroception({
        global: {
          activation: 'low',
          capacity: 'very_low',
          stability: 'high',
          temperature: 'mid',
          trend: 'fuel falling',
          confidence: 0.8,
        },
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('gather');
    expect(out.params.target).toBe('deadwood-0');
  });

  it('gathers when the fuel drive is urgent even if felt capacity reads fine, once adjacent', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [adjacentDeadwoodObservation],
      interoception: baseInteroception({
        drives: [
          { drive: 'safety', urgency: 0 },
          { drive: 'fuel', urgency: 0.5, predictedTicksToLimit: 20 },
          { drive: 'warmth', urgency: 0 },
          { drive: 'rest', urgency: 0 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('gather');
  });

  it('gathers when the believed (noisy) fuel reading itself looks dim/hungry, once adjacent', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      observations: [adjacentDeadwoodObservation],
      interoception: baseInteroception({
        salient: [
          { region: 'fuel', qualities: ['dim', 'hungry'], confidence: 0.4 },
          { region: 'heat', qualities: ['comfortable'], confidence: 0.9 },
          { region: 'damage', qualities: ['unhurt'], confidence: 0.9 },
          { region: 'fatigue', qualities: ['fresh'], confidence: 0.9 },
          { region: 'activation', qualities: ['calm'], confidence: 0.9 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('gather');
  });

  it('consumes after a gather completes against the same target', () => {
    const pilot = createScriptedPilot();
    const hungryCtx = baseCtx({
      observations: [adjacentDeadwoodObservation],
      interoception: baseInteroception({
        global: {
          activation: 'low',
          capacity: 'very_low',
          stability: 'high',
          temperature: 'mid',
          trend: 'fuel falling',
          confidence: 0.8,
        },
      }),
    });
    const first = pilot.decide(hungryCtx) as import('../core/types').Intent;
    expect(first.skill).toBe('gather');

    const followUp = baseCtx({
      observations: [adjacentDeadwoodObservation],
      activeIntent: { intent: first, status: 'done' },
      interoception: baseInteroception({
        global: {
          activation: 'low',
          capacity: 'very_low',
          stability: 'high',
          temperature: 'mid',
          trend: 'fuel falling',
          confidence: 0.8,
        },
      }),
    });
    const second = pilot.decide(followUp) as import('../core/types').Intent;
    expect(second.skill).toBe('consume');
    expect(second.params.item).toBe('deadwood-0');
  });
});

// ---------------------------------------------------------------- priority 3

describe('createScriptedPilot — priority 3: warmth', () => {
  it('shelters when the warmth drive is urgent', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      interoception: baseInteroception({
        drives: [
          { drive: 'safety', urgency: 0 },
          { drive: 'fuel', urgency: 0 },
          { drive: 'warmth', urgency: 0.6 },
          { drive: 'rest', urgency: 0 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('shelter');
  });

  it('anticipates: shelters before the band is breached when dusk is near and the forecast is short', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      tick: 200, // dusk window (night starts at DAY_TICKS/2 = 240)
      interoception: baseInteroception({
        drives: [
          { drive: 'safety', urgency: 0 },
          { drive: 'fuel', urgency: 0 },
          { drive: 'warmth', urgency: 0, predictedTicksToLimit: 15 },
          { drive: 'rest', urgency: 0 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('shelter');
  });

  it('does NOT anticipate shelter from a short forecast at midday (no dusk pressure)', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      tick: 20, // deep in the day, nowhere near dusk
      interoception: baseInteroception({
        drives: [
          { drive: 'safety', urgency: 0 },
          { drive: 'fuel', urgency: 0 },
          { drive: 'warmth', urgency: 0, predictedTicksToLimit: 15 },
          { drive: 'rest', urgency: 0 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).not.toBe('shelter');
  });
});

// ---------------------------------------------------------------- priority 4

describe('createScriptedPilot — priority 4: fatigue', () => {
  it('rests when fatigue is high and the ember is safe', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      interoception: baseInteroception({
        drives: [
          { drive: 'safety', urgency: 0 },
          { drive: 'fuel', urgency: 0 },
          { drive: 'warmth', urgency: 0 },
          { drive: 'rest', urgency: 0.6 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('rest');
    expect(out.params.duration).toBeGreaterThan(0);
  });

  it('does not rest when fatigued but unsafe (activation high)', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      interoception: baseInteroception({
        global: {
          activation: 'high',
          capacity: 'high',
          stability: 'mid',
          temperature: 'mid',
          trend: 'stable',
          confidence: 0.8,
        },
        drives: [
          { drive: 'safety', urgency: 0 },
          { drive: 'fuel', urgency: 0 },
          { drive: 'warmth', urgency: 0 },
          { drive: 'rest', urgency: 0.6 },
        ],
      }),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).not.toBe('rest');
  });
});

// ---------------------------------------------------------------- priority 5

describe('createScriptedPilot — priority 5: explore', () => {
  it('explores when nothing is urgent', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx();
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('move_to');
    expect(out.params.dest).toBeDefined();
  });

  it('spreads exploration across different directions over repeated calls (visited memory)', () => {
    const pilot = createScriptedPilot();
    const dests = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const out = pilot.decide(baseCtx({ tick: 100 + i })) as import('../core/types').Intent;
      expect(out.skill).toBe('move_to');
      const dest = out.params.dest as { x: number; y: number };
      dests.add(`${dest.x},${dest.y}`);
    }
    // 8 explore calls in a row with round-robin least-visited direction
    // selection must not all pile into a single destination.
    expect(dests.size).toBeGreaterThan(1);
  });

  it('falls back to wait when every movement/action skill is infeasible', () => {
    const pilot = createScriptedPilot();
    const ctx = baseCtx({
      skills: ALL_SKILLS.map((s) => (s.name === 'wait' ? s : { ...s, feasible: false })),
    });
    const out = pilot.decide(ctx) as import('../core/types').Intent;
    expect(out.skill).toBe('wait');
  });
});

// ---------------------------------------------------------------- determinism

describe('createScriptedPilot — determinism', () => {
  it('produces identical output for identical, independent fixed contexts', () => {
    const ctxA = baseCtx({ observations: [deadwoodObservation] });
    const ctxB = baseCtx({ observations: [deadwoodObservation] });
    const outA = createScriptedPilot().decide(ctxA);
    const outB = createScriptedPilot().decide(ctxB);
    expect(outA).toEqual(outB);
  });

  it('every intent has a non-empty goal and at least one interrupt condition', () => {
    const pilot = createScriptedPilot();
    const fixtures: ContextPacket[] = [
      baseCtx({ observations: [wolfObservation] }),
      baseCtx({
        interoception: baseInteroception({
          global: {
            activation: 'low',
            capacity: 'very_low',
            stability: 'high',
            temperature: 'mid',
            trend: 'fuel falling',
            confidence: 0.8,
          },
        }),
        observations: [deadwoodObservation],
      }),
      baseCtx({
        interoception: baseInteroception({
          drives: [
            { drive: 'safety', urgency: 0 },
            { drive: 'fuel', urgency: 0 },
            { drive: 'warmth', urgency: 0.6 },
            { drive: 'rest', urgency: 0 },
          ],
        }),
      }),
      baseCtx({
        interoception: baseInteroception({
          drives: [
            { drive: 'safety', urgency: 0 },
            { drive: 'fuel', urgency: 0 },
            { drive: 'warmth', urgency: 0 },
            { drive: 'rest', urgency: 0.6 },
          ],
        }),
      }),
      baseCtx(),
    ];
    for (const ctx of fixtures) {
      const out = pilot.decide(ctx) as import('../core/types').Intent;
      expect(out.goal.length).toBeGreaterThan(0);
      expect(out.interruptConditions.length).toBeGreaterThan(0);
      for (const cond of out.interruptConditions) {
        expect(cond).toMatch(/^[a-z]+_(above|below)_\d+(\.\d+)?$/);
      }
    }
  });
});

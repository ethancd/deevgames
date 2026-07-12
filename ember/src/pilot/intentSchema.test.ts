/**
 * EMBER — INTENT_TOOL schema tests (src/pilot/intentSchema.test.ts).
 *
 * A tiny, self-contained JSON-Schema-subset checker (supports exactly the
 * keywords INTENT_TOOL uses: type [string or array of strings], enum,
 * properties/required/additionalProperties on objects, items on arrays,
 * anyOf) validates:
 *   1. one hand-built, schema-shaped example per skill (all 8), including
 *      the awkward edges (shelter's empty params, wait's flare=true, a
 *      nullable style/flare/thought left explicitly null);
 *   2. every intent a real ScriptedPilot run emits over 400 ticks — proving
 *      the schema is broad enough for genuine gameplay decisions, not just
 *      the examples above.
 */

import { describe, expect, it } from 'vitest';
import { INTENT_TOOL } from './intentSchema';
import { createSim } from '../engine';
import { createScriptedPilot } from './scripted';
import type { Intent } from '../core/types';

// ------------------------------------------------------- tiny schema checker

type Schema = Record<string, unknown>;

function typeMatches(t: string, value: unknown): boolean {
  switch (t) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function validate(schema: Schema, value: unknown, path: string): string[] {
  const errors: string[] = [];

  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as Schema[];
    const branchErrors = branches.map((s) => validate(s, value, path));
    if (!branchErrors.some((errs) => errs.length === 0)) {
      errors.push(`${path}: matched none of ${branches.length} anyOf branches`);
    }
    return errors;
  }

  if (Array.isArray(schema.enum)) {
    if (!(schema.enum as unknown[]).includes(value)) {
      errors.push(`${path}: value not in enum`);
    }
    return errors;
  }

  const rawType = schema.type;
  if (rawType !== undefined) {
    const types = Array.isArray(rawType) ? (rawType as string[]) : [rawType as string];
    if (!types.some((t) => typeMatches(t, value))) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${JSON.stringify(value)}`);
      return errors;
    }
  }

  if (typeMatches('object', value) && schema.properties) {
    const obj = value as Record<string, unknown>;
    const properties = schema.properties as Record<string, Schema>;
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in obj)) errors.push(`${path}.${key}: required but missing`);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(properties));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errors.push(`${path}.${key}: additional property not allowed`);
      }
    }
    for (const [key, sub] of Object.entries(properties)) {
      if (key in obj) errors.push(...validate(sub, obj[key], `${path}.${key}`));
    }
  }

  if (typeMatches('array', value) && schema.items) {
    const items = schema.items as Schema;
    (value as unknown[]).forEach((item, i) => {
      errors.push(...validate(items, item, `${path}[${i}]`));
    });
  }

  return errors;
}

function validateIntentTool(input: unknown): string[] {
  return validate(INTENT_TOOL.input_schema, input, 'input');
}

// --------------------------------------------------------------- basics

describe('INTENT_TOOL', () => {
  it('is a strict submit_intent tool', () => {
    expect(INTENT_TOOL.name).toBe('submit_intent');
    expect(INTENT_TOOL.strict).toBe(true);
    expect(typeof INTENT_TOOL.description).toBe('string');
    expect(INTENT_TOOL.description.length).toBeGreaterThan(0);
  });

  it('never uses constraints strict mode rejects', () => {
    const forbidden = ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems'];
    const asString = JSON.stringify(INTENT_TOOL.input_schema);
    for (const kw of forbidden) {
      expect(asString.includes(`"${kw}"`)).toBe(false);
    }
  });

  // ---------------------------------------------------- hand-built examples

  const examples: { name: string; input: unknown }[] = [
    {
      name: 'move_to (direct, style omitted as null)',
      input: {
        goal: 'walk to deadwood',
        skill: 'move_to',
        params: { dest: { x: 3, y: 4 }, style: null },
        interruptConditions: ['threat_above_0.4'],
        thought: 'heading over',
      },
    },
    {
      name: 'move_to (cautious)',
      input: {
        goal: 'route around the wolf',
        skill: 'move_to',
        params: { dest: { x: 10, y: 20 }, style: 'cautious' },
        interruptConditions: ['threat_above_0.5'],
        thought: null,
      },
    },
    {
      name: 'gather',
      input: {
        goal: 'gather fuel',
        skill: 'gather',
        params: { target: 'deadwood-1' },
        interruptConditions: ['fuel_above_0.9'],
        thought: 'getting dim',
      },
    },
    {
      name: 'consume',
      input: {
        goal: 'eat',
        skill: 'consume',
        params: { item: 'sunpatch-2' },
        interruptConditions: ['threat_above_0.5'],
        thought: null,
      },
    },
    {
      name: 'rest',
      input: {
        goal: 'rest a while',
        skill: 'rest',
        params: { duration: 40 },
        interruptConditions: ['threat_above_0.4', 'fatigue_below_0.15'],
        thought: 'tired',
      },
    },
    {
      name: 'shelter (empty params)',
      input: {
        goal: 'get to the den',
        skill: 'shelter',
        params: {},
        interruptConditions: ['threat_above_0.6'],
        thought: null,
      },
    },
    {
      name: 'flee',
      input: {
        goal: 'flee the wolf',
        skill: 'flee',
        params: { from: { x: 5, y: 5 } },
        interruptConditions: ['threat_below_0.15'],
        thought: 'run',
      },
    },
    {
      name: 'focus',
      input: {
        goal: 'check fuel more carefully',
        skill: 'focus',
        params: { region: 'fuel' },
        interruptConditions: ['threat_above_0.5'],
        thought: null,
      },
    },
    {
      name: 'wait (idle)',
      input: {
        goal: 'wait it out',
        skill: 'wait',
        params: { flare: null },
        interruptConditions: ['threat_above_0.3'],
        thought: null,
      },
    },
    {
      name: 'wait (flare)',
      input: {
        goal: 'flare to scare it off',
        skill: 'wait',
        params: { flare: true },
        interruptConditions: ['threat_below_0.2'],
        thought: 'bright burst',
      },
    },
  ];

  for (const { name, input } of examples) {
    it(`validates a well-formed ${name} intent`, () => {
      expect(validateIntentTool(input)).toEqual([]);
    });
  }

  // ------------------------------------------------------- rejects malformed

  it('rejects an unknown skill name', () => {
    const errs = validateIntentTool({
      goal: 'g',
      skill: 'teleport',
      params: {},
      interruptConditions: [],
      thought: null,
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a move_to with a non-numeric dest', () => {
    const errs = validateIntentTool({
      goal: 'g',
      skill: 'move_to',
      params: { dest: { x: 'nope', y: 4 }, style: null },
      interruptConditions: [],
      thought: null,
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects an object with an additional (unschemaed) property', () => {
    const errs = validateIntentTool({
      goal: 'g',
      skill: 'shelter',
      params: { extra: true },
      interruptConditions: [],
      thought: null,
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a top-level object missing a required key', () => {
    const errs = validateIntentTool({
      goal: 'g',
      skill: 'wait',
      params: { flare: null },
      // interruptConditions omitted
      thought: null,
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  // -------------------------------------------- every ScriptedPilot intent

  /** ScriptedPilot stamps a private `_exploreDir` scratch marker into
   *  move_to params purely for its own stateless self-memory (see
   *  scripted.ts's file header), and src/skills/reflexes.ts stamps a
   *  private `_reflexSource` marker (see its header + engine/index.ts's
   *  isReflexIntent()) into every reflex-authored intent's params so
   *  replay can tell reflex- from pilot-authored entries apart without
   *  trusting pilot-controlled `goal` text. Neither is part of the
   *  LLM-facing protocol and a real (strict-schema, additionalProperties:
   *  false) LLM tool call could never emit either, so both are stripped
   *  before checking against the tool schema. Truly-optional fields the
   *  strict schema requires-but-nullable (move_to.style, wait.flare) are
   *  backfilled with `null` when ScriptedPilot/reflexes omit them outright,
   *  matching how src/pilot/llm.ts's own structural validator already
   *  treats "absent" and "null" as equivalent for those fields. */
  function toToolInputShape(intent: Intent): Record<string, unknown> {
    const params = { ...(intent.params as Record<string, unknown>) };
    delete params._exploreDir;
    delete params._reflexSource;
    if (intent.skill === 'move_to' && !('style' in params)) params.style = null;
    if (intent.skill === 'wait' && !('flare' in params)) params.flare = null;
    return {
      goal: intent.goal,
      skill: intent.skill,
      params,
      interruptConditions: intent.interruptConditions,
      thought: intent.thought ?? null,
    };
  }

  it('validates every intent emitted by a real 400-tick ScriptedPilot run', async () => {
    const sim = createSim({ seed: 123, pilot: createScriptedPilot() });
    await sim.run(400);

    expect(sim.intents.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const intent of sim.intents) {
      const errs = validateIntentTool(toToolInputShape(intent));
      if (errs.length > 0) {
        failures.push(`skill=${intent.skill} goal=${JSON.stringify(intent.goal)}: ${errs.join('; ')}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

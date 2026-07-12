/**
 * EMBER — strict tool-call schema for the LLM pilot (src/pilot/intentSchema.ts).
 *
 * Required export per src/pilot/llmContracts.ts:
 *   INTENT_TOOL: { name: 'submit_intent'; description: string;
 *                  input_schema: Record<string, unknown>; strict: true }
 *
 * Mirrors core Intent exactly (src/core/types.ts): `skill` is an 8-value
 * enum, `params` is typed per-skill via `anyOf` (mirroring each SkillDef's
 * precondition() in src/skills/skills.ts — see that file's param reads:
 * requireVec/requireString/requireFiniteNumber/optionalEnum), and every
 * object schema sets `additionalProperties: false` with every property
 * listed in `required` (strict mode requires this — optional fields are
 * expressed as "required but nullable", i.e. `type: [T, 'null']`, rather
 * than omitted from `required`; see src/skills/params.ts's readers, which
 * already treat `null` the same as "absent" for optional params).
 *
 * Deliberately uses NO constraints strict mode rejects: no minLength,
 * minimum/maximum, maxLength, minItems, etc. (per llmContracts.ts's pinned
 * ANTHROPIC API USAGE note). `region`'s allowed values are imported from
 * src/skills/skills.ts's FOCUSABLE_REGIONS (single source of truth) rather
 * than re-typed here, so the two can never silently drift apart.
 */

import { FOCUSABLE_REGIONS } from '../skills';
import type { SkillName } from '../core/types';

/** The 8 SkillName values, in the same order src/core/types.ts declares
 *  them — used both as the `skill` enum and to build `params`'s anyOf. */
const SKILL_NAMES: readonly SkillName[] = [
  'move_to',
  'gather',
  'consume',
  'rest',
  'shelter',
  'flee',
  'focus',
  'wait',
];

const vecSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y'],
  properties: {
    x: { type: 'number', description: 'tile x coordinate' },
    y: { type: 'number', description: 'tile y coordinate' },
  },
};

const moveToParams = {
  type: 'object',
  additionalProperties: false,
  required: ['dest', 'style'],
  properties: {
    dest: { ...vecSchema, description: 'tile to walk to' },
    style: {
      type: ['string', 'null'],
      enum: ['direct', 'cautious', null],
      description:
        'null or "direct": fast, effort 0.6. "cautious": routes around the wolf/water, effort 0.4.',
    },
  },
};

const gatherParams = {
  type: 'object',
  additionalProperties: false,
  required: ['target'],
  properties: {
    target: {
      type: 'string',
      description: 'id of an adjacent deadwood (fuel > 0) or active sunpatch to harvest',
    },
  },
};

const consumeParams = {
  type: 'object',
  additionalProperties: false,
  required: ['item'],
  properties: {
    item: {
      type: 'string',
      description: 'id of an adjacent deadwood (fuel > 0) or active sunpatch to eat from',
    },
  },
};

const restParams = {
  type: 'object',
  additionalProperties: false,
  required: ['duration'],
  properties: {
    duration: { type: 'number', description: 'ticks to rest, resting=true, effort 0' },
  },
};

const shelterParams = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {},
};

const fleeParams = {
  type: 'object',
  additionalProperties: false,
  required: ['from'],
  properties: {
    from: { ...vecSchema, description: 'point to flee away from (e.g. last known wolf position)' },
  },
};

const focusParams = {
  type: 'object',
  additionalProperties: false,
  required: ['region'],
  properties: {
    region: {
      type: 'string',
      enum: [...FOCUSABLE_REGIONS],
      description: 'raises interoceptive confidence for this region; never changes state',
    },
  },
};

const waitParams = {
  type: 'object',
  additionalProperties: false,
  required: ['flare'],
  properties: {
    flare: {
      type: ['boolean', 'null'],
      description:
        'null or false: ordinary idle wait. true: brief bright flare (big fuel cost, scares an attacking wolf).',
    },
  },
};

const PARAMS_BY_SKILL: Record<SkillName, Record<string, unknown>> = {
  move_to: moveToParams,
  gather: gatherParams,
  consume: consumeParams,
  rest: restParams,
  shelter: shelterParams,
  flee: fleeParams,
  focus: focusParams,
  wait: waitParams,
};

export interface IntentTool {
  name: 'submit_intent';
  description: string;
  input_schema: Record<string, unknown>;
  strict: true;
}

export const INTENT_TOOL: IntentTool = {
  name: 'submit_intent',
  description:
    'Submit your single next Intent for the ember-spirit. This is the ONLY channel that ' +
    'affects the world — goal/thought are narration and never change body state. Always set ' +
    'at least one interruptCondition. Choose exactly one skill and pass the params shape for ' +
    'that skill (unused optional fields must still be present, set to null).',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['goal', 'skill', 'params', 'interruptConditions', 'thought'],
    properties: {
      goal: {
        type: 'string',
        description: 'short plan summary; narration only, never causal (<=120 chars kept)',
      },
      skill: {
        type: 'string',
        enum: [...SKILL_NAMES],
        description: 'which skill runtime to invoke',
      },
      params: {
        anyOf: SKILL_NAMES.map((name) => PARAMS_BY_SKILL[name]),
        description: 'the param shape matching `skill` — see per-skill schemas in this anyOf',
      },
      interruptConditions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'grammar: "<var>_above_<num>" | "<var>_below_<num>", <var> is a body var ' +
          '(fuel|heat|damage|fatigue|activation|stability) or "threat". Set at least one.',
      },
      thought: {
        type: ['string', 'null'],
        description: 'optional speech-bubble narration; never causal (<=60 chars kept)',
      },
    },
  },
};

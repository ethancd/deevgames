/**
 * EMBER — arbiter (src/skills/arbiter.ts).
 *
 * validateIntent() is the pilot's only gate into the world: it rejects
 * unknown skill names, malformed/missing params, a malformed
 * interruptConditions shape, and any intent whose skill-specific
 * precondition fails. Reason strings are specific — they are surfaced to
 * the pilot verbatim as `whyNot` so a rejected plan can be corrected
 * instead of retried blindly. The pilot cannot act "by description" — only
 * an intent whose precondition genuinely holds against the live SkillCtx
 * passes.
 *
 * Hardened against a fixed audit finding: this function used to only
 * inspect `intent.skill`/`intent.params`, never `intent.interruptConditions`
 * — a non-array (or array-with-non-string-elements) interruptConditions
 * could sail through ACCEPTED, then crash src/skills/reflexes.ts's
 * interruptTriggered() uncaught on the very next tick. It's also wrapped in
 * a try/catch: a hostile intent whose properties are throwing getters (or
 * whose precondition() somehow throws) is now turned into a clean rejection
 * instead of an uncaught exception that aborts the whole sim.
 */

import type { Intent, SkillCtx, SkillDef } from '../core/types';
import { SKILLS } from './skills';

export type ValidateIntentResult = { ok: true; def: SkillDef } | { ok: false; reason: string };

function validateIntentUnsafe(intent: Intent, ctx: SkillCtx): ValidateIntentResult {
  if (intent === null || typeof intent !== 'object') {
    return { ok: false, reason: 'intent must be an object' };
  }

  const skillName = intent.skill as unknown;
  if (typeof skillName !== 'string' || !(skillName in SKILLS)) {
    return { ok: false, reason: `unknown skill "${String(skillName)}"` };
  }
  const def = SKILLS[skillName as keyof typeof SKILLS];

  const params = intent.params as unknown;
  if (params === null || params === undefined || typeof params !== 'object' || Array.isArray(params)) {
    return { ok: false, reason: 'intent.params must be an object' };
  }

  const conds = intent.interruptConditions as unknown;
  if (!Array.isArray(conds) || !conds.every((c) => typeof c === 'string')) {
    return { ok: false, reason: 'intent.interruptConditions must be an array of strings' };
  }

  const result = def.precondition(params as Record<string, unknown>, ctx);
  if (result !== true) {
    return { ok: false, reason: result };
  }

  return { ok: true, def };
}

export function validateIntent(intent: Intent, ctx: SkillCtx): ValidateIntentResult {
  try {
    return validateIntentUnsafe(intent, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `intent validation threw: ${message}` };
  }
}

/**
 * EMBER — arbiter (src/skills/arbiter.ts).
 *
 * validateIntent() is the pilot's only gate into the world: it rejects
 * unknown skill names, malformed/missing params, and any intent whose
 * skill-specific precondition fails. Reason strings are specific — they are
 * surfaced to the pilot verbatim as `whyNot` so a rejected plan can be
 * corrected instead of retried blindly. The pilot cannot act "by
 * description" — only an intent whose precondition genuinely holds against
 * the live SkillCtx passes.
 */

import type { Intent, SkillCtx, SkillDef } from '../core/types';
import { SKILLS } from './skills';

export type ValidateIntentResult = { ok: true; def: SkillDef } | { ok: false; reason: string };

export function validateIntent(intent: Intent, ctx: SkillCtx): ValidateIntentResult {
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

  const result = def.precondition(params as Record<string, unknown>, ctx);
  if (result !== true) {
    return { ok: false, reason: result };
  }

  return { ok: true, def };
}

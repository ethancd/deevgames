/**
 * EMBER — skills module public API (src/skills/index.ts).
 *
 * Required exports per src/core/types.ts:
 *   SKILLS, validateIntent, checkReflex, interruptTriggered
 */

export { SKILLS, FOCUSABLE_REGIONS } from './skills';
export { validateIntent } from './arbiter';
export type { ValidateIntentResult } from './arbiter';
export { checkReflex, interruptTriggered } from './reflexes';

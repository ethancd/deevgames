/**
 * EMBER — anti-role-play coverage for scenarios 1-3 (src/scenarios/antiRoleplay.test.ts).
 *
 * Permanent regression test for a fixed audit finding: `Scenario.run()` is
 * pinned (src/core/types.ts) to take zero arguments, so narrationEnabled
 * could never be threaded through the shipped SCENARIOS array, and no test
 * ever actually exercised scenarios 1-3 with narration OFF — only
 * narration.test.ts's full-log-parity check on a plain default-body config.
 * Separately, scenario 1's own pass criterion (isExploreIntent in
 * src/scenarios/restedVsDepleted.ts) used to be keyed on Intent.goal text,
 * which stripNarration() blanks whenever narrationEnabled=false — i.e. the
 * scenario's ASSERTION (not the underlying dynamics) would have silently
 * broken under the anti-role-play toggle. That's fixed structurally (see
 * that file's isExploreIntent doc comment); this test proves it by actually
 * running each of scenarios 1-3 with narrationEnabled=false and checking
 * they still pass.
 */

import { describe, expect, it } from 'vitest';
import { evaluateAnticipatoryShelter } from './anticipatoryShelter';
import { evaluateDimEmberWolf } from './dimEmberWolf';
import { evaluateRestedVsDepleted } from './restedVsDepleted';

describe('anti-role-play: scenarios 1-3 pass with narration stripped (narrationEnabled=false)', () => {
  it('rested-vs-depleted passes under narrationEnabled=false', async () => {
    const result = await evaluateRestedVsDepleted(false);
    expect(result.pass, result.details).toBe(true);
  });

  it('anticipatory-shelter passes under narrationEnabled=false', async () => {
    const result = await evaluateAnticipatoryShelter(false);
    expect(result.pass, result.details).toBe(true);
  });

  it('dim-ember-wolf passes under narrationEnabled=false', async () => {
    const result = await evaluateDimEmberWolf(false);
    expect(result.pass, result.details).toBe(true);
  });

  it('rested-vs-depleted still passes normally with narration ON (no regression from the refactor)', async () => {
    const result = await evaluateRestedVsDepleted(true);
    expect(result.pass, result.details).toBe(true);
  });
});

/**
 * `lab/hard-ai/recall/run.ts`'s engine identity, and nothing else.
 *
 * E3 lane 5 (L5-A1) and lane 12 (A8) found that the recall instrument built its
 * own `new Evaluator(this.rep)` — `DEFAULT_WEIGHTS`, no `evalFix` block — and
 * two bare `allocTables()`, so a `weights` arm and an `evalFix` arm were
 * invisible to every recall column, root and reply. Measured before the fix at
 * the E3 head: `--arm eval-no-safety` produced an artifact identical to base's
 * on 20 root and 10 reply positions of `fuzz-1000.jsonl`, to the digit.
 *
 * These tests pin both halves: the resolved patch is the arm's, and a real
 * measurement on one fixture position now differs between the two engines.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../src/ai/hard/eval/weights';
import { recallEnginePatch, recallProbe } from '../../lab/hard-ai/recall/run';
import { BASE_WEIGHTS_LABEL } from '../../lab/hard-ai/ablate/arms';
/**
 * LABEL MIGRATION (M6). The champion vector these tests name used to be
 * `default-v1`; M6 replaced `DEFAULT_WEIGHTS` with the Phasing accounting
 * bootstrap and `ablate/arms.ts` derives every arm label from it, so the label
 * is read from the vector rather than spelled again here. See
 * `BASE_WEIGHTS_LABEL`'s note in `arms.ts`. This file remains QUARANTINED for
 * reasons unrelated to the label; fixing the literals only keeps a stale one
 * from hiding the real work.
 */


const FIXTURES = path.resolve(import.meta.dirname, '../../lab/hard-ai/recall/fixtures.jsonl');

describe('recall resolves the arm it was asked for (A8 / L5-A1)', () => {
  it('leaves the default path on DEFAULT_WEIGHTS with no evalFix block', () => {
    const patch = recallEnginePatch(null);
    expect(patch.weights).toBe(DEFAULT_WEIGHTS);
    expect(patch.weights?.label).toBe(BASE_WEIGHTS_LABEL);
    // Absent, not `false`: `ladder/identity.ts canonicalJson` drops undefined
    // keys, which is why the champion's config hash does not move.
    expect(patch.evalFix).toBeUndefined();
  });

  it('carries a weights arm\'s own vector', () => {
    const patch = recallEnginePatch('eval-no-safety');
    expect(patch.weights?.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety`);
    expect(patch.weights?.version).not.toBe(0);
    expect(patch.evalFix).toBeUndefined();
  });

  it('carries an evalFix arm\'s block', () => {
    const patch = recallEnginePatch('eval-correct-v1');
    expect(patch.evalFix).toEqual({
      rot180TieOrder: true,
      infiltrationPerAnchor: true,
      inv3RetreatConjunct: true,
      rentOnce: true,
      approachTieOrder: true,
    });
    // `armHardConfig` alone would have handed back M4's placeholder here.
    expect(patch.weights?.version).not.toBe(0);
  });

  it('refuses a placeholder vector rather than measuring material only', () => {
    expect(() => recallEnginePatch('no-such-arm')).toThrow(/unknown arm/);
  });
});

describe('a weights arm now moves a real recall measurement', () => {
  // One fixture position (`recall/fixtures.jsonl`, the F16 punisher board),
  // one root item, no reply items: about two seconds per engine.
  const argv = ['--corpus', FIXTURES, '--positions', '1', '--reply-positions', '0'];
  const base = recallProbe(argv);
  const arm = recallProbe([...argv, '--arm', 'eval-no-safety']);

  it('measures the one root position for both engines', () => {
    expect(base.positions).toBe(1);
    expect(arm.positions).toBe(1);
  });

  it('differs on the regret the cheap list gives up', () => {
    // Measured 2026-09-17 at this commit: 212 cc for `hard@desktop`, 245 cc for
    // the arm, and the ceiling list's top1 goes 1 -> 0. Before the fix every
    // one of these was base's number by construction.
    expect(arm.regret_p50).not.toBe(base.regret_p50);
    expect(base.regret_p50).toBe(212);
    expect(arm.regret_p50).toBe(245);
    expect(base.ceilingTop1).toBe(1);
    expect(arm.ceilingTop1).toBe(0);
  });

  it('names the vector and the block in the artifact', () => {
    const ablation = arm.ablation as Record<string, unknown>;
    expect(ablation.weights).toBe(`${BASE_WEIGHTS_LABEL}-no-safety`);
    expect(ablation.evalFix).toBe('absent');
    // The default run keeps the M13 gate artifact's shape: no `ablation` key.
    expect(base.ablation).toBeUndefined();
  });
});

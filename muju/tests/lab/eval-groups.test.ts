import { describe, expect, it } from 'vitest';
import { F, FEATURE_COUNT, INV_BASE } from '../../src/ai/hard/eval/features';
import {
  EVAL_GROUPS,
  EVAL_GROUP_NAMES,
  GROUP_OF,
  INVARIANT_FEATURES,
  STAGE2_FEATURES,
} from '../../lab/hard-ai/audit/eval-groups';

describe('lab/hard-ai/audit/eval-groups.ts', () => {
  it('partitions the 58 features: each index in exactly one group', () => {
    const seen = new Map<number, string>();
    for (const g of EVAL_GROUP_NAMES) {
      for (const i of EVAL_GROUPS[g]) {
        expect(seen.has(i), `feature ${i} appears twice`).toBe(false);
        seen.set(i, g);
      }
    }
    expect(seen.size).toBe(FEATURE_COUNT);
    for (let i = 0; i < FEATURE_COUNT; i++) expect(GROUP_OF[i]).toBe(seen.get(i));
  });

  it('lists indices ascending within a group', () => {
    for (const g of EVAL_GROUP_NAMES) {
      const xs = EVAL_GROUPS[g];
      for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThan(xs[k - 1]);
    }
  });

  it('invariant and stage-2 lists match features.ts', () => {
    expect(INVARIANT_FEATURES).toEqual(Array.from({ length: 20 }, (_, i) => INV_BASE + i));
    expect(STAGE2_FEATURES[0]).toBe(F.EconDelta);
    expect(STAGE2_FEATURES[STAGE2_FEATURES.length - 1]).toBe(FEATURE_COUNT - 1);
    expect(EVAL_GROUPS.material).toEqual([F.Material]);
  });
});

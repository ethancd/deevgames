/**
 * EMBER — scenario harness test (src/scenarios/harness.test.ts).
 *
 * Asserts every scenario in SCENARIOS passes headless, and that the ids
 * match exactly the 4 pinned in src/core/types.ts.
 */

import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './index';
import { runAllScenarios } from './harness';

const EXPECTED_IDS = [
  'rested-vs-depleted',
  'anticipatory-shelter',
  'dim-ember-wolf',
  'miscalibrated-interoception',
];

describe('SCENARIOS', () => {
  it('has exactly the 4 pinned scenario ids', () => {
    expect(SCENARIOS.map((s) => s.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it('every scenario has a non-empty description', () => {
    for (const s of SCENARIOS) {
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});

describe('runAllScenarios', () => {
  it('every scenario passes', async () => {
    const results = await runAllScenarios();
    expect(results).toHaveLength(SCENARIOS.length);
    for (const r of results) {
      expect(r.pass, `${r.id} failed: ${r.details}`).toBe(true);
    }
  });
});

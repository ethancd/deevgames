/**
 * EMBER — scenario harness (src/scenarios/harness.ts).
 *
 * runAllScenarios() runs every entry in SCENARIOS in order and collects
 * their ScenarioResults. Scenarios are independent (each builds its own
 * Sim(s)), so this simply awaits them in sequence for clear, orderly
 * output — parallelizing is left to Promise.all inside each scenario for
 * its own multi-run comparisons (see e.g. restedVsDepleted.ts).
 */

import type { ScenarioResult } from '../core/types';
import { SCENARIOS } from './index';

export async function runAllScenarios(): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of SCENARIOS) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential
    const result = await scenario.run();
    results.push(result);
  }
  return results;
}

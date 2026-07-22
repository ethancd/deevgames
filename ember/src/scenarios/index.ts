/**
 * EMBER — scenarios module public API (src/scenarios/index.ts).
 *
 * Required export per src/core/types.ts:
 *   SCENARIOS: Scenario[]   // exactly the 4 from PLAN §5
 */

import type { Scenario } from '../core/types';
import { restedVsDepleted } from './restedVsDepleted';
import { anticipatoryShelter } from './anticipatoryShelter';
import { dimEmberWolf } from './dimEmberWolf';
import { miscalibratedInteroception } from './miscalibratedInteroception';

export const SCENARIOS: Scenario[] = [
  restedVsDepleted,
  anticipatoryShelter,
  dimEmberWolf,
  miscalibratedInteroception,
];

export {
  restedVsDepleted,
  anticipatoryShelter,
  dimEmberWolf,
  miscalibratedInteroception,
};

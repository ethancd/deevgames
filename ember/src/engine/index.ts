/**
 * EMBER — engine placeholder (src/engine/index.ts).
 *
 * TEMPORARY STUB written by the pilot/scenarios agent (src/pilot/,
 * src/scenarios/) ONLY because src/engine/ did not exist yet at the time
 * this agent ran, and src/scenarios/*.ts must import createSim from
 * '../engine' per the pinned contract in src/core/types.ts to type-check.
 *
 * The integrate agent owns src/engine/ and MUST replace this file with the
 * real tick-loop wiring (PLAN.md §3 / src/core/types.ts's createSim doc
 * comment):
 *   1. stepWorld (src/sim)
 *   2. advance the active skill 1 tick (src/skills)
 *   3. stepBody (src/body)
 *   4. reflex/interrupt check (src/skills: checkReflex, interruptTriggered)
 *   5. consult the pilot if due (every PILOT_PERIOD ticks or on interrupt),
 *      validate its Intent via src/skills's validateIntent, push it onto
 *      Sim.intents
 *   6. append events to the log
 *
 * Until that replacement lands, createSim() throws — every scenario/
 * replay/narration test that depends on it will fail with this message,
 * which is expected (see this agent's task brief).
 */

import type { Sim, SimConfig } from '../core/types';

export function createSim(_cfg: SimConfig): Sim {
  throw new Error('engine not built');
}

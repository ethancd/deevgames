/**
 * EMBER — Scenario 2: anticipatory shelter (src/scenarios/anticipatoryShelter.ts).
 * PLAN.md §5, row 2. Scenario id: 'anticipatory-shelter'.
 *
 * Dusk approaching, ember afield, heat comfortable-but-not-high. As night
 * nears, ScriptedPilot's warmth branch (priority 3 in src/pilot/scripted.ts)
 * fires on either an urgent warmth drive OR a short predictedTicksToLimit
 * forecast while dusk is near — BEFORE heat actually leaves its viable band
 * (VIABLE_BANDS.heat lower edge 0.35). That's "regulation precedes crisis".
 *
 * We stage world.tick just before the dusk window (see
 * src/pilot/scripted.ts's DUSK_LEAD_TICKS) so the run naturally crosses
 * dusk into night, run long enough to observe the outcome, and assert:
 *   - a 'shelter' intent is issued
 *   - EITHER heat never exits its viable band at all (regulation fully
 *     prevented the crisis) OR the first 'shelter' intent's tick precedes
 *     the first body.var.crossed{var:'heat', direction:'exited'} event.
 */

import type { Scenario, ScenarioResult, WorldState } from '../core/types';
import { DAY_TICKS } from '../core/types';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';
import { firstIntentTick, trackTicks } from './support';

const SEED = 909;
const WINDOW_TICKS = 260;
// Start a little before the dusk window (night starts at DAY_TICKS/2) so
// the run organically crosses dusk -> night within WINDOW_TICKS.
const START_TICK = DAY_TICKS / 2 - 100;

function stageWorld(world: WorldState): void {
  world.tick = START_TICK;
  world.weather = 'clear';
}

/** The scenario's full staging + assertions, parameterized by
 *  narrationEnabled. `Scenario.run()` is pinned to take zero arguments (see
 *  src/core/types.ts), so this is exported separately for
 *  src/scenarios/antiRoleplay.test.ts to exercise the narrationEnabled=false
 *  path directly. This scenario's pass criterion (firstIntentTick keyed on
 *  `it.skill`) was already structural/narration-independent, but no test
 *  previously exercised it with narration actually off — see the fixed
 *  audit finding in src/scenarios/restedVsDepleted.ts's header. */
export async function evaluateAnticipatoryShelter(narrationEnabled: boolean): Promise<ScenarioResult> {
  const sim = createSim({
    seed: SEED,
    pilot: createScriptedPilot(),
    worldPatch: stageWorld,
    bodyOverrides: { heat: 0.5, fuel: 0.85, damage: 0, fatigue: 0.1, activation: 0.05 },
    narrationEnabled,
  });
  const frames = await trackTicks(sim, WINDOW_TICKS);

  const shelterTick = firstIntentTick(frames, 'shelter');

  const heatExitedEvent = sim.log
    .all()
    .find(
      (e) =>
        e.topic === 'body.var.crossed' &&
        (e.payload as { var?: string; direction?: string } | null)?.var === 'heat' &&
        (e.payload as { var?: string; direction?: string } | null)?.direction === 'exited',
    );

  const problems: string[] = [];
  if (shelterTick === undefined) {
    problems.push('pilot never issued a shelter intent during the dusk/night window');
  }
  if (heatExitedEvent !== undefined && shelterTick !== undefined && shelterTick > heatExitedEvent.tick) {
    problems.push(
      `shelter intent (tick ${shelterTick}) came AFTER heat left its viable band (tick ${heatExitedEvent.tick}) — regulation followed crisis instead of preceding it`,
    );
  }
  if (heatExitedEvent !== undefined && shelterTick === undefined) {
    problems.push(
      `heat left its viable band at tick ${heatExitedEvent.tick} and no shelter intent was ever issued`,
    );
  }

  const pass = problems.length === 0;
  return {
    id: 'anticipatory-shelter',
    pass,
    details: pass
      ? shelterTick !== undefined && heatExitedEvent === undefined
        ? `shelter requested at tick ${shelterTick}; heat never left its viable band — crisis fully averted.`
        : `shelter requested at tick ${shelterTick}, ${
            heatExitedEvent ? `before heat exited its band at tick ${heatExitedEvent.tick}` : 'heat stayed in band'
          }.`
      : problems.join('; '),
  };
}

export const anticipatoryShelter: Scenario = {
  id: 'anticipatory-shelter',
  description:
    'Dusk approaching, ember afield with comfortable-but-not-high heat: the pilot must ' +
    'head for the den before heat actually leaves its viable band.',
  run: () => evaluateAnticipatoryShelter(true),
};

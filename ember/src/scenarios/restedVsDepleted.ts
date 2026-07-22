/**
 * EMBER — Scenario 1: rested vs. depleted (src/scenarios/restedVsDepleted.ts).
 * PLAN.md §5, row 1. Scenario id: 'rested-vs-depleted'.
 *
 * Same seed, same staged map (a fully-fueled deadwood placed a few tiles
 * from the ember's start, on a passable tile, so both runs can reach it
 * quickly and deterministically), two initial bodies differing ONLY in
 * fuel: 0.9 (rested) vs 0.15 (depleted). Both run under a fresh
 * ScriptedPilot with nothing else urgent staged (day tick, no wolf, low
 * fatigue/activation) so the only causal lever is fuel.
 *
 * "Goal position" for this scenario = the destination of the pilot's FIRST
 * genuine exploration leg (skill 'move_to', narrated with the 'Explore '
 * prefix ScriptedPilot uses only for priority-5 exploration — see
 * src/pilot/scripted.ts). ScriptedPilot has no externally supplied
 * destination; "reaching the goal" is therefore reframed, faithfully to
 * PLAN §5's intent, as "getting to the point of setting off to explore":
 *   - rested body: nothing else is urgent, so it heads straight into its
 *     first explore leg with no detour.
 *   - depleted body: fuel is urgent immediately, so priority 2 fires first
 *     — a gather + consume detour — and only reaches its first explore leg
 *     afterward.
 * We assert the depleted run's gather/consume completions land strictly
 * before its first explore leg, the rested run has none at all, and the
 * two position trajectories diverge.
 */

import type {
  BodyState,
  Intent,
  Scenario,
  ScenarioResult,
  Sim,
  WorldState,
} from '../core/types';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';
import {
  deadwoodNear,
  findPassableNear,
  firstIntentMatching,
  positionsEqual,
  type Frame,
  trackTicks,
} from './support';

const SEED = 4242;
// Long enough for the depleted run (fuel 0.15) to detour + gather + consume
// + start exploring, short enough that the rested run (fuel 0.9) never
// drains anywhere near the fuel-urgency margin (0.25*1.3=0.325) even under
// continuous move_to effort (0.6) — at ~0.004 fuel/tick that margin isn't
// reached until ~tick 144, so 100 ticks leaves a comfortable safety margin
// (see the integrate agent's notes: this constant was tuned down from an
// original 150, which occasionally let the rested run legitimately cross
// into fuel-seeking territory near the end of the window — a real dynamics
// effect, not a pilot/engine bug).
const WINDOW_TICKS = 100;
const DEADWOOD_ID = 'rvsd-deadwood';

function stageWorld(world: WorldState): void {
  world.tick = 0; // fixed day tick — keep heat/cold out of this scenario
  world.weather = 'clear';
  const pos = findPassableNear(world, { x: world.ember.pos.x + 2, y: world.ember.pos.y }, 6);
  world.deadwood.push(deadwoodNear(pos, { x: 0, y: 0 }, DEADWOOD_ID));
}

function stageBody(overrides: Partial<BodyState>): Partial<BodyState> {
  return {
    heat: 0.7,
    damage: 0,
    fatigue: 0.1,
    activation: 0.05,
    ...overrides,
  };
}

/**
 * Structural (not narration-based) fingerprint of a ScriptedPilot explore
 * leg. Fixed audit finding: this used to be `it.skill === 'move_to' &&
 * it.goal.startsWith('Explore')` — i.e. this scenario's own pass criterion
 * was keyed on Intent.goal, which src/engine/index.ts's stripNarration()
 * blanks to '' whenever narrationEnabled=false. That made the scenario's
 * assertion (not the underlying dynamics, which were always fine) silently
 * break under the anti-role-play toggle. exploreIntent() in
 * src/pilot/scripted.ts always issues the same fixed interruptConditions
 * pair below for both its "the unknown" and "for fuel" explore legs, so
 * this structural check is exactly equivalent under narration on OR off.
 */
function isExploreIntent(it: Intent): boolean {
  return (
    it.skill === 'move_to' &&
    it.interruptConditions.includes('fuel_below_0.2') &&
    it.interruptConditions.includes('activation_above_0.6')
  );
}

function isFuelCompletion(topic: string): boolean {
  return topic === 'skill.gather.complete' || topic === 'skill.consume.complete';
}

async function run(fuel: number, narrationEnabled: boolean): Promise<{ frames: Frame[]; sim: Sim }> {
  const sim = createSim({
    seed: SEED,
    pilot: createScriptedPilot(),
    worldPatch: stageWorld,
    bodyOverrides: stageBody({ fuel }),
    narrationEnabled,
  });
  const frames = await trackTicks(sim, WINDOW_TICKS);
  return { frames, sim };
}

/** The scenario's full staging + assertions, parameterized by
 *  narrationEnabled. `Scenario.run()` is pinned to take zero arguments (see
 *  src/core/types.ts), so this is exported separately for
 *  src/scenarios/antiRoleplay.test.ts to exercise the narrationEnabled=false
 *  path directly (closing the anti-role-play coverage gap for this
 *  scenario — see the fixed audit finding above). */
export async function evaluateRestedVsDepleted(narrationEnabled: boolean): Promise<ScenarioResult> {
  const [rested, depleted] = await Promise.all([
    run(0.9, narrationEnabled),
    run(0.15, narrationEnabled),
  ]);

  const restedFirstExplore = firstIntentMatching(rested.frames, isExploreIntent);
  const depletedFirstExplore = firstIntentMatching(depleted.frames, isExploreIntent);

  const restedFuelEvents = rested.sim.log.all().filter((e) => isFuelCompletion(e.topic));
  const depletedFuelEvents = depleted.sim.log.all().filter((e) => isFuelCompletion(e.topic));

  const problems: string[] = [];

  if (restedFuelEvents.length > 0) {
    problems.push(
      `rested run detoured for fuel (${restedFuelEvents.length} gather/consume completion(s)); expected none`,
    );
  }

  if (depletedFuelEvents.length === 0) {
    problems.push('depleted run never completed a gather/consume — no detour observed');
  }

  if (depletedFirstExplore !== undefined) {
    const lateFuelEvents = depletedFuelEvents.filter((e) => e.tick >= depletedFirstExplore);
    if (lateFuelEvents.length > 0) {
      problems.push(
        `depleted run's fuel detour did not fully precede its first explore leg (tick ${depletedFirstExplore})`,
      );
    }
  }

  const diverge = !positionsEqual(rested.frames, depleted.frames);
  if (!diverge) {
    problems.push('trajectories are identical — expected the fuel detour to cause divergence');
  }

  const pass = problems.length === 0;
  return {
    id: 'rested-vs-depleted',
    pass,
    details: pass
      ? `rested explored from tick ${restedFirstExplore ?? '?'} with no fuel detour; ` +
        `depleted completed ${depletedFuelEvents.length} gather/consume step(s) before ` +
        `exploring from tick ${depletedFirstExplore ?? '?'}; trajectories diverged.`
      : problems.join('; '),
  };
}

export const restedVsDepleted: Scenario = {
  id: 'rested-vs-depleted',
  description:
    'Identical map + seed, two initial bodies (fuel 0.9 vs 0.15): the depleted ember ' +
    'must gather+consume fuel before it starts exploring; the rested one heads straight ' +
    'out. Trajectories diverge.',
  run: () => evaluateRestedVsDepleted(true),
};

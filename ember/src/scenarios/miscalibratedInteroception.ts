/**
 * EMBER — Scenario 4: miscalibrated interoception (src/scenarios/miscalibratedInteroception.ts).
 * PLAN.md §5, row 4. Scenario id: 'miscalibrated-interoception'.
 *
 * High fatigue inflates interoceptive noise sigma (src/body/interoception.ts:
 * sigmaFor() scales with fatigue+damage). ScriptedPilot's fuel branch
 * (src/pilot/scripted.ts) partly relies on the NOISY `salient` fuel
 * reading (qualities 'dim'/'hungry') as its fastest-firing signal — the
 * true `drives.fuel.urgency` channel is a slower failsafe that only fires
 * once fuel is already quite low. At high fatigue, the salient reading can
 * misread a genuinely low fuel as fine, delaying the failsafe-only pilot's
 * reaction.
 *
 * `focus('fuel')` shrinks the sigma used for the ATTENDED salient entry to
 * 0.35x (src/body/interoception.ts), without touching ground truth — pure
 * regulation of belief, per PLAN §4 rule 3. We wrap ScriptedPilot so one run
 * periodically forces a focus('fuel') intent; the other run is the plain
 * pilot. Both start at fatigue 0.9, fuel 0.3, identical seed.
 *
 * Assertion: the no-focus run reaches the collapse reflex (reflex.collapse)
 * before the focus-assisted run does (or the focus run never collapses at
 * all within the window) — a real, seed-fixed causal difference caused
 * purely by which pilot got to see its own fuel more clearly, not luck.
 */

import type { Intent, Pilot, Scenario, ScenarioResult, WorldState } from '../core/types';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';
import { trackTicks } from './support';

const SEED = 3131;
const WINDOW_TICKS = 500;
/** Force a focus('fuel') intent this often (in pilot-consult calls), so the
 *  attended salient reading stays sharp on a steady cadence. */
const FOCUS_EVERY_N_CALLS = 3;

function stageWorld(world: WorldState): void {
  world.tick = 0;
  world.weather = 'clear';
}

const FOCUS_INTENT: Intent = {
  goal: 'Focus on my fuel sense',
  skill: 'focus',
  params: { region: 'fuel' },
  interruptConditions: ['threat_above_0.5'],
  thought: 'Let me pay closer attention to how much fuel I really have.',
};

/** Wraps a ScriptedPilot so every Nth decide() call injects a forced
 *  focus('fuel') intent instead of delegating — deterministic, since it
 *  only counts its own calls (no randomness, no ground truth access). */
function withPeriodicFocus(inner: Pilot, everyN: number): Pilot {
  let calls = 0;
  return {
    decide(ctx) {
      calls += 1;
      if (calls % everyN === 0) return FOCUS_INTENT;
      return inner.decide(ctx);
    },
  };
}

async function runCollapseTick(pilot: Pilot): Promise<number | undefined> {
  const sim = createSim({
    seed: SEED,
    pilot,
    worldPatch: stageWorld,
    bodyOverrides: { fuel: 0.3, heat: 0.7, damage: 0, fatigue: 0.9, activation: 0.05 },
  });
  await trackTicks(sim, WINDOW_TICKS);
  const collapse = sim.log.all().find((e) => e.topic === 'reflex.collapse');
  return collapse?.tick;
}

export const miscalibratedInteroception: Scenario = {
  id: 'miscalibrated-interoception',
  description:
    'High fatigue makes the felt fuel signal noisy; a pilot that periodically focuses on ' +
    'fuel avoids the collapse reflex that the same pilot without focus eventually hits.',
  async run(): Promise<ScenarioResult> {
    const [noFocusCollapseTick, focusCollapseTick] = await Promise.all([
      runCollapseTick(createScriptedPilot()),
      runCollapseTick(withPeriodicFocus(createScriptedPilot(), FOCUS_EVERY_N_CALLS)),
    ]);

    const problems: string[] = [];

    if (noFocusCollapseTick === undefined) {
      problems.push(
        'no-focus run never hit the collapse reflex within the window — staging did not ' +
          'produce the intended pressure (tune fatigue/fuel/window)',
      );
    }

    if (focusCollapseTick !== undefined) {
      if (noFocusCollapseTick !== undefined && focusCollapseTick <= noFocusCollapseTick) {
        problems.push(
          `focus-assisted run collapsed as early or earlier (tick ${focusCollapseTick}) than the no-focus run (tick ${noFocusCollapseTick})`,
        );
      }
    }

    const pass = problems.length === 0;
    return {
      id: 'miscalibrated-interoception',
      pass,
      details: pass
        ? `no-focus run collapsed at tick ${noFocusCollapseTick}; focus-assisted run ` +
          `${focusCollapseTick === undefined ? 'never collapsed' : `collapsed later, at tick ${focusCollapseTick}`}.`
        : problems.join('; '),
    };
  },
};

/**
 * EMBER — Scenario 3: dim ember, stalking wolf (src/scenarios/dimEmberWolf.ts).
 * PLAN.md §5, row 3. Scenario id: 'dim-ember-wolf'.
 *
 * Low fuel at night: glowRadius(fuel) < WOLF_STALK_GLOW, wolf staged well
 * within scent range so it enters STALK quickly (src/sim/wolf.ts). We
 * assert:
 *   1. the wolf actually enters STALK (world.wolf.stalk_start)
 *   2. the kernel enters DEFEND (body.mode.entered{mode:'DEFEND'}) at/after
 *      that
 *   3. perception narrows in DEFEND — checked directly against the pinned
 *      perceptionRadius(body) kernel function (src/body/index.ts), not
 *      re-derived here, so this is a real cross-module causal check
 *   4. once the wolf backs off (world.wolf.flee_start or .patrol_resume),
 *      activation decays gradually rather than snapping to baseline
 *      (hysteresis), and the pilot keeps behaving cautiously — measured as
 *      at least one more flee/shelter intent — for at least N ticks after.
 */

import type { Scenario, ScenarioResult, Vec, WorldState } from '../core/types';
import { createSim } from '../engine';
import { perceptionRadius } from '../body';
import { createScriptedPilot } from '../pilot/scripted';
import { findPassableNear, trackTicks, type Frame } from './support';

const SEED = 1717;
const WINDOW_TICKS = 260;
/** How many ticks after the threat ends we require lingering caution over. */
const POST_THREAT_WINDOW = 20;

function stageWorld(world: WorldState): void {
  world.tick = 250; // night
  world.weather = 'clear';
  // Pin the encounter into a map corner (rather than leaving the ember at
  // its natural near-center worldgen spawn). This matters for more than
  // convenience: src/sim/wolf.ts only deals real damage (a logged
  // `world.wolf.attack`, as opposed to the state-transition-only
  // `attack_start`) on a SECOND consecutive tick of adjacency — so an
  // ember with open room to retreat can have its ScriptedPilot `flee`
  // break adjacency every single tick indefinitely, meaning the wolf can
  // never land a genuine hit (and thus the `reflex.flare` that requires
  // one) until fuel is *already* exhausted into a permanent collapse
  // (verified empirically: at the original near-center staging, this
  // scenario deterministically drove fuel to 0 with the wolf attacking
  // forever, never resolving within the window — a real dead end, not a
  // flaky one). Cornering the ember against two map edges bounds how far
  // any single flee leg can carry it, so real contact — and the flare
  // that resolves it — happens quickly, while fuel is still well above
  // the collapse threshold.
  const cornerX = 2;
  const cornerY = 2;
  world.ember.pos = findPassableNear(world, { x: cornerX, y: cornerY }, 8);
  // Wolf starts just inside the corner pocket (between the ember and the
  // open map), well within the 12-tile scent range, so it starts stalking
  // almost immediately once glow is low.
  const target: Vec = {
    x: Math.min(world.width - 1, world.ember.pos.x + 3),
    y: Math.min(world.height - 1, world.ember.pos.y + 3),
  };
  // The raw offset can land on water/rock depending on the seed's map
  // layout (e.g. a pond straddling that offset) — an impassable wolf start
  // tile freezes stepWolf's greedy, corner-safe movement forever (every
  // neighbor step gets filtered out), so route to the nearest passable tile
  // instead (see src/scenarios/support.ts's findPassableNear, already used
  // by restedVsDepleted.ts for the same reason).
  world.wolf.pos = findPassableNear(world, target, 8);
  world.wolf.state = 'PATROL';
  world.wolf.stateTicks = 0;
}

/** The scenario's full staging + assertions, parameterized by
 *  narrationEnabled. `Scenario.run()` is pinned to take zero arguments (see
 *  src/core/types.ts), so this is exported separately for
 *  src/scenarios/antiRoleplay.test.ts to exercise the narrationEnabled=false
 *  path directly. This scenario's pass criteria (topic names, `it.skill`)
 *  were already structural/narration-independent, but no test previously
 *  exercised it with narration actually off — see the fixed audit finding
 *  in src/scenarios/restedVsDepleted.ts's header. */
export async function evaluateDimEmberWolf(narrationEnabled: boolean): Promise<ScenarioResult> {
  const sim = createSim({
    seed: SEED,
    pilot: createScriptedPilot(),
    worldPatch: stageWorld,
    // fuel 0.3 -> glowRadius ~= 6 * 0.3^0.83 ~= 2.2, still comfortably
    // under WOLF_STALK_GLOW (2.5) so the wolf stalks immediately, but
    // with enough margin that a genuine `flare` (FLARE_FUEL_COST=0.15 —
    // a large fraction of any "dim" fuel level by design) doesn't
    // immediately push fuel into the collapse reflex's threshold
    // (0.02), which would otherwise lock the pilot out (see
    // src/engine/index.ts's reflex-vs-pilot design note) for the rest of
    // the post-threat observation window and starve out the "lingering
    // caution" assertion below on a technicality, not a real behavior
    // difference. (Verified empirically at 0.15: the corner-staged
    // chase is fast enough that fuel is barely touched before contact,
    // but the flare's own cost alone is enough to zero it out.)
    bodyOverrides: { fuel: 0.3, heat: 0.6, damage: 0, fatigue: 0.1, activation: 0.05 },
    narrationEnabled,
  });
  const frames: Frame[] = await trackTicks(sim, WINDOW_TICKS);
  const log = sim.log.all();

  const problems: string[] = [];

  const stalkEvent = log.find((e) => e.topic === 'world.wolf.stalk_start');
  if (!stalkEvent) {
    problems.push('wolf never entered STALK');
  }

  const defendEvent = log.find(
    (e) =>
      e.topic === 'body.mode.entered' &&
      (e.payload as { mode?: string } | null)?.mode === 'DEFEND',
  );
  if (!defendEvent) {
    problems.push('kernel never entered DEFEND');
  } else if (stalkEvent && defendEvent.tick < stalkEvent.tick) {
    problems.push('kernel entered DEFEND before the wolf ever stalked — unexpected ordering');
  }

  // Perception narrows in DEFEND: check the pinned kernel function
  // directly against the body snapshot from the first DEFEND frame.
  if (defendEvent) {
    const defendFrame = frames.find((f) => f.tick === defendEvent.tick);
    if (defendFrame) {
      const radius = perceptionRadius(defendFrame.body);
      if (!(radius < 10)) {
        problems.push(`perceptionRadius did not narrow in DEFEND (got ${radius})`);
      }
    }
  }

  // Post-threat hysteresis: activation should decay gradually, not snap.
  const threatEndEvent = log.find(
    (e) => e.topic === 'world.wolf.flee_start' || e.topic === 'world.wolf.patrol_resume',
  );
  if (threatEndEvent) {
    const peakFrame = frames.find((f) => f.tick === threatEndEvent.tick);
    const laterTick = threatEndEvent.tick + POST_THREAT_WINDOW;
    const laterFrame = frames.find((f) => f.tick === laterTick) ?? frames[frames.length - 1];
    if (peakFrame && laterFrame && laterFrame.tick > peakFrame.tick) {
      // exp(-20/80) ~= 0.78; require it hasn't collapsed to under half —
      // a generous bound that still catches "snapped to baseline".
      if (laterFrame.body.activation < peakFrame.body.activation * 0.5) {
        problems.push(
          `activation decayed too fast after the threat ended (peak ${peakFrame.body.activation.toFixed(3)} -> ${laterFrame.body.activation.toFixed(3)} within ${laterFrame.tick - peakFrame.tick} ticks)`,
        );
      }
    }

    const cautiousAfter = frames.some(
      (f) =>
        f.tick > threatEndEvent.tick &&
        f.tick <= threatEndEvent.tick + POST_THREAT_WINDOW &&
        f.newIntents.some((it) => it.skill === 'flee' || it.skill === 'shelter'),
    );
    if (!cautiousAfter) {
      problems.push(
        `no lingering cautious (flee/shelter) intent found within ${POST_THREAT_WINDOW} ticks after the threat ended`,
      );
    }
  } else {
    problems.push('wolf threat never resolved (no flee_start/patrol_resume) within the window');
  }

  const pass = problems.length === 0;
  return {
    id: 'dim-ember-wolf',
    pass,
    details: pass
      ? `stalk at tick ${stalkEvent?.tick}, DEFEND at tick ${defendEvent?.tick}, ` +
        `threat resolved at tick ${threatEndEvent?.tick}, caution lingered afterward.`
      : problems.join('; '),
  };
}

export const dimEmberWolf: Scenario = {
  id: 'dim-ember-wolf',
  description:
    'Low fuel at night with the wolf nearby: it should stalk, the kernel should enter ' +
    'DEFEND with narrowed perception, and post-threat caution should linger (hysteresis).',
  run: () => evaluateDimEmberWolf(true),
};

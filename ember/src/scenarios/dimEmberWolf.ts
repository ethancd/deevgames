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
import { trackTicks, type Frame } from './support';

const SEED = 1717;
const WINDOW_TICKS = 260;
/** How many ticks after the threat ends we require lingering caution over. */
const POST_THREAT_WINDOW = 20;

function stageWorld(world: WorldState): void {
  world.tick = 250; // night
  world.weather = 'clear';
  // Put the wolf close enough (well within the 12-tile scent range) that it
  // starts stalking almost immediately once glow is low.
  const dx = world.width / 2 > world.ember.pos.x ? 6 : -6;
  const target: Vec = {
    x: Math.max(0, Math.min(world.width - 1, world.ember.pos.x + dx)),
    y: world.ember.pos.y,
  };
  world.wolf.pos = target;
  world.wolf.state = 'PATROL';
  world.wolf.stateTicks = 0;
}

export const dimEmberWolf: Scenario = {
  id: 'dim-ember-wolf',
  description:
    'Low fuel at night with the wolf nearby: it should stalk, the kernel should enter ' +
    'DEFEND with narrowed perception, and post-threat caution should linger (hysteresis).',
  async run(): Promise<ScenarioResult> {
    const sim = createSim({
      seed: SEED,
      pilot: createScriptedPilot(),
      worldPatch: stageWorld,
      // fuel 0.15 -> glowRadius ~= 6 * 0.15^0.83 ~= 1.2, well under
      // WOLF_STALK_GLOW (2.5).
      bodyOverrides: { fuel: 0.15, heat: 0.6, damage: 0, fatigue: 0.1, activation: 0.05 },
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
      const laterFrame =
        frames.find((f) => f.tick === laterTick) ?? frames[frames.length - 1];
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
  },
};

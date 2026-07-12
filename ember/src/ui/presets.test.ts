/**
 * EMBER — presets tests (src/ui/presets.test.ts).
 *
 * No DOM needed (pure sim driving), so this deliberately does NOT use the
 * `// @vitest-environment jsdom` pragma — stays on the default 'node'
 * environment alongside WF1's suite.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';
import { PRESETS } from './presets';

const WITHIN_TICKS = 40;

describe('PRESETS', () => {
  it('defines exactly free-run, day-explore, night-defend', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(['day-explore', 'free-run', 'night-defend']);
    for (const id of Object.keys(PRESETS)) {
      expect(PRESETS[id as keyof typeof PRESETS].id).toBe(id);
    }
  });

  it('night-defend reliably reaches DEFEND with the wolf stalking within ~40 ticks of play', async () => {
    const preset = PRESETS['night-defend'];
    const sim = createSim({
      seed: preset.seed,
      pilot: createScriptedPilot(),
      worldPatch: preset.worldPatch,
      bodyOverrides: preset.bodyOverrides,
    });

    let stalkTick: number | null = null;
    let defendTick: number | null = null;
    for (let i = 0; i < WITHIN_TICKS; i++) {
      await sim.step();
      for (const e of sim.log.all()) {
        if (e.topic === 'world.wolf.stalk_start' && stalkTick === null) stalkTick = e.tick;
        if (
          e.topic === 'body.mode.entered' &&
          (e.payload as { mode?: string } | null)?.mode === 'DEFEND' &&
          defendTick === null
        ) {
          defendTick = e.tick;
        }
      }
      if (stalkTick !== null && defendTick !== null) break;
    }

    expect(stalkTick, 'wolf never entered STALK within the window').not.toBeNull();
    expect(defendTick, 'kernel never entered DEFEND within the window').not.toBeNull();
    expect(sim.world.wolf.state).toBe('STALK');
    expect(sim.body.mode).toBe('DEFEND');
  });

  it('day-explore stays healthy EXPLORE with the wolf absent/far by day', async () => {
    const preset = PRESETS['day-explore'];
    const sim = createSim({
      seed: preset.seed,
      pilot: createScriptedPilot(),
      worldPatch: preset.worldPatch,
      bodyOverrides: preset.bodyOverrides,
    });

    await sim.run(60);

    expect(sim.body.mode).toBe('EXPLORE');
    expect(sim.body.fuel).toBeGreaterThan(0.5);
    const wolfDist = Math.max(
      Math.abs(sim.world.wolf.pos.x - sim.world.ember.pos.x),
      Math.abs(sim.world.wolf.pos.y - sim.world.ember.pos.y),
    );
    expect(sim.world.wolf.state === 'PATROL' || wolfDist > 12).toBe(true);
  });

  it('free-run has no staging (fresh default body/world)', () => {
    const preset = PRESETS['free-run'];
    expect(preset.worldPatch).toBeUndefined();
    expect(preset.bodyOverrides).toBeUndefined();
  });
});

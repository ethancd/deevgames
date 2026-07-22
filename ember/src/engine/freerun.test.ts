/**
 * EMBER — free-run sanity check (src/engine/freerun.test.ts).
 *
 * Not a scenario (no staged setup): a plain 2000-tick run with
 * ScriptedPilot on a naturally-generated world, seeded for determinism.
 * This is a coarse end-to-end smoke test of the whole wired system —
 * sim + body + skills + pilot + engine tick loop — running far longer than
 * any of the 4 demo scenarios.
 *
 * Assertions:
 *   1. At least 3 distinct Modes were entered over the run (EXPLORE is the
 *      starting mode; we count it plus every body.mode.entered payload) —
 *      i.e. the kernel's hysteretic mode machinery actually engages under
 *      realistic, unscripted play, not just in scenarios hand-tuned to
 *      force a specific mode.
 *   2. The ember either survives in a healthy state, OR — if it ends up
 *      critically depleted — the log contains a LEGIBLE causal explanation
 *      (a recent collapse reflex, a recent wolf attack, or high sustained
 *      damage) rather than an unexplained silent zero-out. Either outcome
 *      is an acceptable pass; what's not acceptable is death with no
 *      evidence of why in the event log.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { createScriptedPilot } from '../pilot/scripted';

const SEED = 42;
const TICKS = 2000;
/** How far back from the end of the run to look for an explanation. */
const TAIL_WINDOW = 200;

describe('freerun sanity (2000 ticks, ScriptedPilot, natural worldgen)', () => {
  it('survives or dies for a legible reason; at least 3 distinct modes entered', async () => {
    const sim = createSim({ seed: SEED, pilot: createScriptedPilot() });
    const initialMode = sim.body.mode;

    await sim.run(TICKS);

    expect(sim.world.tick).toBe(TICKS);
    expect(sim.intents.length).toBeGreaterThan(0);

    // ---- at least 3 distinct modes entered ----
    const modesSeen = new Set<string>([initialMode]);
    for (const e of sim.log.all()) {
      if (e.topic === 'body.mode.entered') {
        const mode = (e.payload as { mode?: string } | null | undefined)?.mode;
        if (typeof mode === 'string') modesSeen.add(mode);
      }
    }
    expect(
      modesSeen.size,
      `expected >= 3 distinct modes over ${TICKS} ticks, saw: ${[...modesSeen].join(', ')}`,
    ).toBeGreaterThanOrEqual(3);

    // ---- survives, or dies for a legible reason ----
    const finalFuel = sim.body.fuel;
    const finalDamage = sim.body.damage;
    const survived = finalFuel > 0.05 && finalDamage < 0.9;

    if (!survived) {
      const tailStart = sim.world.tick - TAIL_WINDOW;
      const log = sim.log.all();
      const recentCollapse = log.some((e) => e.topic === 'reflex.collapse' && e.tick >= tailStart);
      const recentAttack = log.some((e) => e.topic === 'world.wolf.attack' && e.tick >= tailStart);
      const highDamage = finalDamage >= 0.5;
      const legible = recentCollapse || recentAttack || highDamage;
      expect(
        legible,
        `ember ended critical (fuel=${finalFuel.toFixed(3)}, damage=${finalDamage.toFixed(3)}) with no ` +
          `legible cause in the last ${TAIL_WINDOW} ticks (no recent reflex.collapse, no recent ` +
          `world.wolf.attack, and damage below 0.5) — this looks like an unexplained silent failure.`,
      ).toBe(true);
    } else {
      expect(survived).toBe(true);
    }
  });
});

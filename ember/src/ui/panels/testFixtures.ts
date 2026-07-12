/**
 * EMBER — shared test fixtures for the panels' component tests
 * (src/ui/panels/testFixtures.ts).
 *
 * Not part of the pinned contract; internal to this directory, used only by
 * *.test.tsx here. Builds REAL ContextPackets/BodyStates by driving a real
 * `createSim` (ScriptedPilot) a handful of ticks — per the task brief
 * ("build a real ContextPacket by running a real sim briefly") — rather than
 * hand-writing fixture literals that could drift from the real shape WF1
 * actually produces.
 */

import type { BodyState, ContextPacket, Intent, Pilot, WolfEntity, WorldState } from '../../core/types';
import { createSim } from '../../engine';
import { createScriptedPilot } from '../../pilot/scripted';
import type { BodyHistoryPoint } from '../contracts';

export interface SimFixture {
  packet: ContextPacket;
  intent: Intent;
  body: BodyState;
  wolf: WolfEntity;
  history: BodyHistoryPoint[];
}

/** Wraps a Pilot so every ContextPacket it's handed (and the Intent it
 *  returns) is captured — the most direct way to get a real, engine-built
 *  ContextPacket without duplicating createSim's private buildContextPacket
 *  logic here. */
function capturingPilot(inner: Pilot, sink: { packet: ContextPacket | null; intent: Intent | null }): Pilot {
  return {
    async decide(ctx) {
      const intent = await inner.decide(ctx);
      sink.packet = ctx;
      sink.intent = intent;
      return intent;
    },
  };
}

/** Runs a fresh sim for `ticks` ticks (default long enough to guarantee at
 *  least one pilot consult under PILOT_PERIOD=8), sampling a
 *  BodyHistoryPoint every tick, and returns the LAST ContextPacket/Intent
 *  the pilot saw plus the final body/wolf/history — real data throughout,
 *  never hand-authored. */
export async function buildSimFixture(opts: {
  seed?: number;
  ticks?: number;
  bodyOverrides?: Partial<BodyState>;
  worldPatch?: (world: WorldState) => void;
} = {}): Promise<SimFixture> {
  const sink: { packet: ContextPacket | null; intent: Intent | null } = { packet: null, intent: null };
  const pilot = capturingPilot(createScriptedPilot(), sink);
  const sim = createSim({
    seed: opts.seed ?? 7,
    pilot,
    bodyOverrides: opts.bodyOverrides,
    worldPatch: opts.worldPatch,
  });

  const history: BodyHistoryPoint[] = [];
  const ticks = opts.ticks ?? 24;
  for (let i = 0; i < ticks; i++) {
    await sim.step();
    if (sim.world.tick % 2 === 0) {
      history.push({
        tick: sim.world.tick,
        fuel: sim.body.fuel,
        heat: sim.body.heat,
        damage: sim.body.damage,
        fatigue: sim.body.fatigue,
        activation: sim.body.activation,
        stability: sim.body.stability,
        mode: sim.body.mode,
      });
    }
  }

  if (!sink.packet || !sink.intent) {
    throw new Error('testFixtures: pilot was never consulted within the requested tick budget');
  }

  return {
    packet: sink.packet,
    intent: sink.intent,
    body: { ...sim.body, debts: { ...sim.body.debts } },
    wolf: { ...sim.world.wolf, pos: { ...sim.world.wolf.pos } },
    history,
  };
}

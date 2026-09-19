// @vitest-environment node
/** Current Phasing contracts for the optional P8 cap. The historical Standard
 * snapshots, Metal-v2.8 mock and exact old search pins remain in their file. */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { isLegalAction } from '../../../src/game/legality';
import type { GameState } from '../../../src/game/types';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { TurnFlag } from '../../../src/ai/hard/gen/turn';
import { generateAt, INF, macroTtEligible, pvs } from '../../../src/ai/hard/search/pvs';
import { newTTEntry } from '../../../src/ai/hard/search/tt';
import { WorkClass, WORK_COST } from '../../../src/ai/hard/search/time';
import { homeWitness } from '../../../src/ai/hard/tactics/prover';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { buildState } from './game-fixture';
import { prepare } from './search-fixture';

const gen = { ...DESKTOP.gen, K: 8, maxPlacePlans: 1, maxPromotions: 1,
  action: { ...DESKTOP.gen.action, widths: Int32Array.of(2, 1, 1, 1), keep: 4 },
  purchase: { ...DESKTOP.gen.purchase, maxPlans: 1, maxBodies: 0, squares: 1 } };
const config: Partial<HardConfig> = { maxDepth: 1, useDfpn: false, gen, genInterior: gen,
  quiesce: { ...DESKTOP.quiesce, maxPly: 0, maxCandidates: 2 } };
const capped: Partial<HardConfig> = { ...config, searchFix: { rescueCap: 1 } };
const occupied = () => buildState({ white: 10, reserves: new Array(100).fill(0), units: [
  { def: 'metal_3', owner: 'black', x: 0, y: 0 },
  { def: 'shadow_3', owner: 'white', x: 1, y: 0 },
  { def: 'shadow_3', owner: 'white', x: 0, y: 1 },
  { def: 'plant_1', owner: 'black', x: 9, y: 9 },
] });

/** Wrap the real bounded Phasing prover, retaining the engine-installed cap. */
function observeWitness(engine: HardEngine): () => number {
  let calls = 0;
  for (const generator of [engine.ctx.gen, engine.ctx.genInterior, engine.ctx.genQuiesce]) {
    generator.setRescueWitness((p, invader, out) => {
      calls++;
      return homeWitness(p, invader, 2_048, out);
    });
  }
  return () => calls;
}

function completeReplay(state: GameState, actions: AIAction[]): GameState {
  const mover = state.turn.currentPlayer;
  expect(actions.length).toBeGreaterThan(0);
  for (const action of actions) {
    expect(state.phase).toBe('playing');
    expect(state.turn.currentPlayer).toBe(mover);
    expect(isLegalAction(state, action), action.type).toBe(true);
    state = applyAction(state, action);
  }
  if (state.phase !== 'victory') {
    expect(state.turn.currentPlayer).not.toBe(mover);
    expect(state.turn.phase).toBe('action');
    expect(state.turn.actionsRemaining).toBe(4);
  }
  return state;
}

describe('P8 Phasing rescue cap production wiring', () => {
  it('shares one charged witness across all three generators and suppresses TT publication after refusal', () => {
    const state = occupied(), { engine, ctx, p } = prepare(state, 100_000, capped);
    const calls = observeWitness(engine), before = ctx.rep.digest(p);
    const generators = [ctx.gen, ctx.genInterior, ctx.genQuiesce];
    for (let index = 0; index < generators.length; index++) {
      ctx.truncated = false;
      const n = generateAt(ctx, p, ctx.tables[0], 0, generators[index]);
      expect(n).toBeGreaterThan(0);
      expect(calls()).toBe(1);
      expect(ctx.genStats.rescueCapped).toBe(index === 0 ? 0 : 1);
      expect(ctx.truncated).toBe(index !== 0);
      let rescues = 0;
      for (let i = 0; i < n; i++) {
        const turn = ctx.turns[0][i];
        const check = verifyTurn(ctx.rep, state, p, turn, ctx.keep[0]);
        expect(check.verified, check.reason).toBe(true);
        completeReplay(state, check.actions);
        if ((turn.flags & TurnFlag.HOME_RESCUE) !== 0) {
          rescues++;
          expect(check.endState.board.units.some(u => u.id === 'u0')).toBe(false);
        }
      }
      if (index === 0) expect(rescues).toBeGreaterThan(0);
      expect(ctx.rep.digest(p)).toBe(before);
    }
    expect(ctx.meter.byClass[WorkClass.PROVER] - ctx.stats.proverCalls).toBe(1);
    const pricedWithoutProofs = Array.from(ctx.meter.byClass).reduce((sum, count, cls) =>
      sum + (cls === WorkClass.PROVER ? 0 : count * WORK_COST[cls]), 0);
    expect(ctx.meter.used).toBe(pricedWithoutProofs + WORK_COST[WorkClass.PROVER]);
    expect(ctx.meter.exhausted()).toBe(false);

    // The root is eligible absent truncation; a partial root must not pass
    // merely because TT use was already forbidden by its phase or AP count.
    expect(macroTtEligible(p)).toBe(true);
    ctx.truncated = false;
    ctx.tt.clear();
    pvs(ctx, p, 1, -INF, INF, 0, 0);
    expect(ctx.truncated).toBe(true);
    expect(calls()).toBe(1);
    expect(ctx.tt.probe(p.kposLo, p.kposHi, newTTEntry())).toBe(false);
    expect(ctx.meter.exhausted()).toBe(false);
    expect(ctx.rep.digest(p)).toBe(before);
  });

  it('rearms the same engine cap each turn and returns deterministic complete legal macros', async () => {
    const state = occupied(), engine = new HardEngine(capped), calls = observeWitness(engine);
    const first = await engine.searchTurn(state, { work: 25_000 });
    expect(calls()).toBe(1);
    const second = await engine.searchTurn(state, { work: 25_000 });
    expect(calls()).toBe(2);
    for (const result of [first, second]) {
      expect(result.source).toBe('search');
      completeReplay(state, result.actions);
    }
    expect(second.actions).toEqual(first.actions);
    expect(second.endKey).toBe(first.endKey);
    expect(second.work).toBe(first.work);
  });

  it('is inert when no home is occupied, with and without the optional flag', async () => {
    const state = buildState({ reserves: new Array(100).fill(0), units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'black', x: 8, y: 8 },
    ] });
    const absent = new HardEngine(config), present = new HardEngine(capped);
    const absentCalls = observeWitness(absent), presentCalls = observeWitness(present);
    const a = await absent.searchTurn(state, { work: 25_000 });
    const b = await present.searchTurn(state, { work: 25_000 });
    expect(absentCalls()).toBe(0);
    expect(presentCalls()).toBe(0);
    for (const result of [a, b]) completeReplay(state, result.actions);
    expect(b.actions).toEqual(a.actions);
    expect(b.endKey).toBe(a.endKey);
    expect(b.work).toBe(a.work);
    expect(b.stats.proverCalls).toBe(a.stats.proverCalls);
  });
});

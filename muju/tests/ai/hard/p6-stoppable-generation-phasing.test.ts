// @vitest-environment node
/** Current Phasing contracts for P6. Historical Standard snapshot/golden tests
 * remain unchanged in p6-stoppable-generation.test.ts. No corpus is loaded. */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { isLegalAction } from '../../../src/game/legality';
import type { GameState } from '../../../src/game/types';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { allocTurn, copyTurn, generateAt, INF, macroTtEligible, pvs } from '../../../src/ai/hard/search/pvs';
import { allocState } from '../../../src/ai/hard/core/state';
import { newKeepSetTable } from '../../../src/ai/hard/core/action';
import { searchRoot } from '../../../src/ai/hard/search/root';
import { newTTEntry } from '../../../src/ai/hard/search/tt';
import { WorkClass, WORK_COST } from '../../../src/ai/hard/search/time';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { buildState } from './game-fixture';
import { prepare } from './search-fixture';

const gen = { ...DESKTOP.gen, K: 8, maxPlacePlans: 1, maxPromotions: 1,
  action: { ...DESKTOP.gen.action, widths: Int32Array.of(2, 1, 1, 1), keep: 4 },
  purchase: { ...DESKTOP.gen.purchase, maxPlans: 1, maxBodies: 0, squares: 1 } };
const config: Partial<HardConfig> = { maxDepth: 1, useDfpn: false, gen, genInterior: gen,
  quiesce: { ...DESKTOP.quiesce, maxPly: 0, maxCandidates: 2 } };
const ordinary = () => buildState({ reserves: new Array(100).fill(0), units: [
  { def: 'plant_1', owner: 'white', x: 2, y: 2 },
  { def: 'plant_1', owner: 'black', x: 8, y: 8 },
] });

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

function expectCompleteResult(engine: HardEngine, state: GameState, actions: AIAction[], endKey: string): void {
  const end = engine.ctx.rep.pack(completeReplay(state, actions), allocState());
  const key = (end.kposHi >>> 0).toString(16).padStart(8, '0')
    + (end.kposLo >>> 0).toString(16).padStart(8, '0');
  expect(endKey).toBe(key);
}

describe('P6 Phasing stoppable generation', () => {
  it('latches a stop inside production generation, restores the root and retains complete candidates', () => {
    const state = ordinary(), { ctx, p } = prepare(state, 100_000, config);
    const before = ctx.rep.digest(p);
    let polls = 0;
    ctx.stop = () => ++polls >= 2;
    const n = generateAt(ctx, p, ctx.tables[0], 0);
    expect(polls).toBe(2);
    expect(ctx.truncated).toBe(true);
    expect(ctx.meter.exhausted()).toBe(false);
    expect(ctx.rep.digest(p)).toBe(before);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const check = verifyTurn(ctx.rep, state, p, ctx.turns[0][i], ctx.keep[0]);
      expect(check.verified, check.reason).toBe(true);
      completeReplay(state, check.actions);
    }
  });

  it.each([false, true])('salvages a complete macro after an already-expired stop (upkeep review: %s)', review => {
    const state = review ? buildState({ reserves: new Array(100).fill(0), reviewUpkeep: { white: true }, units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'fire_2', owner: 'white', x: 3, y: 2 },
      { def: 'plant_1', owner: 'black', x: 8, y: 8 },
    ] }) : ordinary();
    const engine = new HardEngine(config);
    engine.ctx.stop = () => true;
    const result = searchRoot(engine, state, { work: 100_000, canonical: state, config: engine.config });
    expect(result.source).toBe('search');
    expect(result.depth).toBe(0);
    expect(engine.ctx.truncated).toBe(true);
    expect(engine.ctx.meter.exhausted()).toBe(false);
    completeReplay(state, result.actions);
    if (review) expect(result.actions.some(a => a.type === 'PAY_UPKEEP')).toBe(true);
  });

  it('salvages when the last pre-deepening poll is false and the first deepening poll expires', () => {
    const state = ordinary(), engine = new HardEngine(config);
    const decisions: boolean[] = [];
    let entered = false;
    const newSearch = engine.ctx.tt.newSearch.bind(engine.ctx.tt);
    const iteration = vi.spyOn(engine.ctx.tt, 'newSearch').mockImplementation(() => {
      entered = true;
      newSearch();
    });
    engine.ctx.stop = () => { decisions.push(entered); return entered; };
    try {
      const result = searchRoot(engine, state, { work: 100_000, canonical: state, config: engine.config, expose: true });
      const firstExpiry = decisions.indexOf(true);
      expect(firstExpiry).toBeGreaterThan(0);
      expect(decisions[firstExpiry - 1]).toBe(false);
      expect(iteration).toHaveBeenCalledTimes(1);
      expect(result.stats.nodes).toBe(0);
      expect(result.stats.stopReason).toBe('abort');
      expect(result.depth).toBe(0);
      expect(result.source).toBe('search');
      expect(result.fallback).toBeUndefined();
      expect(engine.ctx.truncated).toBe(true);
      expect(result.candidateSource).toBe('generator-list');
      expect(result.candidates!.filter(c => c.chosen).map(c => c.endKey)).toEqual([result.endKey]);
      expectCompleteResult(engine, state, result.actions, result.endKey);
    } finally {
      iteration.mockRestore();
    }
  });

  it('owns its initial salvage through stopped regeneration and reports the original candidate list', () => {
    const state = buildState({ reserves: new Array(100).fill(0), reviewUpkeep: { white: true }, units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'fire_2', owner: 'white', x: 3, y: 2 },
      { def: 'plant_1', owner: 'black', x: 8, y: 8 },
    ] });
    const engine = new HardEngine(config), expected = allocTurn();
    let calls = 0, initialCount = 0, regeneratedCount = -1, regenerating = false;
    const generate = engine.ctx.gen.generate.bind(engine.ctx.gen);
    const generation = vi.spyOn(engine.ctx.gen, 'generate').mockImplementation((...args) => {
      calls++;
      if (calls === 2) {
        regenerating = true;
        // These are the actual destination records of the first generation.
        // A saved alias loses both its actions and upkeep choice here.
        for (const turn of engine.ctx.turns[0]) {
          turn.actions.fill(-1); turn.count = 0; turn.keepMask?.fill(0);
        }
        engine.ctx.keep[0].masks.fill(0); engine.ctx.keep[0].count = 0;
      }
      const n = generate(...args);
      if (calls === 1) {
        initialCount = n;
        expect(n).toBeGreaterThan(1);
        // Rank a real legal candidate beyond the first slot. The stopped
        // regeneration retains fewer entries, so it cannot repair this alias.
        args[6][n - 1].gainCc = 1_000_000;
        copyTurn(expected, args[6][n - 1]);
        expect(expected.keepMask?.length).toBe(4);
      } else if (calls === 2) regeneratedCount = n;
      return n;
    });
    engine.ctx.stop = () => regenerating;
    try {
      const result = searchRoot(engine, state, { work: 100_000, canonical: state, config: engine.config, expose: true });
      expect(calls).toBe(2);
      expect(regeneratedCount).toBeGreaterThan(0);
      expect(regeneratedCount).toBeLessThan(initialCount);
      const initial = verifyTurn(engine.ctx.rep, state, engine.rootState, expected, newKeepSetTable());
      expect(initial.verified, initial.reason).toBe(true);
      expect(result.actions).toEqual(initial.actions);
      expect(result.actions.some(a => a.type === 'PAY_UPKEEP')).toBe(true);
      expect(result.scoreCc).toBe(expected.gainCc);
      expect(result.depth).toBe(0);
      expect(result.source).toBe('search');
      expect(result.fallback).toBeUndefined();
      expect(result.stats.stopReason).toBe('abort');
      expect(engine.ctx.truncated).toBe(true);
      expect(result.stats.nodes).toBe(1);
      expect(result.rootTrace!.filter(r => r.depth === 1)).toEqual([
        expect.objectContaining({ searched: 0, completed: false, truncated: true }),
      ]);
      expect(result.candidateSource).toBe('generator-list');
      expect(result.candidates).toHaveLength(initialCount);
      expect(result.candidates!.filter(c => c.chosen).map(c => c.endKey)).toEqual([result.endKey]);
      expect(result.candidates!.every(c => !c.searched)).toBe(true);
      expectCompleteResult(engine, state, result.actions, result.endKey);
    } finally {
      generation.mockRestore();
    }
  });

  it('does not publish a stopped macro-eligible node to the TT', () => {
    const { ctx, p } = prepare(ordinary(), 100_000, config);
    const before = ctx.rep.digest(p);
    expect(macroTtEligible(p)).toBe(true);
    ctx.stop = () => true;
    pvs(ctx, p, 1, -INF, INF, 0, 0);
    expect(ctx.truncated).toBe(true);
    expect(ctx.meter.exhausted()).toBe(false);
    expect(ctx.tt.probe(p.kposLo, p.kposHi, newTTEntry())).toBe(false);
    expect(ctx.rep.digest(p)).toBe(before);
  });

  it('counts actual generator home proofs without adding their diagnostic count to priced work', () => {
    const state = buildState({ reserves: new Array(100).fill(0), units: [
      { def: 'plant_1', owner: 'white', x: 9, y: 9 },
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'fire_1', owner: 'black', x: 8, y: 9 },
    ] });
    const { ctx, p } = prepare(state, 100_000, config);
    const before = ctx.rep.digest(p), callsBefore = ctx.rep.fullProverCalls;
    const n = generateAt(ctx, p, ctx.tables[0], 0);
    const calls = ctx.rep.fullProverCalls - callsBefore;
    expect(calls).toBeGreaterThan(0);
    expect(ctx.stats.proverCalls).toBe(calls);
    expect(ctx.meter.byClass[WorkClass.PROVER]).toBe(calls);
    const priced = Array.from(ctx.meter.byClass).reduce((sum, count, cls) =>
      sum + (cls === WorkClass.PROVER ? 0 : count * WORK_COST[cls]), 0);
    expect(ctx.meter.used).toBe(priced);
    expect(ctx.rep.digest(p)).toBe(before);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const check = verifyTurn(ctx.rep, state, p, ctx.turns[0][i], ctx.keep[0]);
      expect(check.verified, check.reason).toBe(true);
    }
  });
});

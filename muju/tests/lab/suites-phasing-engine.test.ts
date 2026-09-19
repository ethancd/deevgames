// @vitest-environment node
/** Injected computation only; canonical replay/fresh pack remain real. No Hard search. */
import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import { getElementGraph } from '../../src/game/elements';
import { upkeepForTier } from '../../src/game/upkeep';
import { calculateAttackPower } from '../../src/game/combat';
import { DEFAULT_WEIGHTS, cloneWeights } from '../../src/ai/hard/eval/weights';
import { EMPTY_BOOK } from '../../src/ai/hard/book/format';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { makePosition, positionRef, replayMacro, sourceBinding, semanticHash } from '../../lab/hard-ai/suites/phasing/canonical';
import { AdapterRefusal, createPhasingEngineAdapter, packedEndpointKey, weightIdentity } from '../../lab/hard-ai/suites/phasing/engine-adapter';
import type { EngineFacade } from '../../lab/hard-ai/suites/phasing/engine-adapter';
import type { HardConfig } from '../../src/ai/hard/config';
import type { RootResult } from '../../src/ai/hard/search/root';
import type { AIAction, GameState, InvariantPair, PhasingPosition, PlayerId, SourceBinding } from '../../lab/hard-ai/suites/phasing/format';

const binding = sourceBinding(DEFAULT_RULES);
const pass: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
function root(id = 'root', bound = binding): PhasingPosition {
  const board = createEmptyBoard(); for (const row of board.cells) for (const cell of row) cell.resourceLayers = 0;
  board.units = [{ id: 'w', definitionId: 'fire_1', owner: 'white', position: { x: 2, y: 2 }, hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0, attackedThisTurn: [] }, { id: 'b', definitionId: 'water_1', owner: 'black', position: { x: 7, y: 7 }, hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0, attackedThisTurn: [] }];
  const state: GameState = { ruleset: 'phasing', actionsPerTurn: 4, blackCrystalHandicap: bound.rules.handicap, pendingSummons: [], phase: 'playing', board,
    players: { white: { id: 'white', startCorner: { x: 0, y: 0 }, resources: 20, resourcesGained: 0 }, black: { id: 'black', startCorner: { x: 9, y: 9 }, resources: 20, resourcesGained: 0 } },
    turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: 4, turnNumber: 1 }, winner: null, selectedUnit: null, validMoves: [], validAttacks: [], inactivityPlies: 0, progressThisTurn: false, inactivityRule: bound.rules.inactivityRule, victoryRule: bound.rules.victoryRule };
  return makePosition(id, state, bound, { kind: 'authored-diagram', rationale: 'Finite adapter protocol fixture; no strength outcome.' });
}
function selected(state: GameState, work: number): RootResult {
  const trace = replayMacro(state, pass), stats = newSearchStats(); stats.rung = work;
  return { actions: structuredClone(pass), scoreCc: 17, depth: 1, work: 8, source: 'search', endKey: packedEndpointKey(trace.endpoint), stats };
}
type Behavior = (state: GameState, work: number, facade: MutableFacade) => Promise<RootResult>;
interface MutableFacade extends EngineFacade { cappedProverCalls: number }
function factory(behavior?: Behavior, observer?: (config: HardConfig, seed: number, operation: 'seed' | 'eval' | 'search', perspective?: PlayerId) => void): (config: HardConfig) => EngineFacade {
  return config => {
    let seed = -1;
    const facade: MutableFacade = { config, get currentWeights() { return config.weights; }, cappedProverCalls: 0,
      setSeed(value) { seed = value; observer?.(config, seed, 'seed'); },
      fullEvaluate(_state, perspective) { observer?.(config, seed, 'eval', perspective); return config.weights.w[1]; },
      async searchTurn(state, opts) { observer?.(config, seed, 'search'); return behavior ? behavior(state, opts.work, facade) : selected(state, opts.work); } };
    return facade;
  };
}

describe('Phasing fixed-work adapter identity', () => {
  it('resolves real desktop weights, owns their vectors and uses EMPTY_BOOK for eval and search', async () => {
    const weights = cloneWeights(DEFAULT_WEIGHTS); weights.w[1] += 3; const expected = weightIdentity(weights), seen: HardConfig[] = [];
    const adapter = createPhasingEngineAdapter({ seed: 1234, weights, restoreBinding: binding, createEngine: factory(undefined, (config, seed, operation, perspective) => {
      expect(seed).toBe(1234); expect(config.book).toBe(EMPTY_BOOK); expect(weightIdentity(config.weights)).toBe(expected); expect(config.weights.version).toBeGreaterThan(0);
      if (operation === 'eval') expect(perspective).toBe('black'); if (operation === 'seed') seen.push(config);
    }) });
    weights.w[1] += 1000;
    const evalResult = await adapter.evaluate(root(), 'black'), searchResult = await adapter.search(root(), 25000);
    expect(evalResult.value.engineIdentity).toBe(adapter.engineIdentity); expect(searchResult.turn.engineIdentity).toBe(adapter.engineIdentity); expect(evalResult.value.perspective).toBe('black'); expect(searchResult.value.perspective).toBe('white');
    expect(adapter.identity.weightsSha256).toBe(expected); expect(adapter.identity.executionKind).toBe('injected-test'); expect(adapter.identity.book).toBe('EMPTY_BOOK');
    expect(seen).toHaveLength(2); expect(seen[0]).not.toBe(seen[1]); expect(searchResult.diagnostics.requestedWork).toBe(25000);
    expect(searchResult.diagnostics.searchStats?.rung).toBe(25000); expect(searchResult.diagnostics.searchStats?.stopReason).toBe('complete');
    expect(Array.isArray(searchResult.diagnostics.searchStats?.byClass)).toBe(true); expect(JSON.parse(JSON.stringify(searchResult.diagnostics))).toEqual(searchResult.diagnostics);
    expect(searchResult.diagnostics.verifiedEndKey).toBe(searchResult.diagnostics.claimedEndKey); expect(searchResult.turn.canonicalEndHash).toBe(semanticHash(replayMacro(root().state, pass).endpoint));
  });
  it('distinguishes injected computation and changes of seed or weights from production identity', () => {
    const production = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding }); // construction is lazy: no Hard instance/search
    const injected = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, createEngine: factory() });
    const otherSeed = createPhasingEngineAdapter({ seed: 2, restoreBinding: binding, createEngine: factory() });
    const changed = cloneWeights(DEFAULT_WEIGHTS); changed.w[1]++;
    const otherWeights = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, weights: changed, createEngine: factory() });
    expect(production.identity.executionKind).toBe('production'); expect(new Set([production.engineIdentity, injected.engineIdentity, otherSeed.engineIdentity, otherWeights.engineIdentity]).size).toBe(4);
    expect(production.identity.abi.sources['src/ai/hard/core/action.ts']).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects placeholder, stale-shaped weights and invalid fixed inputs before computation', async () => {
    const bad = cloneWeights(DEFAULT_WEIGHTS); bad.version = 0;
    expect(() => createPhasingEngineAdapter({ seed: 1, weights: bad, restoreBinding: binding })).toThrow(/nonplaceholder/);
    const stale = cloneWeights(DEFAULT_WEIGHTS); stale.w = new Int32Array(1);
    expect(() => createPhasingEngineAdapter({ seed: 1, weights: stale, restoreBinding: binding })).toThrow(/current-shape/);
    expect(() => createPhasingEngineAdapter({ seed: -1, restoreBinding: binding })).toThrow(/uint32/);
    const adapter = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, createEngine: () => { throw new Error('must not construct'); } });
    await expect(adapter.search(root(), 0)).rejects.toThrow(/positive fixed work/);
  });
  it('refuses a factory that supplies different evaluator weights or config', async () => {
    const adapter = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, createEngine: config => {
      const base = factory()(config), wrong = cloneWeights(config.weights); wrong.w[1]++;
      return { ...base, currentWeights: wrong };
    } });
    await expect(adapter.evaluate(root(), 'white')).rejects.toThrow(/weights diverged/);
  });
});

describe('canonical replay and correctness vetoes', () => {
  const mutations: [string, (result: RootResult, engine: MutableFacade) => void][] = [
    ['fallback field', r => { r.fallback = 'engine-error'; }], ['fallback source', r => { r.source = 'fallback'; }], ['book source', r => { r.source = 'book'; }],
    ['replica divergence', r => { r.stats.replicaDivergences = 1; }], ['reported proof cap', r => { r.stats.cappedProverCalls = 1; }], ['actual proof cap', (_r, e) => { e.cappedProverCalls = 1; }],
    ['wrong endpoint', r => { r.endKey = '0'.repeat(16); }], ['empty plan', r => { r.actions = []; }], ['partial plan', r => { r.actions = pass.slice(0, 1); }],
    ['illegal action', r => { r.actions = [{ type: 'MOVE', unitId: 'b', to: { x: 6, y: 7 } }]; }], ['cross-handoff suffix', r => { r.actions = [...pass, ...pass]; }],
    ['nonfinite score', r => { r.scoreCc = Number.NaN; }], ['wrong work rung', r => { r.stats.rung++; }], ['wall abort', r => { r.stats.stopReason = 'abort'; }], ['false terminal claim', r => { r.source = 'mate'; }],
  ];
  it.each(mutations)('rejects %s while preserving diagnostics/actions', async (_name, mutate) => {
    const adapter = createPhasingEngineAdapter({ seed: 9, restoreBinding: binding, createEngine: factory(async (s, work, engine) => { const value = selected(s, work); mutate(value, engine); return value; }) });
    const error = await adapter.search(root(), 25000).then(() => null, error => error);
    expect(error).toBeInstanceOf(AdapterRefusal); expect(error.diagnostics.positionId).toBe('root'); expect(error.diagnostics.requestedWork).toBe(25000); expect(Array.isArray(error.actions)).toBe(true);
    expect(Array.isArray(error.diagnostics.searchStats?.byClass)).toBe(true);
  });
  it('rejects mutation of its private canonical input without modifying caller state', async () => {
    const position = root(), original = semanticHash(position.state);
    const adapter = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, createEngine: factory(async (s, work) => { const result = selected(s, work); s.players.white.resources++; return result; }) });
    await expect(adapter.search(position, 25000)).rejects.toThrow(/mutated canonical root/); expect(semanticHash(position.state)).toBe(original);
  });
});

describe('asynchronous rules ownership and paired metrics', () => {
  it('serializes separate adapters and restores global rules after an awaited failure', async () => {
    const alternate: SourceBinding = sourceBinding({ ...DEFAULT_RULES, elementGraph: 'none', upkeep: 'off', combatHandicap: { white: 2, black: 0 } });
    const before = root().state, originalPower = calculateAttackPower(before.board.units[0], before.board.units[1]);
    let release!: () => void, entered!: () => void, startedSecond = false;
    const started = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const first = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, createEngine: factory(async () => { expect(getElementGraph()).toBe('none'); expect(upkeepForTier(3)).toBe(0); entered(); await held; throw new Error('injected awaited failure'); }) });
    const second = createPhasingEngineAdapter({ seed: 1, restoreBinding: binding, createEngine: factory(async (s, work) => { startedSecond = true; expect(getElementGraph()).toBe('double-thick'); expect(upkeepForTier(3)).toBe(2); return selected(s, work); }) });
    const a = first.search(root('alternate', alternate), 25000).catch(error => error); await started;
    const b = second.search(root(), 25000); await Promise.resolve(); expect(startedSecond).toBe(false);
    release(); expect(await a).toBeInstanceOf(AdapterRefusal); await b;
    expect(getElementGraph()).toBe('double-thick'); expect(upkeepForTier(3)).toBe(2);
    const s = root().state; expect(calculateAttackPower(s.board.units[0], s.board.units[1])).toBe(originalPower);
  });
  it('preserves both member eval/search diagnostics and explicit perspectives', async () => {
    const a = root('a'), b = root('b'); a.state.turn.currentPlayer = 'black'; b.state.turn.currentPlayer = 'black'; a.boundary.currentPlayer = 'black'; b.boundary.currentPlayer = 'black';
    const c: InvariantPair = { id: 'pair', family: 'invariants', kind: 'invariant-pair', invariant: 1, rationale: 'Finite adapter fixture', tags: [], authoredFrom: { id: 'pair', revision: 'test', disposition: 'new' }, evidence: { positive: [], negative: [], rationale: 'API only; no suite acceptance', exposure: 'No search' }, violating: positionRef(a), correct: positionRef(b), perspective: 'white', classification: 'preference', primaryMetric: 'search-gap', work: 25000,
      premise: { violating: { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'game-phase', value: 'playing' }] }, correct: { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'game-phase', value: 'playing' }] } } };
    const adapter = createPhasingEngineAdapter({ seed: 7, restoreBinding: binding, createEngine: factory() });
    const output = await adapter.executeCase(c, ref => ref.id === 'a' ? a : b); expect(output.execution.kind).toBe('pair');
    expect(Object.keys(output.diagnostics)).toEqual(['violating/eval', 'correct/eval', 'violating/search', 'correct/search']);
    if (output.execution.kind !== 'pair') throw new Error('wrong execution');
    expect(output.execution.evaluation.correct.perspective).toBe('white'); expect(output.execution.search!.correct.perspective).toBe('black'); expect(output.execution.turns!.correct.actions).toEqual(pass);
    expect(output.diagnostics['correct/search'].claimedEndKey).toBe(output.diagnostics['correct/search'].verifiedEndKey);
  });
  it.each(['second-eval', 'second-search', 'second-create'] as const)('retains completed pair evidence when %s refuses', async failure => {
    const a = root('a'), b = root('b');
    const c: InvariantPair = { id: 'pair', family: 'invariants', kind: 'invariant-pair', invariant: 1, rationale: 'Finite adapter refusal fixture', tags: [], authoredFrom: { id: 'pair', revision: 'test', disposition: 'new' }, evidence: { positive: [], negative: [], rationale: 'API only; no suite acceptance', exposure: 'No search' }, violating: positionRef(a), correct: positionRef(b), perspective: 'white', classification: 'preference', primaryMetric: 'search-gap', work: 25000,
      premise: { violating: { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'game-phase', value: 'playing' }] }, correct: { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'game-phase', value: 'playing' }] } } };
    let evals = 0, searches = 0, creations = 0;
    const create = factory(async (state, work) => {
      searches++; const result = selected(state, work);
      if (failure === 'second-search' && searches === 2) result.fallback = 'engine-error';
      return result;
    }, (_config, _seed, operation) => { if (operation === 'eval' && ++evals === 2 && failure === 'second-eval') throw new Error('second eval refusal'); });
    const adapter = createPhasingEngineAdapter({ seed: 7, restoreBinding: binding, createEngine: config => {
      if (++creations === 2 && failure === 'second-create') throw new Error('second creation refusal');
      return create(config);
    } });
    const error = await adapter.executeCase(c, ref => ref.id === 'a' ? a : b).then(() => null, error => error);
    expect(error).toBeInstanceOf(Error);
    if (failure !== 'second-create') expect(error).toBeInstanceOf(AdapterRefusal);
    const persisted = JSON.parse(JSON.stringify({ refusal: error.diagnostics, rejectedActions: error.actions }));
    const completed = persisted.refusal.completedOperations;
    expect(persisted.refusal.failedOperation).toBe(failure === 'second-search' ? 'correct/search' : 'correct/eval');
    expect(Object.keys(completed)).toEqual(failure === 'second-search' ? ['violating/eval', 'correct/eval', 'violating/search'] : ['violating/eval']);
    expect(completed['violating/eval'].positionId).toBe('a');
    if (failure === 'second-search') {
      expect(completed['correct/eval'].positionId).toBe('b'); expect(completed['violating/search'].searchStats.rung).toBe(25000);
      expect(completed['violating/search'].claimedEndKey).toBe(completed['violating/search'].verifiedEndKey); expect(persisted.rejectedActions).toEqual(pass);
    } else expect(searches).toBe(0);
    expect(getElementGraph()).toBe('double-thick'); expect(upkeepForTier(3)).toBe(2);
  });
});

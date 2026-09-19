// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { buildInvariants } from '../../lab/hard-ai/suites/phasing/build-invariants';
import { sourceBinding, withRules, hashJson, positionRef, semanticHash, replayMacro } from '../../lab/hard-ai/suites/phasing/canonical';
import { validateSuiteDocument, type InvariantPair, type PositionRef } from '../../lab/hard-ai/suites/phasing/format';
import { evaluatePredicate, validateAuthorEvidence, validateProvenance } from '../../lab/hard-ai/suites/phasing/predicates';
import { getUnitDefinition } from '../../src/game/units';
import { calculateAttackPower } from '../../src/game/combat';
import { getAllSpawnPositions } from '../../src/game/spawning';

const binding = sourceBinding({ ...DEFAULT_RULES });
const suite = withRules(binding, () => buildInvariants(binding), binding);
const resolve = (ref: PositionRef) => {
  const p = suite.positions.find(p => p.id === ref.id);
  if (!p || positionRef(p).sha256 !== ref.sha256) throw new Error('invalid test reference');
  return p;
};
const pair = (n: number) => suite.cases.find(c => c.kind === 'invariant-pair' && c.invariant === n) as InvariantPair;
const scoped = (fn: () => void) => withRules(binding, fn, binding);

describe('Phasing authored invariant pairs', () => {
  it('retains20 pairs/40 logical members with explicit15/18 structural', () => scoped(() => {
    expect(validateSuiteDocument(suite)).toEqual(suite);
    validateProvenance(suite);
    expect(suite.cases).toHaveLength(20);
    expect(new Set(suite.cases.map(c => c.id)).size).toBe(20);
    const pairs = suite.cases as InvariantPair[];
    expect(pairs.flatMap(c => [c.violating, c.correct])).toHaveLength(40);
    expect(pairs.filter(c => c.classification === 'structural').map(c => c.invariant)).toEqual([15, 18]);
    expect(pairs.filter(c => c.classification === 'preference')).toHaveLength(18);
    for (const c of pairs) {
      const v = resolve(c.violating), good = resolve(c.correct);
      expect(v.boundary).toEqual(good.boundary);
      expect(v.boundary).toEqual({ kind: 'act', currentPlayer: 'black', actionsRemaining: 4, upkeepPending: false });
      expect(v.binding).toEqual(good.binding);
      expect(c.perspective).toBe('white');
    }
    expect(hashJson(withRules(binding, () => buildInvariants(binding), binding))).toBe(hashJson(suite));
  }));

  for (const c of suite.cases) it(`${c.id}: premise and temporal evidence are canonical`, () => scoped(() => {
    const result = validateAuthorEvidence(c, resolve);
    expect(result.status, JSON.stringify(result.results.filter(r => r.status !== 'pass'))).toBe('pass');
  }));

  it('negative tactical members exceed optimistic AP reach bounds, independent of Hard tables', () => scoped(() => {
    for (const [n, attackerId, targets, attacks] of [
      [3, 'attacker', ['target'], 1], [4, 'attacker', ['target'], 1],
      [12, 'attacker', ['left', 'right'], 1], [19, 'paid-attacker', ['target'], 1],
    ] as const) {
      const state = resolve(pair(n).correct).state;
      const attacker = state.board.units.find(u => u.id === attackerId)!;
      for (const id of targets) {
        const target = state.board.units.find(u => u.id === id)!;
        const distance = Math.abs(attacker.position.x - target.position.x) + Math.abs(attacker.position.y - target.position.y);
        expect(Math.ceil(Math.max(0, distance - 1) / getUnitDefinition(attacker.definitionId).speed) + attacks).toBeGreaterThan(4);
      }
    }
    const home = resolve(pair(10).correct).state.board.units.find(u => u.id === 'runner')!;
    expect(Math.ceil((home.position.x + home.position.y) / getUnitDefinition(home.definitionId).speed)).toBeGreaterThan(4);
  }));

  it('the safe anchor rectangle lies beyond every four-AP Fire-I occupation', () => scoped(() => {
    const state = resolve(pair(6).correct).state;
    const intruder = state.board.units.find(u => u.id === 'intruder')!;
    const candidates = getAllSpawnPositions('white', state.board);
    expect(candidates.length).toBeGreaterThan(0);
    for (const q of candidates) expect(Math.ceil((Math.abs(q.x - intruder.position.x) + Math.abs(q.y - intruder.position.y)) /
      getUnitDefinition(intruder.definitionId).speed)).toBeGreaterThan(4);
  }));

  it('the unpunished strand premise uses a genuinely harmless surviving army', () => scoped(() => {
    const state = resolve(pair(4).violating).state;
    const attacker = state.board.units.find(u => u.id === 'attacker')!;
    const survivor = state.board.units.find(u => u.id === 'survivor')!;
    expect(calculateAttackPower(survivor, attacker)).toBe(0);
  }));

  it('expected budget UNKNOWN is isolated from ordinary tactical proof acceptance', () => scoped(() => {
    const c = pair(15), state = resolve(c.violating).state;
    expect(semanticHash(state)).toBe(semanticHash(resolve(c.correct).state));
    expect(c.primaryMetric).toBe('none');
    const trace = { root: state, endpoint: state, steps: [], boundary: 'intermediate' as const, additionalHandoffs: 0 };
    expect(evaluatePredicate({ kind: 'home-proof-budget@1', at: 'root', invader: 'white', expected: 'unknown', maxNodes: 1 }, trace).status).toBe('pass');
    expect(evaluatePredicate({ kind: 'home-defense@1', at: 'root', invader: 'white', expected: 'rescue', maxNodes: 1 }, trace).status).toBe('indeterminate');
    expect(evaluatePredicate({ kind: 'home-defense@1', at: 'root', invader: 'white', expected: 'rescue', maxNodes: 100 }, trace).status).toBe('pass');
    const invalid = structuredClone(suite), changed = invalid.cases.find(x => x.id === c.id) as InvariantPair;
    changed.classification = 'preference'; changed.primaryMetric = 'eval-gap';
    expect(() => validateSuiteDocument(invalid)).toThrow();
  }));

  it('END_PLACE remains required exactly once and cannot follow a completed macro', () => scoped(() => {
    const c = pair(18), state = resolve(c.violating).state;
    expect(semanticHash(state)).toBe(semanticHash(resolve(c.correct).state));
    const actions = [{ type: 'END_ACTION_PHASE' as const }, { type: 'END_PLACE_PHASE' as const }];
    expect(replayMacro(state, actions).endpoint.turn.currentPlayer).toBe('white');
    expect(() => replayMacro(state, [...actions, { type: 'END_PLACE_PHASE' }])).toThrow(/after first handoff/);
  }));
});

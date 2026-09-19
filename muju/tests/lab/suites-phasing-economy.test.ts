// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { buildEconomy } from '../../lab/hard-ai/suites/phasing/build-economy';
import { sourceBinding, withRules, replayMacro, continueHorizon, hashJson, positionRef } from '../../lab/hard-ai/suites/phasing/canonical';
import { validateSuiteDocument, type MacroDecision, type PositionRef } from '../../lab/hard-ai/suites/phasing/format';
import { evaluateDecision, evaluatePredicate, validateAuthorEvidence, validateProvenance } from '../../lab/hard-ai/suites/phasing/predicates';

const binding = sourceBinding({ ...DEFAULT_RULES });
const suite = buildEconomy(binding);
const resolve = (ref: PositionRef) => {
  const p = suite.positions.find(p => p.id === ref.id);
  if (!p || positionRef(p).sha256 !== ref.sha256) throw new Error('invalid test reference');
  return p;
};
const scoped = (fn: () => void) => withRules(binding, fn, binding);

describe('Phasing authored economy suite', () => {
  it('retains all30 slots with explicit two replacements and fixed20/10 classifications', () => scoped(() => {
    expect(validateSuiteDocument(suite)).toEqual(suite);
    validateProvenance(suite);
    expect(suite.cases).toHaveLength(30);
    expect(suite.positions).toHaveLength(30);
    expect(new Set(suite.cases.map(c => c.id)).size).toBe(30);
    expect(suite.cases.filter(c => c.kind === 'macro-decision')).toHaveLength(20);
    expect(suite.cases.filter(c => c.kind === 'canonical-coverage')).toHaveLength(10);
    expect(suite.cases.filter(c => c.authoredFrom.disposition === 'replacement').map(c => c.authoredFrom.id).sort())
      .toEqual(['relocate-metal_1-e', 'relocate-metal_1-s']);
    for (const p of suite.positions) {
      expect(p.state.ruleset).toBe('phasing');
      expect(p.state.phase).toBe('playing');
      expect(p.state.board.units.some(u => u.owner === 'white')).toBe(true);
      expect(p.state.board.units.some(u => u.owner === 'black')).toBe(true);
    }
    expect(hashJson(buildEconomy(binding))).toBe(hashJson(suite));
  }));

  for (const c of suite.cases) it(`${c.id}: canonical positive/negative author evidence`, () => scoped(() => {
    const result = validateAuthorEvidence(c, resolve);
    expect(result.status, JSON.stringify(result.results.filter(r => r.status !== 'pass'))).toBe('pass');
  }));

  it('does not turn the first-harvest Fire-I tie into a preference', () => scoped(() => {
    const c = suite.cases.find(c => c.id === 'relocate-fire_1-e') as MacroDecision;
    const positive = c.evidence.positive.find(p => p.kind === 'legal-trace@1')!;
    const negative = c.evidence.negative.find(p => p.kind === 'legal-trace@1')!;
    if (positive.kind !== 'legal-trace@1' || negative.kind !== 'legal-trace@1') throw new Error('missing traces');
    const first = [positive, negative].map(p => replayMacro(resolve(c.root).state, p.actions));
    for (const trace of first) expect(evaluatePredicate({ kind: 'economy-ledger@1', surviveThroughout: ['white', 'black'],
      facts: [{ player: 'white', metric: 'mined', unitId: 'miner', value: { eq: 1 } }] }, trace).status).toBe('pass');
    expect(c.horizon).toEqual({ kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: 8, homeFirst: false });
    expect(evaluateDecision(c, continueHorizon(first[0], c.horizon)).status).toBe('pass');
    expect(evaluateDecision(c, continueHorizon(first[1], c.horizon)).status).toBe('fail');
    expect(continueHorizon(first[1], c.horizon).endpoint.phase).toBe('playing');
  }));

  it('cannot substitute unrelated miner income for the root-bound extraction objective', () => scoped(() => {
    const c = suite.cases.find(c => c.id === 'relocate-fire_1-e') as MacroDecision;
    const state = structuredClone(resolve(c.root).state);
    state.board.units.push({ ...structuredClone(state.board.units[0]), id: 'unrelated-miner', definitionId: 'plant_1', position: { x: 3, y: 5 } });
    const trace = continueHorizon(replayMacro(state, [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]), c.horizon);
    expect(evaluatePredicate({ kind: 'economy-ledger@1', surviveThroughout: ['white', 'black'],
      facts: [{ player: 'white', metric: 'mined', value: { min: 5 } }] }, trace).status).toBe('pass');
    expect(evaluateDecision(c, trace).status).toBe('fail');
  }));

  it('does not accept the historical no-opponent elimination loophole', () => scoped(() => {
    const c = suite.cases.find(c => c.id === 'relocate-plant_3-e') as MacroDecision;
    const state = structuredClone(resolve(c.root).state);
    state.board.units = state.board.units.filter(u => u.owner === 'white');
    const witness = c.evidence.positive.find(p => p.kind === 'legal-trace@1')!;
    if (witness.kind !== 'legal-trace@1') throw new Error('missing trace');
    // Use the first terminal rather than appending actions after an early win.
    const trace = replayMacro(state, witness.actions.slice(0, 2));
    expect(trace.endpoint.phase).toBe('victory');
    expect(evaluateDecision(c, trace).status).toBe('fail');
  }));
});

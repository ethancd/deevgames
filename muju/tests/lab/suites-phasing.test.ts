import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import type { Unit } from '../../src/game/types';
import { getUnitDefinition } from '../../src/game/units';
import { applyAction } from '../../src/ai/simulate';
import { componentBatch, continueHorizon, hashJson, makePosition, positionRef, replayMacro, replayTrace, semanticHash, sourceBinding, verifySourceBinding, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import type { AIAction, CanonicalCoverage, GameState, InvariantPair, MacroDecision, PhasingPosition, PlayerId, PredicateSpec, RulesBlock, SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import { FAMILIES, validateSuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import { arrivalEvents, economyLedger, evaluateDecision, evaluatePredicate, evaluateProbe, rootTrace, validateAuthorEvidence, validateProvenance } from '../../lab/hard-ai/suites/phasing/predicates';
import { aggregate, scoreCase } from '../../lab/hard-ai/suites/phasing/score';
import type { CaseResult, EngineTurn } from '../../lab/hard-ai/suites/phasing/score';
import { buildReleaseManifest, RELEASE_COUNTS, REQUIRED_SHARED_ARTIFACTS, validateManifestShape } from '../../lab/hard-ai/suites/phasing/manifest';
import type { ReleaseManifest } from '../../lab/hard-ai/suites/phasing/manifest';

const rules: RulesBlock = { elementGraph: 'double-thick', upkeep: 'shipped', inactivityRule: 'on', victoryRule: 'elimination', handicap: 0, combatHandicap: { white: 0, black: 0 } };
const binding = sourceBinding(rules);
const own = (id: string, owner: PlayerId, definitionId: string, x: number, y: number): Unit => ({ id, owner, definitionId, position: { x, y }, hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0, attackedThisTurn: [], placedThisTurn: false, promotedThisPlacement: false, lastAttackKilled: false });
function state(): GameState {
  const board = createEmptyBoard(); for (const row of board.cells) for (const cell of row) cell.resourceLayers = 0;
  board.units = [own('w', 'white', 'fire_1', 2, 2), own('b', 'black', 'water_1', 7, 7)];
  return { ruleset: 'phasing', actionsPerTurn: 4, blackCrystalHandicap: 0, pendingSummons: [], phase: 'playing', board, players: { white: { id: 'white', startCorner: { x: 0, y: 0 }, resources: 10, resourcesGained: 0 }, black: { id: 'black', startCorner: { x: 9, y: 9 }, resources: 10, resourcesGained: 0 } }, turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: 4, turnNumber: 1 }, winner: null, selectedUnit: null, validMoves: [], validAttacks: [], inactivityPlies: 0, progressThisTurn: false, inactivityRule: 'on', victoryRule: 'elimination' };
}
const position = (id: string, s = state()): PhasingPosition => makePosition(id, s, binding, { kind: 'authored-diagram', rationale: 'Tiny authored canonical contract fixture, not strength evidence.' });
const alive: PredicateSpec = { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'game-phase', value: 'playing' }, { kind: 'army-count', player: 'white', value: { min: 1 } }, { kind: 'army-count', player: 'black', value: { min: 1 } }] };
const pass: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
function coverage(p = position('root')): CanonicalCoverage {
  const probe = { kind: 'legal-trace@1' as const, actions: pass, endpoint: 'first-handoff-or-terminal' as const, assert: alive };
  return { id: 'coverage', family: 'tactics', kind: 'canonical-coverage', root: positionRef(p), rationale: 'Complete canonical pass coverage', tags: ['contract'], authoredFrom: { id: 'new', revision: 'test', disposition: 'new' }, evidence: { positive: [probe], negative: [], rationale: 'Legal full turn', exposure: 'No engine outcomes' }, probes: [probe], engineReplay: { required: true, work: 10 } };
}
const doc = (p = position('root')): SuiteDocument => ({ schema: 'muju-phasing-suite-v1', family: 'tactics', positions: [p], cases: [coverage(p)] });
const run = <T>(fn: () => T): T => withRules(binding, fn, binding);
const turn = (actions = pass): EngineTurn => ({ actions, source: 'hard', fallback: false, engineIdentity: 'fixture-engine' });

describe('Phasing suite identity and strict loading', () => {
  it('validates explicit source, state, boundary and reference binding', () => { const d = doc(); expect(validateSuiteDocument(d).cases).toHaveLength(1); const broken = structuredClone(d); broken.positions[0].boundary.actionsRemaining = 3; expect(() => validateSuiteDocument(broken)).toThrow(/boundary/); });
  it('rejects historical schema, implicit Standard, unknown predicates and source drift', () => {
    expect(() => validateSuiteDocument({ ...doc(), schema: 'muju-suite-v1' })).toThrow();
    const d = doc(); delete d.positions[0].state.ruleset; expect(() => validateSuiteDocument(d)).toThrow();
    expect(() => verifySourceBinding({ ...binding, rulesSourcesSha256: '0'.repeat(64) })).toThrow(/binding/);
    const unknown = structuredClone(doc()) as unknown as { cases: { probes: unknown[] }[] }; unknown.cases[0].probes = [{ kind: 'anything@1' }]; expect(() => validateSuiteDocument(unknown)).toThrow();
  });
  it('preserves ordered canonical state while omitting only UI highlights', () => {
    const a = state(), b = structuredClone(a); b.selectedUnit = 'w'; b.validMoves = [{ x: 3, y: 2 }]; expect(semanticHash(b)).toBe(semanticHash(a));
    b.board.units.reverse(); expect(semanticHash(b)).not.toBe(semanticHash(a));
    const c = structuredClone(a); c.pendingSummons = [{ id: 'p', owner: 'white', definitionId: 'fire_1', position: { x: 1, y: 1 }, cost: 3 }]; const before = semanticHash(c); c.pendingSummons[0].cost++; expect(semanticHash(c)).not.toBe(before);
    const d = structuredClone(a); d.progressThisTurn = true; expect(semanticHash(d)).not.toBe(semanticHash(a));
  });
  it('rejects impossible pending purchases while retaining cross-owner overlap and later obstruction', () => {
    const s = state(); s.pendingSummons = [{ id: 'pw', owner: 'white', definitionId: 'fire_1', position: { x: 2, y: 2 }, cost: 3 }, { id: 'pb', owner: 'black', definitionId: 'water_1', position: { x: 2, y: 2 }, cost: 4 }];
    expect(() => validateSuiteDocument(doc(position('root', s)))).not.toThrow();
    const tier = structuredClone(s); tier.pendingSummons![0].definitionId = 'fire_2'; tier.pendingSummons![0].cost = 7; expect(() => validateSuiteDocument(doc(position('root', tier)))).toThrow(/tier\/cost/);
    const price = structuredClone(s); price.pendingSummons![0].cost = 300; expect(() => validateSuiteDocument(doc(position('root', price)))).toThrow(/tier\/cost/);
    const duplicate = structuredClone(s); duplicate.pendingSummons![1].owner = 'white'; expect(() => validateSuiteDocument(doc(position('root', duplicate)))).toThrow(/commitment square/);
  });
  it('checks exact canonical legal-prefix provenance', () => run(() => {
    const seed = position('seed'), actions: AIAction[] = [{ type: 'MOVE', unitId: 'w', to: { x: 3, y: 2 } }];
    const end = makePosition('end', applyAction(seed.state, actions[0]), binding, { kind: 'legal-prefix', seed: positionRef(seed), actions, seedReachability: 'authored-diagram' });
    const d = doc(end); d.positions.unshift(seed); validateSuiteDocument(d); expect(() => validateProvenance(d, binding)).not.toThrow();
    const endpointTamper = structuredClone(d), tamperedEnd = endpointTamper.positions.find(p => p.id === 'end')!;
    tamperedEnd.state = structuredClone(tamperedEnd.state); tamperedEnd.state.players.white.resources++;
    expect(() => validateProvenance(endpointTamper, binding)).toThrow(/endpoint/);
    const seedTamper = structuredClone(d), tamperedSeed = seedTamper.positions.find(p => p.id === 'seed')!;
    tamperedSeed.state = structuredClone(tamperedSeed.state); tamperedSeed.state.players.white.resources++;
    expect(() => validateProvenance(seedTamper, binding)).toThrow(/seed mismatch/);
  }));
  it('rejects empty predicates and budget proofs as decisions', () => {
    const d = doc(); (d.cases[0] as CanonicalCoverage).probes[0] = { kind: 'legal-trace@1', actions: pass, endpoint: 'first-handoff-or-terminal', assert: { kind: 'all@1', predicates: [] } }; expect(() => validateSuiteDocument(d)).toThrow();
    const p = position('root'), c = coverage(p); const decision: MacroDecision = { ...c, kind: 'macro-decision', work: 10, horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: 'predicate-only', accept: { kind: 'home-proof-budget@1', at: 'root', invader: 'black', expected: 'unknown', maxNodes: 1 } };
    const { probes: _probes, engineReplay: _engine, ...clean } = decision as MacroDecision & Pick<CanonicalCoverage, 'probes' | 'engineReplay'>;
    clean.evidence.negative = clean.evidence.positive; expect(() => validateSuiteDocument({ ...doc(p), cases: [clean] })).toThrow(/budget/);
  });
});

describe('canonical complete macro and bounded coverage protocol', () => {
  it('requires a real complete turn and rejects empty, partial, illegal, cross-handoff and post-terminal lines', () => run(() => {
    expect(replayMacro(state(), pass).endpoint.turn.currentPlayer).toBe('black');
    expect(() => replayMacro(state(), [])).toThrow(/1..512/);
    expect(() => replayMacro(state(), pass.slice(0, 1))).toThrow(/incomplete/);
    expect(() => replayMacro(state(), [{ type: 'MOVE', unitId: 'b', to: { x: 6, y: 7 } }])).toThrow(/illegal/);
    expect(() => replayMacro(state(), [...pass, ...pass])).toThrow(/handoff/);
    expect(() => replayMacro(state(), [{ type: 'RESIGN' }, ...pass])).toThrow(/terminal/);
  }));
  it('allows explicit multi-actor coverage without allowing it to masquerade as a macro', () => run(() => {
    const trace = replayTrace(state(), [...pass, ...pass], 'coverage-sequence'); expect(trace.endpoint.turn.currentPlayer).toBe('white');
    expect(() => continueHorizon(trace, { kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: 1, homeFirst: false })).toThrow(/complete/);
    expect(evaluatePredicate({ kind: 'action-legality@1', at: 'endpoint', action: { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 1, y: 1 } }, expected: false }, trace).status).toBe('pass');
  }));
  it('counts requested passive handoffs and requires survival across the whole horizon', () => run(() => {
    const trace = continueHorizon(replayMacro(state(), pass), { kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: 2, homeFirst: false }); expect(trace.additionalHandoffs).toBe(2);
    expect(evaluatePredicate({ kind: 'economy-ledger@1', surviveThroughout: ['white', 'black'], facts: [{ player: 'white', metric: 'incomeWindows', value: { eq: 2 } }] }, trace).status).toBe('pass');
    expect(() => continueHorizon(replayMacro(state(), pass), { kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: 11, homeFirst: false })).toThrow();
  }));
  it('keeps legal fallback and divergent adapter endpoints as correctness errors', () => run(() => {
    const p = position('root'), c = coverage(p), resolve = () => p;
    expect(scoreCase(c, { kind: 'coverage', turn: { ...turn(), fallback: true } }, resolve, 'fixture-engine').status).toBe('error');
    expect(scoreCase(c, { kind: 'coverage', turn: { ...turn(), canonicalEndHash: '0'.repeat(64) } }, resolve, 'fixture-engine').failureCodes).toContain('engine-canonical-divergence');
    const good = scoreCase(c, { kind: 'coverage', turn: turn() }, resolve, 'fixture-engine'); expect(good.status).toBe('pass'); expect(good.offered).toBe(0); expect(good.earned).toBe(0);
  }));
  it('scores a distinguishing decision only after independently checking both full witnesses', () => run(() => {
    const p = position('root'), { probes: _probes, engineReplay: _engine, ...common } = coverage(p);
    const actions: AIAction[] = [{ type: 'MOVE', unitId: 'w', to: { x: 3, y: 2 } }, ...pass];
    const accept: PredicateSpec = { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'unit', id: 'w', present: true, position: { x: 3, y: 2 } }] };
    const c: MacroDecision = { ...common, kind: 'macro-decision', work: 10, horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: 'predicate-only', accept, evidence: { ...common.evidence, positive: [{ kind: 'legal-trace@1', actions, endpoint: 'first-handoff-or-terminal', assert: accept }], negative: [{ kind: 'legal-trace@1', actions: pass, endpoint: 'first-handoff-or-terminal', assert: alive }] } };
    validateSuiteDocument({ ...doc(p), cases: [c] });
    expect(scoreCase(c, { kind: 'macro', turn: turn(actions) }, () => p, 'fixture-engine').earned).toBe(1);
    const miss = scoreCase(c, { kind: 'macro', turn: turn() }, () => p, 'fixture-engine'); expect(miss.status).toBe('fail'); expect(miss.offered).toBe(1);
    const broken = { ...c, evidence: { ...c.evidence, negative: c.evidence.positive } }; expect(scoreCase(broken, { kind: 'macro', turn: turn(actions) }, () => p, 'fixture-engine').failureCodes).toContain('author-evidence-not-established');
  }));
  it('credits a terminal win only under the explicit frozen terminal policy', () => run(() => {
    const s = state(); s.board.units[0].definitionId = 'fire_3'; s.board.units[1].definitionId = 'plant_1'; s.board.units[1].position = { x: 3, y: 2 };
    const trace = replayMacro(s, [{ type: 'ATTACK', unitId: 'w', targetPosition: { x: 3, y: 2 } }]); expect(trace.endpoint.winner).toBe('white');
    const p = position('root', s), { probes: _probes, engineReplay: _engine, ...common } = coverage(p);
    const c: MacroDecision = { ...common, kind: 'macro-decision', work: 10, horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: 'predicate-only', accept: { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'game-phase', value: 'playing' }] } };
    expect(evaluateDecision(c, trace).status).toBe('fail'); expect(evaluateDecision({ ...c, terminalPolicy: 'allow-root-mover-win' }, trace).status).toBe('pass');
  }));
});

describe('canonical receipts and finite predicates', () => {
  it('uses the original board for a simultaneous batch and refunds original costs once', () => run(() => {
    const s = state(); s.board.units[0].position = { x: 2, y: 2 };
    s.pendingSummons = [{ id: 'arrive', owner: 'white', definitionId: 'fire_1', position: { x: 1, y: 1 }, cost: 3 }, { id: 'occupied', owner: 'white', definitionId: 'water_1', position: { x: 2, y: 2 }, cost: 4 }];
    const trace = componentBatch(s, 'white'); const events = arrivalEvents(trace); expect(events[0].summoned.map(p => p.id)).toEqual(['arrive']); expect(events[0].refund).toBe(4);
    expect(trace.endpoint.board.units.map(u => u.id)).toEqual(['w', 'b', 'arrive']);
    expect(evaluatePredicate({ kind: 'summon-resolution@1', commitment: { kind: 'root', id: 'occupied' }, player: 'white', outcome: 'disrupted', window: 1 }, trace).status).toBe('pass');
    expect(economyLedger(trace).white.refund).toBe(4);
    expect(arrivalEvents(componentBatch(trace.endpoint, 'white'))[0].refund).toBe(0);
  }));
  it('does not let one paid sibling create a new spawn anchor for another', () => run(() => {
    const s = state(); s.board.units[0].position = { x: 2, y: 0 };
    s.pendingSummons = [{ id: 'first', owner: 'white', definitionId: 'fire_1', position: { x: 1, y: 0 }, cost: 3 }, { id: 'second', owner: 'white', definitionId: 'water_1', position: { x: 1, y: 1 }, cost: 4 }];
    const events = arrivalEvents(componentBatch(s, 'white')); expect(events[0].disrupted.map(p => p.id)).toContain('second');
  }));
  it('binds target removal to an actual root unit and reports no-occupier as failed proof', () => run(() => {
    expect(() => evaluatePredicate({ kind: 'target-removed@1', targetId: 'missing' }, rootTrace(state()))).toThrow(/root unit/);
    expect(evaluatePredicate({ kind: 'home-defense@1', at: 'root', invader: 'black', expected: 'rescue', maxNodes: 10 }, rootTrace(state())).status).toBe('fail');
  }));
  it('does not mistake terminal-phase DFS cessation for mate or budget evidence', () => run(() => {
    const s = state(); s.board.units[1].position = { x: 0, y: 0 }; s.phase = 'victory'; s.winner = 'black'; s.victoryReason = 'home-occupation';
    const proof = evaluatePredicate({ kind: 'home-defense@1', at: 'root', invader: 'black', expected: 'mate', maxNodes: 10 }, rootTrace(s)); expect(proof.status).toBe('fail'); expect(JSON.stringify(proof.facts)).toContain('playing snapshot');
    expect(evaluatePredicate({ kind: 'home-proof-budget@1', at: 'root', invader: 'black', expected: 'unknown', maxNodes: 1 }, rootTrace(s)).status).toBe('fail');
  }));
  it('retains a real proof cutoff as a veto even when another conjunct is false', () => run(() => {
    const s = state(); s.board.units[0].position = { x: 9, y: 9 }; s.board.units[1].position = { x: 9, y: 7 };
    const trace = rootTrace(s), proof: PredicateSpec = { kind: 'home-defense@1', at: 'root', invader: 'white', expected: 'rescue', maxNodes: 1 };
    expect(evaluatePredicate(proof, trace).status).toBe('indeterminate');
    expect(evaluatePredicate({ ...proof, maxNodes: 20000 }, trace).status).toBe('pass');
    const falseFact: PredicateSpec = { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'bank', player: 'white', value: { eq: 100000 } }] };
    const conjunction = evaluatePredicate({ kind: 'all@1', predicates: [falseFact, proof] }, trace);
    expect(conjunction.status).toBe('indeterminate');
    expect((conjunction.facts as { status: string }[]).map(r => r.status)).toEqual(['fail', 'indeterminate']);
  }));
  it('attributes mining to the named root miner and reconciles bank arithmetic', () => run(() => {
    const s = state(); s.board.cells[2][2].resourceLayers = 5;
    const trace = replayMacro(s, pass), ledger = economyLedger(trace); expect(ledger.white.mined).toBe(getUnitDefinition('fire_1').mining);
    expect(evaluatePredicate({ kind: 'economy-ledger@1', surviveThroughout: ['white', 'black'], facts: [{ player: 'white', metric: 'mined', unitId: 'w', value: { eq: 1 } }] }, trace).status).toBe('pass');
    expect(() => evaluatePredicate({ kind: 'economy-ledger@1', surviveThroughout: [], facts: [{ player: 'white', metric: 'mined', unitId: 'invented', value: { eq: 1 } }] }, trace)).toThrow(/root owned/);
  }));
  it('validates negative legality by observing a canonical no-op', () => run(() => {
    expect(evaluateProbe({ kind: 'legality@1', action: { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 1, y: 1 } }, expected: false }, state()).status).toBe('pass');
  }));
});

describe('fixed membership and pair metric identity', () => {
  it('never accepts a one-family diagnostic as a release', () => { expect(() => buildReleaseManifest([doc()], [], {})).toThrow(/six/); });
  it('normalizes both pair columns to explicit perspective and preserves structural zero units', () => run(() => {
    const a = position('a'), b = position('b'), { probes: _probes, engineReplay: _engine, root: _root, ...common } = coverage(a);
    const c: InvariantPair = { ...common, kind: 'invariant-pair', family: 'invariants', invariant: 1, violating: positionRef(a), correct: positionRef(b), perspective: 'white', premise: { violating: alive, correct: alive }, classification: 'preference', primaryMetric: 'eval-gap', evidence: { positive: [{ kind: 'legality@1', action: { type: 'END_ACTION_PHASE' }, expected: true, member: 'correct' }], negative: [], rationale: 'Canonical premises independent of eval', exposure: 'Stub values only' } };
    const resolve = (r: { id: string }) => r.id === 'a' ? a : b;
    const execution = { kind: 'pair' as const, evaluation: { violating: { value: 1, perspective: 'white' as const, engineIdentity: 'fixture-engine' }, correct: { value: -3, perspective: 'black' as const, engineIdentity: 'fixture-engine' } } };
    expect(validateAuthorEvidence(c, resolve).status).toBe('pass'); const out = scoreCase(c, execution, resolve, 'fixture-engine'); expect(out.metrics?.evalGap).toBe(2); expect(out.earned).toBe(1);
    expect(scoreCase({ ...c, invariant: 18, classification: 'structural', primaryMetric: 'none' }, execution, resolve, 'fixture-engine').offered).toBe(0);
    const empty = structuredClone(execution); empty.evaluation.correct.engineIdentity = ''; empty.evaluation.violating.engineIdentity = ''; expect(scoreCase(c, empty, resolve, '').status).toBe('error');
    execution.evaluation.correct.engineIdentity = 'different'; expect(scoreCase(c, execution, resolve, 'fixture-engine').status).toBe('error');
  }));
  it('retains all offered units for missing results and rejects duplicate outcomes', () => {
    const cases = FAMILIES.flatMap(family => Array.from({ length: RELEASE_COUNTS[family] }, (_, i) => ({ id: `${family}-${i}`, family, kind: family === 'invariants' ? 'invariant-pair' as const : 'macro-decision' as const, classification: family === 'invariants' ? 'preference' as const : 'decision' as const, sha256: hashJson([family, i]), members: Array.from({ length: family === 'invariants' ? 2 : 1 }, (_, j) => ({ id: `${family}-${i}-${j}`, sha256: hashJson(j) })), offered: 1 as const })));
    const manifest: ReleaseManifest = validateManifestShape({ schema: 'muju-phasing-suite-manifest-v1', scope: 'release', caseCount: 225, memberCount: 245, cases, files: FAMILIES.map(family => ({ family, path: `${family}.json`, sha256: 'a'.repeat(64) })), artifacts: Object.fromEntries(REQUIRED_SHARED_ARTIFACTS.map(p => [p, 'b'.repeat(64)])) });
    const first: CaseResult = { schema: 'muju-phasing-case-result-v1', id: cases[0].id, caseSha256: cases[0].sha256, kind: cases[0].kind, offered: 1, earned: 0, status: 'fail', failureCodes: ['predicate-miss'], predicates: [], engineIdentity: 'fixture-engine' };
    const out = aggregate(manifest, [first]); expect(out.offered).toBe(225); expect(out.earned).toBe(0); expect(out.complete).toBe(false); expect(out.valid).toBe(false); expect(out.acceptance).toBe('not-established');
    expect(() => aggregate(manifest, [first, first])).toThrow(/duplicate/);
    const all: CaseResult[] = cases.map(c => ({ ...first, id: c.id, caseSha256: c.sha256, kind: c.kind }));
    expect(aggregate(manifest, all).valid).toBe(true); // decision misses are measurements
    expect(aggregate(manifest, all).engineIdentity).toBe('fixture-engine');
    expect(() => aggregate(manifest, [{ ...first, engineIdentity: '' }])).toThrow(/empty.*identity/);
    expect(() => aggregate(manifest, [{ ...first, engineIdentity: '   ' }])).toThrow(/empty.*identity/);
    expect(() => aggregate(manifest, [first, { ...all[1], engineIdentity: 'different-engine' }])).toThrow(/mixed.*identities/);
    const coverageManifest = structuredClone(manifest); coverageManifest.cases[0] = { ...coverageManifest.cases[0], kind: 'canonical-coverage', classification: 'coverage', offered: 0 };
    all[0] = { ...all[0], kind: 'canonical-coverage', offered: 0 };
    const rejected = aggregate(coverageManifest, all); expect(rejected.offered).toBe(224); expect(rejected.valid).toBe(false); expect(rejected.coverage.fail).toBe(1);
  });
});

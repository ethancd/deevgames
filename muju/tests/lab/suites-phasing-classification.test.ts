// @vitest-environment node
/** Non-gating diagnostics, the searched primary metric, multi-answer accept and
 * intruder survival — the v2 scoring contract, on synthetic cases only.
 *
 * Nothing here authors a fixture, plays a game or measures anything. Each test
 * builds the smallest canonical object that can carry the contract and asks
 * the shared validator, scorer and aggregator what they do with it.
 *
 * The four pieces:
 *
 * 1. `diagnostic` invariant pairs. Three v1 pairs gate on a preference their
 *    own rationales refuse to claim. A diagnostic is still MEASURED at the
 *    same fixed work and still has to satisfy its canonical premises, but it
 *    OFFERS ZERO POINTS: the primary metric is recorded on the case result and
 *    is never converted into a pass/fail predicate, so it can move no floor.
 * 2. `search-gap` as the primary metric at a STATED fixed work per member. A
 *    static evaluation cannot gate a search engine; the pair contract now
 *    carries the work the reading was taken at, and refuses a search-gap pair
 *    that does not name one.
 * 3. `any-of@1` accept, for positions with several equally valid answers.
 * 4. The intruder-survival horizon: a pass-only continuation of at least one
 *    further hand-off, plus an endpoint fact that the intruder is still there.
 */
import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import type { Unit } from '../../src/game/types';
import { hashJson, makePosition, positionRef, replayMacro, sourceBinding, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import {
  assertsIntruderSurvival, containsBudgetProbe, decisionUnits, FAMILIES, hasIntruderSurvivalHorizon,
  INTRUDER_SURVIVAL_HANDOFFS, intruderPresentFact, intruderSurvivalHorizon, requiresUnitAtEndpoint, validateSuiteDocument,
} from '../../lab/hard-ai/suites/phasing/format';
import type {
  AIAction, GameState, InvariantPair, MacroDecision, PhasingPosition, PlayerId, PositionRef, PredicateSpec, RulesBlock, SuiteDocument,
} from '../../lab/hard-ai/suites/phasing/format';
import { evaluateDecision, evaluatePredicate, rootTrace } from '../../lab/hard-ai/suites/phasing/predicates';
import { aggregate, scoreCase } from '../../lab/hard-ai/suites/phasing/score';
import type { CaseExecution, CaseResult } from '../../lab/hard-ai/suites/phasing/score';
import { describeCase, GATING_CLASSIFICATIONS, RELEASE_COUNTS, REQUIRED_SHARED_ARTIFACTS, validateManifestShape } from '../../lab/hard-ai/suites/phasing/manifest';
import type { ReleaseManifest } from '../../lab/hard-ai/suites/phasing/manifest';
import { assessFloors, minimumEarnedFor, offeredBy } from '../../lab/hard-ai/suites/phasing/contract';
import type { FloorContractV1 } from '../../lab/hard-ai/suites/phasing/contract';

const IDENTITY = 'fixture-engine';
const rules: RulesBlock = { elementGraph: 'double-thick', upkeep: 'shipped', inactivityRule: 'on', victoryRule: 'elimination', handicap: 0, combatHandicap: { white: 0, black: 0 } };
const binding = sourceBinding(rules);
const scoped = <T>(body: () => T): T => withRules(binding, body, binding);
const own = (id: string, owner: PlayerId, definitionId: string, x: number, y: number): Unit =>
  ({ id, owner, definitionId, position: { x, y }, hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0 });
function state(): GameState {
  const board = createEmptyBoard();
  for (const row of board.cells) for (const cell of row) cell.resourceLayers = 0;
  board.units = [own('w', 'white', 'fire_1', 2, 2), own('b', 'black', 'water_1', 7, 7)];
  return { ruleset: 'phasing', actionsPerTurn: 4, blackCrystalHandicap: 0, pendingSummons: [], phase: 'playing', board,
    players: { white: { id: 'white', startCorner: { x: 0, y: 0 }, resources: 10, resourcesGained: 0 },
      black: { id: 'black', startCorner: { x: 9, y: 9 }, resources: 10, resourcesGained: 0 } },
    turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: 4, turnNumber: 1 },
    winner: null, selectedUnit: null, validMoves: [], validAttacks: [],
    inactivityPlies: 0, progressThisTurn: false, inactivityRule: 'on', victoryRule: 'elimination' };
}
const position = (id: string, s = state()): PhasingPosition =>
  makePosition(id, s, binding, { kind: 'authored-diagram', rationale: 'Tiny authored canonical contract fixture, not strength evidence.' });
const pass: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
const alive: PredicateSpec = { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'game-phase', value: 'playing' }] };
const playingRoot: PredicateSpec = { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'game-phase', value: 'playing' }] };

const a = position('a'), b = position('b');
const resolve = (ref: PositionRef): PhasingPosition => ref.id === 'a' ? a : b;
/** A pair whose canonical premises hold on both members, so anything the tests
 * below observe comes from the classification and the metric, not the premise. */
function pair(overrides: Partial<InvariantPair> = {}): InvariantPair {
  return { id: 'pair', family: 'invariants', kind: 'invariant-pair', invariant: 1,
    rationale: 'Synthetic classification fixture', tags: [],
    authoredFrom: { id: 'pair', revision: 'classification-test', disposition: 'new' },
    evidence: { positive: [{ kind: 'legality@1', action: { type: 'END_ACTION_PHASE' }, expected: true, member: 'correct' }], negative: [],
      rationale: 'Canonical premises independent of any engine value', exposure: 'Stub values only' },
    violating: positionRef(a), correct: positionRef(b), perspective: 'white',
    premise: { violating: playingRoot, correct: playingRoot },
    classification: 'preference', primaryMetric: 'eval-gap', ...overrides } as InvariantPair;
}
/** correct - violating, both from White's perspective. */
const values = (correct: number, violating: number): CaseExecution => ({ kind: 'pair',
  evaluation: { violating: { value: violating, perspective: 'white', engineIdentity: IDENTITY }, correct: { value: correct, perspective: 'white', engineIdentity: IDENTITY } } });
const withSearch = (correct: number, violating: number, searchCorrect: number, searchViolating: number): CaseExecution => ({ kind: 'pair',
  evaluation: { violating: { value: violating, perspective: 'white', engineIdentity: IDENTITY }, correct: { value: correct, perspective: 'white', engineIdentity: IDENTITY } },
  search: { violating: { value: searchViolating, perspective: 'white', engineIdentity: IDENTITY }, correct: { value: searchCorrect, perspective: 'white', engineIdentity: IDENTITY } },
  turns: { violating: { actions: pass, source: 'hard', fallback: false, engineIdentity: IDENTITY },
    correct: { actions: pass, source: 'hard', fallback: false, engineIdentity: IDENTITY } } });

describe('diagnostic invariant pairs are measured and reported but gate nothing', () => {
  it('offers zero units while a preference offers one', () => scoped(() => {
    expect(decisionUnits(pair({ classification: 'preference' }))).toBe(1);
    expect(decisionUnits(pair({ classification: 'diagnostic' }))).toBe(0);
    expect(decisionUnits(pair({ classification: 'structural', primaryMetric: 'none' }))).toBe(0);
    expect(describeCase(pair({ classification: 'diagnostic' }))).toMatchObject({ classification: 'diagnostic', offered: 0 });
    expect(GATING_CLASSIFICATIONS).toEqual(['decision', 'preference']);
  }));

  it('records the same metric a preference would gate on, and does not turn it into a verdict', () => scoped(() => {
    // The identical negative reading: a gating preference MISSES it, a
    // diagnostic records it and passes on its premises alone.
    const gating = scoreCase(pair({ classification: 'preference' }), values(-4, 1), resolve, IDENTITY);
    expect(gating.offered).toBe(1);
    expect(gating.status).toBe('fail');
    expect(gating.earned).toBe(0);
    expect(gating.metrics).toMatchObject({ evalGap: -5, primary: 'eval-gap', classification: 'preference', gating: true });
    // The metric became a scored predicate for the preference...
    expect(gating.predicates.some(p => (p.facts as { metric?: string }[]).some(f => f?.metric === 'eval-gap'))).toBe(true);

    const diagnostic = scoreCase(pair({ classification: 'diagnostic' }), values(-4, 1), resolve, IDENTITY);
    expect(diagnostic.offered).toBe(0);
    expect(diagnostic.earned).toBe(0);
    expect(diagnostic.status).toBe('pass');
    expect(diagnostic.metrics).toMatchObject({ evalGap: -5, primary: 'eval-gap', classification: 'diagnostic', gating: false });
    // ...and did not for the diagnostic. This is the whole demotion.
    expect(diagnostic.predicates.some(p => (p.facts as { metric?: string }[]).some(f => f?.metric === 'eval-gap'))).toBe(false);
    // A positive reading earns the diagnostic nothing either: it is not a
    // cheaper way to pass, it is outside the denominator in both directions.
    const positive = scoreCase(pair({ classification: 'diagnostic' }), values(4, 1), resolve, IDENTITY);
    expect(positive.earned).toBe(0);
    expect(positive.metrics?.evalGap).toBe(3);
  }));

  it('still fails the run when a diagnostic pair’s canonical premise is false', () => scoped(() => {
    const falsePremise: PredicateSpec = { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'bank', player: 'white', value: { eq: 99999 } }] };
    const broken = scoreCase(pair({ classification: 'diagnostic', premise: { violating: falsePremise, correct: playingRoot } }), values(4, 1), resolve, IDENTITY);
    expect(broken.status).toBe('fail');
    expect(broken.offered).toBe(0);
    // The premise is author evidence, so it trips before the engine values are
    // even read; `aggregate` lists that code as a run failure regardless of
    // offered units, which is what keeps a demoted pair honest.
    expect(broken.failureCodes).toContain('author-evidence-not-established');
  }));

  it('accepts a diagnostic pair in a suite document and refuses a metric-free one', () => scoped(() => {
    const document = (c: InvariantPair): SuiteDocument => ({ schema: 'muju-phasing-suite-v1', family: 'invariants', positions: [a, b], cases: [c] });
    expect(() => validateSuiteDocument(document(pair({ classification: 'diagnostic', primaryMetric: 'eval-gap' })))).not.toThrow();
    expect(() => validateSuiteDocument(document(pair({ classification: 'diagnostic', primaryMetric: 'search-gap', work: 120_000 })))).not.toThrow();
    // A diagnostic is measured, so it must name a metric...
    expect(() => validateSuiteDocument(document(pair({ classification: 'diagnostic', primaryMetric: 'none' })))).toThrow(/pair scoring contract/);
    // ...and a searched one must name the fixed work it is measured at.
    expect(() => validateSuiteDocument(document(pair({ classification: 'diagnostic', primaryMetric: 'search-gap' })))).toThrow(/pair scoring contract/);
    // Structural invariants 15 and 18 stay structural.
    expect(() => validateSuiteDocument(document(pair({ invariant: 15, classification: 'diagnostic', primaryMetric: 'eval-gap' })))).toThrow(/structural/);
    // A budget proof cannot define a diagnostic's premise any more than a preference's.
    const budget: PredicateSpec = { kind: 'home-proof-budget@1', at: 'root', invader: 'white', expected: 'unknown', maxNodes: 1 };
    expect(() => validateSuiteDocument(document(pair({ classification: 'diagnostic', premise: { violating: budget, correct: playingRoot } })))).toThrow(/budget proof/);
  }));

  it('keeps diagnostics out of every denominator and reports them in the summary', () => {
    // A synthetic release manifest in which three invariant pairs are demoted.
    const DEMOTED = new Set(['invariants-8', 'invariants-9', 'invariants-10']);
    const cases = FAMILIES.flatMap(family => Array.from({ length: RELEASE_COUNTS[family] }, (_, i) => {
      const id = `${family}-${i}`, isPair = family === 'invariants';
      const classification = !isPair ? 'decision' as const : DEMOTED.has(id) ? 'diagnostic' as const : 'preference' as const;
      return { id, family, kind: isPair ? 'invariant-pair' as const : 'macro-decision' as const, classification,
        sha256: hashJson([family, i]), members: Array.from({ length: isPair ? 2 : 1 }, (_, j) => ({ id: `${id}-${j}`, sha256: hashJson(j) })),
        offered: (classification === 'diagnostic' ? 0 : 1) as 0 | 1 };
    }));
    const manifest: ReleaseManifest = validateManifestShape({ schema: 'muju-phasing-suite-manifest-v1', scope: 'release',
      caseCount: 225, memberCount: 245, cases, files: FAMILIES.map(family => ({ family, path: `${family}.json`, sha256: 'a'.repeat(64) })),
      artifacts: Object.fromEntries(REQUIRED_SHARED_ARTIFACTS.map(p => [p, 'b'.repeat(64)])) });
    // A manifest that keeps a diagnostic's offered unit is refused outright.
    const cheating = structuredClone(manifest);
    cheating.cases = cheating.cases.map(c => c.classification === 'diagnostic' ? { ...c, offered: 1 as const } : c);
    expect(() => validateManifestShape(cheating)).toThrow(/score membership/);

    expect(offeredBy(manifest, 'invariants')).toBe(RELEASE_COUNTS.invariants - DEMOTED.size);
    const results: CaseResult[] = manifest.cases.map(c => ({ schema: 'muju-phasing-case-result-v1', id: c.id, caseSha256: c.sha256,
      kind: c.kind, status: 'pass', offered: c.offered, earned: c.offered, failureCodes: [], predicates: [], engineIdentity: IDENTITY,
      ...(c.classification === 'diagnostic'
        ? { metrics: { evalGap: -2, searchGap: 7, primary: 'search-gap' as const, classification: 'diagnostic' as const, gating: false, work: 120_000 } }
        : {}) }));
    const summary = aggregate(manifest, results);
    expect(summary.valid).toBe(true);
    expect(summary.offered).toBe(225 - DEMOTED.size);
    expect(summary.earned).toBe(225 - DEMOTED.size);
    // Measured and reported: the readings are in the summary, with the primary
    // metric named, and nothing about them enters offered/earned.
    expect(summary.diagnostics.map(d => d.id)).toEqual([...DEMOTED].sort());
    expect(summary.diagnostics.every(d => d.primary === 'search-gap' && d.value === 7 && d.evalGap === -2)).toBe(true);
    // A result that claims to gate under a diagnostic descriptor is refused.
    const lying = structuredClone(results);
    lying[lying.findIndex(r => DEMOTED.has(r.id))].metrics!.gating = true;
    expect(() => aggregate(manifest, lying)).toThrow(/claims to gate/);

    // The floor tightens in proportion: the same allowed miss over fewer units.
    const minimumEarned = Object.fromEntries(FAMILIES.map(family => [family, offeredBy(manifest, family) - (family === 'invariants' ? 1 : 0)]));
    const contract: FloorContractV1 = { schema: 'muju-phasing-suite-floor-v1', manifestSha256: hashJson(manifest),
      declaredAt: '2026-09-19T00:00:00.000Z', seed: 1, profile: 'desktop', minimumEarned: minimumEarned as FloorContractV1['minimumEarned'],
      rationale: 'Synthetic diagnostic-demotion contract; floors derive from the offered counts after demotion.',
      coverage: 'all', fallback: 'veto', illegalOrDivergent: 'veto', unresolvedProof: 'veto' };
    expect(minimumEarnedFor(contract, manifest, 'invariants')).toBe(RELEASE_COUNTS.invariants - DEMOTED.size - 1);
    const floors = assessFloors(contract, manifest, summary);
    expect(floors.pass).toBe(true);
    expect(floors.families.find(f => f.family === 'invariants')).toMatchObject({ offered: RELEASE_COUNTS.invariants - DEMOTED.size });
  });
});

describe('search-gap is the primary metric at a stated fixed work', () => {
  it('scores the searched gap, not the static one, and records the work', () => scoped(() => {
    const searched = pair({ classification: 'preference', primaryMetric: 'search-gap', work: 120_000 });
    // Static evaluation prefers the violating member; search prefers the correct
    // one. A search-gap pair must follow the search.
    const out = scoreCase(searched, withSearch(-4, 1, 9, 2), resolve, IDENTITY);
    expect(out.metrics).toMatchObject({ evalGap: -5, searchGap: 7, primary: 'search-gap', classification: 'preference', gating: true, work: 120_000 });
    expect(out.status).toBe('pass');
    expect(out.earned).toBe(1);
    // And the reverse: a positive static gap cannot rescue a negative searched one.
    expect(scoreCase(searched, withSearch(4, 1, 2, 9), resolve, IDENTITY).status).toBe('fail');
  }));

  it('refuses a search-gap case whose search reading is missing', () => scoped(() => {
    const searched = pair({ classification: 'preference', primaryMetric: 'search-gap', work: 120_000 });
    const out = scoreCase(searched, values(4, 1), resolve, IDENTITY);
    expect(out.status).toBe('error');
    expect(out.failureCodes).toContain('primary-search-missing');
    // Same for a diagnostic: it is measured at the same fixed work, so a
    // missing reading is an error rather than a silently skipped row.
    const diagnostic = scoreCase(pair({ classification: 'diagnostic', primaryMetric: 'search-gap', work: 120_000 }), values(4, 1), resolve, IDENTITY);
    expect(diagnostic.status).toBe('error');
    expect(diagnostic.failureCodes).toContain('primary-search-missing');
  }));

  it('requires a declared work on any search-gap pair', () => scoped(() => {
    const document = (c: InvariantPair): SuiteDocument => ({ schema: 'muju-phasing-suite-v1', family: 'invariants', positions: [a, b], cases: [c] });
    expect(() => validateSuiteDocument(document(pair({ primaryMetric: 'search-gap' })))).toThrow(/pair scoring contract/);
    expect(() => validateSuiteDocument(document(pair({ primaryMetric: 'search-gap', work: 1 })))).not.toThrow();
  }));
});

describe('any-of accept for multi-answer tactics decisions', () => {
  const trace = () => scoped(() => replayMacro(state(), pass));
  const bank = (value: number): PredicateSpec => ({ kind: 'state-facts@1', at: 'root', facts: [{ kind: 'bank', player: 'white', value: { eq: value } }] });
  const unresolved: PredicateSpec = { kind: 'home-defense@1', at: 'root', invader: 'white', expected: 'rescue', maxNodes: 1 };

  it('passes when any single branch passes, and fails only when every branch does', () => scoped(() => {
    const t = trace();
    expect(evaluatePredicate({ kind: 'any-of@1', predicates: [bank(9999), bank(10)] }, t).status).toBe('pass');
    expect(evaluatePredicate({ kind: 'any-of@1', predicates: [bank(10), bank(9999)] }, t).status).toBe('pass');
    expect(evaluatePredicate({ kind: 'any-of@1', predicates: [bank(9999), bank(8888)] }, t).status).toBe('fail');
    // Both branches are reported, so the record still shows which answer scored.
    expect((evaluatePredicate({ kind: 'any-of@1', predicates: [bank(9999), bank(10)] }, t).facts as { status: string }[]).map(r => r.status)).toEqual(['fail', 'pass']);
  }));

  it('is indeterminate when nothing passes and a branch could not be resolved', () => scoped(() => {
    const s = state(); s.board.units[0].position = { x: 9, y: 9 }; s.board.units[1].position = { x: 9, y: 7 };
    const t = rootTrace(s);
    expect(evaluatePredicate(unresolved, t).status).toBe('indeterminate');
    expect(evaluatePredicate({ kind: 'any-of@1', predicates: [bank(9999), unresolved] }, t).status).toBe('indeterminate');
    // An exhausted proof never silently reads as a miss...
    expect(evaluatePredicate({ kind: 'any-of@1', predicates: [unresolved] }, t).status).toBe('indeterminate');
    // ...but a genuinely satisfied alternative answer still settles the case.
    expect(evaluatePredicate({ kind: 'any-of@1', predicates: [unresolved, { kind: 'state-facts@1', at: 'root', facts: [{ kind: 'game-phase', value: 'playing' }] }] }, t).status).toBe('pass');
  }));

  it('accepts an any-of decision predicate and still refuses a budget proof inside one', () => scoped(() => {
    const root = position('root');
    const decision: MacroDecision = { id: 'multi-answer', family: 'tactics', kind: 'macro-decision',
      rationale: 'Two equally valid targets; scoring one as the only answer is the v1 defect', tags: [],
      authoredFrom: { id: 'multi-answer', revision: 'classification-test', disposition: 'new' },
      evidence: { positive: [{ kind: 'legal-trace@1', actions: pass, endpoint: 'first-handoff-or-terminal', assert: alive }],
        negative: [{ kind: 'legal-trace@1', actions: pass, endpoint: 'first-handoff-or-terminal', assert: { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'game-phase', value: 'victory' }] } }],
        rationale: 'Canonical witness only', exposure: 'No engine outcomes' },
      root: positionRef(root), work: 10, horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: 'predicate-only',
      accept: { kind: 'any-of@1', predicates: [{ kind: 'target-removed@1', targetId: 'b' }, alive] } };
    const document: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'tactics', positions: [root], cases: [decision] };
    expect(() => validateSuiteDocument(document)).not.toThrow();
    // The second branch (the turn simply completes) is the one that holds here.
    expect(evaluateDecision(decision, replayMacro(root.state, pass)).status).toBe('pass');
    const budget: PredicateSpec = { kind: 'home-proof-budget@1', at: 'root', invader: 'white', expected: 'unknown', maxNodes: 1 };
    expect(containsBudgetProbe({ kind: 'any-of@1', predicates: [alive, budget] })).toBe(true);
    const smuggled = structuredClone(document);
    (smuggled.cases[0] as MacroDecision).accept = { kind: 'any-of@1', predicates: [alive, budget] };
    expect(() => validateSuiteDocument(smuggled)).toThrow(/budget proof/);
  }));
});

describe('intruder survival: a pass-only hand-off plus a unit-present fact', () => {
  const raid = (accept: PredicateSpec, handoffs = INTRUDER_SURVIVAL_HANDOFFS): MacroDecision => ({
    id: 'raid', family: 'summon-disruption', kind: 'macro-decision', rationale: 'Synthetic disruption shape', tags: [],
    authoredFrom: { id: 'raid', revision: 'classification-test', disposition: 'new' },
    evidence: { positive: [], negative: [], rationale: 'shape only', exposure: 'shape only' },
    root: positionRef(a), work: 10, horizon: intruderSurvivalHorizon(true, handoffs), terminalPolicy: 'predicate-only', accept });
  const present: PredicateSpec = { kind: 'state-facts@1', at: 'endpoint', facts: [intruderPresentFact('raider', 'black')] };
  const disrupted: PredicateSpec = { kind: 'summon-resolution@1', commitment: { kind: 'root', id: 'p' }, outcome: 'disrupted', player: 'white' };

  it('builds the declared horizon', () => {
    expect(intruderSurvivalHorizon()).toEqual({ kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: 1, homeFirst: true });
    expect(hasIntruderSurvivalHorizon(raid(present))).toBe(true);
    expect(hasIntruderSurvivalHorizon(raid(present, 4))).toBe(true);
    expect(hasIntruderSurvivalHorizon({ ...raid(present), horizon: { kind: 'first-handoff-or-terminal' } })).toBe(false);
  });

  it('builds the endpoint fact and finds it through conjunctions', () => {
    expect(intruderPresentFact('raider', 'black')).toEqual({ kind: 'unit', id: 'raider', present: true, owner: 'black' });
    expect(requiresUnitAtEndpoint(present, 'raider', 'black')).toBe(true);
    expect(requiresUnitAtEndpoint(present, 'raider', 'white')).toBe(false);
    expect(requiresUnitAtEndpoint(present, 'other', 'black')).toBe(false);
    expect(requiresUnitAtEndpoint({ kind: 'all@1', predicates: [disrupted, present] }, 'raider', 'black')).toBe(true);
    // A root-bound fact says nothing about survival past the horizon.
    expect(requiresUnitAtEndpoint({ kind: 'state-facts@1', at: 'root', facts: [intruderPresentFact('raider', 'black')] }, 'raider', 'black')).toBe(false);
    // An absence fact is not a survival requirement either.
    expect(requiresUnitAtEndpoint({ kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'unit', id: 'raider', present: false }] }, 'raider')).toBe(false);
  });

  it('requires the fact on EVERY branch of a multi-answer accept', () => {
    const both: PredicateSpec = { kind: 'any-of@1', predicates: [{ kind: 'all@1', predicates: [disrupted, present] }, { kind: 'all@1', predicates: [alive, present] }] };
    const leaky: PredicateSpec = { kind: 'any-of@1', predicates: [{ kind: 'all@1', predicates: [disrupted, present] }, alive] };
    expect(requiresUnitAtEndpoint(both, 'raider', 'black')).toBe(true);
    // One branch that scores a raid whose intruder is gone defeats the rule.
    expect(requiresUnitAtEndpoint(leaky, 'raider', 'black')).toBe(false);
    expect(assertsIntruderSurvival(raid(both), 'raider', 'black')).toBe(true);
    expect(assertsIntruderSurvival(raid(leaky), 'raider', 'black')).toBe(false);
  });

  it('needs the horizon and the fact together, which is the whole rule', () => {
    expect(assertsIntruderSurvival(raid({ kind: 'all@1', predicates: [disrupted, present] }), 'raider', 'black')).toBe(true);
    // Horizon without the fact: a raid that is answered on the reply still scores.
    expect(assertsIntruderSurvival(raid(disrupted), 'raider', 'black')).toBe(false);
    // Fact without the horizon: the endpoint is the mover's own hand-off, so
    // the intruder has not had to survive anything.
    expect(assertsIntruderSurvival({ ...raid(present), horizon: { kind: 'first-handoff-or-terminal' } }, 'raider', 'black')).toBe(false);
  });
});

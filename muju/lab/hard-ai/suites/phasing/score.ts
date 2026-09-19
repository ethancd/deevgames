import { continueHorizon, hashJson, replayMacro, semanticHash } from './canonical';
import { decisionUnits } from './format';
import { evaluateDecision, evaluatePredicate, evaluateProbe, rootTrace, validateAuthorEvidence } from './predicates';
import type { PredicateResult } from './predicates';
import type { AIAction, PhasingCase, PhasingPosition, PlayerId, PositionRef } from './format';
import type { ReleaseManifest } from './manifest';
import { validateManifestShape } from './manifest';

/** Engine adapter supplies diagnostics but canonical replay owns correctness. */
export interface EngineTurn {
  actions: AIAction[]; source: string; fallback: boolean; engineIdentity: string;
  /** Adapter computes this from its selected end position; optional diagnostic. */
  canonicalEndHash?: string; error?: string;
}
export interface EngineValue { value: number; perspective: PlayerId; engineIdentity: string; error?: string }
export type CaseExecution =
  | { kind: 'macro'; turn: EngineTurn }
  | { kind: 'coverage'; turn?: EngineTurn }
  | { kind: 'pair'; evaluation: { violating: EngineValue; correct: EngineValue }; search?: { violating: EngineValue; correct: EngineValue }; turns?: { violating: EngineTurn; correct: EngineTurn } }
  | { kind: 'error'; error: string };
export interface CaseResult {
  schema: 'muju-phasing-case-result-v1'; id: string; caseSha256: string; kind: PhasingCase['kind'];
  status: 'pass' | 'fail' | 'indeterminate' | 'error'; offered: 0 | 1; earned: 0 | 1;
  failureCodes: string[]; predicates: PredicateResult[];
  endpointSha256?: string; engineIdentity?: string;
  metrics?: { evalGap: number; searchGap?: number; primary: 'eval-gap' | 'search-gap' | 'none' };
}
function validateTurn(turn: EngineTurn, expectedIdentity: string): void {
  if (!turn || turn.error) throw new Error(`engine-error:${turn?.error ?? 'missing turn'}`);
  if (!turn.source || typeof turn.fallback !== 'boolean' || turn.fallback || turn.source.toLowerCase().includes('fallback')) throw new Error('engine-fallback');
  if (turn.engineIdentity !== expectedIdentity || !expectedIdentity) throw new Error('engine-identity-mismatch');
  if (!Array.isArray(turn.actions)) throw new Error('missing-actions');
}
function normalized(value: EngineValue, perspective: PlayerId, identity: string): number {
  if (!identity.trim() || !value || value.error || !Number.isFinite(value.value) || !['white', 'black'].includes(value.perspective) || value.engineIdentity !== identity) throw new Error('invalid-pair-value-or-identity');
  return value.value * (value.perspective === perspective ? 1 : -1);
}
function statusOf(results: PredicateResult[]): CaseResult['status'] { return results.some(r => r.status === 'indeterminate') ? 'indeterminate' : results.some(r => r.status === 'fail') ? 'fail' : 'pass'; }

/** Install bound canonical rules before calling. No result can change case membership. */
export function scoreCase(c: PhasingCase, execution: CaseExecution, resolve: (ref: PositionRef) => PhasingPosition, engineIdentity: string): CaseResult {
  const out: CaseResult = { schema: 'muju-phasing-case-result-v1', id: c.id, caseSha256: hashJson(c), kind: c.kind, status: 'error', offered: decisionUnits(c), earned: 0, failureCodes: [], predicates: [], engineIdentity };
  try {
    const author = validateAuthorEvidence(c, resolve);
    if (author.status !== 'pass') { out.status = author.status; out.failureCodes.push('author-evidence-not-established'); out.predicates = author.results; return out; }
    if (execution.kind === 'error') throw new Error(`engine-error:${execution.error}`);
    if (c.kind === 'macro-decision') {
      if (execution.kind !== 'macro') throw new Error('execution-kind-mismatch');
      validateTurn(execution.turn, engineIdentity);
      const macro = replayMacro(resolve(c.root).state, execution.turn.actions);
      out.endpointSha256 = semanticHash(macro.endpoint);
      if (execution.turn.canonicalEndHash && execution.turn.canonicalEndHash !== out.endpointSha256) throw new Error('engine-canonical-divergence');
      out.predicates.push(evaluateDecision(c, continueHorizon(macro, c.horizon)));
    } else if (c.kind === 'canonical-coverage') {
      if (execution.kind !== 'coverage') throw new Error('execution-kind-mismatch');
      const root = resolve(c.root).state;
      out.predicates.push(...c.probes.map(p => evaluateProbe(p, root)));
      if (c.engineReplay.required || execution.turn) {
        if (!execution.turn) throw new Error('required-coverage-turn-missing');
        validateTurn(execution.turn, engineIdentity);
        const trace = replayMacro(root, execution.turn.actions); out.endpointSha256 = semanticHash(trace.endpoint);
        if (execution.turn.canonicalEndHash && execution.turn.canonicalEndHash !== out.endpointSha256) throw new Error('engine-canonical-divergence');
      }
    } else {
      if (execution.kind !== 'pair') throw new Error('execution-kind-mismatch');
      for (const member of ['violating', 'correct'] as const) out.predicates.push(evaluatePredicate(c.premise[member], rootTrace(resolve(c[member]).state)));
      const evalGap = normalized(execution.evaluation.correct, c.perspective, engineIdentity) - normalized(execution.evaluation.violating, c.perspective, engineIdentity);
      let searchGap: number | undefined;
      if (execution.search) {
        if (!execution.turns) throw new Error('pair search requires replayable turns');
        for (const member of ['violating', 'correct'] as const) { const turn = execution.turns[member]; validateTurn(turn, engineIdentity); const trace = replayMacro(resolve(c[member]).state, turn.actions); if (turn.canonicalEndHash && turn.canonicalEndHash !== semanticHash(trace.endpoint)) throw new Error('pair-engine-canonical-divergence'); }
        searchGap = normalized(execution.search.correct, c.perspective, engineIdentity) - normalized(execution.search.violating, c.perspective, engineIdentity);
      }
      if (c.primaryMetric === 'search-gap' && searchGap === undefined) throw new Error('primary-search-missing');
      out.metrics = { evalGap, ...(searchGap === undefined ? {} : { searchGap }), primary: c.primaryMetric };
      if (c.classification === 'preference') { const actual = c.primaryMetric === 'eval-gap' ? evalGap : searchGap!; out.predicates.push({ status: actual > 0 ? 'pass' : 'fail', facts: [{ metric: c.primaryMetric, actual, required: 'strictly-positive' }] }); }
    }
    out.status = statusOf(out.predicates); out.earned = out.status === 'pass' ? out.offered : 0;
    if (out.status !== 'pass') out.failureCodes.push(out.status === 'indeterminate' ? 'predicate-indeterminate' : 'predicate-miss');
  } catch (error) { out.status = 'error'; out.failureCodes.push(error instanceof Error ? error.message : String(error)); }
  return out;
}

export interface SuiteResult {
  schema: 'muju-phasing-suite-result-v1'; manifestSha256: string; scope: 'release';
  engineIdentity: string | null;
  complete: boolean; valid: boolean; acceptance: 'not-established';
  offered: number; earned: number; expectedCases: 225; receivedCases: number;
  coverage: { expected: number; pass: number; fail: number; indeterminate: number; error: number; missing: number };
  failures: string[]; results: CaseResult[];
}
/** Missing results invalidate the run and retain their manifest-offered units. */
export function aggregate(manifestInput: ReleaseManifest, results: CaseResult[]): SuiteResult {
  const manifest = validateManifestShape(manifestInput), expected = new Map(manifest.cases.map(c => [c.id, c])), seen = new Set<string>(), failures: string[] = [];
  let earned = 0;
  let engineIdentity: string | null = null;
  const coverage = { expected: manifest.cases.filter(c => c.offered === 0).length, pass: 0, fail: 0, indeterminate: 0, error: 0, missing: 0 };
  for (const r of results) {
    const c = expected.get(r.id);
    if (!c || seen.has(r.id)) throw new Error(`extra/duplicate result ${r.id}`); seen.add(r.id);
    if (typeof r.engineIdentity !== 'string' || !r.engineIdentity.trim()) throw new Error(`empty result engine identity ${r.id}`);
    if (engineIdentity !== null && engineIdentity !== r.engineIdentity) throw new Error('mixed result engine identities');
    engineIdentity = r.engineIdentity;
    if (r.schema !== 'muju-phasing-case-result-v1' || r.caseSha256 !== c.sha256 || r.kind !== c.kind || r.offered !== c.offered || !['pass', 'fail', 'indeterminate', 'error'].includes(r.status) || r.earned !== (r.status === 'pass' ? c.offered : 0)) throw new Error(`result contract mismatch ${r.id}`);
    earned += r.earned;
    if (!c.offered) coverage[r.status]++;
    if (r.status === 'error' || r.status === 'indeterminate' || (!c.offered && r.status === 'fail') || r.failureCodes.includes('author-evidence-not-established')) failures.push(`${r.id}:${r.status}`);
  }
  for (const c of manifest.cases) if (!seen.has(c.id)) { failures.push(`${c.id}:missing`); if (!c.offered) coverage.missing++; }
  return { schema: 'muju-phasing-suite-result-v1', manifestSha256: hashJson(manifest), scope: 'release', engineIdentity, complete: seen.size === 225, valid: failures.length === 0, acceptance: 'not-established', offered: manifest.cases.reduce((n, c) => n + c.offered, 0), earned, expectedCases: 225, receivedCases: results.length, coverage, failures, results: [...results].sort((a, b) => a.id.localeCompare(b.id)) };
}

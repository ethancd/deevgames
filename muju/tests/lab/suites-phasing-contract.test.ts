// @vitest-environment node
/** Floor-contract integrity and scorer-override tests.
 *
 * Two independent questions. (5) A floor is only preregistered if git says it
 * existed, in these bytes, in history this run descends from, before the run
 * started; declaredAt is written by whoever writes the contract. (7) No engine
 * fallback, timeout or terminal-win override can earn a point, and in
 * particular a terminated, one-sided economy root cannot be credited.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { buildEconomy } from '../../lab/hard-ai/suites/phasing/build-economy';
import { buildNewFamilies } from '../../lab/hard-ai/suites/phasing/build-new-families';
import { buildTacticsSuite } from '../../lab/hard-ai/suites/phasing/build-tactics';
import { buildHomeMateSuite } from '../../lab/hard-ai/suites/phasing/build-home-mate';
import { buildInvariants } from '../../lab/hard-ai/suites/phasing/build-invariants';
import { continueHorizon, hashJson, replayMacro, sourceBinding, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { FAMILIES } from '../../lab/hard-ai/suites/phasing/format';
import type { Family, MacroDecision, PhasingPosition, PositionRef, PredicateSpec, SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import { assertContractBuild, minimumEarnedFor, offeredBy, V1_ALLOWED_MISS, validateFloorContract } from '../../lab/hard-ai/suites/phasing/contract';
import type { FloorContractV1, FloorContractV2 } from '../../lab/hard-ai/suites/phasing/contract';
import { buildReleaseManifest } from '../../lab/hard-ai/suites/phasing/manifest';
import type { ReleaseManifest } from '../../lab/hard-ai/suites/phasing/manifest';
import { resolveContractCommit } from '../../lab/hard-ai/suites/phasing/measure';
import { MUJU_ROOT } from '../../lab/hard-ai/suites/phasing/run';
import { evaluateDecision } from '../../lab/hard-ai/suites/phasing/predicates';
import { scoreCase } from '../../lab/hard-ai/suites/phasing/score';
import type { EngineTurn } from '../../lab/hard-ai/suites/phasing/score';

const IDENTITY = 'test-engine-identity';
const resolverFor = (doc: SuiteDocument) => (ref: PositionRef): PhasingPosition => {
  const position = doc.positions.find(p => p.id === ref.id);
  if (!position) throw new Error(`missing ${ref.id}`);
  return position;
};
const turnFrom = (actions: MacroDecision['evidence']['positive'][number]): EngineTurn => {
  if (actions.kind !== 'legal-trace@1') throw new Error('expected a macro witness');
  return { actions: structuredClone(actions.actions), source: 'hard-search', fallback: false, engineIdentity: IDENTITY };
};

describe('floor contract integrity', () => {
  const repoTop = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: MUJU_ROOT, encoding: 'utf8' }).trim();
  const committedContract = join(MUJU_ROOT, 'lab/hard-ai/suites/phasing/fixtures/v1/floor-contract.json');

  it('binds the contract to git rather than to its own declaredAt', () => {
    const now = new Date().toISOString();
    const resolved = resolveContractCommit(committedContract, now);
    expect(resolved.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(resolved.ancestorOfHead).toBe(true);
    expect(resolved.bytesMatchCommit).toBe(true);
    expect(Date.parse(resolved.committedAt)).toBeLessThan(Date.parse(now));
    // The commit is genuinely reachable from HEAD.
    expect(() => execFileSync('git', ['merge-base', '--is-ancestor', resolved.commit, 'HEAD'], { cwd: repoTop })).not.toThrow();
    // A run that claims to have started before the contract was committed is refused.
    expect(() => resolveContractCommit(committedContract, '2000-01-01T00:00:00.000Z')).toThrow(/precede the measurement start/);
  });

  it('refuses an uncommitted contract, which is what blocks a v2 measurement before the coordinator commits it', () => {
    const notCommitted = join(MUJU_ROOT, 'lab/hard-ai/suites/phasing/fixtures/v2/floor-contract.json');
    expect(() => resolveContractCommit(notCommitted, new Date().toISOString())).toThrow(/is not committed/);
    expect(() => resolveContractCommit(join(tmpdir(), 'floor-contract.json'), new Date().toISOString())).toThrow(/inside this repository/);
  });

  describe('v2 floors are derived, not asserted', () => {
    const base = {
      declaredAt: '2026-09-19T00:00:00.000Z', seed: 1, profile: 'desktop' as const,
      rationale: 'Synthetic v2 contract test; floors derive from the frozen v1 allowed-miss budget and the v2 offered counts.',
      coverage: 'all' as const, fallback: 'veto' as const, illegalOrDivergent: 'veto' as const, unresolvedProof: 'veto' as const,
    };

    it('reuses the v1 allowed-miss budget and derives minimumEarned from the manifest', () => {
      // A full manifest needs all six families; build it the way the runner does.
      const manifest = releaseManifest();
      const contract: FloorContractV2 = { ...base, schema: 'muju-phasing-suite-floor-v2', manifestSha256: hashJson(manifest),
        engineSourceSha256: 'a'.repeat(64), weightsSha256: 'b'.repeat(64), allowedMiss: { ...V1_ALLOWED_MISS } };
      expect(() => validateFloorContract(contract, manifest)).not.toThrow();
      for (const family of FAMILIES) {
        expect(minimumEarnedFor(contract, manifest, family)).toBe(offeredBy(manifest, family) - V1_ALLOWED_MISS[family]);
      }
      // Loosening any family's budget is refused, so v2 floors cannot be set
      // from the v1 outcomes that have already been seen.
      for (const family of FAMILIES) {
        const loosened = { ...contract, allowedMiss: { ...contract.allowedMiss, [family]: V1_ALLOWED_MISS[family] + 1 } as Record<Family, number> };
        expect(() => validateFloorContract(loosened, manifest)).toThrow(/allowed-miss budget/);
      }
    }, 120_000);

    it('pins the engine build the floors were declared against', () => {
      const contract: FloorContractV2 = { ...base, schema: 'muju-phasing-suite-floor-v2', manifestSha256: hashJson(releaseManifest()),
        engineSourceSha256: 'a'.repeat(64), weightsSha256: 'b'.repeat(64), allowedMiss: { ...V1_ALLOWED_MISS } };
      expect(() => assertContractBuild(contract, { sourceSha256: 'a'.repeat(64), weightsSha256: 'b'.repeat(64) })).not.toThrow();
      expect(() => assertContractBuild(contract, { sourceSha256: 'c'.repeat(64), weightsSha256: 'b'.repeat(64) })).toThrow(/engine source/);
      expect(() => assertContractBuild(contract, { sourceSha256: 'a'.repeat(64), weightsSha256: 'c'.repeat(64) })).toThrow(/weights/);
      // A v1 contract pins no build at all; that is exactly the gap v2 closes.
      const v1: FloorContractV1 = JSON.parse(readFileSync(committedContract, 'utf8'));
      expect(v1.schema).toBe('muju-phasing-suite-floor-v1');
      expect('engineSourceSha256' in v1).toBe(false);
    });
  });
});

/** The six-family manifest, built the way the runner builds it, once. */
let memoisedManifest: ReleaseManifest | undefined;
function releaseManifest(): ReleaseManifest {
  return memoisedManifest ??= buildManifest();
}
function buildManifest(): ReleaseManifest {
  const binding = sourceBinding(DEFAULT_RULES);
  const [disruption, fortify] = buildNewFamilies();
  const documents: SuiteDocument[] = [buildTacticsSuite(), buildHomeMateSuite(),
    withRules(binding, () => buildEconomy(binding), binding), withRules(binding, () => buildInvariants(binding), binding),
    disruption, fortify];
  const files = documents.map(d => ({ family: d.family, path: `${d.family}.suite.json`, sha256: hashJson(d).slice(0, 64) }));
  return buildReleaseManifest(documents, files, { 'lab/hard-ai/suites/phasing/format.ts': '0'.repeat(64),
    'lab/hard-ai/suites/phasing/canonical.ts': '0'.repeat(64), 'lab/hard-ai/suites/phasing/predicates.ts': '0'.repeat(64),
    'lab/hard-ai/suites/phasing/manifest.ts': '0'.repeat(64), 'lab/hard-ai/suites/phasing/score.ts': '0'.repeat(64) });
}

describe('scorer refuses fallbacks, timeouts and hidden terminations', () => {
  const binding = sourceBinding(DEFAULT_RULES);
  const economy = withRules(binding, () => buildEconomy(binding), binding);
  const decision = economy.cases.find(c => c.kind === 'macro-decision') as MacroDecision;
  const resolve = resolverFor(economy);
  const honest = turnFrom(decision.evidence.positive[0]);

  it('earns the point only for a clean production turn', () => {
    const scored = withRules(binding, () => scoreCase(decision, { kind: 'macro', turn: honest }, resolve, IDENTITY), binding);
    expect(scored.failureCodes, JSON.stringify(scored.failureCodes)).toEqual([]);
    expect(scored.status).toBe('pass');
    expect(scored.offered).toBe(1);
    expect(scored.earned).toBe(1);
  }, 60_000);

  it('never earns a point for a fallback, a timeout or a foreign engine identity', () => {
    const cases: [string, Parameters<typeof scoreCase>[1], RegExp][] = [
      ['declared fallback', { kind: 'macro', turn: { ...honest, fallback: true } }, /engine-fallback/],
      ['fallback named in source', { kind: 'macro', turn: { ...honest, source: 'hard-v2-fallback' } }, /engine-fallback/],
      ['turn carries an error', { kind: 'macro', turn: { ...honest, error: 'search timeout' } }, /engine-error:search timeout/],
      ['adapter raised', { kind: 'error', error: 'search timed out after budget' }, /engine-error:search timed out after budget/],
      ['foreign identity', { kind: 'macro', turn: { ...honest, engineIdentity: 'other-engine' } }, /engine-identity-mismatch/],
      ['wrong execution kind', { kind: 'coverage' }, /execution-kind-mismatch/],
    ];
    for (const [name, execution, code] of cases) {
      const scored = withRules(binding, () => scoreCase(decision, execution, resolve, IDENTITY), binding);
      expect(scored.status, name).toBe('error');
      expect(scored.earned, name).toBe(0);
      expect(scored.failureCodes.join('|'), name).toMatch(code);
    }
  }, 60_000);

  it('keeps every economy decision on predicate-only, so no terminal-win override can credit one', () => {
    for (const c of economy.cases) {
      if (c.kind !== 'macro-decision') continue;
      expect(c.terminalPolicy, c.id).toBe('predicate-only');
      // Survival is asserted across every state of the trace, not only its endpoint.
      const survives = (p: PredicateSpec): boolean => p.kind === 'all@1' ? p.predicates.some(survives)
        : p.kind === 'economy-ledger@1' && p.surviveThroughout.length === 2;
      expect(survives(c.accept), c.id).toBe(true);
    }
  });

  it('refuses a terminated one-sided root even when the mover is the winner', () => {
    const [, fortify] = buildNewFamilies();
    const fortifyBinding = fortify.positions[0].binding;
    const win = fortify.cases.find(c => c.kind === 'macro-decision') as MacroDecision;
    withRules(fortifyBinding, () => {
      const root = resolverFor(fortify)(win.root).state;
      const witness = win.evidence.positive[0];
      if (witness.kind !== 'legal-trace@1') throw new Error('expected a macro witness');
      const trace = continueHorizon(replayMacro(root, witness.actions), win.horizon);
      expect(trace.endpoint.phase).toBe('victory');
      expect(trace.endpoint.winner).toBe(root.turn.currentPlayer);
      // The declared override credits the mover's own win, as home-fortify intends.
      expect(win.terminalPolicy).toBe('allow-root-mover-win');
      expect(evaluateDecision(win, trace).status).toBe('pass');
      // The same winning, one-sided endpoint scored under an economy contract
      // is a miss: predicate-only plus surviveThroughout cannot be overridden.
      const asEconomy: MacroDecision = { ...win, terminalPolicy: 'predicate-only',
        accept: { kind: 'economy-ledger@1', surviveThroughout: ['white', 'black'], facts: [{ player: 'white', metric: 'mined', value: { min: 0 } }] } };
      expect(evaluateDecision(asEconomy, trace).status).toBe('fail');
    }, fortifyBinding);
  }, 60_000);
});

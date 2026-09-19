// @vitest-environment node
/** Floor-contract integrity and scorer-override tests.
 *
 * Two independent questions. (5) A floor is only preregistered if git says it
 * existed, in these bytes, in history this run descends from, before the run
 * started; declaredAt is written by whoever writes the contract. (7) No engine
 * fallback, timeout or terminal-win override can earn a point, and in
 * particular a terminated, one-sided economy root cannot be credited.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
import { appendMeasurementLedger, describeWitness, findPriorMeasurements, isResultPath, resolveContractCommit, verifyMeasurementLedger } from '../../lab/hard-ai/suites/phasing/measure';
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

/** ------------------------------------------------------------------------
 * The git binding, honestly tiered, plus the defences that do not depend on
 * trusting a clock.
 *
 * `%cI` is self-asserted (GIT_COMMITTER_DATE, clock skew), an amend or rebase
 * after an off-record run passes every ancestry and date check, and a contract
 * can be committed together with the numbers it claims to predate. None of
 * that is fixable by looking harder at dates, so this code does four things
 * instead: it states how far outside this machine the commit can be
 * corroborated (tier A remote-tracking / tier B local), it compares git's own
 * blob identity, it refuses a contract commit that also carries results, and
 * it refuses a second measurement of the same manifest+contract — with an
 * append-only hash-chained ledger that must still verify before a run starts.
 *
 * Every repository below is created by the test in a temp directory. Nothing
 * here runs git against the working repository.
 * ------------------------------------------------------------------------ */
interface TempRepo { dir: string; run: (...args: string[]) => string; write: (path: string, body: string) => string }
function tempRepo(): TempRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'muju-contract-repo-')));
  const run = (...args: string[]): string => execFileSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Contract Test', ...args],
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path: string, body: string): string => {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    return target;
  };
  run('init', '-q', '-b', 'main');
  write('README.md', 'seed\n');
  run('add', 'README.md'); run('commit', '-qm', 'seed');
  return { dir, run, write };
}
const CONTRACT_BODY = `${JSON.stringify({ schema: 'muju-phasing-suite-floor-v2', note: 'bytes only; shape is validated elsewhere' }, null, 2)}\n`;
const future = () => new Date(Date.now() + 60_000).toISOString();

describe('floor contract witness tiers', () => {
  const made: string[] = [];
  const repo = (): TempRepo => { const r = tempRepo(); made.push(r.dir); return r; };
  afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

  it('records tier B when the contract commit lives only in this clone', () => {
    const r = repo();
    const contract = r.write('contracts/floor.json', CONTRACT_BODY);
    r.run('add', 'contracts/floor.json'); r.run('commit', '-qm', 'freeze the floor');
    const resolved = resolveContractCommit(contract, future(), r.dir);
    expect(resolved.witnessTier).toBe('local-only');
    expect(resolved.remoteRefs).toEqual([]);
    expect(resolved.blobSha1).toMatch(/^[0-9a-f]{40}$/);
    expect(resolved.touchesResultPaths).toBe(false);
    // The report must say so in words, not only in a field a reader may skip.
    expect(describeWitness(resolved.witnessTier)).toBe('WITNESS: local only');
  });

  it('records tier A when a remote-tracking ref contains the contract commit', () => {
    const r = repo();
    const contract = r.write('contracts/floor.json', CONTRACT_BODY);
    r.run('add', 'contracts/floor.json'); r.run('commit', '-qm', 'freeze the floor');
    const head = r.run('rev-parse', 'HEAD');
    r.run('update-ref', 'refs/remotes/origin/main', head);
    const resolved = resolveContractCommit(contract, future(), r.dir);
    expect(resolved.witnessTier).toBe('remote-tracking');
    expect(resolved.remoteRefs).toContain('origin/main');
    expect(describeWitness(resolved.witnessTier)).toMatch(/remote-tracking ref contains/);
    // An amend rewrites the floor into a commit the remote-tracking ref no
    // longer contains, so the strong tier is lost — even though the amended
    // contract still passes every ancestry, date and blob check, which is
    // exactly the attack the date checks cannot see.
    r.write('contracts/floor.json', CONTRACT_BODY.replace('bytes only', 'quietly rewritten'));
    r.run('add', 'contracts/floor.json');
    r.run('commit', '-q', '--amend', '--no-edit');
    const amended = resolveContractCommit(contract, future(), r.dir);
    expect(amended.commit).not.toBe(head);
    expect(amended.ancestorOfHead).toBe(true);
    expect(amended.bytesMatchCommit).toBe(true);
    expect(amended.witnessTier).toBe('local-only');
  });
});

describe('floor contract refusals that do not depend on the clock', () => {
  const made: string[] = [];
  const repo = (): TempRepo => { const r = tempRepo(); made.push(r.dir); return r; };
  afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

  it('refuses a working-tree contract whose blob differs from the blob at its commit', () => {
    const r = repo();
    const contract = r.write('contracts/floor.json', CONTRACT_BODY);
    r.run('add', 'contracts/floor.json'); r.run('commit', '-qm', 'freeze the floor');
    expect(() => resolveContractCommit(contract, future(), r.dir)).not.toThrow();
    writeFileSync(contract, `${CONTRACT_BODY}  `);
    expect(() => resolveContractCommit(contract, future(), r.dir)).toThrow(/blob differs from the blob at its commit/);
  });

  it('refuses a contract commit that also carries results or measurement output', () => {
    for (const [name, path] of [['a results directory', 'lab/results/run-1/summary.json'], ['a measurement record', 'measure/out/result.json'],
      ['case rows', 'measure/out/cases.jsonl'], ['the ledger itself', 'lab/measurement-ledger.jsonl']] as const) {
      const r = repo();
      const contract = r.write('contracts/floor.json', CONTRACT_BODY);
      r.write(path, '{}\n');
      r.run('add', '-A'); r.run('commit', '-qm', `freeze the floor and ${name}`);
      expect(() => resolveContractCommit(contract, future(), r.dir), name).toThrow(/may not be committed with its own numbers/);
      // The same contract, committed on its own, is accepted.
      const clean = repo();
      const alone = clean.write('contracts/floor.json', CONTRACT_BODY);
      clean.run('add', 'contracts/floor.json'); clean.run('commit', '-qm', 'freeze the floor');
      clean.write(path, '{}\n'); clean.run('add', '-A'); clean.run('commit', '-qm', 'later results');
      expect(() => resolveContractCommit(alone, future(), clean.dir), `${name} (separate commits)`).not.toThrow();
    }
  });

  it('classifies result and non-result paths', () => {
    for (const path of ['lab/results/x/result.json', 'results/a.json', 'a/b/result.json', 'out/cases.jsonl', 'x/started.json', 'y/failure.json', 'z/measurement-ledger.jsonl'])
      expect(isResultPath(path), path).toBe(true);
    for (const path of ['docs/hard-ai/phasing/M5-FLOOR-PREREGISTRATION-v2.md', 'lab/hard-ai/suites/phasing/fixtures/v2/floor-contract.json', 'src/game/rules.ts', 'resultsy/thing.json'])
      expect(isResultPath(path), path).toBe(false);
  });

  it('refuses an uncommitted contract, a commit off this history, and a contract outside the repository', () => {
    const r = repo();
    const contract = r.write('contracts/floor.json', CONTRACT_BODY);
    expect(() => resolveContractCommit(contract, future(), r.dir)).toThrow(/is not committed/);
    r.run('add', 'contracts/floor.json'); r.run('commit', '-qm', 'freeze the floor');
    // A contract whose only commit sits on a branch HEAD does not descend from
    // is not preregistration for THIS run.
    const onMain = r.run('rev-parse', 'HEAD');
    r.run('checkout', '-q', '-b', 'side');
    r.write('contracts/floor.json', `${CONTRACT_BODY}side\n`);
    r.run('commit', '-qam', 'side edit');
    r.run('checkout', '-q', 'main');
    expect(r.run('rev-parse', 'HEAD')).toBe(onMain);
    // Back on main the contract resolves to main's commit; on the side branch
    // the resolved commit is the side commit, still an ancestor of that HEAD.
    expect(resolveContractCommit(contract, future(), r.dir).commit).toBe(onMain);
    expect(() => resolveContractCommit(join(tmpdir(), 'not-in-this-repo.json'), future(), r.dir)).toThrow(/inside this repository/);
  });

  it('still refuses a run that claims to predate the contract commit', () => {
    const r = repo();
    const contract = r.write('contracts/floor.json', CONTRACT_BODY);
    r.run('add', 'contracts/floor.json'); r.run('commit', '-qm', 'freeze the floor');
    expect(() => resolveContractCommit(contract, '2000-01-01T00:00:00.000Z', r.dir)).toThrow(/precede the measurement start/);
  });
});

describe('first-measurement refusal and the append-only ledger', () => {
  const made: string[] = [];
  const tempDir = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'muju-ledger-'))); made.push(dir); return dir; };
  afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

  const MANIFEST = 'a'.repeat(64), CONTRACT_FILE = 'b'.repeat(64);
  const record = (manifestSha256: string, contractFileSha256: string) => JSON.stringify({
    schema: 'muju-phasing-measurement-v1', input: { bundle: { manifestSha256 }, contractFileSha256 } });

  it('finds an existing result for the same manifest and contract, anywhere under a results directory', () => {
    const root = tempDir();
    mkdirSync(join(root, 'lab/results/phasing-v2-run'), { recursive: true });
    mkdirSync(join(root, 'other/results/nested/deep'), { recursive: true });
    mkdirSync(join(root, 'not-results'), { recursive: true });
    writeFileSync(join(root, 'lab/results/phasing-v2-run/result.json'), record(MANIFEST, CONTRACT_FILE));
    writeFileSync(join(root, 'other/results/nested/deep/result.json'), record(MANIFEST, 'c'.repeat(64)));
    writeFileSync(join(root, 'not-results/result.json'), record(MANIFEST, CONTRACT_FILE));
    const found = findPriorMeasurements(root, MANIFEST, CONTRACT_FILE);
    expect(found).toEqual([join(root, 'lab/results/phasing-v2-run/result.json')]);
    // A different manifest, or a different contract file, is a different
    // preregistration and does not block.
    expect(findPriorMeasurements(root, 'd'.repeat(64), CONTRACT_FILE)).toEqual([]);
    expect(findPriorMeasurements(root, MANIFEST, 'e'.repeat(64))).toEqual([]);
  });

  const entry = (overrides: Partial<Parameters<typeof appendMeasurementLedger>[0]> = {}) => ({
    manifestSha256: MANIFEST, contractCommit: '1'.repeat(40), contractBlobSha1: '2'.repeat(40),
    contractFileSha256: CONTRACT_FILE, engineSourceSha256: '3'.repeat(64), weightsSha256: '4'.repeat(64),
    witnessTier: 'local-only' as const, startedAt: '2026-09-19T00:00:00.000Z', resultSha256: '5'.repeat(64), ...overrides });

  it('chains appended lines and re-verifies every earlier one', () => {
    const path = join(tempDir(), 'measurement-ledger.jsonl');
    expect(verifyMeasurementLedger(path)).toEqual({ entries: [], head: 'GENESIS', seq: 0 });
    const first = appendMeasurementLedger(entry(), path);
    expect(first.seq).toBe(1); expect(first.prev).toBe('GENESIS');
    const second = appendMeasurementLedger(entry({ contractCommit: '9'.repeat(40), witnessTier: 'remote-tracking' }), path);
    expect(second.seq).toBe(2); expect(second.prev).toBe(first.chain);
    const verified = verifyMeasurementLedger(path);
    expect(verified.entries.map(e => e.seq)).toEqual([1, 2]);
    expect(verified.head).toBe(second.chain);
    // The recorded identity is the whole point: tier, engine and weights.
    expect(verified.entries[0].witnessTier).toBe('local-only');
    expect(verified.entries[1].witnessTier).toBe('remote-tracking');
    expect(verified.entries.every(e => e.engineSourceSha256 === '3'.repeat(64) && e.weightsSha256 === '4'.repeat(64))).toBe(true);
  });

  it('refuses a ledger whose earlier lines were altered, reordered or removed', () => {
    const base = join(tempDir(), 'measurement-ledger.jsonl');
    appendMeasurementLedger(entry(), base);
    appendMeasurementLedger(entry({ contractCommit: '9'.repeat(40) }), base);
    appendMeasurementLedger(entry({ contractCommit: '8'.repeat(40) }), base);
    const lines = readFileSync(base, 'utf8').split('\n').filter(Boolean);
    const write = (body: string[]): string => {
      const path = join(tempDir(), 'measurement-ledger.jsonl');
      writeFileSync(path, body.map(line => `${line}\n`).join(''));
      return path;
    };
    const altered = JSON.parse(lines[0]); altered.witnessTier = 'remote-tracking';
    expect(() => verifyMeasurementLedger(write([JSON.stringify(altered), lines[1], lines[2]]))).toThrow(/fails its hash chain/);
    expect(() => verifyMeasurementLedger(write([lines[1], lines[0], lines[2]]))).toThrow(/out of sequence|does not follow/);
    expect(() => verifyMeasurementLedger(write([lines[0], lines[2]]))).toThrow(/out of sequence|does not follow/);
    expect(() => verifyMeasurementLedger(write([lines[0], lines[1], 'not json']))).toThrow(/not JSON/);
    // An intact ledger still verifies, so the refusals above are not vacuous.
    expect(verifyMeasurementLedger(write(lines)).entries).toHaveLength(3);
  });
});

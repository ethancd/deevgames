/** Full six-family measurement; requires a separately frozen floor contract.
 * Never authors cases, adjusts classifications, tunes weights or reads a corpus.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireHeavySlot, heavyBypassed } from '../../ladder/heavy';
import { DEFAULT_RULES } from '../../positions/corpus';
import { loadWeights } from '../../../../src/ai/hard/eval/weights';
import { artifactPins, freshDirectory, loadBundle, MUJU_ROOT, resolver, validateBundle } from './run';
import { canonicalSourceHashes, hashJson, sha256, sourceBinding, withRules } from './canonical';
import { caseMembers } from './format';
import { assertContractBuild, assessFloors, validateFloorContract } from './contract';
import { createPhasingEngineAdapter } from './engine-adapter';
import { aggregate, scoreCase } from './score';
import type { CaseExecution, CaseResult } from './score';

const writeJson = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

export interface ContractCommit {
  commit: string; committedAt: string; path: string;
  ancestorOfHead: true; bytesMatchCommit: true; committedBeforeRun: true;
}
const git = (args: string[], cwd: string): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** Bind the floor contract to git rather than to its own declaredAt string.
 *
 * A floor is only preregistered if it existed, in this exact form, in history
 * this run descends from, before the run began. declaredAt is written by
 * whoever writes the contract, so it proves nothing on its own. This resolves
 * the contract file's last commit and refuses the run unless that commit is an
 * ancestor of HEAD, precedes the run start, and holds the very bytes read.
 * An uncommitted or working-tree-modified contract is refused outright, which
 * is what stops a v2 measurement before the coordinator commits the contract.
 */
export function resolveContractCommit(contractPath: string, startedAt: string, repoRoot: string = MUJU_ROOT): ContractCommit {
  const top = git(['rev-parse', '--show-toplevel'], repoRoot);
  const path = relative(top, contractPath).replaceAll('\\', '/');
  if (!path || path.startsWith('..')) throw new Error('Floor contract must live inside this repository to be preregistered');
  try { git(['ls-files', '--error-unmatch', '--', path], top); }
  catch { throw new Error(`Floor contract ${path} is not committed; a v2 measurement requires the contract in history first`); }
  const line = git(['log', '-1', '--format=%H%x1f%cI', 'HEAD', '--', path], top);
  const [commit, committedAt] = line.split('\x1f');
  if (!commit || !committedAt) throw new Error(`Floor contract ${path} has no commit reachable from HEAD`);
  try { git(['merge-base', '--is-ancestor', commit, 'HEAD'], top); }
  catch { throw new Error('Floor contract commit is not an ancestor of HEAD'); }
  if (!(Date.parse(committedAt) < Date.parse(startedAt))) throw new Error('Floor contract commit does not precede the measurement start');
  const committedBytes = execFileSync('git', ['show', `${commit}:${path}`], { cwd: top, maxBuffer: 64 * 1024 * 1024 });
  if (sha256(committedBytes) !== sha256(readFileSync(contractPath))) throw new Error('Floor contract differs from its committed bytes; the working tree copy is modified');
  return { commit, committedAt, path, ancestorOfHead: true, bytesMatchCommit: true, committedBeforeRun: true };
}
interface Args { manifest: string; contract: string; out: string; weights?: string }
export function parseMeasurementArgs(args: string[]): Args {
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--manifest', '--contract', '--out', '--weights'].includes(key) || !value || key in options) throw new Error('Unknown, duplicate or incomplete measurement argument');
    options[key] = resolve(value);
  }
  if (!options['--manifest'] || !options['--contract'] || !options['--out']) throw new Error('Usage: hard:suite:phasing:measure --manifest MANIFEST --contract FROZEN_FLOORS --out NEW_DIR [--weights PINNED_WEIGHTS]');
  return { manifest: options['--manifest'], contract: options['--contract'], out: options['--out'], ...(options['--weights'] ? { weights: options['--weights'] } : {}) };
}
export async function measureBundle(args: Args): Promise<boolean> {
  const out = freshDirectory(args.out), startedAt = new Date().toISOString();
  let before: { artifacts: Record<string, string>; canonical: Record<string, string> } | undefined;
  let head: string | undefined;
  try {
    before = { artifacts: artifactPins(), canonical: canonicalSourceHashes() };
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: MUJU_ROOT, encoding: 'utf8' }).trim();
    const { manifest, documents, identity: bundle } = loadBundle(args.manifest);
    const contractBytes = readFileSync(args.contract), contract = validateFloorContract(JSON.parse(contractBytes.toString()), manifest);
    const contractFileSha256 = sha256(contractBytes);
    if (Date.parse(contract.declaredAt) > Date.parse(startedAt)) throw new Error('Floor declaration is dated after measurement start');
    // declaredAt is self-asserted; git is the witness that the floor predates the run.
    const contractCommit = resolveContractCommit(args.contract, startedAt);
    const author = validateBundle(args.manifest);
    writeJson(join(out, 'author-validation.json'), author);
    if (!author.valid) throw new Error('Author evidence must all pass before the engine runs');
    const restoreBinding = sourceBinding(DEFAULT_RULES);
    const weightsBytes = args.weights ? readFileSync(args.weights) : undefined;
    const weights = weightsBytes ? loadWeights(JSON.parse(weightsBytes.toString())) : undefined;
    const adapter = createPhasingEngineAdapter({ seed: contract.seed, restoreBinding, ...(weights ? { weights } : {}) });
    if (adapter.identity.executionKind !== 'production') throw new Error('Measurements require the production engine implementation');
    // A v2 floor names the build it was declared against; any other build is refused.
    assertContractBuild(contract, adapter.identity);
    const input = { bundle, contract, contractFileSha256, contractCommit,
      weightsFileSha256: weightsBytes ? sha256(weightsBytes) : null,
      weightsSha256: adapter.identity.weightsSha256, engineSourceSha256: adapter.identity.sourceSha256 };
    writeJson(join(out, 'started.json'), { schema: 'muju-phasing-measurement-start-v1', startedAt, head, pid: process.pid, args, input, before,
      engineIdentity: adapter.engineIdentity, engine: adapter.identity, status: 'started', acceptance: 'not-established' });
    const rowPath = join(out, 'cases.jsonl'); writeFileSync(rowPath, '', { flag: 'wx' });
    const results: CaseResult[] = [];
    // Sequential operations own canonical globals. Every expected case runs;
    // exceptions remain zero-earned errors in the fixed manifest denominator.
    for (const document of documents) {
      const lookup = resolver(document);
      for (const c of document.cases) {
        let execution: CaseExecution, diagnostics: unknown;
        try { const played = await adapter.executeCase(c, lookup); execution = played.execution; diagnostics = played.diagnostics; }
        catch (error) {
          execution = { kind: 'error', error: error instanceof Error ? error.stack ?? error.message : String(error) };
          diagnostics = { adapterException: execution.error,
            ...(error && typeof error === 'object' && 'diagnostics' in error ? { refusal: error.diagnostics } : {}),
            ...(error && typeof error === 'object' && 'actions' in error ? { rejectedActions: error.actions } : {}) };
        }
        const binding = lookup(caseMembers(c)[0]).binding;
        const result = withRules(binding, () => scoreCase(c, execution, lookup, adapter.engineIdentity), restoreBinding);
        results.push(result);
        appendFileSync(rowPath, `${JSON.stringify({ id: c.id, family: c.family, result, execution, diagnostics })}\n`);
      }
    }
    const summary = aggregate(manifest, results), floors = assessFloors(contract, manifest, summary);
    // Re-open only the exact declared inputs after all execution; never a dataset.
    const afterBundle = loadBundle(args.manifest).identity;
    const after = { artifacts: artifactPins(), canonical: canonicalSourceHashes() };
    const drift = hashJson(before) !== hashJson(after) || hashJson(afterBundle) !== hashJson(bundle)
      || sha256(readFileSync(args.contract)) !== contractFileSha256
      || !!(weightsBytes && args.weights && sha256(readFileSync(args.weights)) !== sha256(weightsBytes));
    // Engine identity additionally pins all Hard/config/weight source bytes.
    const afterAdapter = createPhasingEngineAdapter({ seed: contract.seed, restoreBinding, ...(weights ? { weights } : {}) });
    const engineDrift = afterAdapter.engineIdentity !== adapter.engineIdentity;
    const valid = summary.valid && !drift && !engineDrift;
    writeJson(join(out, 'result.json'), { schema: 'muju-phasing-measurement-v1', startedAt, finishedAt: new Date().toISOString(), head,
      contractCommit, weightsSha256: adapter.identity.weightsSha256, engineSourceSha256: adapter.identity.sourceSha256,
      input, before, after, drift, engineDrift, engineIdentity: adapter.engineIdentity, valid,
      floorPass: valid && floors.pass, summary, floors, rowsSha256: sha256(readFileSync(rowPath)) });
    process.stdout.write(`${JSON.stringify({ valid, floorPass: valid && floors.pass, earned: summary.earned, offered: summary.offered,
      coverage: summary.coverage, failedCases: summary.failures, families: floors.families, out })}\n`);
    return valid && floors.pass;
  } catch (error) {
    writeJson(join(out, 'failure.json'), { startedAt, finishedAt: new Date().toISOString(), head, before, error: error instanceof Error ? error.stack : String(error) });
    throw error;
  }
}
async function main(): Promise<void> {
  const args = parseMeasurementArgs(process.argv.slice(2));
  if (existsSync(args.out)) throw new Error('Output already exists; preserve the previous measurement');
  if (heavyBypassed() || process.env.MUJU_HEAVY_DIR || process.env.MUJU_HEAVY_SLOTS) throw new Error('Shared queue overrides are forbidden');
  const release = await acquireHeavySlot('phasing-suite-measure');
  try { if (!await measureBundle(args)) process.exitCode = 1; }
  finally { release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });

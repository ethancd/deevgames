/** Full six-family measurement; requires a separately frozen floor contract.
 * Never authors cases, adjusts classifications, tunes weights or reads a corpus.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireHeavySlot, heavyBypassed } from '../../ladder/heavy';
import { DEFAULT_RULES } from '../../positions/corpus';
import { loadWeights } from '../../../../src/ai/hard/eval/weights';
import { artifactPins, freshDirectory, loadBundle, MUJU_ROOT, resolver, validateBundle } from './run';
import { canonicalSourceHashes, hashJson, sha256, sourceBinding, stableJson, withRules } from './canonical';
import { caseMembers } from './format';
import { assertContractBuild, assessFloors, validateFloorContract } from './contract';
import { createPhasingEngineAdapter } from './engine-adapter';
import { aggregate, scoreCase } from './score';
import type { CaseExecution, CaseResult } from './score';

const writeJson = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

/** How strongly the floor contract's commit is witnessed OUTSIDE this machine.
 *
 * Nothing here can prove a negative about a measurement that was never
 * recorded. What the tiers separate is how hard it is to move the contract
 * commit after the fact:
 *
 * - `remote-tracking` (strong-as-available): the contract commit is contained
 *   in a remote-tracking ref, so a copy of that exact commit object exists in
 *   a fetched remote. Amending or rebasing it locally produces a different
 *   commit id that is no longer contained in that ref, and the mismatch is
 *   visible to anyone who fetches. It does NOT prove when the remote received
 *   it, and it does not prove no measurement was run before the push.
 * - `local-only`: the commit exists only in this clone. `%cI` is self-asserted
 *   (GIT_COMMITTER_DATE, clock skew), and an amend or rebase after an
 *   off-record run passes every date and ancestry check. This tier proves that
 *   the bytes measured are the bytes committed, and nothing about time.
 *
 * The tier is recorded in the ledger and in result.json, and the report prints
 * "WITNESS: local only" for the weak tier so no reader has to infer it.
 */
export type WitnessTier = 'remote-tracking' | 'local-only';
export interface ContractCommit {
  commit: string; committedAt: string; path: string;
  /** git's own object id for the contract blob at `commit`. */ blobSha1: string;
  ancestorOfHead: true; bytesMatchCommit: true; committedBeforeRun: true;
  /** The contract commit touched no result or measurement-output path. */ touchesResultPaths: false;
  witnessTier: WitnessTier; remoteRefs: string[];
}
const git = (args: string[], cwd: string): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** Files a contract commit may not carry: committing the floor together with
 * the numbers it is supposed to predate is exactly the move the tiers cannot
 * detect by date, so it is refused structurally instead. */
export const MEASUREMENT_OUTPUT_FILES: ReadonlySet<string> = new Set(['result.json', 'cases.jsonl', 'started.json', 'failure.json', 'measurement-ledger.jsonl']);
export function isResultPath(path: string): boolean {
  const parts = path.split('/').filter(Boolean);
  return parts.some(part => part === 'results') || MEASUREMENT_OUTPUT_FILES.has(parts[parts.length - 1] ?? '');
}
/** The append-only measurement ledger. Deliberately a `.jsonl`, which
 * `artifactPins()` does not walk, so recording a measurement cannot invalidate
 * the manifest of the measurement being recorded. */
export const LEDGER_PATH = join(MUJU_ROOT, 'lab/hard-ai/suites/phasing/measurement-ledger.jsonl');
export interface LedgerEntry {
  schema: 'muju-phasing-measurement-ledger-v1'; seq: number;
  manifestSha256: string; contractCommit: string; contractBlobSha1: string; contractFileSha256: string;
  engineSourceSha256: string; weightsSha256: string; witnessTier: WitnessTier;
  startedAt: string; resultSha256: string;
  /** Chain value of the previous line, or GENESIS. */ prev: string;
  /** sha256(prev + stableJson(this entry without `chain`)). */ chain: string;
}
export const LEDGER_GENESIS = 'GENESIS';
export const ledgerChain = (entry: Omit<LedgerEntry, 'chain'>): string => sha256(`${entry.prev}\n${stableJson(entry)}`);
/** Re-derive every previous line's chain value. A rewritten, reordered or
 * deleted line breaks the chain and the measurement refuses to start. */
export function verifyMeasurementLedger(ledgerPath: string = LEDGER_PATH): { entries: LedgerEntry[]; head: string; seq: number } {
  if (!existsSync(ledgerPath)) return { entries: [], head: LEDGER_GENESIS, seq: 0 };
  const lines = readFileSync(ledgerPath, 'utf8').split('\n').filter(line => line.trim());
  const entries: LedgerEntry[] = [];
  let head = LEDGER_GENESIS;
  lines.forEach((line, index) => {
    let parsed: LedgerEntry;
    try { parsed = JSON.parse(line) as LedgerEntry; }
    catch { throw new Error(`Measurement ledger line ${index + 1} is not JSON; the ledger is append-only and must not be rewritten`); }
    if (parsed.schema !== 'muju-phasing-measurement-ledger-v1') throw new Error(`Measurement ledger line ${index + 1} has an unknown schema`);
    if (parsed.seq !== index + 1) throw new Error(`Measurement ledger line ${index + 1} is out of sequence (seq ${parsed.seq})`);
    if (parsed.prev !== head) throw new Error(`Measurement ledger line ${index + 1} does not follow the previous line`);
    const { chain, ...rest } = parsed;
    if (ledgerChain(rest) !== chain) throw new Error(`Measurement ledger line ${index + 1} fails its hash chain; a previous line was altered`);
    entries.push(parsed); head = chain;
  });
  return { entries, head, seq: entries.length };
}
export function appendMeasurementLedger(entry: Omit<LedgerEntry, 'schema' | 'seq' | 'prev' | 'chain'>, ledgerPath: string = LEDGER_PATH): LedgerEntry {
  const { head, seq } = verifyMeasurementLedger(ledgerPath);
  const unchained: Omit<LedgerEntry, 'chain'> = { schema: 'muju-phasing-measurement-ledger-v1', seq: seq + 1, ...entry, prev: head };
  const line: LedgerEntry = { ...unchained, chain: ledgerChain(unchained) };
  appendFileSync(ledgerPath, `${JSON.stringify(line)}\n`);
  return line;
}
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage', '.venv', 'build', '.next', 'test-results']);
function walkForResults(directory: string, inResults: boolean, depth: number, found: string[]): void {
  if (depth > 12) return;
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walkForResults(path, inResults || entry.name === 'results', depth + 1, found);
    } else if (inResults && entry.name === 'result.json') found.push(path);
  }
}
/** Every recorded phasing measurement of this manifest under this contract that
 * already exists somewhere in the repository's results directories. A v2 floor
 * is a FIRST-measurement instrument: a re-run needs a new contract version, so
 * finding one of these refuses the run instead of quietly producing a second
 * reading of the same preregistration. */
export function findPriorMeasurements(repoTop: string, manifestSha256: string, contractFileSha256: string): string[] {
  const found: string[] = [];
  walkForResults(repoTop, false, 0, found);
  return found.filter(path => {
    try {
      const record = JSON.parse(readFileSync(path, 'utf8')) as { schema?: string; input?: { bundle?: { manifestSha256?: string }; contractFileSha256?: string } };
      return record.schema === 'muju-phasing-measurement-v1'
        && record.input?.bundle?.manifestSha256 === manifestSha256
        && record.input?.contractFileSha256 === contractFileSha256;
    } catch { return false; }
  }).sort();
}
export const describeWitness = (tier: WitnessTier): string =>
  tier === 'remote-tracking' ? 'WITNESS: remote-tracking ref contains the contract commit' : 'WITNESS: local only';

/** Bind the floor contract to git rather than to its own declaredAt string.
 *
 * A floor is only preregistered if it existed, in this exact form, in history
 * this run descends from, before the run began. declaredAt is written by
 * whoever writes the contract, so it proves nothing on its own. This resolves
 * the contract file's last commit and refuses the run unless that commit is an
 * ancestor of HEAD, precedes the run start, holds the very bytes read, and
 * carries no result or measurement-output file of its own. An uncommitted or
 * working-tree-modified contract is refused outright, which is what stops a v2
 * measurement before the coordinator commits the contract.
 *
 * The date check is kept because it costs nothing, but it is NOT load-bearing:
 * `%cI` is whatever GIT_COMMITTER_DATE said. The checks that do not depend on
 * trusting a clock are the blob identity, the result-path refusal, the
 * first-measurement refusal and the hash-chained ledger; the witness tier says
 * how far outside this machine the commit can be corroborated at all.
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
  // git's own blob identity for the committed contract, compared against the
  // working-tree file. This does not depend on any timestamp.
  const blobSha1 = git(['rev-parse', `${commit}:${path}`], top);
  const workingBlob = git(['hash-object', '--', contractPath], top);
  if (!/^[0-9a-f]{40}$/.test(blobSha1) || blobSha1 !== workingBlob) throw new Error('Floor contract blob differs from the blob at its commit; the working tree copy is modified');
  const committedBytes = execFileSync('git', ['show', `${commit}:${path}`], { cwd: top, maxBuffer: 64 * 1024 * 1024 });
  if (sha256(committedBytes) !== sha256(readFileSync(contractPath))) throw new Error('Floor contract differs from its committed bytes; the working tree copy is modified');
  const touched = git(['show', '--name-only', '--format=', commit], top).split('\n').map(name => name.trim()).filter(Boolean);
  const offending = touched.filter(isResultPath);
  if (offending.length) throw new Error(`Floor contract commit also carries result/measurement output (${offending.join(', ')}); a preregistration may not be committed with its own numbers`);
  let remoteRefs: string[] = [];
  try { remoteRefs = git(['branch', '-r', '--contains', commit], top).split('\n').map(ref => ref.trim().split(' ')[0]).filter(Boolean).sort(); }
  catch { remoteRefs = []; }
  return { commit, committedAt, path, blobSha1, ancestorOfHead: true, bytesMatchCommit: true, committedBeforeRun: true,
    touchesResultPaths: false, witnessTier: remoteRefs.length ? 'remote-tracking' : 'local-only', remoteRefs };
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
export interface MeasurementOptions {
  /** Overridable so a test can exercise the ledger without writing to the
   * repository's real one. Production always uses LEDGER_PATH. */
  ledgerPath?: string;
}
export async function measureBundle(args: Args, options: MeasurementOptions = {}): Promise<boolean> {
  const ledgerPath = options.ledgerPath ?? LEDGER_PATH;
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
    // Refusals that do not depend on trusting a clock.
    const repoTop = git(['rev-parse', '--show-toplevel'], MUJU_ROOT);
    const manifestSha256 = hashJson(manifest);
    const ledgerBefore = verifyMeasurementLedger(ledgerPath);
    const alreadyLedgered = ledgerBefore.entries.filter(e => e.manifestSha256 === manifestSha256 && e.contractCommit === contractCommit.commit);
    if (alreadyLedgered.length) throw new Error(`This manifest has already been measured under contract commit ${contractCommit.commit} (ledger seq ${alreadyLedgered.map(e => e.seq).join(', ')}); a re-run requires a new contract version`);
    const prior = findPriorMeasurements(repoTop, manifestSha256, contractFileSha256);
    if (prior.length) throw new Error(`A result already exists for this manifest and contract (${prior.map(path => relative(repoTop, path)).join(', ')}); a v2 floor is a first-measurement instrument`);
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
      witnessTier: contractCommit.witnessTier, witness: describeWitness(contractCommit.witnessTier),
      ledgerHeadBefore: ledgerBefore.head, ledgerPath: relative(repoTop, ledgerPath),
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
    const resultPath = join(out, 'result.json');
    // witnessTier sits at the top of the record, not inside contractCommit, so
    // a reader cannot miss that a floor was witnessed on this machine only.
    writeJson(resultPath, { schema: 'muju-phasing-measurement-v1', witnessTier: contractCommit.witnessTier, witness: describeWitness(contractCommit.witnessTier),
      startedAt, finishedAt: new Date().toISOString(), head,
      contractCommit, weightsSha256: adapter.identity.weightsSha256, engineSourceSha256: adapter.identity.sourceSha256,
      input, before, after, drift, engineDrift, engineIdentity: adapter.engineIdentity, valid,
      floorPass: valid && floors.pass, summary, floors, rowsSha256: sha256(readFileSync(rowPath)) });
    // Append-only and hash-chained, written as soon as result.json exists, so
    // an invalid run or one that misses its floors is still recorded against
    // this preregistration. A run that dies before producing a result leaves
    // failure.json and no ledger line, and has therefore also consumed no
    // first-measurement slot.
    const ledgered = appendMeasurementLedger({ manifestSha256, contractCommit: contractCommit.commit,
      contractBlobSha1: contractCommit.blobSha1, contractFileSha256,
      engineSourceSha256: adapter.identity.sourceSha256, weightsSha256: adapter.identity.weightsSha256,
      witnessTier: contractCommit.witnessTier, startedAt, resultSha256: sha256(readFileSync(resultPath)) }, ledgerPath);
    process.stdout.write(`${describeWitness(contractCommit.witnessTier)}\n`);
    process.stdout.write(`${JSON.stringify({ valid, floorPass: valid && floors.pass, earned: summary.earned, offered: summary.offered,
      coverage: summary.coverage, failedCases: summary.failures, families: floors.families,
      witnessTier: contractCommit.witnessTier, ledgerSeq: ledgered.seq, out })}\n`);
    return valid && floors.pass;
  } catch (error) {
    writeJson(join(out, 'failure.json'), { startedAt, finishedAt: new Date().toISOString(), head, before, error: error instanceof Error ? error.stack : String(error) });
    throw error;
  }
}
async function main(): Promise<void> {
  const args = parseMeasurementArgs(process.argv.slice(2));
  // Fail before the queue if the ledger has been rewritten.
  verifyMeasurementLedger();
  if (existsSync(args.out)) throw new Error('Output already exists; preserve the previous measurement');
  if (heavyBypassed() || process.env.MUJU_HEAVY_DIR || process.env.MUJU_HEAVY_SLOTS) throw new Error('Shared queue overrides are forbidden');
  const release = await acquireHeavySlot('phasing-suite-measure');
  try { if (!await measureBundle(args)) process.exitCode = 1; }
  finally { release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });

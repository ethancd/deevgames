/** Full six-family measurement; requires a separately frozen floor contract.
 * Never authors cases, adjusts classifications, tunes weights or reads a corpus.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
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
/** One remote-tracking ref that contains the contract commit, with the URL of
 * the remote it belongs to and whether that URL can corroborate anything off
 * this machine. `git branch -r --contains` alone does NOT establish tier A: a
 * clone of a sibling directory, a `file://` URL or a remote pointing at
 * localhost all produce remote-tracking refs that live entirely in this clone's
 * filesystem, which is exactly the tier-B situation the tier is meant to name. */
export interface RemoteWitness { ref: string; remote: string; url: string; localOnly: boolean }
export interface ContractCommit {
  commit: string; committedAt: string; path: string;
  /** git's own object id for the contract blob at `commit`. */ blobSha1: string;
  ancestorOfHead: true; bytesMatchCommit: true; committedBeforeRun: true;
  /** The contract commit touched no result or measurement-output path. */ touchesResultPaths: false;
  witnessTier: WitnessTier; remoteRefs: string[];
  /** Every containing remote-tracking ref with its resolved remote URL. Recorded
   * in started.json and result.json so a reader can see WHICH remote was taken
   * as the witness rather than trusting the tier word. */
  remoteWitnesses: RemoteWitness[];
  /** The non-local remote URLs that granted tier A; empty under tier B. */
  witnessUrls: string[];
}
const git = (args: string[], cwd: string): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** Hosts that name this machine. A remote on one of these is a local clone
 * dressed as a remote and witnesses nothing outside this box. */
const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
/** Is this remote URL confined to this machine? File paths, `file://` URLs and
 * loopback hosts all are. Anything unparseable is treated as local, because the
 * tier must fail toward the weaker claim. */
export function isLocalOnlyRemoteUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (/^file:/i.test(u)) return true;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(u)) {
    try {
      const host = new URL(u).hostname.toLowerCase();
      return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || /^127\./.test(host);
    } catch { return true; }
  }
  // scp-style `[user@]host:path`, which is a network remote unless the host is
  // loopback. A leading `/`, `./`, `../`, `~` or a bare relative path is a
  // filesystem clone; a Windows drive letter (`C:\`) is one too.
  const scp = /^(?:[^/@]+@)?([^/:]+):(?![\\/])/.exec(u);
  if (scp && !/^[A-Za-z]$/.test(scp[1])) {
    const host = scp[1].toLowerCase();
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || /^127\./.test(host);
  }
  return true;
}
/** Resolve each containing remote-tracking ref to its remote's URL. A ref whose
 * remote cannot be identified or has no URL is recorded as local-only. */
export function describeRemoteWitnesses(refs: readonly string[], remotes: readonly string[], urlOf: (remote: string) => string | null): RemoteWitness[] {
  const byLength = [...remotes].sort((a, b) => b.length - a.length);
  return refs.map(ref => {
    const remote = byLength.find(name => ref === name || ref.startsWith(`${name}/`)) ?? '';
    const url = remote ? urlOf(remote) ?? '' : '';
    return { ref, remote, url, localOnly: !remote || isLocalOnlyRemoteUrl(url) };
  });
}
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
/** Collect every `result.json` below `directory`. There is deliberately no
 * `results/`-directory condition: a measurement written to `--out /tmp/run-3`
 * is still a measurement, and keying the search on a directory NAME let a
 * second reading of the same preregistration hide behind a rename. */
function walkForResults(directory: string, depth: number, found: string[]): void {
  if (depth > 12) return;
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walkForResults(path, depth + 1, found);
    } else if (entry.name === 'result.json') found.push(path);
  }
}
/** Every recorded phasing measurement OF THIS MANIFEST that already exists under
 * one of the given search roots.
 *
 * Two things this deliberately does not do. It does not require a `results/`
 * ancestor, and it does not compare the contract file: keying on the contract
 * made both first-measurement checks defeatable by amending the contract after
 * a run, which changes the contract bytes and the contract commit while leaving
 * the manifest — the thing whose engineering floor is being read — identical.
 * The manifest hash is the only key. A genuine re-measurement is declared with
 * `supersedes`, not obtained by editing the preregistration.
 *
 * Roots come from the caller (the ledger's own directory, the run's `--out`
 * parent, and the repository top) rather than from a hard-coded name. */
export function findPriorMeasurements(roots: string | readonly string[], manifestSha256: string): string[] {
  const list = (typeof roots === 'string' ? [roots] : [...roots]).map(root => resolve(root));
  // Drop a root nested inside another so a file is not reported twice.
  const outermost = list.filter(root => !list.some(other => other !== root && !relative(other, root).startsWith('..') && relative(other, root) !== ''));
  const found: string[] = [];
  for (const root of new Set(outermost)) walkForResults(root, 0, found);
  return [...new Set(found)].filter(path => {
    try {
      const record = JSON.parse(readFileSync(path, 'utf8')) as { schema?: string; input?: { bundle?: { manifestSha256?: string } } };
      return record.schema === 'muju-phasing-measurement-v1' && record.input?.bundle?.manifestSha256 === manifestSha256;
    } catch { return false; }
  }).sort();
}
/** A measurement of this manifest that already happened, as recorded either in
 * the ledger or by a `result.json` on disk. */
export type PriorMeasurement =
  | { source: 'ledger'; seq: number; chain: string; contractCommit: string; contractFileSha256: string; startedAt: string; resultSha256: string }
  | { source: 'result-file'; path: string };
/** A v2 contract may name the ledger line it re-measures. Nothing else unblocks
 * a manifest that has already been read. */
export interface Supersedes { ledgerSeq: number; chain: string }
const describePrior = (prior: PriorMeasurement): string =>
  prior.source === 'ledger' ? `ledger seq ${prior.seq} (contract commit ${prior.contractCommit})` : `result file ${prior.path}`;
/** Refuse a second reading of the same manifest unless the contract says, in
 * committed bytes, exactly which earlier reading it supersedes.
 *
 * The check keys on the MANIFEST HASH ALONE. Amending the contract commit after
 * an off-record run therefore no longer clears the way: it changes the contract
 * commit and the contract bytes, and neither is consulted here.
 *
 * A `supersedes` must name the most recent ledger line for this manifest and
 * carry that line's chain value, which cannot be produced without the ledger
 * the run is about to verify. A prior result file with no ledger line behind it
 * is refused outright: there is nothing to name, and the ledger is incomplete.
 */
export function assertFirstMeasurementOfManifest(input: {
  manifestSha256: string; ledger: readonly LedgerEntry[]; priorResultPaths: readonly string[]; supersedes?: Supersedes;
}): PriorMeasurement[] {
  const ledgered = input.ledger.filter(e => e.manifestSha256 === input.manifestSha256);
  const priors: PriorMeasurement[] = [
    ...ledgered.map(e => ({ source: 'ledger' as const, seq: e.seq, chain: e.chain, contractCommit: e.contractCommit,
      contractFileSha256: e.contractFileSha256, startedAt: e.startedAt, resultSha256: e.resultSha256 })),
    ...input.priorResultPaths.map(path => ({ source: 'result-file' as const, path })),
  ];
  if (!priors.length) {
    if (input.supersedes) throw new Error('Floor contract declares supersedes, but this manifest has no earlier measurement to supersede');
    return priors;
  }
  const latest = ledgered[ledgered.length - 1];
  const detail = priors.map(describePrior).join(', ');
  if (!latest) throw new Error(`This manifest has already been measured (${detail}) with no ledger line behind it; the ledger is incomplete and a re-measurement cannot be declared against it`);
  if (!input.supersedes) throw new Error(`This manifest has already been measured (${detail}); a v2 floor is a first-measurement instrument. A re-measurement requires a contract that declares supersedes: { ledgerSeq: ${latest.seq}, chain: "${latest.chain}" }`);
  if (input.supersedes.ledgerSeq !== latest.seq) throw new Error(`Floor contract supersedes ledger seq ${input.supersedes.ledgerSeq}, but the most recent measurement of this manifest is seq ${latest.seq}`);
  if (input.supersedes.chain !== latest.chain) throw new Error(`Floor contract supersedes ledger seq ${latest.seq} with the wrong chain value; the contract does not name the measurement it claims to supersede`);
  return priors;
}
/** Every ledger line must still point at a commit this HEAD descends from.
 *
 * This is what closes the amend hole from the other side. Rewriting the commit
 * a recorded measurement was made against does not erase the record, and the
 * record no longer resolves: the next run refuses and names the line. */
export function assertLedgerCommitsReachable(entries: readonly LedgerEntry[], isAncestorOfHead: (commit: string) => boolean): void {
  for (const entry of entries)
    if (!isAncestorOfHead(entry.contractCommit))
      throw new Error(`Measurement ledger line ${entry.seq} records contract commit ${entry.contractCommit}, which is no longer an ancestor of HEAD; that commit was amended, rebased or dropped after it was measured, so this history cannot be measured against the same preregistration`);
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
  // A remote-tracking ref is not by itself a witness outside this machine: a
  // clone of a sibling directory, a `file://` URL or a remote pointing at
  // localhost all produce one. Resolve each ref's remote URL and grant tier A
  // only for a remote that is genuinely somewhere else.
  let remotes: string[] = [];
  try { remotes = git(['remote'], top).split('\n').map(name => name.trim()).filter(Boolean); }
  catch { remotes = []; }
  const urlOf = (remote: string): string | null => {
    try { return git(['remote', 'get-url', remote], top); } catch { return null; }
  };
  const remoteWitnesses = describeRemoteWitnesses(remoteRefs, remotes, urlOf);
  const witnessUrls = [...new Set(remoteWitnesses.filter(w => !w.localOnly).map(w => w.url))].sort();
  return { commit, committedAt, path, blobSha1, ancestorOfHead: true, bytesMatchCommit: true, committedBeforeRun: true,
    touchesResultPaths: false, witnessTier: witnessUrls.length ? 'remote-tracking' : 'local-only', remoteRefs,
    remoteWitnesses, witnessUrls };
}
/** Does HEAD in this repository descend from `commit`? Injected into the ledger
 * check so a test can exercise it against a throwaway repository. */
export const headDescendsFrom = (commit: string, repoTop: string): boolean => {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) return false;
  try { git(['merge-base', '--is-ancestor', commit, 'HEAD'], repoTop); return true; } catch { return false; }
};
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
    // Every recorded measurement must still resolve against this history. An
    // amended-away contract commit is a refusal, not a silently orphaned line.
    assertLedgerCommitsReachable(ledgerBefore.entries, commit => headDescendsFrom(commit, repoTop));
    // Both first-measurement checks key on the MANIFEST HASH ALONE, so amending
    // the contract commit after a run cannot clear either of them. Search roots
    // are named (the ledger's directory, this run's output parent, the
    // repository top) rather than inferred from a directory called `results`.
    const priorRoots = [dirname(ledgerPath), resolve(out, '..'), repoTop];
    const priorResultPaths = findPriorMeasurements(priorRoots, manifestSha256).filter(path => resolve(path) !== resolve(join(out, 'result.json')));
    const priorMeasurementsOfThisManifest = assertFirstMeasurementOfManifest({ manifestSha256, ledger: ledgerBefore.entries,
      priorResultPaths, ...(contract.schema === 'muju-phasing-suite-floor-v2' && contract.supersedes ? { supersedes: contract.supersedes } : {}) });
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
      witnessUrls: contractCommit.witnessUrls, remoteWitnesses: contractCommit.remoteWitnesses,
      priorMeasurementsOfThisManifest,
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
      // The URLs that granted the tier, and any earlier reading of this exact
      // manifest, sit beside witnessTier at the top of the record: a superseding
      // re-measurement must be as visible as the tier is.
      witnessUrls: contractCommit.witnessUrls, remoteWitnesses: contractCommit.remoteWitnesses,
      priorMeasurementsOfThisManifest,
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
    process.stdout.write(`${describeWitness(contractCommit.witnessTier)}${contractCommit.witnessUrls.length ? ` (${contractCommit.witnessUrls.join(', ')})` : ''}\n`);
    process.stdout.write(`${JSON.stringify({ valid, floorPass: valid && floors.pass, earned: summary.earned, offered: summary.offered,
      coverage: summary.coverage, failedCases: summary.failures, families: floors.families,
      witnessTier: contractCommit.witnessTier, witnessUrls: contractCommit.witnessUrls,
      supersededMeasurements: priorMeasurementsOfThisManifest.length, ledgerSeq: ledgered.seq, out })}\n`);
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

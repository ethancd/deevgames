/** Canonical Phasing suite authoring and byte-bound validation.
 * This entrypoint performs no Hard search and never establishes acceptance.
 * File pins are relative to the bundle; artifact pins are relative to muju/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { acquireHeavySlot, heavyBypassed } from '../../ladder/heavy';
import { DEFAULT_RULES } from '../../positions/corpus';
import { buildTacticsSuite } from './build-tactics';
import { buildHomeMateSuite } from './build-home-mate';
import { buildEconomy } from './build-economy';
import { buildInvariants } from './build-invariants';
import { buildNewFamilies } from './build-new-families';
import { canonicalSourceHashes, hashJson, positionRef, sha256, sourceBinding, withRules } from './canonical';
import { caseMembers, FAMILIES, validateSuiteDocument } from './format';
import type { Family, PositionRef, SourceBinding, SuiteDocument } from './format';
import { buildReleaseManifest, releaseOf, safeRelativePath, validateManifestShape, validateReleaseManifest } from './manifest';
import type { ReleaseManifest, ReleaseVersion, SuiteFilePin } from './manifest';
import { validateAuthorEvidence, validateProvenance } from './predicates';
import { assertNoUncreditedWin } from './veto';
import { v2Builders } from './build-v2';

export const MUJU_ROOT = fileURLToPath(new NodeURL('../../../../', import.meta.url));
const SOURCE_DIRECTORY = 'lab/hard-ai/suites/phasing';
const writeJson = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
export function freshDirectory(directory: string): string {
  const target = resolve(directory);
  if (existsSync(target)) throw new Error('Output directory already exists; failed drafts must be preserved');
  mkdirSync(target, { recursive: true }); return target;
}
/** Source and authored input files only; no outcomes/corpus/openings are opened. */
export function artifactPins(): Record<string, string> {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? entry.name === 'author-inputs' ? walk(path) : []
      : entry.name.endsWith('.ts') || directory.endsWith('author-inputs') && entry.name.endsWith('.json') ? [path] : [];
  });
  const paths = [...walk(join(MUJU_ROOT, SOURCE_DIRECTORY)), join(MUJU_ROOT, 'package.json')].sort();
  return Object.fromEntries(paths.map(path => [relative(MUJU_ROOT, path).replaceAll('\\', '/'), sha256(readFileSync(path))]));
}
function pinnedFile(base: string, path: string, expected: string): Buffer {
  if (!safeRelativePath(path)) throw new Error(`Unsafe pinned path ${path}`);
  const actual = realpathSync(resolve(base, path)), root = realpathSync(base);
  if (relative(root, actual).startsWith('..')) throw new Error(`Pinned path escapes its root: ${path}`);
  const bytes = readFileSync(actual);
  if (sha256(bytes) !== expected) throw new Error(`Byte pin mismatch ${path}`);
  return bytes;
}
export function resolver(doc: SuiteDocument) {
  const byId = new Map(doc.positions.map(position => [position.id, position]));
  return (ref: PositionRef) => {
    const position = byId.get(ref.id);
    if (!position || positionRef(position).sha256 !== ref.sha256) throw new Error(`Position reference mismatch ${ref.id}`);
    return position;
  };
}
export interface AuthorCaseCheck { id: string; status: 'pass' | 'fail' | 'indeterminate' | 'error'; results?: { status: string; facts: unknown[] }[]; error?: string }
/** One macro-decision root the free-win veto refuses, with the reason verbatim. */
export interface VetoFinding { id: string; family: Family; reason: string }
/** Apply the author-time free-win veto to every macro-decision in a document.
 *
 * Collected rather than thrown so one bundle-wide run names EVERY defective
 * root at once; the v2 author path turns a non-empty list into an invalid
 * bundle. Running it over a v1 document is how the flagged set is enumerated
 * without changing a v1 byte.
 *
 * The rules block a position was authored under is installed for the probe:
 * the veto replays canonical actions, and canonical reads its rules from
 * module globals. */
export function vetoDocument(document: SuiteDocument, restore: SourceBinding, proofNodes?: number): VetoFinding[] {
  const lookup = resolver(document), findings: VetoFinding[] = [];
  for (const c of document.cases) {
    if (c.kind !== 'macro-decision') continue;
    const binding = lookup(caseMembers(c)[0]).binding;
    try { withRules(binding, () => assertNoUncreditedWin(c, lookup(c.root).state, undefined, proofNodes), restore); }
    catch (error) { findings.push({ id: c.id, family: c.family, reason: error instanceof Error ? error.message : String(error) }); }
  }
  return findings;
}
export interface BundleIdentity { manifestSha256: string; manifestFileSha256: string; files: SuiteFilePin[] }
export interface AuthorReport {
  schema: 'muju-phasing-author-report-v1'; acceptance: 'not-established'; engineExecuted: false;
  valid: boolean; caseCount: number; memberCount: number; checks: AuthorCaseCheck[];
  errors: { family: Family; error: string }[];
  bundle?: BundleIdentity;
  /** Which authored release this report describes. Optional so the frozen v1
   * `author-report.json` still matches its own schema. */
  release?: ReleaseVersion;
  /** Every macro-decision the free-win veto refused. Enforced for v2 on both
   * the author path and the measurement path; empty and unenforced for v1. */
  vetoFindings: VetoFinding[];
}
export function validateDocumentEvidence(input: unknown): { document: SuiteDocument; checks: AuthorCaseCheck[] } {
  const document = validateSuiteDocument(input), restore = sourceBinding(DEFAULT_RULES), lookup = resolver(document);
  validateProvenance(document, restore);
  const checks = document.cases.map(c => {
    try {
      const binding = lookup(caseMembers(c)[0]).binding;
      const result = withRules(binding, () => validateAuthorEvidence(c, lookup), restore);
      return { id: c.id, status: result.status, results: result.results.map(r => ({ status: r.status, facts: r.facts })) };
    } catch (error) { return { id: c.id, status: 'error' as const, error: String(error) }; }
  });
  return { document, checks };
}
/** Caller chooses a new directory; errors are recorded and never repaired by omission.
 *
 * `release: 'v2'` selects the v2 builders AND turns on the free-win veto: every
 * macro-decision the veto flags is recorded as a family error, so a defective v2
 * bundle cannot be written valid. v1 keeps its historical behaviour — its
 * twenty-one flagged roots are the reason v2 exists, and re-running the v1
 * authoring must still reproduce `fixtures/v1`. */
export function authorBundle(directory: string, release: ReleaseVersion = 'v1'): AuthorReport {
  const out = freshDirectory(directory), binding = sourceBinding(DEFAULT_RULES);
  const documents: SuiteDocument[] = [], files: SuiteFilePin[] = [];
  const report: AuthorReport = { schema: 'muju-phasing-author-report-v1', acceptance: 'not-established', engineExecuted: false,
    valid: false, caseCount: 0, memberCount: 0, checks: [], errors: [], release, vetoFindings: [] };
  const builders: Record<Family, (b: SourceBinding) => SuiteDocument> = release === 'v2' ? v2Builders() : {
    tactics: () => buildTacticsSuite(), 'home-mate': () => buildHomeMateSuite(),
    economy: () => withRules(binding, () => buildEconomy(binding), binding),
    invariants: () => withRules(binding, () => buildInvariants(binding), binding),
    'summon-disruption': () => buildNewFamilies()[0], 'home-fortify': () => buildNewFamilies()[1],
  };
  for (const family of FAMILIES) {
    try {
      const draft = builders[family](binding), filename = `${family}.suite.json`;
      writeJson(join(out, filename), draft); // Preserve even a rejected draft.
      const { document, checks } = validateDocumentEvidence(draft);
      documents.push(document); report.checks.push(...checks);
      if (release === 'v2') report.vetoFindings.push(...vetoDocument(document, binding));
      files.push({ family, path: filename, sha256: sha256(readFileSync(join(out, filename))) });
    } catch (error) { report.errors.push({ family, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
  }
  // A flagged root is a defect of the bundle, not of one case run: record it as
  // a family error so `valid` cannot be true while any of them stands.
  for (const finding of report.vetoFindings) report.errors.push({ family: finding.family, error: `free-win veto refused ${finding.id}: ${finding.reason}` });
  report.caseCount = documents.reduce((n, doc) => n + doc.cases.length, 0);
  report.memberCount = documents.reduce((n, doc) => n + doc.cases.reduce((m, c) => m + caseMembers(c).length, 0), 0);
  if (!report.errors.length && report.checks.every(check => check.status === 'pass')) {
    try {
      const manifest = buildReleaseManifest(documents, files, artifactPins(), release);
      writeJson(join(out, 'manifest.json'), manifest);
      report.bundle = { manifestSha256: hashJson(manifest), manifestFileSha256: sha256(readFileSync(join(out, 'manifest.json'))), files: structuredClone(manifest.files) };
      report.valid = true;
    } catch (error) { report.errors.push({ family: 'invariants', error: `Release manifest: ${String(error)}` }); }
  }
  writeJson(join(out, 'author-report.json'), report);
  return report;
}
/** All bytes verified before their data can enter canonical execution. */
export function loadBundle(manifestPath: string): { manifest: ReleaseManifest; documents: SuiteDocument[]; identity: BundleIdentity } {
  const bytes = readFileSync(manifestPath);
  const manifest = validateManifestShape(JSON.parse(bytes.toString()));
  const current = artifactPins();
  if (hashJson(current) !== hashJson(manifest.artifacts)) {
    // A superseded bundle is pinned to the suite tree it was authored against.
    // Say so, and name the difference, instead of reporting a bare hash error:
    // `fixtures/v1` cannot load in this tree because the instrument added files
    // (veto.ts, build-v2.ts, the v2 author input) AFTER v1 was pinned, and its
    // bytes must not be touched to make it load again.
    const added = Object.keys(current).filter(path => !(path in manifest.artifacts));
    const removed = Object.keys(manifest.artifacts).filter(path => !(path in current));
    const changed = Object.keys(manifest.artifacts).filter(path => path in current && current[path] !== manifest.artifacts[path]);
    const detail = [added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`, changed.length && `changed ${changed.join(', ')}`].filter(Boolean).join('; ');
    throw new Error(`Superseded bundle: builder/predicate/validator artifact set or bytes differ, so this manifest is pinned to an older suite tree and cannot be loaded here (${detail || 'artifact bytes differ'}). Its fixtures are the historical record of the release they were authored under; re-author a new release rather than repinning them.`);
  }
  for (const [path, expected] of Object.entries(manifest.artifacts)) pinnedFile(MUJU_ROOT, path, expected);
  const documents = manifest.files.map(file => {
    const document = validateSuiteDocument(JSON.parse(pinnedFile(dirname(manifestPath), file.path, file.sha256).toString()));
    if (document.family !== file.family) throw new Error('Pinned file family mismatch');
    return document;
  });
  validateReleaseManifest(manifest, documents);
  return { manifest, documents, identity: { manifestSha256: hashJson(manifest), manifestFileSha256: sha256(bytes), files: structuredClone(manifest.files) } };
}
export function validateBundle(manifestPath: string): AuthorReport {
  const { manifest, documents, identity } = loadBundle(manifestPath);
  const checks = documents.flatMap(doc => validateDocumentEvidence(doc).checks);
  // Reject changed inputs after replay too; the report binds the bytes read.
  if (sha256(readFileSync(manifestPath)) !== identity.manifestFileSha256) throw new Error('Bundle manifest input drift');
  for (const file of identity.files) pinnedFile(dirname(manifestPath), file.path, file.sha256);
  // The measurement path re-runs the veto for a v2 bundle rather than trusting
  // the author report that shipped with it: the veto is a property of the
  // CASES, so whoever measures them re-derives it. v1 is exempt by version, not
  // by judgement — it is a historical record with twenty-one flagged roots.
  const release = releaseOf(manifest), binding = sourceBinding(DEFAULT_RULES);
  const vetoFindings = release === 'v2' ? documents.flatMap(doc => vetoDocument(doc, binding)) : [];
  // The expected count is the manifest's own, which validateManifestShape has
  // already checked against the case list it ships. Pinning 225 here would have
  // passed a v2 bundle of 225 cases and silently mis-sized any other.
  return { schema: 'muju-phasing-author-report-v1', acceptance: 'not-established', engineExecuted: false,
    valid: !vetoFindings.length && checks.length === manifest.caseCount && checks.every(c => c.status === 'pass'),
    caseCount: manifest.caseCount, memberCount: manifest.memberCount, checks, release, vetoFindings,
    errors: vetoFindings.map(f => ({ family: f.family, error: `free-win veto refused ${f.id}: ${f.reason}` })), bundle: identity };
}
export function parseArgs(args: string[]): { mode: 'author' | 'author-v2' | 'validate'; out: string; manifest?: string } {
  const [mode, ...rest] = args;
  if (mode !== 'author' && mode !== 'author-v2' && mode !== 'validate') throw new Error('Usage: hard:suite:phasing author --out NEW_DIR | author-v2 --out NEW_DIR | validate --manifest MANIFEST --out NEW_DIR. Engine measurement requires a separate preregistered contract.');
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--out', '--manifest'].includes(rest[i]) || !rest[i + 1] || rest[i] in options) throw new Error('Unknown, duplicate or incomplete argument');
    options[rest[i]] = rest[i + 1];
  }
  if (!options['--out'] || (mode === 'validate') !== !!options['--manifest']) throw new Error('Explicit new output directory and mode-appropriate manifest are required');
  return { mode, out: resolve(options['--out']), ...(options['--manifest'] ? { manifest: resolve(options['--manifest']) } : {}) };
}
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (heavyBypassed() || process.env.MUJU_HEAVY_DIR || process.env.MUJU_HEAVY_SLOTS) throw new Error('Shared heavy queue overrides are forbidden');
  if (existsSync(args.out)) throw new Error('Output already exists');
  const release = await acquireHeavySlot(`phasing-suite-${args.mode}`);
  const startedAt = new Date().toISOString();
  let before: { artifacts: Record<string, string>; canonical: Record<string, string> } | undefined;
  let head: string | undefined;
  try {
    before = { artifacts: artifactPins(), canonical: canonicalSourceHashes() };
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: MUJU_ROOT, encoding: 'utf8' }).trim();
    let report: AuthorReport;
    if (args.mode === 'author' || args.mode === 'author-v2') report = authorBundle(args.out, args.mode === 'author-v2' ? 'v2' : 'v1');
    else { freshDirectory(args.out); report = validateBundle(args.manifest!); writeJson(join(args.out, 'author-report.json'), report); }
    const after = { artifacts: artifactPins(), canonical: canonicalSourceHashes() }, sourceDrift = hashJson(before) !== hashJson(after);
    writeJson(join(args.out, 'execution.json'), { schema: 'muju-phasing-author-execution-v1', args, startedAt, finishedAt: new Date().toISOString(), head, pid: process.pid, before, after, bundle: report.bundle, sourceDrift, valid: report.valid && !sourceDrift });
    process.stdout.write(`${JSON.stringify({ valid: report.valid && !sourceDrift, release: report.release, cases: report.caseCount, members: report.memberCount, errors: report.errors, vetoRefused: report.vetoFindings.map(f => f.id), checksFailed: report.checks.filter(c => c.status !== 'pass').map(c => c.id), acceptance: report.acceptance })}\n`);
    if (!report.valid || sourceDrift) process.exitCode = 1;
  } catch (error) {
    if (!existsSync(args.out)) freshDirectory(args.out);
    writeJson(join(args.out, 'failure.json'), { startedAt, finishedAt: new Date().toISOString(), head, before, error: error instanceof Error ? error.stack : String(error) });
    throw error;
  } finally { release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });

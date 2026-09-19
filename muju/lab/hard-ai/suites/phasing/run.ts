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
import { buildReleaseManifest, safeRelativePath, validateManifestShape, validateReleaseManifest } from './manifest';
import type { ReleaseManifest, SuiteFilePin } from './manifest';
import { validateAuthorEvidence, validateProvenance } from './predicates';
import { assertNoUncreditedWin } from './veto';

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
/** Caller chooses a new directory; errors are recorded and never repaired by omission. */
export function authorBundle(directory: string): AuthorReport {
  const out = freshDirectory(directory), binding = sourceBinding(DEFAULT_RULES);
  const documents: SuiteDocument[] = [], files: SuiteFilePin[] = [];
  const report: AuthorReport = { schema: 'muju-phasing-author-report-v1', acceptance: 'not-established', engineExecuted: false,
    valid: false, caseCount: 0, memberCount: 0, checks: [], errors: [] };
  const builders: Record<Family, () => SuiteDocument> = {
    tactics: buildTacticsSuite, 'home-mate': buildHomeMateSuite,
    economy: () => withRules(binding, () => buildEconomy(binding), binding),
    invariants: () => withRules(binding, () => buildInvariants(binding), binding),
    'summon-disruption': () => buildNewFamilies()[0], 'home-fortify': () => buildNewFamilies()[1],
  };
  for (const family of FAMILIES) {
    try {
      const draft = builders[family](), filename = `${family}.suite.json`;
      writeJson(join(out, filename), draft); // Preserve even a rejected draft.
      const { document, checks } = validateDocumentEvidence(draft);
      documents.push(document); report.checks.push(...checks);
      files.push({ family, path: filename, sha256: sha256(readFileSync(join(out, filename))) });
    } catch (error) { report.errors.push({ family, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
  }
  report.caseCount = documents.reduce((n, doc) => n + doc.cases.length, 0);
  report.memberCount = documents.reduce((n, doc) => n + doc.cases.reduce((m, c) => m + caseMembers(c).length, 0), 0);
  if (!report.errors.length && report.checks.every(check => check.status === 'pass')) {
    try {
      const manifest = buildReleaseManifest(documents, files, artifactPins());
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
  if (hashJson(current) !== hashJson(manifest.artifacts)) throw new Error('Builder/predicate/validator artifact set or bytes differ');
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
  // The expected count is the manifest's own, which validateManifestShape has
  // already checked against the case list it ships. Pinning 225 here would have
  // passed a v2 bundle of 225 cases and silently mis-sized any other.
  return { schema: 'muju-phasing-author-report-v1', acceptance: 'not-established', engineExecuted: false,
    valid: checks.length === manifest.caseCount && checks.every(c => c.status === 'pass'),
    caseCount: manifest.caseCount, memberCount: manifest.memberCount, checks, errors: [], bundle: identity };
}
function parseArgs(args: string[]): { mode: 'author' | 'validate'; out: string; manifest?: string } {
  const [mode, ...rest] = args;
  if (mode !== 'author' && mode !== 'validate') throw new Error('Usage: hard:suite:phasing author --out NEW_DIR | validate --manifest MANIFEST --out NEW_DIR. Engine measurement requires a separate preregistered contract.');
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
    if (args.mode === 'author') report = authorBundle(args.out);
    else { freshDirectory(args.out); report = validateBundle(args.manifest!); writeJson(join(args.out, 'author-report.json'), report); }
    const after = { artifacts: artifactPins(), canonical: canonicalSourceHashes() }, sourceDrift = hashJson(before) !== hashJson(after);
    writeJson(join(args.out, 'execution.json'), { schema: 'muju-phasing-author-execution-v1', args, startedAt, finishedAt: new Date().toISOString(), head, pid: process.pid, before, after, bundle: report.bundle, sourceDrift, valid: report.valid && !sourceDrift });
    process.stdout.write(`${JSON.stringify({ valid: report.valid && !sourceDrift, cases: report.caseCount, members: report.memberCount, errors: report.errors, checksFailed: report.checks.filter(c => c.status !== 'pass').map(c => c.id), acceptance: report.acceptance })}\n`);
    if (!report.valid || sourceDrift) process.exitCode = 1;
  } catch (error) {
    if (!existsSync(args.out)) freshDirectory(args.out);
    writeJson(join(args.out, 'failure.json'), { startedAt, finishedAt: new Date().toISOString(), head, before, error: error instanceof Error ? error.stack : String(error) });
    throw error;
  } finally { release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });

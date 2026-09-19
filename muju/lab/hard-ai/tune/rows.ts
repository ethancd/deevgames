/**
 * The two on-disk formats the tuning pipeline reads and writes, and the pure
 * helpers both entry points share (DESIGN §5.15, MILESTONES M18).
 *
 * Current Phasing rows require schema identity, 62 features and weights v2.
 * Historical `muju-texel-v1` is DESIGN §5.15's row verbatim — `{schema, id, result, side,
 * turn, features[58], material[18], kpos}` — with five additive provenance
 * fields (`opening`, `pool`, `handicap`, `game`, `run`), the `actions` the
 * position had left, and the `split` the corpus builder assigned. Additive
 * fields only: a reader that knows DESIGN's eight fields reads these rows
 * unchanged.
 *
 * THE MATERIAL BLOCK IS NOT A FEATURE. `Evaluator.stage0` scores material as
 * `Σ_d material[d] · (n_root[d] − n_other[d])` from the 18 tunable
 * `Weights.material` params, and `extract` separately writes a WEIGHT-FREE
 * catalogue-prior version into `out[F.Material]`
 * (`src/ai/hard/eval/features.ts:174`). `Evaluator.full` copies `this.f`
 * into `outFeatures` without touching index 0
 * (`src/ai/hard/eval/evaluate.ts:163-167`), so `w[F.Material]` multiplies
 * nothing in the score the engine returns. `material` in a row therefore
 * carries the 18 SIGNED COUNTS `n_root[d] − n_other[d]`, and
 * `scoreOf(row, weights)` reconstructs the engine's own score as
 * `Σ_{i≥1} w[i]·f[i] + Σ_d material[d]·counts[d]`. Measured exact on 730 of
 * 730 macro nodes from 20 `hard-ai-e1/baseline` replays, 665 of which had a
 * non-zero `f[F.Material]` (see `docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md`).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_COUNT } from '../../../src/ai/hard/eval/features';
import { PHASING_EVAL_SCHEMA, WEIGHTS_VERSION, WEIGHTS_FILE_SCHEMA } from '../../../src/ai/hard/eval/weights';
import { NDEF } from '../../../src/ai/hard/core/catalog';
import { mulberry32 } from '../../harness/rng';

export const ROW_SCHEMA = 'muju-texel-phasing-v1';
export const CORPUS_MANIFEST_SCHEMA = 'muju-texel-phasing-corpus-manifest-v1';
export { WEIGHTS_FILE_SCHEMA };
export const DEV_POOL_PATH = 'lab/hard-ai/ladder/openings/p1-dev.jsonl';
export const SOURCE_ALLOWLIST_SCHEMA = 'muju-phasing-tune-allowlist-v1';

/** `1` = the row's side won, `0.5` = draw, `0` = the row's side lost. */
export type RowResult = 1 | 0.5 | 0;

export type Split = 'train' | 'heldout';

export interface TexelRow {
  schema: typeof ROW_SCHEMA;
  /** Required at every IO/fit boundary; optional only to represent rejected legacy rows in source tests. */
  featureSchema?: string;
  weightsVersion?: number;
  /** `<run>-<game>-p<n>`, unique inside one corpus. */
  id: string;
  result: RowResult;
  /** 0 = white, 1 = black — `Side`, the side the row is scored from. */
  side: 0 | 1;
  turn: number;
  /** `[FEATURE_COUNT]` weight-free `f[i]` from `Evaluator.full`'s `outFeatures`. */
  features: number[];
  /** `[NDEF]` signed counts `n_row[d] − n_other[d]` (see the module header). */
  material: number[];
  /** 16 hex digits: `keyHex(p.kposHi, p.kposLo)`. */
  kpos: string;
  // --- additive provenance ---
  opening: string;
  /** Repo-relative path of the opening pool the game was drawn from. */
  pool: string;
  handicap: number;
  /** The replay file id, `<pairId>-<orientation>`. */
  game: string;
  /** The run directory the game came from, repo-relative. */
  run: string;
  /** Actions the side had left at the node (4 at a macro node). */
  actions: number;
  split: Split;
}

export interface OpeningSplit {
  seed: number;
  by: 'opening';
  fraction: number;
  train: string[];
  heldout: string[];
}

/**
 * A deterministic 80/20 split of opening ids so no opening family is in both
 * halves. The ids are sorted first (the caller's discovery order must not
 * matter), then shuffled with `mulberry32(seed)` under a descending
 * Fisher-Yates — the same generator and the same sweep
 * `lab/hard-ai/ladder/openings/split.ts` uses for the E1 pools, so one reading
 * of "deterministic split" serves both files.
 *
 * The held-out half is `floor(n · fraction)` and is never empty when there are
 * at least two openings, and never the whole set.
 */
export function splitOpenings(ids: readonly string[], seed: number, fraction = 0.2): OpeningSplit {
  const pool = [...new Set(ids)].sort();
  const rng = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  let take = Math.floor(pool.length * fraction);
  if (pool.length >= 2) take = Math.min(Math.max(take, 1), pool.length - 1);
  const heldout = pool.slice(0, take).sort();
  const train = pool.slice(take).sort();
  return { seed, by: 'opening', fraction, train, heldout };
}

// --- leakage ---------------------------------------------------------------

/** Metadata labels only. NEVER open these files to enumerate their IDs. */
export const REFUSED_POOLS: readonly string[] = ['e1-sealed.jsonl', 'e2-val.jsonl', 'p1-val.jsonl', 'p1-sealed.jsonl'];
export const REFUSED_ID_PREFIXES: readonly string[] = ['e2-'];
export interface RefusalRules {
  ids: Set<string>;
  pools: readonly string[];
  prefixes: readonly string[];
  missing: string[];
}
/** Compatibility name; strictly metadata-only and performs no filesystem IO. */
export function loadRefusalRules(_repoRoot: string, pools: readonly string[] = REFUSED_POOLS): RefusalRules {
  return { ids: new Set(), pools, prefixes: REFUSED_ID_PREFIXES, missing: [] };
}
export type RefusalReason = 'pool' | 'id' | 'prefix';
export function refusalFor(openingId: string, poolPath: string | null, rules: RefusalRules): RefusalReason | null {
  if (poolPath !== DEV_POOL_PATH || rules.pools.includes(path.basename(poolPath))) return 'pool';
  if (rules.ids.has(openingId)) return 'id';
  for (const prefix of rules.prefixes) if (openingId.startsWith(prefix)) return 'prefix';
  return null;
}

export interface ApprovedReplay { path: string; sha256: string; opening: string }
export interface ApprovedRun {
  path: string; manifestSha256: string; gamesSha256: string;
  openingIds: string[]; replays: ApprovedReplay[];
}
export interface ApprovedCorpus { path: string; manifestSha256: string; positionsSha256: string }
export interface SourceAllowlist {
  schema: typeof SOURCE_ALLOWLIST_SCHEMA;
  featureSchema: typeof PHASING_EVAL_SCHEMA;
  featureCount: number;
  weightsVersion: number;
  rulesVersion: 'muju-phasing-1';
  pool: { path: typeof DEV_POOL_PATH; sha256: string; openingIds: string[] };
  runs: ApprovedRun[];
  corpora: ApprovedCorpus[];
}
export interface SourceApproval { manifest: SourceAllowlist; sha256: string; repoRoot: string }
const SHA = /^[0-9a-f]{64}$/;
const FORBIDDEN_COMPONENT = /(?:^|[-_./])(sealed|val|validation)(?:$|[-_./])/i;
export function hashText(text: string): string { return createHash('sha256').update(text).digest('hex'); }
function needHash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SHA.test(value)) throw new Error('tune preflight: missing/invalid SHA-256 binding');
}
function relativePath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value === '' || path.isAbsolute(value) || value.includes('\\') ||
    value.split('/').some(p => p === '..' || p === '.' || p === '') || FORBIDDEN_COMPONENT.test(value))
    throw new Error('tune preflight: refused source path');
}
/** Reject links before file reads, including a link named as an allowed pool/run. */
export function safeSourcePath(repoRoot: string, rel: string): string {
  relativePath(rel);
  let current = path.resolve(repoRoot);
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('tune preflight: symbolic source path refused');
  }
  return current;
}
function stringIds(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(x => typeof x !== 'string' || x.length === 0) ||
    new Set(value).size !== value.length) throw new Error('tune preflight: explicit unique opening IDs required');
}
export function assertFeatureIdentity(value: { featureSchema?: unknown; featureCount?: unknown; weightsVersion?: unknown }): void {
  if (FEATURE_COUNT !== 62 || value.featureSchema !== PHASING_EVAL_SCHEMA || value.featureCount !== 62 || value.weightsVersion !== WEIGHTS_VERSION || WEIGHTS_VERSION !== 2)
    throw new Error('tune preflight: current Phasing schema/62 features/weights version 2 required');
}
/** The explicitly supplied hash is the trust boundary; no corpus discovery. */
export function loadSourceApproval(repoRoot: string, file: string | undefined, expectedSha256: string | undefined): SourceApproval {
  needHash(expectedSha256);
  if (!file || !file.endsWith('.allowlist.json')) throw new Error('tune preflight: explicit .allowlist.json metadata path required');
  const rel = path.relative(path.resolve(repoRoot), path.resolve(repoRoot, file)).split(path.sep).join('/');
  const text = fs.readFileSync(safeSourcePath(repoRoot, rel), 'utf8');
  if (hashText(text) !== expectedSha256) throw new Error('tune preflight: source allowlist hash mismatch');
  const m = JSON.parse(text) as SourceAllowlist;
  assertFeatureIdentity(m);
  if (m.schema !== SOURCE_ALLOWLIST_SCHEMA || m.rulesVersion !== 'muju-phasing-1' || m.pool?.path !== DEV_POOL_PATH)
    throw new Error('tune preflight: only explicitly approved p1-dev Phasing sources are allowed');
  needHash(m.pool.sha256); stringIds(m.pool.openingIds);
  if (!Array.isArray(m.runs) || !Array.isArray(m.corpora)) throw new Error('tune preflight: run/corpus allowlists required');
  for (const run of m.runs) {
    relativePath(run.path); needHash(run.manifestSha256); needHash(run.gamesSha256); stringIds(run.openingIds);
    if (run.openingIds.some(id => !m.pool.openingIds.includes(id)) || !Array.isArray(run.replays)) throw new Error('tune preflight: unapproved run openings');
    for (const replay of run.replays) {
      relativePath(replay.path); needHash(replay.sha256);
      if (!replay.path.startsWith('replays/') || !replay.path.endsWith('.json') || !run.openingIds.includes(replay.opening))
        throw new Error('tune preflight: unapproved replay metadata');
    }
    if (new Set(run.replays.map(r => r.path)).size !== run.replays.length) throw new Error('tune preflight: duplicate replay allowlist path');
  }
  for (const corpus of m.corpora) { relativePath(corpus.path); needHash(corpus.manifestSha256); needHash(corpus.positionsSha256); }
  if (new Set(m.runs.map(r => r.path)).size !== m.runs.length || new Set(m.corpora.map(c => c.path)).size !== m.corpora.length)
    throw new Error('tune preflight: duplicate source allowlist path');
  return { manifest: m, sha256: expectedSha256, repoRoot: path.resolve(repoRoot) };
}
export function readBoundText(approval: SourceApproval, rel: string, sha256: string): string {
  needHash(sha256);
  const text = fs.readFileSync(safeSourcePath(approval.repoRoot, rel), 'utf8');
  if (hashText(text) !== sha256) throw new Error(`tune preflight: bound file hash mismatch: ${rel}`);
  return text;
}
/** Read every requested run's metadata before opening ANY games or replays. */
export function preflightRuns(approval: SourceApproval, paths: readonly string[]): ApprovedRun[] {
  const selected = paths.map(arg => {
    const rel = path.relative(approval.repoRoot, path.resolve(approval.repoRoot, arg)).split(path.sep).join('/');
    relativePath(rel);
    const run = approval.manifest.runs.find(r => r.path === rel);
    if (!run) throw new Error('tune preflight: run is not in the source allowlist');
    return run;
  });
  if (new Set(selected.map(run => run.path)).size !== selected.length) throw new Error('tune preflight: duplicate requested run');
  for (const run of selected) {
    const m = JSON.parse(readBoundText(approval, `${run.path}/manifest.json`, run.manifestSha256));
    if (m.schema !== 'muju-ladder-manifest-v1' || m.status !== 'complete' || m.voided !== false || m.rules?.rulesVersion !== 'muju-phasing-1' ||
      m.openings?.path !== DEV_POOL_PATH || m.openings?.sha256 !== approval.manifest.pool.sha256 ||
      !Array.isArray(m.openings.ids) || m.openings.ids.length !== run.openingIds.length || m.openings.ids.some((id: unknown) => typeof id !== 'string' || !run.openingIds.includes(id)))
      throw new Error('tune preflight: completed p1-dev run manifest binding required');
    for (const config of [m.aResolvedConfig, m.bResolvedConfig]) {
      if (config?.engine === 'hard') {
        const w = config.config?.weights;
        const vector = (value: unknown, length: number): boolean => value !== null && typeof value === 'object' &&
          Object.keys(value).length === length && Array.from({ length }, (_, i) => (value as Record<number, unknown>)[i]).every(v =>
            typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647);
        if (w?.featureSchema !== PHASING_EVAL_SCHEMA || w?.version !== WEIGHTS_VERSION || !vector(w.w, 62) || !vector(w.material, 18))
          throw new Error('tune preflight: historical Hard weight schema refused');
      }
    }
  }
  return selected;
}

// --- scoring ---------------------------------------------------------------

export interface WeightVector {
  /** `[FEATURE_COUNT]` cc. */
  w: number[];
  /** `[NDEF]` cc. */
  material: number[];
}

/**
 * The engine's own score for a row, in cc: `Σ_{i≥1} w[i]·f[i] + Σ_d
 * material[d]·counts[d]`. Index 0 is skipped deliberately (module header).
 */
export function scoreOf(row: Pick<TexelRow, 'features' | 'material'>, weights: WeightVector): number {
  let s = 0;
  for (let i = 1; i < FEATURE_COUNT; i++) s += weights.w[i] * row.features[i];
  for (let d = 0; d < NDEF; d++) s += weights.material[d] * row.material[d];
  return s;
}

// --- io --------------------------------------------------------------------

export function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function assertCurrentRow(row: TexelRow): void {
  assertFeatureIdentity({ featureSchema: row.featureSchema, featureCount: row.features?.length, weightsVersion: row.weightsVersion });
  if (row.schema !== ROW_SCHEMA || !Array.isArray(row.features) || row.features.some(x => !Number.isSafeInteger(x) || x < -2147483648 || x > 2147483647) ||
    !Array.isArray(row.material) || row.material.length !== NDEF || row.material.some(x => !Number.isInteger(x) || x < -2147483648 || x > 2147483647) ||
    ![0, 0.5, 1].includes(row.result) || ![0, 1].includes(row.side) || !['train', 'heldout'].includes(row.split))
    throw new Error('tune row: invalid current Phasing row');
}
export function readRows(corpusDir: string, approval?: SourceApproval): TexelRow[] {
  if (!approval) throw new Error('tune preflight: source approval required before positions are opened');
  const rel = path.relative(approval.repoRoot, path.resolve(corpusDir)).split(path.sep).join('/');
  relativePath(rel);
  const allowed = approval.manifest.corpora.find(c => c.path === rel);
  if (!allowed) throw new Error('tune preflight: corpus is not in the source allowlist');
  const m = JSON.parse(readBoundText(approval, `${rel}/manifest.json`, allowed.manifestSha256));
  assertFeatureIdentity(m);
  if (m.schema !== CORPUS_MANIFEST_SCHEMA || m.pool?.path !== DEV_POOL_PATH || m.pool?.sha256 !== approval.manifest.pool.sha256 ||
    m.positionsSha256 !== allowed.positionsSha256 || !Array.isArray(m.openings) || m.openings.some((id: unknown) =>
      typeof id !== 'string' || !approval.manifest.pool.openingIds.includes(id))) throw new Error('tune preflight: corpus manifest binding mismatch');
  needHash(m.sourceAllowlistSha256);
  if (m.rulesVersion !== 'muju-phasing-1' || !Array.isArray(m.sources) || m.sources.length === 0)
    throw new Error('tune preflight: corpus source-manifest provenance required');
  for (const source of m.sources) {
    const run = approval.manifest.runs.find(r => r.path === source.path);
    if (!run || run.manifestSha256 !== source.manifestSha256 || run.gamesSha256 !== source.gamesSha256)
      throw new Error('tune preflight: corpus uses an unapproved source manifest');
  }
  preflightRuns(approval, m.sources.map((source: { path: string }) => source.path));
  const rows: TexelRow[] = [], ids = new Set<string>();
  const text = readBoundText(approval, `${rel}/positions.jsonl`, allowed.positionsSha256);
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as TexelRow;
    assertCurrentRow(row);
    if (typeof row.id !== 'string' || ids.has(row.id) || row.pool !== DEV_POOL_PATH || !approval.manifest.pool.openingIds.includes(row.opening) || !m.openings.includes(row.opening) || !m.sources.some((source: { path: string }) => source.path === row.run))
      throw new Error('tune row: duplicate ID or unapproved pool/opening');
    ids.add(row.id); rows.push(row);
  }
  return rows;
}
export function assertFreshOutput(outDir: string, repoRoot: string): void {
  assertNotInSrc(outDir, repoRoot);
  if (fs.existsSync(outDir)) throw new Error('tune output must be a fresh directory');
  let ancestor = path.resolve(outDir);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (fs.realpathSync(ancestor) !== ancestor) throw new Error('tune output symbolic ancestor refused');
}
export function createFreshOutput(outDir: string, repoRoot: string): void {
  assertFreshOutput(outDir, repoRoot);
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  fs.mkdirSync(outDir); // exclusive creation: a concurrent writer is a failure
}
export function writeRows(corpusDir: string, rows: readonly TexelRow[]): string {
  for (const row of rows) assertCurrentRow(row);
  const file = path.resolve(corpusDir, 'positions.jsonl');
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : ''), { flag: 'wx' });
  return file;
}

/**
 * Refuses an output directory inside `src/`. No tuning artifact is a source
 * file: `src/ai/hard/eval/weights.generated.ts` is M20's to write, on an SPRT
 * H1, and never a lab run's side effect (MILESTONES M20).
 */
export function assertNotInSrc(outDir: string, repoRoot: string): void {
  const rel = path.relative(repoRoot, path.resolve(outDir));
  if (rel === 'src' || rel.startsWith(`src${path.sep}`)) {
    throw new Error(`--out may not write into src/ (got ${rel}); tuned weights reach src/ only through MILESTONES M20's fixed-work SPRT`);
  }
}

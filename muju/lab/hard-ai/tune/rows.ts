/**
 * The two on-disk formats the tuning pipeline reads and writes, and the pure
 * helpers both entry points share (DESIGN §5.15, MILESTONES M18).
 *
 * `muju-texel-v1` is DESIGN §5.15's row verbatim — `{schema, id, result, side,
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
import { NDEF } from '../../../src/ai/hard/core/catalog';
import { mulberry32 } from '../../harness/rng';

export const ROW_SCHEMA = 'muju-texel-v1';
export const CORPUS_MANIFEST_SCHEMA = 'muju-texel-corpus-manifest-v1';
export const WEIGHTS_FILE_SCHEMA = 'muju-weights-v1';

/** `1` = the row's side won, `0.5` = draw, `0` = the row's side lost. */
export type RowResult = 1 | 0.5 | 0;

export type Split = 'train' | 'heldout';

export interface TexelRow {
  schema: typeof ROW_SCHEMA;
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

/**
 * Pools no corpus row may ever come from.
 *
 * `e1-sealed.jsonl` is E6.2's acceptance set (`ALLOCATION.md`, "Sealed
 * acceptance": any earlier run against it voids it). `e2-val.jsonl` rows 32-63
 * are E3's own confirmation openings and rows 0-31 stay reserved for E2
 * (`docs/hard-ai/e3/E3-PLAN.md`), so the whole file is refused here rather
 * than half of it.
 */
export const REFUSED_POOLS: readonly string[] = ['e1-sealed.jsonl', 'e2-val.jsonl'];

/**
 * Id prefixes that identify a refused pool on their own.
 *
 * ONLY `e2-`. `e1-sealed.jsonl`'s ids are `e1-g3-s270`-shaped, and so are
 * `e1-dev.jsonl`'s and `e1-val.jsonl`'s — the sealed pool was minted with the
 * same `--id-prefix e1-` as the development pool (`ALLOCATION.md`, "Commands
 * that produced them"). A prefix rule on `e1-` would refuse the entire
 * development stratum, which is the one stratum tuning is allowed to use, so
 * sealed rows are caught by the id SET read out of the pool file instead.
 */
export const REFUSED_ID_PREFIXES: readonly string[] = ['e2-'];

export interface RefusalRules {
  /** Every opening id in every refused pool file that was found on disk. */
  ids: Set<string>;
  pools: readonly string[];
  prefixes: readonly string[];
  /** Pool files that could not be read (reported, never silently skipped). */
  missing: string[];
}

/** Reads the refused pools' ids out of `lab/hard-ai/ladder/openings/`. */
export function loadRefusalRules(repoRoot: string, pools: readonly string[] = REFUSED_POOLS): RefusalRules {
  const ids = new Set<string>();
  const missing: string[] = [];
  for (const pool of pools) {
    const file = path.resolve(repoRoot, 'lab/hard-ai/ladder/openings', pool);
    if (!fs.existsSync(file)) {
      missing.push(pool);
      continue;
    }
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const text = line.trim();
      if (text === '') continue;
      const parsed = JSON.parse(text) as { id?: unknown };
      if (typeof parsed.id === 'string') ids.add(parsed.id);
    }
  }
  return { ids, pools, prefixes: REFUSED_ID_PREFIXES, missing };
}

export type RefusalReason = 'pool' | 'id' | 'prefix';

/** Why this (opening, pool) pair may not enter the corpus, or `null`. */
export function refusalFor(openingId: string, poolPath: string | null, rules: RefusalRules): RefusalReason | null {
  if (poolPath !== null && rules.pools.includes(path.basename(poolPath))) return 'pool';
  if (rules.ids.has(openingId)) return 'id';
  for (const prefix of rules.prefixes) if (openingId.startsWith(prefix)) return 'prefix';
  return null;
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

export function readRows(corpusDir: string): TexelRow[] {
  const file = path.resolve(corpusDir, 'positions.jsonl');
  if (!fs.existsSync(file)) throw new Error(`corpus: ${file} not found`);
  const rows: TexelRow[] = [];
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const row = JSON.parse(line) as TexelRow;
    if (row.schema !== ROW_SCHEMA) throw new Error(`${file}:${i + 1}: schema is ${String(row.schema)}, expected ${ROW_SCHEMA}`);
    if (row.features.length !== FEATURE_COUNT) throw new Error(`${file}:${i + 1}: ${row.features.length} features, expected ${FEATURE_COUNT}`);
    if (row.material.length !== NDEF) throw new Error(`${file}:${i + 1}: ${row.material.length} material counts, expected ${NDEF}`);
    rows.push(row);
  }
  return rows;
}

export function writeRows(corpusDir: string, rows: readonly TexelRow[]): string {
  fs.mkdirSync(corpusDir, { recursive: true });
  const file = path.resolve(corpusDir, 'positions.jsonl');
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : ''));
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

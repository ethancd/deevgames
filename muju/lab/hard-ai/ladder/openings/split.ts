/**
 * E1 opening allocation (AMENDMENTS-DECIDED A15, "Two E1 decisions taken with
 * these"; EPIC-PLAN E1.2).
 *
 * WHY A SCRIPT AND NOT A HAND SPLIT. The allocation is the thing E1 freezes
 * before the first preregistered pair runs: which openings may be tuned
 * against (development), which drive champion/challenger contests and are
 * never tuned against (validation), and which E6.2 alone may run (sealed).
 * A split made by hand is a claim; a split made by a seeded script is a claim
 * the test can re-derive from the seed, which is what `ALLOCATION.md`'s
 * sha256 constants stand on.
 *
 * WHAT IT DOES. Regenerates the E1 pool in-process (`generate.ts` at
 * `--seed 2027 --id-prefix e1- --exclude e0-openings.jsonl`, so no pool file
 * has to be committed or trusted), shuffles it with `mulberry32(2027)` — the
 * same harness RNG the generator draws from — and cuts it 3:2:2 into
 * `e1-dev`, `e1-val` and `e1-sealed`, any remainder going to development.
 * Then it writes the preregistered baseline set: the six E0 openings left over
 * after the pilot's two and E1.1's eight reserved ones, followed by the first
 * 44 development rows, in that exact order, because `pairing.ts#buildPairs`
 * cycles handicaps fastest and walks the opening list once per handicap
 * sweep — `--handicaps 0,3 --pairs 100` consumes rows 0..49 at both handicaps.
 *
 * WHY THE SHUFFLE. The generator emits in attempt order, which correlates ply
 * length and driver bot with position in the file (`PLY_TARGETS` and
 * `DRIVER_BOTS` cycle over the attempt index). Splitting that order would hand
 * development and sealed systematically different opening lengths. The shuffle
 * is seeded, so the allocation is still reproducible.
 *
 * NO PROVENANCE IN THE JSONL. The openings format takes no comments
 * (`openings.ts#parseOpenings`), so every hash, count and command lives in
 * `ALLOCATION.md` next to these files.
 *
 * CLI:
 *   node --import tsx lab/hard-ai/ladder/openings/split.ts \
 *     --out-dir lab/hard-ai/ladder/openings
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../../../harness/rng';
import { loadOpenings, type OpeningSpec } from '../openings';
import { generateOpenings, loadExclusions, renderOpeningSpecs } from './generate';

/** Root seed of the E1 pool and of the shuffle that splits it. Distinct from E0's 2026. */
export const E1_SEED = 2027;
/** Namespaces E1 ids away from E0's `g<plies>-s<attempt>` (see `generate.ts`'s module doc). */
export const E1_ID_PREFIX = 'e1-';
/** Pool size asked for: 48 + 32 + 32. */
export const E1_TARGET_COUNT = 112;
/** Attempt budget. The pool is reached in ~1,000 candidates; this is the guard, not the cost. */
export const E1_MAX_ATTEMPTS = 20_000;
/** Pool the E1 set must stay disjoint from, by h0 digest and by prefix relation. */
export const E1_EXCLUDE = 'e0-openings.jsonl';

/** Development : validation : sealed. 112 cuts exactly 48/32/32. */
export const SPLIT_WEIGHTS = { dev: 3, val: 2, sealed: 2 } as const;

/**
 * E0 rows the pilot already ran (E0-PILOT-REPORT §"Pilot 2": `g2-s0` and
 * `g3-s1`, pair ids `g2-s0:0:0`, `g3-s1:0:1`, `g2-s0:3:0`, `g3-s1:3:1`).
 * Held out of the preregistered baseline by A15's "excluding the pilot pairs".
 */
export const E0_PILOT_INDICES = [0, 1] as const;
/** E0 rows reserved for E1.1's eight diagnostic pairs, also excluded from the baseline. */
export const E0_E1_1_INDICES = [2, 3, 4, 5, 6, 7, 8, 9] as const;
/** E0 rows the baseline opens with: everything the pilot and E1.1 do not claim. */
export const E0_BASELINE_INDICES = [10, 11, 12, 13, 14, 15] as const;
/** Pairs per handicap in the preregistered baseline, hence rows in `e1-baseline.jsonl`. */
export const BASELINE_SIZE = 50;

export const FILE_NAMES = {
  dev: 'e1-dev.jsonl',
  val: 'e1-val.jsonl',
  sealed: 'e1-sealed.jsonl',
  baseline: 'e1-baseline.jsonl',
} as const;

/**
 * Fisher-Yates over a copy, drawing from `mulberry32(seed)` — the harness RNG
 * (`lab/harness/rng.ts`), so the shuffle is the same generator every other
 * seeded draw in the lab uses. Descending `i` with `j = floor(rng() * (i+1))`
 * is the unbiased form; the input is never mutated.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export interface Strata {
  dev: OpeningSpec[];
  val: OpeningSpec[];
  sealed: OpeningSpec[];
}

/**
 * Cuts an already-shuffled pool 3:2:2. Validation and sealed are floored, so
 * any remainder lands in development — the stratum that may be inspected, the
 * one it is safe to make bigger.
 */
export function splitShuffled(shuffled: readonly OpeningSpec[]): Strata {
  const total = SPLIT_WEIGHTS.dev + SPLIT_WEIGHTS.val + SPLIT_WEIGHTS.sealed;
  const val = Math.floor((shuffled.length * SPLIT_WEIGHTS.val) / total);
  const sealed = Math.floor((shuffled.length * SPLIT_WEIGHTS.sealed) / total);
  const dev = shuffled.length - val - sealed;
  return {
    dev: shuffled.slice(0, dev),
    val: shuffled.slice(dev, dev + val),
    sealed: shuffled.slice(dev + val),
  };
}

/**
 * The preregistered baseline set, in run order: the six unclaimed E0 rows,
 * then development rows until 50. Fewer than 50 only if the pool came out
 * short — the caller reports the shortfall; validation and sealed are never
 * borrowed from.
 */
export function buildBaseline(e0: readonly OpeningSpec[], dev: readonly OpeningSpec[]): OpeningSpec[] {
  const head = E0_BASELINE_INDICES.map(i => {
    const row = e0[i];
    if (!row) throw new Error(`split: ${E1_EXCLUDE} has no row at index ${i}; the baseline ledger assumes 16 rows`);
    return row;
  });
  return [...head, ...dev.slice(0, BASELINE_SIZE - head.length)];
}

export interface AllocationOptions {
  /** Directory holding `e0-openings.jsonl`; also where the CLI writes. */
  dir: string;
  count?: number;
  seed?: number;
  maxAttempts?: number;
}

export interface Allocation extends Strata {
  /** The shuffled pool, in the order the strata were cut from. */
  pool: OpeningSpec[];
  baseline: OpeningSpec[];
  e0: OpeningSpec[];
  /** Candidates the generator tried to reach the pool. */
  attempts: number;
}

/** Regenerates the pool, shuffles, splits, and builds the baseline. Pure given `options`. */
export function buildAllocation(options: AllocationOptions): Allocation {
  const seed = options.seed ?? E1_SEED;
  const excludePath = path.join(options.dir, E1_EXCLUDE);
  const e0 = loadOpenings(excludePath).openings;
  const generated = generateOpenings({
    count: options.count ?? E1_TARGET_COUNT,
    seed,
    maxAttempts: options.maxAttempts ?? E1_MAX_ATTEMPTS,
    idPrefix: E1_ID_PREFIX,
    exclude: loadExclusions([excludePath]),
  });
  const pool = seededShuffle(generated.openings.map(o => o.spec), seed);
  const strata = splitShuffled(pool);
  return { pool, ...strata, baseline: buildBaseline(e0, strata.dev), e0, attempts: generated.attempts };
}

/** The bytes each allocation file must hold, keyed by filename. */
export function renderAllocation(allocation: Allocation): Record<string, string> {
  return {
    [FILE_NAMES.dev]: renderOpeningSpecs(allocation.dev),
    [FILE_NAMES.val]: renderOpeningSpecs(allocation.val),
    [FILE_NAMES.sealed]: renderOpeningSpecs(allocation.sealed),
    [FILE_NAMES.baseline]: renderOpeningSpecs(allocation.baseline),
  };
}

interface Cli { dir: string; outDir: string; count?: number; seed?: number; maxAttempts?: number }

export function parseArgs(argv: readonly string[]): Cli {
  let dir = 'lab/hard-ai/ladder/openings';
  let outDir: string | undefined;
  let count: number | undefined;
  let seed: number | undefined;
  let maxAttempts: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const need = (): string => {
      if (value === undefined) throw new Error(`split: ${flag} needs a value`);
      i++;
      return value;
    };
    const num = (name: string): number => {
      const n = Number(need());
      if (!Number.isInteger(n)) throw new Error(`split: ${name} must be an integer`);
      return n;
    };
    switch (flag) {
      case '--dir': dir = need(); break;
      case '--out-dir': outDir = need(); break;
      case '--count': count = num('--count'); break;
      case '--seed': seed = num('--seed'); break;
      case '--max-attempts': maxAttempts = num('--max-attempts'); break;
      default: throw new Error(`split: unknown flag ${flag}`);
    }
  }
  return { dir, outDir: outDir ?? dir, count, seed, maxAttempts };
}

function main(argv: readonly string[]): void {
  const cli = parseArgs(argv);
  const allocation = buildAllocation({ dir: path.resolve(cli.dir), count: cli.count, seed: cli.seed, maxAttempts: cli.maxAttempts });
  const outDir = path.resolve(cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const rendered = renderAllocation(allocation);
  process.stdout.write(
    `split: pool ${allocation.pool.length} openings in ${allocation.attempts} candidates, ` +
      `shuffled with mulberry32(${cli.seed ?? E1_SEED})\n`,
  );
  for (const [name, text] of Object.entries(rendered)) {
    const outPath = path.join(outDir, name);
    fs.writeFileSync(outPath, text);
    const rows = text.trimEnd().split('\n').length;
    process.stdout.write(`split: wrote ${name} — ${rows} rows, ${Buffer.byteLength(text)} bytes\n`);
  }
  if (allocation.baseline.length < BASELINE_SIZE) {
    process.stdout.write(
      `split: SHORTFALL — baseline holds ${allocation.baseline.length} of ${BASELINE_SIZE} openings; ` +
        'the pool did not yield enough development rows. Validation and sealed were NOT borrowed from.\n',
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2));

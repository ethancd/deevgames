/**
 * `node --import tsx lab/hard-ai/ladder/paired-diff.ts --base <R0 dir> --test <R1 dir>
 *   [--expect-pairs 192] [--out <file.json>]`
 *
 * The paired score difference preregistered by amendment A8
 * (`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`, "Read-outs reported for R0 and R1"),
 * committed before R1 is played, as A8 requires. For each `pairId` the two ladder rows share:
 *
 *   d = (test `scoreA` − base `scoreA`) / 2        (each `scoreA` is 0, 0.5, … 2; d ∈ [−1, 1])
 *
 * It reports the mean d̄, the counts of pairs with d < 0, d = 0 and d > 0, the sample standard
 * deviation s (n − 1), the two-sided 95% interval d̄ ± 1.96 · s / √n (the normal approximation
 * `elo.ts` uses), and the REGRESSION FLAG: true iff d̄ + 1.96 · s / √n < 0.
 *
 * It refuses to compute anything unless both rows are complete (the ladder's `metrics.json`:
 * `status: "complete"`, `pairsCompleted === pairs`, and, when `--expect-pairs` is given, exactly that many
 * pairs) and both rows hold exactly the same `pairId` set. `distinctGames` from each row is
 * printed beside the result, as A8 asks, because pairs that replay the same game at two handicaps
 * make the interval narrower than the information supports.
 */
import fs from 'node:fs';
import path from 'node:path';

/** DERIVED (A8: "the same normal approximation `lab/hard-ai/ladder/elo.ts` uses"): the two-sided
 * 95% standard-normal quantile. */
export const Z95 = 1.96;

export interface PairRow {
  pairId: string;
  scoreA: number;
}

export interface PairedDiff {
  n: number;
  mean: number;
  sd: number;
  lo: number;
  hi: number;
  negative: number;
  zero: number;
  positive: number;
  regressionFlag: boolean;
}

/** The A8 statistic over two complete, identically keyed pair lists. Pure; throws on any
 * mismatch rather than computing over a partial or misaligned schedule. */
export function pairedDiff(base: readonly PairRow[], test: readonly PairRow[]): PairedDiff {
  const baseById = new Map<string, number>();
  for (const row of base) {
    if (baseById.has(row.pairId)) throw new Error(`paired-diff: duplicate pairId ${row.pairId} in the base row`);
    baseById.set(row.pairId, row.scoreA);
  }
  const testIds = new Set<string>();
  const d: number[] = [];
  for (const row of test) {
    if (testIds.has(row.pairId)) throw new Error(`paired-diff: duplicate pairId ${row.pairId} in the test row`);
    testIds.add(row.pairId);
    const b = baseById.get(row.pairId);
    if (b === undefined) throw new Error(`paired-diff: pairId ${row.pairId} is in the test row but not the base row`);
    d.push((row.scoreA - b) / 2);
  }
  for (const id of baseById.keys()) {
    if (!testIds.has(id)) throw new Error(`paired-diff: pairId ${id} is in the base row but not the test row`);
  }
  const n = d.length;
  if (n < 2) throw new Error(`paired-diff: need at least 2 pairs, got ${n}`);
  const mean = d.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  const half = (Z95 * sd) / Math.sqrt(n);
  return {
    n,
    mean,
    sd,
    lo: mean - half,
    hi: mean + half,
    negative: d.filter(x => x < 0).length,
    zero: d.filter(x => x === 0).length,
    positive: d.filter(x => x > 0).length,
    regressionFlag: mean + half < 0,
  };
}

interface RowFiles {
  manifest: { status?: string; pairs?: number; pairsCompleted?: number; a?: string; b?: string; seed?: number; distinctGames?: unknown };
  pairs: PairRow[];
}

function readRow(dir: string, expectPairs: number | null): RowFiles {
  // `metrics.json` (not `manifest.json`) carries `pairsCompleted` and `distinctGames`.
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8')) as RowFiles['manifest'];
  if (manifest.status !== 'complete') throw new Error(`paired-diff: ${dir} is not complete (status ${String(manifest.status)})`);
  if (manifest.pairsCompleted !== manifest.pairs) {
    throw new Error(`paired-diff: ${dir} completed ${String(manifest.pairsCompleted)} of ${String(manifest.pairs)} pairs`);
  }
  if (expectPairs !== null && manifest.pairs !== expectPairs) {
    throw new Error(`paired-diff: ${dir} has ${String(manifest.pairs)} pairs, expected ${expectPairs}`);
  }
  const pairs = fs.readFileSync(path.join(dir, 'pairs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as PairRow);
  if (pairs.length !== manifest.pairs) throw new Error(`paired-diff: ${dir}/pairs.jsonl has ${pairs.length} rows, manifest says ${String(manifest.pairs)}`);
  return { manifest, pairs };
}

function main(argv: string[]): void {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const baseDir = get('--base');
  const testDir = get('--test');
  if (baseDir === null || testDir === null) throw new Error('usage: paired-diff.ts --base <R0 dir> --test <R1 dir> [--expect-pairs n] [--out file]');
  const expectRaw = get('--expect-pairs');
  const expectPairs = expectRaw === null ? null : Number(expectRaw);
  const base = readRow(baseDir, expectPairs);
  const test = readRow(testDir, expectPairs);
  if (base.manifest.seed !== test.manifest.seed) {
    throw new Error(`paired-diff: the rows ran different seeds (${String(base.manifest.seed)} vs ${String(test.manifest.seed)}), so their schedules differ`);
  }
  const result = {
    base: { dir: baseDir, a: base.manifest.a, b: base.manifest.b, seed: base.manifest.seed, distinctGames: base.manifest.distinctGames },
    test: { dir: testDir, a: test.manifest.a, b: test.manifest.b, seed: test.manifest.seed, distinctGames: test.manifest.distinctGames },
    pairedDiff: pairedDiff(base.pairs, test.pairs),
  };
  const out = get('--out');
  if (out !== null) fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main(process.argv.slice(2));
}

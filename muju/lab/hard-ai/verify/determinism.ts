/**
 * `npm run hard:determinism -- --engine <name> --work <units> --positions <n>
 *   [--seeds <csv>] --out <path>` (DESIGN §7.4).
 *
 * For each of the first `--positions` entries of `lab/hard-ai/positions/openings.jsonl`
 * crossed with `--seeds` (default `1`), runs one fixed-work decision three
 * times in-process plus once in a fresh `node` process (this same file,
 * re-invoked with `--internal-batch`, so the "fresh process" run shares
 * every code path with the in-process ones) and compares `endKey` (a hash of
 * the chosen action sequence), `score`, `depth`, and `stats` (`nodesSearched`
 * as the work-unit proxy, `stats.tacticalNodes` as the node-count proxy —
 * §7.4's `stats.work`/`stats.nodes` are replica-specific field names that
 * don't exist yet; see the module doc in `lab/hard-ai/ladder/engines.ts`).
 * `--work` is always fixed-work units (`fixed:<units>`) — wall-clock budgets
 * are not deterministic by construction (`src/ai/runtime.ts`), so this tool
 * never accepts `wall:`.
 *
 * `hard@*` engines additionally get a WASM-absent run (§7.4); not reachable
 * until M14 registers that engine family.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readPositions } from '../positions/corpus';
import { aiv2Decision, parseAiv2Name, type WorkSpec } from '../ladder/engines';
import type { AIAction } from '../../../src/ai/types';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const OPENINGS_PATH = path.resolve(import.meta.dirname, '../positions/openings.jsonl');
const THIS_FILE = path.resolve(import.meta.dirname, 'determinism.ts');

interface Args {
  engine: string;
  workUnits: number;
  positions: number;
  seeds: number[];
  out: string;
  internalBatch: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };
  const require = (flag: string): string => {
    const v = get(flag);
    if (v === null) throw new Error(`hard:determinism: missing ${flag}`);
    return v;
  };
  return {
    engine: require('--engine'),
    workUnits: Number(require('--work')),
    positions: Number(require('--positions')),
    seeds: (get('--seeds') ?? '1').split(',').map(Number),
    out: get('--out') ? path.resolve(REPO_ROOT, get('--out') as string) : path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/determinism.json'),
    internalBatch: argv.includes('--internal-batch'),
  };
}

interface DecisionSummary {
  positionId: string;
  seed: number;
  endKey: string;
  score: number;
  depth: number;
  nodesSearched: number;
  tacticalNodes: number;
}

function hashActions(actions: readonly AIAction[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(actions)).digest('hex');
}

async function runBatch(engine: string, workUnits: number, positionCount: number, seeds: number[]): Promise<DecisionSummary[]> {
  const work: WorkSpec = { mode: 'fixed', units: workUnits };
  const aiv2 = parseAiv2Name(engine);
  if (!aiv2) {
    if (engine.startsWith('hard@')) throw new Error(`hard:determinism: "${engine}" is not registered until M14 (src/ai/hard/engine.ts)`);
    throw new Error(`hard:determinism: "${engine}" has no deterministic decision path (only aiv2-* is supported at M2)`);
  }
  const positions = readPositions(OPENINGS_PATH).slice(0, positionCount);
  if (positions.length < positionCount) {
    throw new Error(`hard:determinism: requested ${positionCount} positions but ${OPENINGS_PATH} only has ${positions.length}`);
  }
  const out: DecisionSummary[] = [];
  for (const pos of positions) {
    for (const seed of seeds) {
      const result = await aiv2Decision(aiv2.difficulty, aiv2.fast, work, pos.state, seed);
      out.push({
        positionId: pos.id,
        seed,
        endKey: hashActions(result.plan.actions),
        score: result.plan.score,
        depth: result.depth,
        nodesSearched: result.nodesSearched,
        tacticalNodes: result.stats?.tacticalNodes ?? 0,
      });
    }
  }
  return out;
}

function runFreshProcess(args: Args): DecisionSummary[] {
  const stdout = execFileSync(
    process.execPath,
    ['--import', 'tsx', THIS_FILE, '--engine', args.engine, '--work', String(args.workUnits), '--positions', String(args.positions), '--seeds', args.seeds.join(','), '--internal-batch'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const lastLine = stdout.trim().split('\n').filter(Boolean).pop();
  if (!lastLine) throw new Error('hard:determinism: fresh process produced no output');
  return JSON.parse(lastLine) as DecisionSummary[];
}

function summariesEqual(a: DecisionSummary[], b: DecisionSummary[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * If `--out` sits at `<dir>/<stem>.json` and sibling directories
 * `<dir>/<stem>-<label>` exist, each containing a `metrics.json`, folds
 * `{[label]: metrics}` into the written artifact. Lets a gate chain multiple
 * `--out`-writing steps (e.g. two `hard:ladder` runs plus this tool) into
 * one merged artifact by naming convention alone, with no gate-specific code
 * here (DESIGN §7.7's M2 gate row: "artifact merges the three outputs").
 */
function siblingMerges(outPath: string): Record<string, unknown> {
  const dir = path.dirname(outPath);
  const stem = path.basename(outPath, '.json');
  const merged: Record<string, unknown> = {};
  if (!fs.existsSync(dir)) return merged;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${stem}-`)) continue;
    const metricsPath = path.join(dir, entry.name, 'metrics.json');
    if (!fs.existsSync(metricsPath)) continue;
    const label = entry.name.slice(stem.length + 1);
    try {
      merged[label] = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    } catch {
      // malformed sibling artifact; skip rather than fail this tool's own check
    }
  }
  return merged;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.internalBatch) {
    const batch = await runBatch(args.engine, args.workUnits, args.positions, args.seeds);
    console.log(JSON.stringify(batch));
    return;
  }

  const runs: DecisionSummary[][] = [];
  for (let i = 0; i < 3; i++) runs.push(await runBatch(args.engine, args.workUnits, args.positions, args.seeds));
  runs.push(runFreshProcess(args));

  const [first, ...rest] = runs;
  const identical = rest.every(r => summariesEqual(first, r));
  const mismatches: Array<{ run: number; positionId: string; seed: number; field: string }> = [];
  if (!identical) {
    for (let r = 0; r < rest.length; r++) {
      for (let i = 0; i < first.length; i++) {
        const a = first[i], b = rest[r][i];
        if (!b) continue;
        for (const field of ['endKey', 'score', 'depth', 'nodesSearched', 'tacticalNodes'] as const) {
          if (a[field] !== b[field]) mismatches.push({ run: r + 1, positionId: a.positionId, seed: a.seed, field });
        }
      }
    }
  }

  const own = {
    engine: args.engine,
    workUnits: args.workUnits,
    positions: args.positions,
    seeds: args.seeds,
    runs: runs.length,
    identical,
    mismatches,
    at: new Date().toISOString(),
  };
  const merged = { ...own, ...siblingMerges(args.out), determinism: own };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(merged, null, 2) + '\n');
  console.log(`hard:determinism: wrote ${args.out}`);
  console.log(JSON.stringify({ identical, mismatches: mismatches.length }));
  if (!identical) process.exitCode = 1;
}

main().catch(err => {
  console.error(`hard:determinism: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
});

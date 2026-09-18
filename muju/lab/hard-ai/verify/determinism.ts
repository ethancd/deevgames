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
 * `hard@*` engines (M14) run the same comparison on `src/ai/hard/engine.ts`'s
 * `searchTurn` at a fixed work budget. Three additional things change for them:
 *
 *   - `--work` accepts a COMMA-SEPARATED list of budgets (`25000,400000`), and
 *     every position × seed × budget triple is one decision in the batch. The
 *     rung is part of what has to be deterministic, so it belongs inside the
 *     compared batch rather than in a second invocation.
 *   - the batch is SHARDED across child processes by default
 *     (`min(12, cpus)`), each shard owning a stride of the work list and
 *     running the three in-process repetitions plus its own fresh-process run
 *     on that stride. Determinism is a per-decision property, so a stride is as
 *     good a unit as the whole list — and the whole list at `--positions 40
 *     --work 25000,400000 --seeds 1,7` is 640 searches, which is twenty minutes
 *     of wall clock in one process and under two across twelve. `--shards`
 *     overrides; `--shards 1` restores the single-process behaviour.
 *   - the WASM-absent run of §7.4 is implicit: the hard engine never loads the
 *     WASM kernel, so every run is already a WASM-absent run. (`wasmAbsent` is
 *     reported so the artifact says so rather than leaving it unstated.)
 *
 * `aiv2-*` behaviour is unchanged: one budget, one process, three repetitions
 * plus a fresh process.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { readPositions } from '../positions/corpus';
import { aiv2Decision, parseAiv2Name, type WorkSpec } from '../ladder/engines';
import type { AIAction } from '../../../src/ai/types';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { HardEngine } from '../../../src/ai/hard/engine';
import { hardConfigFor } from '../bots/hard';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const OPENINGS_PATH = path.resolve(import.meta.dirname, '../positions/openings.jsonl');
const THIS_FILE = path.resolve(import.meta.dirname, 'determinism.ts');

interface Args {
  engine: string;
  workUnits: number[];
  positions: number;
  seeds: number[];
  shards: number;
  shardIndex: number;
  shardCount: number;
  out: string;
  internalBatch: boolean;
}

function isHardEngine(name: string): boolean {
  return name.startsWith('hard@');
}

function defaultShards(engine: string): number {
  if (!isHardEngine(engine)) return 1;
  const cpus = os.cpus().length;
  return Math.max(1, Math.min(12, cpus));
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
  const engine = require('--engine');
  const shards = get('--shards');
  return {
    engine,
    workUnits: require('--work').split(',').map(Number),
    positions: Number(require('--positions')),
    seeds: (get('--seeds') ?? '1').split(',').map(Number),
    shards: shards === null ? defaultShards(engine) : Number(shards),
    shardIndex: Number(get('--shard-index') ?? '-1'),
    shardCount: Number(get('--shard-count') ?? '1'),
    out: get('--out') ? path.resolve(REPO_ROOT, get('--out') as string) : path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/determinism.json'),
    internalBatch: argv.includes('--internal-batch'),
  };
}

interface DecisionSummary {
  positionId: string;
  seed: number;
  work: number;
  endKey: string;
  score: number;
  depth: number;
  nodesSearched: number;
  tacticalNodes: number;
}

function hashActions(actions: readonly AIAction[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(actions)).digest('hex');
}

interface Decision {
  positionId: string;
  state: import('../../../src/game/types').GameState;
  rules: import('../positions/corpus').RulesBlock;
  seed: number;
  work: number;
}

/** The deterministic work list: positions × seeds × budgets, in that order. */
function buildDecisions(args: Args): Decision[] {
  const positions = readPositions(OPENINGS_PATH).slice(0, args.positions);
  if (positions.length < args.positions) {
    throw new Error(`hard:determinism: requested ${args.positions} positions but ${OPENINGS_PATH} only has ${positions.length}`);
  }
  const out: Decision[] = [];
  for (const pos of positions) {
    for (const seed of args.seeds) {
      for (const work of args.workUnits) out.push({ positionId: pos.id, state: pos.state, rules: pos.rules, seed, work });
    }
  }
  return out;
}

async function runBatch(engine: string, decisions: readonly Decision[]): Promise<DecisionSummary[]> {
  const aiv2 = parseAiv2Name(engine);
  if (!aiv2 && !isHardEngine(engine)) {
    throw new Error(`hard:determinism: "${engine}" has no deterministic decision path (aiv2-* and hard@* only)`);
  }
  const patch = isHardEngine(engine) ? hardConfigFor(engine.slice('hard@'.length)) : null;
  const out: DecisionSummary[] = [];
  for (const d of decisions) {
    if (patch !== null) {
      setElementGraph(d.rules.elementGraph);
      setUpkeepVariant(d.rules.upkeep);
      setCombatHandicap('white', d.rules.combatHandicap.white);
      setCombatHandicap('black', d.rules.combatHandicap.black);
      const hard = new HardEngine(patch);
      hard.setSeed(d.seed);
      const result = await hard.searchTurn(d.state, { work: d.work });
      out.push({
        positionId: d.positionId,
        seed: d.seed,
        work: d.work,
        // `endKey` is the replica's own end-position hash (§7.4); the action
        // list is hashed alongside it so a divergence names itself.
        endKey: `${result.endKey}/${hashActions(result.actions)}`,
        score: result.scoreCc,
        depth: result.depth,
        nodesSearched: result.stats.work,
        tacticalNodes: result.stats.nodes,
      });
      continue;
    }
    const spec: WorkSpec = { mode: 'fixed', units: d.work };
    const result = await aiv2Decision(aiv2!.difficulty, aiv2!.fast, spec, d.state, d.seed);
    out.push({
      positionId: d.positionId,
      seed: d.seed,
      work: d.work,
      endKey: hashActions(result.plan.actions),
      score: result.plan.score,
      depth: result.depth,
      nodesSearched: result.nodesSearched,
      tacticalNodes: result.stats?.tacticalNodes ?? 0,
    });
  }
  return out;
}

function freshProcessArgs(args: Args, shardIndex: number, shardCount: number): string[] {
  return [
    '--import', 'tsx', THIS_FILE,
    '--engine', args.engine,
    '--work', args.workUnits.join(','),
    '--positions', String(args.positions),
    '--seeds', args.seeds.join(','),
    '--shard-index', String(shardIndex),
    '--shard-count', String(shardCount),
    '--internal-batch',
  ];
}

function runFreshProcess(args: Args, shardIndex: number, shardCount: number): DecisionSummary[] {
  const stdout = execFileSync(process.execPath, freshProcessArgs(args, shardIndex, shardCount), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const lastLine = stdout.trim().split('\n').filter(Boolean).pop();
  if (!lastLine) throw new Error('hard:determinism: fresh process produced no output');
  return JSON.parse(lastLine) as DecisionSummary[];
}

interface ShardVerdict {
  identical: boolean;
  mismatches: Array<{ run: number; positionId: string; seed: number; work: number; field: string }>;
  decisions: number;
}

/** One shard's whole check: three in-process repetitions plus a fresh process,
 * over this shard's stride of the work list. */
async function runShardVerdict(args: Args, shardIndex: number, shardCount: number): Promise<ShardVerdict> {
  const mine = buildDecisions(args).filter((_, i) => i % shardCount === shardIndex);
  const runs: DecisionSummary[][] = [];
  for (let i = 0; i < 3; i++) runs.push(await runBatch(args.engine, mine));
  runs.push(runFreshProcess(args, shardIndex, shardCount));
  const [first, ...rest] = runs;
  const mismatches: ShardVerdict['mismatches'] = [];
  for (let r = 0; r < rest.length; r++) {
    for (let i = 0; i < first.length; i++) {
      const a = first[i];
      const b = rest[r][i];
      if (!b) continue;
      for (const field of ['endKey', 'score', 'depth', 'nodesSearched', 'tacticalNodes'] as const) {
        if (a[field] !== b[field]) mismatches.push({ run: r + 1, positionId: a.positionId, seed: a.seed, work: a.work, field });
      }
    }
  }
  return { identical: mismatches.length === 0, mismatches, decisions: first.length };
}

function spawnShardVerdict(args: Args, index: number, count: number): Promise<ShardVerdict> {
  const cliArgs = [
    '--import', 'tsx', THIS_FILE,
    '--engine', args.engine,
    '--work', args.workUnits.join(','),
    '--positions', String(args.positions),
    '--seeds', args.seeds.join(','),
    '--shards', '1',
    '--shard-index', String(index),
    '--shard-count', String(count),
    '--out', path.join(path.dirname(args.out), `.det-shard-${index}.json`),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += String(d); });
    child.on('error', reject);
    child.on('exit', code => {
      const file = path.join(path.dirname(args.out), `.det-shard-${index}.json`);
      if (code !== 0 && !fs.existsSync(file)) {
        reject(new Error(`hard:determinism shard ${index}/${count} exited ${code}:\n${stderr.slice(-4000)}`));
        return;
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { determinism: { identical: boolean; mismatches: ShardVerdict['mismatches']; decisions: number } };
        fs.rmSync(file, { force: true });
        resolve({ identical: parsed.determinism.identical, mismatches: parsed.determinism.mismatches, decisions: parsed.determinism.decisions });
      } catch (err) {
        reject(new Error(`hard:determinism shard ${index}/${count}: unreadable partial: ${String(err)}`));
      }
    });
  });
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
    const all = buildDecisions(args);
    const mine = args.shardIndex >= 0 ? all.filter((_, i) => i % args.shardCount === args.shardIndex) : all;
    const batch = await runBatch(args.engine, mine);
    console.log(JSON.stringify(batch));
    return;
  }

  const shards = Math.max(1, args.shardIndex >= 0 ? 1 : args.shards);
  const verdicts: ShardVerdict[] =
    shards <= 1
      ? [await runShardVerdict(args, args.shardIndex >= 0 ? args.shardIndex : 0, args.shardIndex >= 0 ? args.shardCount : 1)]
      : await Promise.all(Array.from({ length: shards }, (_, i) => spawnShardVerdict(args, i, shards)));

  const identical = verdicts.every(v => v.identical);
  const mismatches = verdicts.flatMap(v => v.mismatches).slice(0, 50);
  const decisions = verdicts.reduce((n, v) => n + v.decisions, 0);

  const own = {
    engine: args.engine,
    workUnits: args.workUnits,
    positions: args.positions,
    seeds: args.seeds,
    shards,
    decisions,
    runs: 4,
    wasmAbsent: isHardEngine(args.engine),
    identical,
    mismatches,
    at: new Date().toISOString(),
  };
  const merged = { ...own, ...siblingMerges(args.out), determinism: own };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(merged, null, 2) + '\n');
  console.log(`hard:determinism: wrote ${args.out}`);
  console.log(JSON.stringify({ identical, decisions, mismatches: mismatches.length }));
  if (!identical) process.exitCode = 1;
}

main().catch(err => {
  console.error(`hard:determinism: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
});

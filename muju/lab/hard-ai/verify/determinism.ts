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
 * `--positions-file <jsonl>` (Strategos W1.11): reads a `muju-position-v1`
 * corpus (`lab/hard-ai/positions/corpus.ts#readPositions`) instead of
 * `lab/hard-ai/positions/openings.jsonl`, e.g.
 * `lab/hard-ai/positions/p4-determinism.jsonl` (Phasing, `muju-phasing-4`,
 * built across the kill clock's `inactivityPlies` range plus a few
 * units-in-contact positions — see that file's sibling generator script's
 * header comment for the recipe). Optional and additive: every existing flag
 * and default is unchanged when it is omitted, so `--positions <n>` stays
 * REQUIRED and reads from the same `openings.jsonl` path exactly as before.
 * When `--positions-file` IS given, `--positions` becomes optional and
 * defaults to every position in that file (an explicit `--positions <n>`
 * still takes the first `n` rows, e.g. to keep a quick smoke run short); a
 * selection that resolves to no positions is refused rather than reported as
 * a vacuous `identical: true`, and the artifact records the file it read
 * (`positionsFile`, repo-relative) so a Gate 0 artifact names its corpus.
 *
 * Every repetition is compared row by row against the first; a repetition
 * that is missing a decision, has an extra one, or lists a different
 * position/seed/budget at the same index is a mismatch (`field: 'decision'`),
 * never a silent skip.
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
import { hardEnginePatch } from '../bots/hard';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const OPENINGS_PATH = path.resolve(import.meta.dirname, '../positions/openings.jsonl');
const THIS_FILE = path.resolve(import.meta.dirname, 'determinism.ts');

interface Args {
  engine: string;
  workUnits: number[];
  positions: number;
  /** `--positions-file`: absolute path to a `muju-position-v1` corpus, or
   * `null` for the default `positions/openings.jsonl` (unchanged behaviour). */
  positionsFile: string | null;
  seeds: number[];
  shards: number;
  shardIndex: number;
  shardCount: number;
  out: string;
  internalBatch: boolean;
}

/** `args.positionsFile ?? OPENINGS_PATH`, the one place the two are merged. */
function positionsPathFor(args: Args): string {
  return args.positionsFile ?? OPENINGS_PATH;
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
  // `--positions-file` is additive (W1.11): when absent, `--positions` is
  // REQUIRED exactly as before (same `require` call, same error message), so
  // every existing invocation is byte-for-byte unaffected. Only when a
  // positions file IS given does `--positions` become optional; `-1` is an
  // internal sentinel `main()` resolves to "every row in that file" before
  // anything else reads it (see the resolution step there).
  const positionsFileRaw = get('--positions-file');
  const positionsFile = positionsFileRaw === null ? null : path.resolve(REPO_ROOT, positionsFileRaw);
  const positionsRaw = positionsFile === null ? require('--positions') : get('--positions');
  return {
    engine,
    // Plain fixed-work units, comma-separated (`--work 60000`, not `fixed:60000`).
    // A NaN budget would make every `b.work !== a.work` comparison true and
    // report 24 phantom mismatches (Strategos W1.15, 2026-09-24), so refuse it.
    workUnits: require('--work').split(',').map(w => {
      const n = Number(w);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`hard:determinism: --work takes positive integer work units, got "${w}"`);
      return n;
    }),
    positions: positionsRaw === null ? -1 : Number(positionsRaw),
    positionsFile,
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

/** The deterministic work list: positions × seeds × budgets, in that order.
 * `args.positions` must already be a concrete count (`main()` resolves the
 * `-1` "every row" sentinel before this is ever called). */
function buildDecisions(args: Args): Decision[] {
  const positionsPath = positionsPathFor(args);
  const positions = readPositions(positionsPath).slice(0, args.positions);
  if (positions.length < args.positions) {
    throw new Error(`hard:determinism: requested ${args.positions} positions but ${positionsPath} only has ${positions.length}`);
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
  // 2026-09-22: `hardEnginePatch`, not `hardConfigFor`. A profile object's
  // `weights` field is always PRESENT and carries M4's `placeholder-m4` vector
  // (`version: 0`), while `HardEngine`'s `DEFAULT_WEIGHTS` substitution is
  // guarded on `cfg.weights === undefined` — so `hardConfigFor` built an engine
  // whose evaluator threw `Phasing weight schema/version mismatch` from
  // `assertCurrentWeights`, and this tool could not run ANY `hard@*` engine.
  // Every other lab call site already resolves the vector through the adapter
  // (`bots/hard.ts:315-325`, `suites/run.ts:91-107`, `ladder/identity.ts:329`);
  // this was the one that was missed.
  const patch = isHardEngine(engine) ? hardEnginePatch(engine.slice('hard@'.length)) : null;
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
  const out = [
    '--import', 'tsx', THIS_FILE,
    '--engine', args.engine,
    '--work', args.workUnits.join(','),
    '--positions', String(args.positions),
    '--seeds', args.seeds.join(','),
    '--shard-index', String(shardIndex),
    '--shard-count', String(shardCount),
    '--internal-batch',
  ];
  if (args.positionsFile !== null) out.push('--positions-file', args.positionsFile);
  return out;
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
    // W1.11 review: a repetition that returned a different decision list is a
    // mismatch, not a row to skip — before this, a fresh process that came back
    // short compared only the rows it did return and could report `identical`.
    for (let i = first.length; i < rest[r].length; i++) {
      const b = rest[r][i];
      mismatches.push({ run: r + 1, positionId: b.positionId, seed: b.seed, work: b.work, field: 'decision' });
    }
    for (let i = 0; i < first.length; i++) {
      const a = first[i];
      const b = rest[r][i];
      if (!b || b.positionId !== a.positionId || b.seed !== a.seed || b.work !== a.work) {
        mismatches.push({ run: r + 1, positionId: a.positionId, seed: a.seed, work: a.work, field: 'decision' });
        continue;
      }
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
  if (args.positionsFile !== null) cliArgs.push('--positions-file', args.positionsFile);
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
  // Resolve the `-1` "`--positions` omitted, `--positions-file` given" sentinel
  // to a concrete count exactly once, here, before anything downstream (the
  // internal-batch branch, `buildDecisions`, the shard/fresh-process re-spawns,
  // or the written artifact's `positions` field) ever reads `args.positions`.
  // Only on the `--positions-file` path: without it, `--positions` is whatever
  // the caller typed, exactly as before this flag existed.
  if (args.positionsFile !== null) {
    if (args.positions === -1) args.positions = readPositions(args.positionsFile).length;
    // `!(n > 0)` also catches NaN, which `slice(0, NaN)` would turn into an
    // empty batch and a vacuous `identical: true`.
    if (!(args.positions > 0)) {
      throw new Error(`hard:determinism: --positions-file ${args.positionsFile} selects no positions (--positions ${args.positions})`);
    }
  }

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
    // Present only when `--positions-file` was given, so an `openings.jsonl`
    // run writes exactly the keys it always wrote.
    ...(args.positionsFile !== null ? { positionsFile: path.relative(REPO_ROOT, args.positionsFile) } : {}),
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

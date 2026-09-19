/**
 * `npm run hard:corpus -- --runs <dir> [--runs <dir> ...] [--max-turns n]
 *  [--holdout-by opening|none] [--holdout-seed <int>] [--refuse-pool <file>]
 *  [--out <dir>]`
 *
 * DESIGN §5.15's Texel corpus, built from EXISTING ladder replays rather than
 * from fresh self-play (MILESTONES M18 specifies `--games 400 --work 25000`
 * self-play; that generator is NOT in this file — see the "What is missing"
 * section of `docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md`). This is an
 * INSTRUMENT: it writes `positions.jsonl` and `manifest.json` under
 * `lab/results/`, nothing else, and no run of it is a tuning decision.
 *
 * WHAT A ROW IS. Each recorded game is rebuilt through the canonical engine by
 * `lab/hard-ai/analyze/replay.ts reconstruct`, which refuses a replay that no
 * longer reproduces its own snapshots. Every turn boundary on the game path is
 * packed; a boundary is a MACRO NODE when the side to move still has all four
 * actions (`p.actions === ACTIONS_PER_TURN`). A boundary with fewer is a
 * mid-turn position the harness turn segmentation produced — the first turn
 * after an opening that spent part of it — and DESIGN §5.12.1 defines feature
 * 19 `ActionsLeft` as "0 at macro nodes", so those boundaries are counted and
 * dropped rather than mixed in.
 *
 * QUIET, verbatim from DESIGN §5.15: no `killNow` entry with `minActions <=
 * p.actions` for EITHER side (`tables/kill.ts KillTable.entry[slot].minActions`,
 * `KILL_IMPOSSIBLE = 255` when no plan exists), and `home[side].actionsToCorner
 * > 4` for both sides (`tables/home.ts HomeSafety.actionsToCorner`,
 * `HOME_NEVER = 127`). Both tables are read off the level-2 `NodeTables` the
 * evaluator itself built for the position (`Evaluator.lastTables`), so the
 * quiet test and the feature vector describe the same table build.
 *
 * LABEL. `result` is from the ROW SIDE's point of view: 1 when that side won
 * the game, 0.5 on a draw, 0 when it lost.
 *
 * INPUT BOUNDARY. Explicit metadata allowlist + caller-supplied SHA-256 bind
 * p1-dev, completed run manifests, games and every replay. All requested run
 * manifests are preflighted before any data is opened. Refused pools are never
 * read for their IDs. A reviewed allowlist is a trust boundary, not independent
 * proof that the producer labeled its data honestly.
 *
 * Current 62-feature Phasing weights v2 only; fresh exclusive outputs. Replay
 * reconstruction/evaluation is real work and requires the normal shared queue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Replica, allocState, ACTIONS_PER_TURN } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { FEATURE_COUNT } from '../../../src/ai/hard/eval/features';
import { PHASING_EVAL_SCHEMA, WEIGHTS_VERSION, assertCurrentWeights } from '../../../src/ai/hard/eval/weights';
import { NDEF } from '../../../src/ai/hard/core/catalog';
import { DEAD, Result, type PackedState } from '../../../src/ai/hard/types';
import type { PlayerId } from '../../../src/game/types';
import { configHashOf, resolvedConfigHash } from '../ladder/identity';
import { keyHex, resolveHardConfig } from '../analyze/engine';
import { REPLAY_SCHEMA, reconstruct, withMatchRules, type LoadedReplay, type StoredReplay } from '../analyze/replay';
import {
  CORPUS_MANIFEST_SCHEMA,
  REFUSED_ID_PREFIXES,
  REFUSED_POOLS,
  ROW_SCHEMA,
  assertFreshOutput,
  createFreshOutput,
  DEV_POOL_PATH,
  loadSourceApproval,
  preflightRuns,
  readBoundText,
  type SourceApproval,
  type ApprovedRun,
  loadRefusalRules,
  refusalFor,
  sha256File,
  splitOpenings,
  writeRows,
  type OpeningSplit,
  type RefusalReason,
  type RowResult,
  type TexelRow,
} from './rows';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = ''; // an explicit fresh output path is required

export interface CorpusArgs {
  runs: string[];
  sourceAllowlist?: string;
  sourceAllowlistSha256?: string;
  maxTurns: number | null;
  out: string;
  holdoutBy: 'opening' | 'none';
  holdoutSeed: number;
  holdoutFraction: number;
  /** Extra pool basenames to refuse, on top of `rows.ts REFUSED_POOLS`. */
  refusePools: string[];
}

export function parseArgs(argv: readonly string[]): CorpusArgs {
  const args: CorpusArgs = {
    runs: [],
    maxTurns: null,
    out: DEFAULT_OUT,
    holdoutBy: 'opening',
    holdoutSeed: 1,
    holdoutFraction: 0.2,
    refusePools: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a}: missing value`);
      return v;
    };
    switch (a) {
      case '--runs': args.runs.push(next()); break;
      case '--source-allowlist': args.sourceAllowlist = next(); break;
      case '--source-allowlist-sha256': args.sourceAllowlistSha256 = next(); break;
      case '--max-turns': args.maxTurns = positive(next(), a); break;
      case '--out': args.out = next(); break;
      case '--holdout-by': {
        const v = next();
        if (v !== 'opening' && v !== 'none') throw new Error(`--holdout-by: expected "opening" or "none", got ${v}`);
        args.holdoutBy = v;
        break;
      }
      case '--holdout-seed': args.holdoutSeed = integer(next(), a); break;
      case '--refuse-pool': args.refusePools.push(path.basename(next())); break;
      case '--holdout-fraction': {
        const v = Number(next());
        if (!Number.isFinite(v) || v <= 0 || v >= 1) throw new Error(`${a}: expected a fraction in (0,1)`);
        args.holdoutFraction = v;
        break;
      }
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  if (args.runs.length === 0) throw new Error('at least one --runs <dir> is required');
  if (!args.out || !args.sourceAllowlist || !args.sourceAllowlistSha256) throw new Error('--out, --source-allowlist and --source-allowlist-sha256 are required');
  return args;
}

function positive(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag}: expected a positive number, got ${value}`);
  return Math.floor(n);
}

function integer(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${flag}: expected an integer, got ${value}`);
  return n;
}

// --- the quiet rule --------------------------------------------------------

export interface QuietVerdict {
  quiet: boolean;
  /** The lowest `minActions` over both sides' `killNow` tables. */
  minKillActions: number;
  actionsToCorner: [number, number];
}

/** DESIGN §5.15's quiet test, read off a level-2 `NodeTables`. */
export function quietVerdict(p: PackedState, tables: { killNow: { entry: { minActions: number }[] }[]; home: { actionsToCorner: number }[] }): QuietVerdict {
  let minKill = Number.POSITIVE_INFINITY;
  for (let side = 0; side < 2; side++) {
    const entries = tables.killNow[side].entry;
    for (let slot = 0; slot < entries.length; slot++) {
      const m = entries[slot].minActions;
      if (m < minKill) minKill = m;
    }
  }
  const corner: [number, number] = [tables.home[0].actionsToCorner, tables.home[1].actionsToCorner];
  const quiet = minKill > p.actions && corner[0] > 4 && corner[1] > 4;
  return { quiet, minKillActions: minKill, actionsToCorner: corner };
}

// --- run reading -----------------------------------------------------------

interface GameLine {
  rulesVersion?: string;
  winner: PlayerId | null;
  winType: string;
  opening: string;
  handicap: number;
  replayPath?: string;
}

interface RunInfo {
  dir: string;
  relDir: string;
  pool: string | null;
  poolSha256: string | null;
  games: number;
  gamesWithReplay: number;
}

export interface CorpusCounts {
  runs: RunInfo[];
  games: number;
  gamesUsed: number;
  drawGames: number;
  turnBoundaries: number;
  nonMacroBoundaries: number;
  packErrors: number;
  terminalBoundaries: number;
  macroNodes: number;
  quietRows: number;
  refusals: Record<RefusalReason, number>;
  refusedRuns: string[];
  terminalHistogram: Record<string, number>;
  perResult: Record<string, number>;
  perOpening: Record<string, number>;
  /** Rows per opening pool, so the stratum mix of a corpus is visible. */
  perPool: Record<string, number>;
}

export interface CorpusResult {
  rows: TexelRow[];
  counts: CorpusCounts;
  split: OpeningSplit | null;
  approval: SourceApproval;
  sources: ApprovedRun[];
}

export function buildCorpus(args: CorpusArgs): CorpusResult {
  assertFreshOutput(path.resolve(REPO_ROOT, args.out), REPO_ROOT);
  const approval = loadSourceApproval(REPO_ROOT, args.sourceAllowlist, args.sourceAllowlistSha256);
  const sources = preflightRuns(approval, args.runs);
  const config = resolveHardConfig('desktop');
  const weights = config.weights;
  assertCurrentWeights(weights);
  const rules = loadRefusalRules(REPO_ROOT, [...REFUSED_POOLS, ...args.refusePools]);

  const counts: CorpusCounts = {
    runs: [],
    games: 0,
    gamesUsed: 0,
    drawGames: 0,
    turnBoundaries: 0,
    nonMacroBoundaries: 0,
    packErrors: 0,
    terminalBoundaries: 0,
    macroNodes: 0,
    quietRows: 0,
    refusals: { pool: 0, id: 0, prefix: 0 },
    refusedRuns: [],
    terminalHistogram: {},
    perResult: { '1': 0, '0.5': 0, '0': 0 },
    perOpening: {},
    perPool: {},
  };
  const rows: TexelRow[] = [];

  for (const approved of sources) {
    const dir = path.resolve(REPO_ROOT, approved.path);
    const relDir = approved.path;
    const pool = DEV_POOL_PATH;
    const poolSha = approval.manifest.pool.sha256;
    const lines = readBoundText(approval, `${relDir}/games.jsonl`, approved.gamesSha256).split('\n').filter(l => l.trim() !== '');
    const info: RunInfo = { dir, relDir, pool, poolSha256: poolSha, games: lines.length, gamesWithReplay: 0 };
    counts.runs.push(info);
    counts.games += lines.length;

    for (const line of lines) {
      const game = JSON.parse(line) as GameLine;
      const refusal = refusalFor(game.opening, pool, rules);
      if (refusal !== null || !approved.openingIds.includes(game.opening) || game.rulesVersion !== 'muju-phasing-1')
        throw new Error('corpus: unapproved game opening/rules');
      if (game.replayPath === undefined) throw new Error('corpus: approved game must have a replay');
      const permitted = approved.replays.find(r => r.path === game.replayPath && r.opening === game.opening);
      if (!permitted) throw new Error('corpus: replay is not explicitly allowlisted');
      // Parse exactly the bytes whose hash was checked; loadReplay(path) would
      // reopen the path and lose that binding if another writer changed it.
      const replayFile = path.join(dir, permitted.path);
      const stored = JSON.parse(readBoundText(approval, `${relDir}/${permitted.path}`, permitted.sha256)) as StoredReplay;
      if (stored.schema !== REPLAY_SCHEMA || !Array.isArray(stored.steps) || stored.steps.length === 0 ||
        !stored.meta?.options || stored.meta.rulesVersion !== 'muju-phasing-1' || stored.opening?.id !== game.opening ||
        stored.meta.winner !== game.winner || stored.meta.winType !== game.winType)
        throw new Error('corpus: bound replay metadata disagrees with game/rules');
      const replay: LoadedReplay = { path: replayFile, fileId: path.basename(replayFile).replace(/\.json$/i, ''),
        stored, meta: stored.meta, options: stored.meta.options, opening: stored.opening, ruleset: 'phasing' };
      info.gamesWithReplay++;
      counts.gamesUsed++;
      if (game.winner === null) counts.drawGames++;
      counts.terminalHistogram[game.winType] = (counts.terminalHistogram[game.winType] ?? 0) + 1;

      const rec = reconstruct(replay);
      // `reconstruct` restores the SHIPPED rules on return (see `replay.ts`'s
      // "DO NOT NEST"), so the evaluation opens its own scope after it.
      withMatchRules(replay.options, () => {
        const rep = new Replica();
        const scratch = new Scratch(8, 8, 4, 4);
        const evaluator = new Evaluator(rep, weights);
        const f = new Int32Array(FEATURE_COUNT);
        for (const turn of rec.turns) {
          if (args.maxTurns !== null && turn.turnNumber > args.maxTurns) continue;
          counts.turnBoundaries++;
          let p: PackedState;
          try {
            p = rep.pack(turn.startState, allocState());
          } catch (error) {
            counts.packErrors++;
            throw new Error(`corpus: approved Phasing replay contains an unpackable position: ${String(error)}`);
          }
          if (p.result !== Result.ONGOING) {
            counts.terminalBoundaries++;
            continue;
          }
          if (p.phase !== 1 || p.upkeepPending !== 0 || p.actions !== ACTIONS_PER_TURN) {
            counts.nonMacroBoundaries++;
            continue;
          }
          counts.macroNodes++;
          const side = p.side as 0 | 1;
          evaluator.full(p, side, scratch, 0, f);
          const verdict = quietVerdict(p, evaluator.lastTables);
          if (!verdict.quiet) continue;
          const material = new Array<number>(NDEF).fill(0);
          for (let slot = 0; slot < p.sq.length; slot++) {
            if (p.sq[slot] === DEAD) continue;
            material[p.defId[slot]] += p.owner[slot] === side ? 1 : -1;
          }
          const result: RowResult = game.winner === null ? 0.5 : game.winner === turn.side ? 1 : 0;
          counts.perResult[String(result)]++;
          counts.perOpening[game.opening] = (counts.perOpening[game.opening] ?? 0) + 1;
          const poolKey = pool === null ? 'unknown' : path.basename(pool);
          counts.perPool[poolKey] = (counts.perPool[poolKey] ?? 0) + 1;
          counts.quietRows++;
          rows.push({
            schema: ROW_SCHEMA,
            featureSchema: PHASING_EVAL_SCHEMA,
            weightsVersion: WEIGHTS_VERSION,
            id: `${replay.fileId}-p${rows.length}`,
            result,
            side,
            turn: turn.turnNumber,
            features: Array.from(f),
            material,
            kpos: keyHex(p.kposHi, p.kposLo),
            opening: game.opening,
            pool: pool ?? 'unknown',
            handicap: game.handicap,
            game: replay.fileId,
            run: relDir,
            actions: p.actions,
            split: 'train',
          });
        }
      });
    }
  }

  let split: OpeningSplit | null = null;
  if (args.holdoutBy === 'opening') {
    split = splitOpenings(rows.map(r => r.opening), args.holdoutSeed, args.holdoutFraction);
    const heldout = new Set(split.heldout);
    for (const row of rows) row.split = heldout.has(row.opening) ? 'heldout' : 'train';
  }
  return { rows, counts, split, approval, sources };
}

export function writeCorpus(args: CorpusArgs, result: CorpusResult): { dir: string; manifest: Record<string, unknown> } {
  const outDir = path.resolve(REPO_ROOT, args.out);
  createFreshOutput(outDir, REPO_ROOT);
  const file = writeRows(outDir, result.rows);
  const config = resolveHardConfig('desktop');
  const counts = result.counts;
  const manifest: Record<string, unknown> = {
    schema: CORPUS_MANIFEST_SCHEMA,
    featureSchema: PHASING_EVAL_SCHEMA,
    featureCount: FEATURE_COUNT,
    weightsVersion: WEIGHTS_VERSION,
    rulesVersion: 'muju-phasing-1',
    pool: { path: DEV_POOL_PATH, sha256: result.approval.manifest.pool.sha256 },
    sourceAllowlistSha256: result.approval.sha256,
    sources: result.sources.map(r => ({ path: r.path, manifestSha256: r.manifestSha256, gamesSha256: r.gamesSha256 })),
    generatedAt: new Date().toISOString(),
    source: 'existing-ladder-replays',
    engineConfigHash: resolvedConfigHash('hard@desktop', { mode: 'wall', ms: 3000 }),
    weights: {
      label: config.weights.label,
      version: config.weights.version,
      featureSchema: config.weights.featureSchema,
      hash: configHashOf({ w: config.weights.w, material: config.weights.material, version: config.weights.version, label: config.weights.label }),
    },
    args: {
      runs: args.runs,
      maxTurns: args.maxTurns,
      holdoutBy: args.holdoutBy,
      holdoutSeed: args.holdoutSeed,
      holdoutFraction: args.holdoutFraction,
    },
    runs: counts.runs.map(r => ({ dir: r.relDir, pool: r.pool, poolSha256: r.poolSha256, games: r.games, gamesWithReplay: r.gamesWithReplay })),
    counts: {
      games: counts.games,
      gamesUsed: counts.gamesUsed,
      drawGames: counts.drawGames,
      turnBoundaries: counts.turnBoundaries,
      terminalBoundaries: counts.terminalBoundaries,
      nonMacroBoundaries: counts.nonMacroBoundaries,
      packErrors: counts.packErrors,
      macroNodes: counts.macroNodes,
      positions: result.rows.length,
    },
    drawShare: counts.gamesUsed === 0 ? 0 : counts.drawGames / counts.gamesUsed,
    quietShare: counts.macroNodes === 0 ? 0 : counts.quietRows / counts.macroNodes,
    perResult: counts.perResult,
    perPool: counts.perPool,
    terminalHistogram: counts.terminalHistogram,
    perOpening: counts.perOpening,
    openings: Object.keys(counts.perOpening).sort(),
    refusals: { ...counts.refusals, runs: counts.refusedRuns, rules: { pools: [...REFUSED_POOLS, ...args.refusePools], prefixes: [...REFUSED_ID_PREFIXES] } },
    split: result.split,
    positionsSha256: sha256File(file),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { dir: outDir, manifest };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = buildCorpus(args);
  const { dir, manifest } = writeCorpus(args, result);
  const c = result.counts;
  console.log(`corpus: ${result.rows.length} positions from ${c.gamesUsed} games in ${args.runs.length} run(s) -> ${path.relative(REPO_ROOT, dir)}`);
  console.log(`  turn boundaries ${c.turnBoundaries} (terminal ${c.terminalBoundaries}, non-macro ${c.nonMacroBoundaries}, pack errors ${c.packErrors}) -> macro nodes ${c.macroNodes}`);
  console.log(`  quiet share ${(manifest.quietShare as number).toFixed(4)}, draw share ${(manifest.drawShare as number).toFixed(4)}`);
  console.log(`  per result 1=${c.perResult['1']} 0.5=${c.perResult['0.5']} 0=${c.perResult['0']}`);
  console.log(`  refusals pool=${c.refusals.pool} id=${c.refusals.id} prefix=${c.refusals.prefix}`);
  console.log(`  rows per pool ${Object.entries(c.perPool).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  if (result.split !== null) {
    console.log(`  holdout by opening, seed ${result.split.seed}: ${result.split.train.length} train / ${result.split.heldout.length} heldout openings`);
  }
}

const INVOKED_DIRECTLY = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (INVOKED_DIRECTLY) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}

/**
 * `npm run hard:analyze -- --replay <file> [--engine hard@<label>]
 *  [--adviser-work <units>] [--production-work <units>] [--swing-cc <n>]
 *  [--side white|black] [--max-turns <n>] [--out <path>]`
 *
 * `npm run hard:analyze -- --run <dir> [--losses-only | --all] [...]`
 *
 * `npm run hard:analyze -- --reclassify <analysisDir|file> [--out <dir>]
 *  [--swing-cc <n>]`
 *
 * The replay analyst's tool for EPIC-PLAN §4 E1.1/E1.4. It rebuilds a recorded
 * game through the canonical engine, asks a deeper search what it would have
 * played on every turn of the `hard@` seat, and names the first turn where the
 * two disagree by more than a threshold — together with the reason the
 * production engine could not find the adviser's turn.
 *
 * RESOURCE. A single adviser search at the default rung is a multi-second
 * whole-turn search and the tool runs three of them per turn, so the process
 * holds one of `lab/hard-ai/ladder/heavy.ts`'s two global slots for the whole
 * analysis and waits for one if both are busy. `--no-heavy` is for the tests,
 * which stub the adviser and never do any real work.
 *
 * WRITES. Exactly two files per replay (`<out>.json`, `<out>.md`) plus, under
 * `--run`, `<dir>/analysis/summary.json` and `summary.md`. The run's own
 * `manifest.json`, `metrics.json`, `games.jsonl` and `replays/` are read-only
 * to this tool.
 *
 * `--reclassify` re-decides saved analyses under the current rules without
 * running a single search (see `./reclassify.ts`), needs no heavy slot, and
 * refuses to write into its own input directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { acquireHeavySlot } from '../ladder/heavy';
import { analyzeReplay, DEFAULT_SWING_CC, type AnalysisResult, type AnalyzeOptions, type LossClass } from './analyze';
import { defaultAdviserWork, resolveHardConfig } from './engine';
import { hardProfileOf, hardSeat, loadReplay, type LoadedReplay } from './replay';
import { histogram, renderMarkdown, renderSummaryMarkdown, type RunSummary } from './report';
import { reclassifyDirectory, reclassifyDirectoryWithRoot } from './reclassify';
import type { PlayerId } from '../../../src/game/types';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT_DIR = path.resolve(REPO_ROOT, 'lab/results/hard-ai-e1/analyze');

export interface Args {
  replay: string | null;
  run: string | null;
  reclassify: string | null;
  /** With `--reclassify`: re-run the production engine with the root instrument on. */
  rerunRoot: boolean;
  engine: string | null;
  adviserWork: number | null;
  productionWork: number | null;
  swingCc: number;
  side: PlayerId | null;
  maxTurns: number | null;
  out: string | null;
  lossesOnly: boolean;
  heavy: boolean;
  heavyTimeoutMin: number;
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    replay: null,
    run: null,
    reclassify: null,
    rerunRoot: false,
    engine: null,
    adviserWork: null,
    productionWork: null,
    swingCc: DEFAULT_SWING_CC,
    side: null,
    maxTurns: null,
    out: null,
    lossesOnly: true,
    heavy: true,
    heavyTimeoutMin: 30,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a}: missing value`);
      return v;
    };
    switch (a) {
      case '--replay': args.replay = next(); break;
      case '--run': args.run = next(); break;
      case '--reclassify': args.reclassify = next(); break;
      case '--rerun-root': args.rerunRoot = true; break;
      case '--engine': args.engine = next(); break;
      case '--adviser-work': args.adviserWork = positive(next(), a); break;
      case '--production-work': args.productionWork = positive(next(), a); break;
      case '--swing-cc': args.swingCc = positive(next(), a); break;
      case '--side': args.side = asSide(next()); break;
      case '--max-turns': args.maxTurns = positive(next(), a); break;
      case '--out': args.out = next(); break;
      case '--losses-only': args.lossesOnly = true; break;
      case '--all': args.lossesOnly = false; break;
      case '--no-heavy': args.heavy = false; break;
      case '--heavy-timeout-min': args.heavyTimeoutMin = positive(next(), a); break;
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  const modes = [args.replay, args.run, args.reclassify].filter(m => m !== null).length;
  if (modes !== 1) {
    throw new Error('exactly one of --replay <file>, --run <dir> or --reclassify <analysisDir|file> is required');
  }
  if (args.engine !== null && hardProfileOf(args.engine) === null) {
    throw new Error(`--engine must be hard@<label>, got ${args.engine}`);
  }
  return args;
}

function positive(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag}: expected a positive number, got ${value}`);
  return Math.floor(n);
}

function asSide(value: string): PlayerId {
  if (value !== 'white' && value !== 'black') throw new Error(`--side: expected white or black, got ${value}`);
  return value;
}

/** The adviser work the run will use, resolved before any search so it can be
 * printed and recorded. */
export function resolveAdviserWork(args: Pick<Args, 'engine' | 'adviserWork'>, seatBot: string): number {
  if (args.adviserWork !== null) return args.adviserWork;
  const label = args.engine ?? (hardProfileOf(seatBot) === null ? 'hard@desktop' : seatBot);
  const profile = hardProfileOf(label);
  if (profile === null) throw new Error(`cannot resolve a hard profile from ${label}`);
  return defaultAdviserWork(resolveHardConfig(profile));
}

function writeArtifacts(outBase: string, result: AnalysisResult): { json: string; md: string } {
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const json = `${outBase}.json`;
  const md = `${outBase}.md`;
  fs.writeFileSync(json, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(md, renderMarkdown(result));
  return { json, md };
}

export interface AnalyzeOneOptions extends AnalyzeOptions {
  /** Base path without extension; `.json` and `.md` are appended. */
  outBase?: string;
}

export async function analyzeOne(file: string, opts: AnalyzeOneOptions = {}): Promise<{ result: AnalysisResult; json: string | null; md: string | null }> {
  const replay = loadReplay(file);
  const result = await analyzeReplay(replay, opts);
  if (opts.outBase === undefined) return { result, json: null, md: null };
  const written = writeArtifacts(opts.outBase, result);
  return { result, ...written };
}

export interface RunOptions extends AnalyzeOptions {
  lossesOnly?: boolean;
  /** Override the output directory; defaults to `<dir>/analysis`. */
  outDir?: string;
}

/** Is this replay a loss for the seat the analysis would pick? */
function isLossForHardSeat(replay: LoadedReplay, side: PlayerId | undefined): { loss: boolean; side: PlayerId | null } {
  const seat = side ?? hardSeat(replay.meta);
  if (seat === null) return { loss: false, side: null };
  return { loss: replay.meta.winner !== null && replay.meta.winner !== seat, side: seat };
}

export async function analyzeRun(dir: string, opts: RunOptions = {}): Promise<RunSummary> {
  const startedAt = Date.now();
  const replaysDir = path.join(dir, 'replays');
  if (!fs.existsSync(replaysDir)) throw new Error(`--run: ${replaysDir} does not exist`);
  const outDir = opts.outDir ?? path.join(dir, 'analysis');
  const lossesOnly = opts.lossesOnly ?? true;
  const files = fs
    .readdirSync(replaysDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  const skipped: RunSummary['skipped'] = [];
  const failed: RunSummary['failed'] = [];
  const games: RunSummary['games'] = [];
  const firstClasses: LossClass[] = [];
  const largestClasses: LossClass[] = [];
  let adviserWork = opts.adviserWork ?? 0;

  for (const file of files) {
    const full = path.join(replaysDir, file);
    let replay: LoadedReplay;
    try {
      replay = loadReplay(full);
    } catch (err) {
      failed.push({ file, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const { loss, side } = isLossForHardSeat(replay, opts.side);
    if (side === null) {
      skipped.push({ file, reason: 'neither seat is a hard@* engine' });
      continue;
    }
    if (lossesOnly && !loss) {
      skipped.push({ file, reason: `not a loss for the ${side} hard@ seat (winner ${String(replay.meta.winner)})` });
      continue;
    }
    try {
      const result = await analyzeReplay(replay, { ...opts, side });
      adviserWork = result.config.adviserWork;
      writeArtifacts(path.join(outDir, replay.fileId), result);
      firstClasses.push(result.firstConsequential.klass);
      largestClasses.push(result.largestSwing.klass);
      const largestRow = result.turns.reduce<AnalysisResult['turns'][number] | null>((b, r) => (b === null || r.swingCc > b.swingCc ? r : b), null);
      games.push({
        fileId: result.fileId,
        side: result.side,
        result: result.outcome.sideResult,
        firstConsequential: { turn: result.firstConsequential.turn, klass: result.firstConsequential.klass },
        largestSwing: { turn: result.largestSwing.turn, klass: result.largestSwing.klass, swingCc: largestRow?.swingCc ?? null },
      });
    } catch (err) {
      failed.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const summary: RunSummary = {
    schema: 'muju-hard-analyze-summary-v1',
    dir: path.resolve(dir),
    lossesOnly,
    analysed: games.length,
    skipped,
    failed,
    adviserWork,
    swingCc: opts.swingCc ?? DEFAULT_SWING_CC,
    firstConsequentialHistogram: histogram(firstClasses),
    largestSwingHistogram: histogram(largestClasses),
    games,
    wallMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'summary.md'), renderSummaryMarkdown(summary));
  return summary;
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`hard:analyze: ${err instanceof Error ? err.message : String(err)}`);
    console.error('usage: npm run hard:analyze -- --replay <file> [--engine hard@<label>] [--adviser-work <units>] [--production-work <units>] [--swing-cc <n>] [--side white|black] [--max-turns <n>] [--out <path>]');
    console.error('       npm run hard:analyze -- --run <dir> [--losses-only | --all] [...]');
    console.error('       npm run hard:analyze -- --reclassify <analysisDir|file> [--rerun-root] [--out <dir>] [--swing-cc <n>]');
    process.exitCode = 2;
    return;
  }

  const shared: AnalyzeOptions = {
    engine: args.engine ?? undefined,
    adviserWork: args.adviserWork ?? undefined,
    productionWork: args.productionWork ?? undefined,
    swingCc: args.swingCc,
    side: args.side ?? undefined,
    maxTurns: args.maxTurns ?? undefined,
    onTurn: row =>
      console.error(
        `  turn ${row.turnNumber}: swing ${row.swingCc} cc (played ${row.playedDeepCc}, adviser ${row.adviserBestDeepCc})` +
          `, K=${row.cheap.count}${row.cheap.containsAdviserBest ? '' : ' adviser-best ABSENT'}${row.timing.overran ? ' OVERRAN' : ''}`,
      ),
  };

  if (args.reclassify !== null) {
    // Without `--rerun-root` there are no searches, so no heavy slot: this is
    // generation and arithmetic. With it there are up to two production
    // searches per game at the ladder rung, so it takes a slot like any search.
    const src = args.reclassify;
    const stat = fs.statSync(src);
    const srcDir = stat.isDirectory() ? src : path.dirname(src);
    const suffix = args.rerunRoot ? 'v3' : 'v2';
    const out = args.out ?? path.join(path.dirname(srcDir), `${path.basename(srcDir)}-${suffix}`);
    let summary;
    if (args.rerunRoot) {
      const release = args.heavy
        ? await acquireHeavySlot(`hard:analyze --reclassify --rerun-root ${src}`, { timeoutMs: args.heavyTimeoutMin * 60_000 })
        : (): void => {};
      try {
        summary = await reclassifyDirectoryWithRoot(src, {
          out,
          swingCc: args.swingCc,
          rerunRoot: true,
          onGame: (fileId, searches) => console.error(`  ${fileId}: ${searches} root search(es) with exposure`),
        });
      } finally {
        release();
      }
      console.log(`root searches: ${summary.rootSearches}`);
    } else {
      summary = reclassifyDirectory(src, { out, swingCc: args.swingCc });
    }
    console.log(`reclassified ${summary.reclassified} analysis file(s) without re-running any search`);
    console.log(`first-consequential before: ${JSON.stringify(summary.beforeFirstHistogram)}`);
    console.log(`first-consequential after : ${JSON.stringify(summary.afterFirstHistogram)}`);
    if (summary.reconstruction !== null) {
      const r = summary.reconstruction;
      console.log(`reconstruction: ${r.reconstructs}/${r.total} replays rebuild; ${r.fails.length} still fail; ${r.missingArtifact.length} rebuild but have no saved analysis`);
    }
    for (const f of summary.failed) console.error(`  failed: ${f.file}: ${f.error}`);
    console.log(`wrote ${path.join(out, 'summary.json')}`);
    return;
  }

  const release = args.heavy
    ? await acquireHeavySlot(`hard:analyze ${args.replay ?? args.run ?? ''}`, { timeoutMs: args.heavyTimeoutMin * 60_000 })
    : (): void => {};
  try {
    if (args.replay !== null) {
      const replay = loadReplay(args.replay);
      const work = resolveAdviserWork(args, replay.meta.players[args.side ?? hardSeat(replay.meta) ?? 'white'].bot);
      console.error(`hard:analyze: ${replay.fileId} — adviser at ${work.toLocaleString('en-US')} work units, swing threshold ${args.swingCc} cc`);
      const outBase = args.out ?? path.join(DEFAULT_OUT_DIR, replay.fileId);
      const { result, json, md } = await analyzeOne(args.replay, { ...shared, outBase: outBase.replace(/\.(json|md)$/i, '') });
      console.log(`first consequential decision: ${result.firstConsequential.klass} at turn ${result.firstConsequential.turn ?? '(none)'}`);
      console.log(`largest swing: ${result.largestSwing.klass} at turn ${result.largestSwing.turn ?? '(none)'}`);
      console.log(`wrote ${json}\nwrote ${md}`);
    } else {
      const dir = args.run as string;
      const summary = await analyzeRun(dir, { ...shared, lossesOnly: args.lossesOnly, outDir: args.out ?? undefined });
      console.log(`analysed ${summary.analysed} replay(s); first-consequential histogram: ${JSON.stringify(summary.firstConsequentialHistogram)}`);
      console.log(`wrote ${path.join(args.out ?? path.join(dir, 'analysis'), 'summary.json')}`);
    }
  } finally {
    release();
  }
}

const INVOKED_DIRECTLY = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (INVOKED_DIRECTLY) {
  void main().catch((err: unknown) => {
    console.error(`hard:analyze: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}

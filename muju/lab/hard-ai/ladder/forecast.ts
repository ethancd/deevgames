/**
 * `node --import tsx lab/hard-ai/ladder/forecast.ts --run <pilot-run-dir>
 *   --pairs <per-handicap> [--workers <n>] [--overhead <s>] [--out <file>]`
 *
 * Turns a COMPLETED pilot run into the campaign runtime estimate EPIC-PLAN §6
 * asks for before a campaign is launched:
 *
 *     2 × pairs × meanGameSeconds / concurrentGameWorkers, plus measured overhead
 *
 * computed separately per handicap and reported twice — once with the pilot's
 * MEAN game (typical) and once with its p90 game (slow), because a campaign
 * sized on the mean alone under-books the tail. `--pairs` is pairs PER HANDICAP,
 * matching §6's worked example: "at 50 pairs per handicap for two handicaps,
 * that is 200 games, not 100".
 *
 * Inputs are the ladder run's own artifacts: `games.jsonl` (one `GameRecord`
 * per game — `durationMs` is the game's wall clock and `options.blackCrystalHandicap`
 * its handicap) and `manifest.json` (engines, work spec, shard count,
 * `finishedAt`).
 *
 * MEASURED OVERHEAD. Everything the pilot's wall clock spent outside game play:
 * shard merge, metrics, and whatever slack sat between games, spread over the
 * pilot's games. It is derived from `manifest.finishedAt − earliest game
 * startedAt` minus the play time the pilot's own shard count could have
 * absorbed, and is therefore a LOWER bound: the clock starts at the first
 * recorded game, so process startup, table build and WASM instantiation before
 * it are not in there. `lab/hard-ai/bench/probe.ts` measures that cold cost
 * directly; pass it in with `--overhead <seconds-per-game>` when you have it.
 *
 * `finishedAt`, NOT `at`. `ladder/run.ts` writes `manifest.at` BEFORE the first
 * game (the manifest lands with `status: "running"` so the artifacts survive a
 * crash) and stamps `finishedAt` when the run ends. Reading the run's end off
 * `at` therefore measured a NEGATIVE residual on every real run and reported
 * `overheadSource: "unavailable"`, which booked zero overhead — the E0 pilot's
 * two forecasts both did (E0-PILOT-REPORT §7 P3).
 *
 * `--workers` defaults to the heavy queue's slot count (`heavy.ts`, normally 2),
 * because that is how many game processes this machine will actually run at once.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameRecord } from '../../harness/types';
import { slotCount } from './heavy';

/**
 * The only fields a forecast reads off a `GameRecord`. Narrowed so a unit test
 * can hand it synthetic rows without fabricating a hundred unrelated fields;
 * a real `GameRecord` satisfies it structurally.
 */
export interface ForecastGame {
  startedAt: string;
  /** Whole-game wall clock. */
  durationMs: number;
  /** v3 records carry it here... */
  handicap?: number;
  /** ...v2 records only in the match options. */
  options?: { blackCrystalHandicap?: number };
}

export interface PilotManifest {
  a?: string;
  b?: string;
  work?: string;
  shards?: number;
  handicaps?: number[];
  /** When the run STARTED: written before the first game, so it is not an end time. */
  at?: string;
  /** When the run ENDED; the only timestamp an overhead estimate may measure against. */
  finishedAt?: string | null;
  device?: string;
  git?: string | null;
}

export interface HandicapForecast {
  handicap: number;
  /** Games of this handicap found in the pilot. */
  pilotGames: number;
  meanGameSeconds: number;
  medianGameSeconds: number;
  /** Nearest-rank p90 (index `ceil(0.9 n) − 1` of the sorted list). */
  p90GameSeconds: number;
  maxGameSeconds: number;
  /** `2 × pairs` — the campaign's games at this handicap. */
  plannedGames: number;
  /** `2 × pairs × meanGameSeconds / workers + overheadSecondsPerGame × 2 × pairs / workers`. */
  typicalSeconds: number;
  /** Same with the p90 game in place of the mean. */
  slowSeconds: number;
}

export interface CampaignForecast {
  run: string;
  a: string;
  b: string;
  work: string;
  device: string;
  git: string | null;
  pilotShards: number;
  pilotGames: number;
  /** Pairs PER HANDICAP planned for the campaign. */
  pairsPerHandicap: number;
  workers: number;
  overheadSecondsPerGame: number;
  overheadSource: 'measured' | 'override' | 'unavailable';
  handicaps: HandicapForecast[];
  totalPlannedGames: number;
  totalTypicalSeconds: number;
  totalSlowSeconds: number;
  formula: string;
  at: string;
}

export interface ForecastOptions {
  pairsPerHandicap: number;
  workers?: number;
  /** Seconds of non-play overhead per game; overrides the value derived from the pilot. */
  overheadSecondsPerGame?: number;
}

export function readJsonl<T>(filePath: string): T[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l) as T);
}

/** The handicap a record was played at, tolerating the pre-v3 shape that only carried it in `options`. */
export function handicapOf(rec: ForecastGame): number {
  return rec.handicap ?? rec.options?.blackCrystalHandicap ?? 0;
}

/** Nearest-rank percentile of an unsorted list of seconds. Empty list is 0. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Wall clock the pilot spent outside game play, per game. Returns `null` when
 * the artifacts cannot support the estimate (no `manifest.finishedAt` — an
 * unfinished or pre-E0 run — no game `startedAt`, or a negative residual, which
 * means the pilot's shards overlapped differently than the manifest claims).
 *
 * The end of the run is `finishedAt`. `at` is the run's START (see the module
 * header) and measuring against it always under-reports, usually into a
 * negative residual and an `unavailable` overhead.
 */
export function measuredOverheadPerGame(games: readonly ForecastGame[], manifest: PilotManifest): number | null {
  if (games.length === 0 || !manifest.finishedAt) return null;
  const starts = games.map(g => Date.parse(g.startedAt)).filter(t => !Number.isNaN(t));
  const end = Date.parse(manifest.finishedAt);
  if (starts.length === 0 || Number.isNaN(end)) return null;
  const runWallSeconds = (end - Math.min(...starts)) / 1000;
  const shards = Math.max(1, manifest.shards ?? 1);
  const playSeconds = games.reduce((sum, g) => sum + g.durationMs / 1000, 0) / shards;
  const residual = runWallSeconds - playSeconds;
  if (!Number.isFinite(residual) || residual < 0) return null;
  return residual / games.length;
}

export function forecastCampaign(
  games: readonly ForecastGame[],
  manifest: PilotManifest,
  opts: ForecastOptions,
  runLabel = '',
): CampaignForecast {
  if (!Number.isInteger(opts.pairsPerHandicap) || opts.pairsPerHandicap <= 0) {
    throw new Error(`forecast: --pairs must be a positive integer, got ${opts.pairsPerHandicap}`);
  }
  const workers = opts.workers ?? slotCount();
  if (!Number.isInteger(workers) || workers <= 0) throw new Error(`forecast: --workers must be a positive integer, got ${workers}`);
  if (games.length === 0) throw new Error('forecast: the pilot run has no games; cannot estimate a campaign from nothing');

  const derived = measuredOverheadPerGame(games, manifest);
  const overhead = opts.overheadSecondsPerGame ?? derived ?? 0;
  const overheadSource: CampaignForecast['overheadSource'] =
    opts.overheadSecondsPerGame !== undefined ? 'override' : derived === null ? 'unavailable' : 'measured';

  const byHandicap = new Map<number, number[]>();
  for (const rec of games) {
    const h = handicapOf(rec);
    const list = byHandicap.get(h) ?? [];
    list.push(rec.durationMs / 1000);
    byHandicap.set(h, list);
  }

  const plannedGames = 2 * opts.pairsPerHandicap;
  const handicaps: HandicapForecast[] = [...byHandicap.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([handicap, seconds]) => {
      const m = mean(seconds);
      const p90 = percentile(seconds, 0.9);
      return {
        handicap,
        pilotGames: seconds.length,
        meanGameSeconds: m,
        medianGameSeconds: percentile(seconds, 0.5),
        p90GameSeconds: p90,
        maxGameSeconds: Math.max(...seconds),
        plannedGames,
        typicalSeconds: (plannedGames * m) / workers + (overhead * plannedGames) / workers,
        slowSeconds: (plannedGames * p90) / workers + (overhead * plannedGames) / workers,
      };
    });

  return {
    run: runLabel,
    a: manifest.a ?? 'unknown',
    b: manifest.b ?? 'unknown',
    work: manifest.work ?? 'unknown',
    device: manifest.device ?? 'unknown',
    git: manifest.git ?? null,
    pilotShards: Math.max(1, manifest.shards ?? 1),
    pilotGames: games.length,
    pairsPerHandicap: opts.pairsPerHandicap,
    workers,
    overheadSecondsPerGame: overhead,
    overheadSource,
    handicaps,
    totalPlannedGames: plannedGames * handicaps.length,
    totalTypicalSeconds: handicaps.reduce((s, h) => s + h.typicalSeconds, 0),
    totalSlowSeconds: handicaps.reduce((s, h) => s + h.slowSeconds, 0),
    formula: '2 x pairs x meanGameSeconds / workers + overhead x games / workers (EPIC-PLAN 2026-09-16 section 6)',
    at: new Date().toISOString(),
  };
}

/** Reads `<dir>/games.jsonl` and `<dir>/manifest.json` and forecasts from them. */
export function forecastRun(dir: string, opts: ForecastOptions): CampaignForecast {
  const gamesPath = path.join(dir, 'games.jsonl');
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(gamesPath)) throw new Error(`forecast: no games.jsonl in ${dir} (is this a completed ladder run?)`);
  const games = readJsonl<GameRecord>(gamesPath);
  const manifest: PilotManifest = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PilotManifest)
    : {};
  return forecastCampaign(games, manifest, opts, dir);
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(2)}h`;
}

export function formatTable(f: CampaignForecast): string {
  const lines = [
    `campaign forecast: ${f.a} vs ${f.b} at ${f.work}`,
    `pilot: ${f.pilotGames} games, ${f.pilotShards} shard(s), ${f.run || 'inline'}`,
    `plan: ${f.pairsPerHandicap} pairs per handicap on ${f.workers} concurrent game worker(s) = ${f.totalPlannedGames} games`,
    `overhead: ${f.overheadSecondsPerGame.toFixed(2)}s per game (${f.overheadSource})`,
    '',
    'handicap | pilot games | mean game | p90 game | typical campaign | slow campaign',
    '-------- | ----------- | --------- | -------- | ---------------- | -------------',
  ];
  for (const h of f.handicaps) {
    lines.push(
      [
        String(h.handicap).padStart(8),
        String(h.pilotGames).padStart(11),
        formatDuration(h.meanGameSeconds).padStart(9),
        formatDuration(h.p90GameSeconds).padStart(8),
        formatDuration(h.typicalSeconds).padStart(16),
        formatDuration(h.slowSeconds).padStart(13),
      ].join(' | '),
    );
  }
  lines.push('');
  lines.push(`total: typical ${formatDuration(f.totalTypicalSeconds)}, slow ${formatDuration(f.totalSlowSeconds)}`);
  lines.push(`formula: ${f.formula}`);
  return lines.join('\n');
}

function parseArgs(argv: string[]): { run: string; opts: ForecastOptions; out: string | null } {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
  };
  const run = get('--run');
  const pairs = get('--pairs');
  if (run === null || pairs === null) {
    throw new Error('usage: forecast.ts --run <dir> --pairs <per-handicap> [--workers <n>] [--overhead <seconds-per-game>] [--out <file>]');
  }
  const workers = get('--workers');
  const overhead = get('--overhead');
  return {
    run,
    opts: {
      pairsPerHandicap: Number(pairs),
      workers: workers === null ? undefined : Number(workers),
      overheadSecondsPerGame: overhead === null ? undefined : Number(overhead),
    },
    out: get('--out'),
  };
}

function cli(argv: string[]): void {
  const { run, opts, out } = parseArgs(argv);
  const f = forecastRun(run, opts);
  console.log(formatTable(f));
  console.log('');
  console.log(JSON.stringify(f, null, 2));
  if (out !== null) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), JSON.stringify(f, null, 2) + '\n');
  }
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    console.error(`forecast: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

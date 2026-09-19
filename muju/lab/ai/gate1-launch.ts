/**
 * Prints (and, with `--exec`, starts) the shard commands for a Gate 1 full row.
 *
 * From muju/:
 *   node --import tsx lab/ai/gate1-launch.ts --shards 8 --calibration C/calibration.json --out DIR
 *   node --import tsx lab/ai/gate1-launch.ts --shards 8 … --exec      # actually start them
 *
 * HOW THIS COOPERATES WITH THE SHARED QUEUE. `lab/hard-ai/ladder/heavy.ts` caps
 * heavy processes across every worktree on this machine at `slotCount()`
 * (`MUJU_HEAVY_SLOTS`, default 2) by exclusive-create slot files in `heavyDir()`.
 * Its rule is that the LEAF that burns CPU holds the slot and "an orchestrator
 * that only spawns children must NOT hold one, or a run with more shards than
 * slots would deadlock against itself". So this launcher takes no slot: each
 * `gate1.ts --shard i/n` process acquires one for itself and waits its turn,
 * with a 24-hour acquire timeout (`SHARD_SLOT_TIMEOUT_MS`) because the default
 * 30 minutes would kill every shard queued behind the first wave.
 *
 * EXPECTED WALL TIME. Let
 *
 *   G  = games in the row (768 for a full row)
 *   t  = mean wall-clock seconds per game on this machine
 *   n  = shards, S = free heavy slots (`slotCount()`)
 *   g_i= games in shard i (this script prints the exact split)
 *
 * a shard costs `g_i · t`, at most `S` shards run at once, so the shards run in
 * `ceil(n / S)` waves and
 *
 *   wall ≈ ceil(n / S) · max_i(g_i) · t      and never less than  G · t / S.
 *
 * Throughput is therefore set by S, not by n: with S = 2, eight shards finish in
 * about the same wall time as two. What more shards buy is RESTART GRANULARITY —
 * a failure costs one shard's games, not the row — and they cost nothing, since
 * a re-run shard resumes from its own verified file. Pick n as a multiple of S
 * so the last wave is full.
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { formatStatus, heavyDir, slotCount } from '../hard-ai/ladder/heavy';
import { scheduleOpenings, loadGate1Book } from './gate1-openings';
import { schedule, type Mode } from './gate1-report';
import { parseShardSpec, shardStem, tasksForShard, type ShardSpec } from './gate1-shard';

/** 768 games in about fifteen hours, the sequential figure the review quoted. */
export const DEFAULT_GAME_SECONDS = 70;
const RUNNER = 'lab/ai/gate1.ts';

export interface LaunchOptions {
  shards: number;
  mode: Mode;
  out: string;
  calibration: string;
  gameSeconds: number;
  exec: boolean;
  acceptLoadedCalibration: boolean;
}

export function parseArgs(args: string[]): LaunchOptions {
  const options: LaunchOptions = { shards: 0, mode: 'full', out: '', calibration: '',
    gameSeconds: DEFAULT_GAME_SECONDS, exec: false, acceptLoadedCalibration: false };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Repeated option ${flag}`);
    seen.add(flag);
    const value = () => {
      const v = args[++i];
      if (!v || v.startsWith('--')) throw new Error(`${flag} requires a value`);
      return v;
    };
    if (flag === '--shards') options.shards = parseShardSpec(`1/${value()}`).count;
    else if (flag === '--out') options.out = value();
    else if (flag === '--calibration') options.calibration = value();
    else if (flag === '--game-seconds') {
      const seconds = Number(value());
      if (!(seconds > 0)) throw new Error('--game-seconds requires a positive number');
      options.gameSeconds = seconds;
    } else if (flag === '--mode') {
      const mode = value();
      if (mode !== 'pilot' && mode !== 'full') throw new Error('--mode must be pilot or full');
      options.mode = mode;
    } else if (flag === '--exec') options.exec = true;
    else if (flag === '--accept-loaded-calibration') options.acceptLoadedCalibration = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.shards) throw new Error('Provide --shards <n>');
  if (!options.out) throw new Error('Provide --out <directory>');
  if (!options.calibration) throw new Error('Provide --calibration <calibration.json>');
  return options;
}

export function shardCommand(shard: ShardSpec, options: LaunchOptions): string[] {
  return ['--import', 'tsx', RUNNER, '--mode', options.mode, '--shard', `${shard.index}/${shard.count}`,
    '--calibration', options.calibration, '--out', options.out,
    ...(options.acceptLoadedCalibration ? ['--accept-loaded-calibration'] : [])];
}

/** The split, the commands and the arithmetic, with nothing hidden in a comment. */
export function launchPlan(options: LaunchOptions) {
  const book = loadGate1Book();
  const tasks = schedule(options.mode, scheduleOpenings(book));
  const shards = Array.from({ length: options.shards }, (_, i) => ({ index: i + 1, count: options.shards }));
  const split = shards.map(shard => ({ shard: shardStem(shard), games: tasksForShard(tasks, shard).length,
    command: `node ${shardCommand(shard, options).join(' ')}` }));
  const slots = slotCount();
  const largest = Math.max(...split.map(s => s.games));
  const waves = Math.ceil(options.shards / slots);
  const hours = (seconds: number) => Number((seconds / 3600).toFixed(2));
  return {
    mode: options.mode, games: tasks.length, shards: options.shards,
    queue: { directory: heavyDir(), slots, status: formatStatus() },
    split,
    wallTime: {
      assumedSecondsPerGame: options.gameSeconds,
      formula: 'wall ~= ceil(shards / slots) * max(games per shard) * seconds per game, and never below ' +
        'games * seconds per game / slots',
      sequentialHours: hours(tasks.length * options.gameSeconds),
      estimatedHours: hours(waves * largest * options.gameSeconds),
      floorHours: hours(tasks.length * options.gameSeconds / slots),
      waves,
      note: `Throughput is capped by the ${slots} shared heavy slots, not by the shard count. More shards buy ` +
        'restart granularity: a re-run shard resumes from its own verified file and replays nothing.',
    },
    merge: `node --import tsx ${RUNNER} --merge ${options.out} --mode ${options.mode}`,
  };
}

export async function main(args: string[]) {
  const options = parseArgs(args);
  const plan = launchPlan(options);
  console.log(JSON.stringify(plan, null, 2));
  if (!options.exec) {
    console.error('gate1-launch: printed only. Re-run with --exec to start the shards.');
    return;
  }
  // No heavy slot is taken here: the orchestrator must not hold one (heavy.ts).
  const children = plan.split.map((_, i) => {
    const shard = { index: i + 1, count: options.shards };
    const child = spawn(process.execPath, shardCommand(shard, options), { stdio: 'inherit', detached: false });
    return new Promise<void>((resolve, reject) => {
      child.on('exit', code => code === 0 ? resolve()
        : reject(new Error(`${shardStem(shard)} exited with code ${code}`)));
      child.on('error', reject);
    });
  });
  const results = await Promise.allSettled(children);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    // Deliberately not automatic: a failed shard is re-run by hand, after its
    // failure is understood, and the merge refuses an incomplete row anyway.
    throw new Error(`${failed.length} shard(s) failed; re-run those shard commands (they resume), then:\n${plan.merge}`);
  }
  console.log(`gate1-launch: every shard finished. Now run:\n${plan.merge}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
}

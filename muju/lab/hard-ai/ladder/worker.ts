/**
 * `node --import tsx lab/hard-ai/ladder/worker.ts --a <engine> --b <engine>
 *   --work fixed:<units>|wall:<ms> --handicaps <csv> --seed <n> --pairs <n>
 *   --shard-index <i> --shard-count <k> --legality as-shipped|strict --out <dir>`
 *
 * One shard of a ladder run (DESIGN §7.7): owns a contiguous slice of pair
 * indices (`pairing.ts#shardRange`) and plays them sequentially — games
 * inside a process must run sequentially because `setUpkeepVariant`,
 * `setElementGraph`, `setCombatHandicap` are module globals (`runner.ts`).
 * Writes its own `games-<i>.jsonl`, `pairs-<i>.jsonl` and `failures-<i>.jsonl`
 * under `--out` (`run.ts` merges every shard's files).
 *
 * Everything a shard needs beyond the argv `shard.ts` forwards — the openings,
 * whether to record replays and where, and which pairs a `--resume` has
 * already completed — is read from `<out>/shard-config.json`, written by
 * `run.ts` before it spawns the shards (`ShardConfig` below). Running this
 * file by hand without that sidecar plays the whole shard from the canonical
 * initial position with replays on.
 *
 * A game whose bot throws is CAUGHT (EPIC-PLAN E0.4): the failure is recorded
 * as a row in `failures-<i>.jsonl` and the shard carries on with the next
 * pair, so one broken game can never discard the completed games of this shard
 * or of any other. A pair only gets a `PairRow` when BOTH of its games
 * finished; an incomplete pair is simply replayed by the next `--resume`.
 *
 * ROWS ARE DURABLE THE MOMENT THEY EXIST. Every row is appended with a
 * SYNCHRONOUS `fs.writeSync`, not a `WriteStream`: the play loop awaits
 * synchronous bots, so it drains only microtasks and libuv never gets a
 * poll-phase turn to flush a stream until the loop ends. Buffered that way a
 * shard that is SIGKILLed, OOM-killed or Ctrl-C'd would lose every game it had
 * finished, and `--resume` and the "artifacts survive failure" claim both
 * depend on the opposite. One `writeSync` per game is negligible next to the
 * game itself.
 *
 * EARLY STOP. Before every pair the shard checks for `sprt-stop.json` in its
 * `--out` directory, which `run.ts` writes when the run's sequential SPRT has
 * crossed a bound. It stops launching new pairs and exits normally, with
 * `stoppedForSprt` on its status; a pair already under way is finished first,
 * so both orientations of every started pair are always on disk.
 *
 * PROGRESS IS VISIBLE FROM OUTSIDE. The shard keeps `status-<i>.json` up to
 * date (pid, counts, and `done` once it has written its last row), replacing it
 * atomically via a temp file + rename. `run.ts` reads it to tell a shard that
 * is still working from one that died, so a dead shard no longer makes it merge
 * its siblings' files while they are still being written.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playGame } from '../../harness/runner';
import type { GameRecord, MatchOptions } from '../../harness/types';
import { DEFAULT_MATCH_OPTIONS } from '../../harness/types';
import { buildPairs, expandPair, shardRange, gameScoreFor, pairScore, type GameSpec, type Orientation } from './pairing';
import { resolveEngine, parseWorkSpec, workKey, type WorkSpec } from './engines';
import { HARD_DIVERGENCE_ANOMALY, hardBotDivergences, hardBotTiming, type HardBotTiming } from '../bots/hard';
import { INITIAL_OPENING, type OpeningSpec } from './openings';
import { applyLadderOpening } from './ruleset';
import { fallbackCountsDelta, ladderFallbackCounts, type FallbackCounts } from './fallbacks';

/** Name of the sidecar `run.ts` drops in the shards directory (see the module doc). */
export const SHARD_CONFIG_FILE = 'shard-config.json';

/**
 * Name of the second sidecar, written by `run.ts` when the sequential SPRT has
 * decided: every shard stops LAUNCHING pairs once it exists. A shard that is
 * already inside a pair finishes it, so both orientations of every pair that
 * was started are always recorded (an unmirrored pair would bias the
 * pentanomial score).
 */
export const SPRT_STOP_FILE = 'sprt-stop.json';

/** What `run.ts` writes into `SPRT_STOP_FILE`; read back into the manifest. */
export interface SprtStopSignal {
  decision: 'H0' | 'H1';
  /** Pair count (in pairIndex order) at which the sequential test crossed a bound. */
  decidedAtPair: number;
  minPairs: number;
  at: string;
}

/** True once `run.ts` has signalled that the sequential SPRT decided. */
export function sprtStopRequested(shardsDir: string): boolean {
  return fs.existsSync(path.join(shardsDir, SPRT_STOP_FILE));
}

export interface ShardConfig {
  /** Openings in schedule order; `pairing.ts#buildPairs` cycles their ids. */
  openings: OpeningSpec[];
  /** Write a replay JSON per game. */
  replays: boolean;
  /** Absolute directory replays are written to (`<run out>/replays`). */
  replaysDir: string;
  /** `pairId`s a previous run already completed; this shard skips them. */
  completedPairIds: string[];
}

interface WorkerArgs {
  a: string;
  b: string;
  work: WorkSpec;
  handicaps: number[];
  seed: number;
  pairs: number;
  shardIndex: number;
  shardCount: number;
  legality: 'as-shipped' | 'strict';
  out: string;
}

function parseArgs(argv: string[]): WorkerArgs {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) throw new Error(`ladder/worker: missing ${flag}`);
    return argv[i + 1];
  };
  return {
    a: get('--a'),
    b: get('--b'),
    work: parseWorkSpec(get('--work')),
    handicaps: get('--handicaps').split(',').map(Number),
    seed: Number(get('--seed')),
    pairs: Number(get('--pairs')),
    shardIndex: Number(get('--shard-index')),
    shardCount: Number(get('--shard-count')),
    legality: (argv.includes('--legality') ? get('--legality') : 'as-shipped') as 'as-shipped' | 'strict',
    out: get('--out'),
  };
}

export function defaultShardConfig(outDir: string): ShardConfig {
  return { openings: [INITIAL_OPENING], replays: true, replaysDir: path.join(outDir, 'replays'), completedPairIds: [] };
}

export function readShardConfig(outDir: string): ShardConfig {
  const p = path.join(outDir, SHARD_CONFIG_FILE);
  if (!fs.existsSync(p)) return defaultShardConfig(outDir);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ShardConfig;
}

/** One `games.jsonl` row: the harness record plus the identity the run schedule gave the game. */
export interface GameRow extends GameRecord {
  /** `"<openingId>:<handicap>:<pairIndex>"` — `pairing.ts#pairIdFor`. */
  pairId: string;
  orientation: Orientation;
  /** Opening id this game started from (`'initial'` for the canonical position). */
  opening: string;
  /** Relative path of this game's replay under the run's `--out`, when replays are on. */
  replayPath?: string;
  /**
   * `os.loadavg()[0]` — the box's 1-minute load average — sampled immediately
   * before this game's first turn and immediately after its last (critique C8
   * and C13, `docs/hard-ai/e3/E3.2-ROW-REPORT.md` §5).
   *
   * Within-row fairness never depended on this: both seats play in one process
   * under one clock, so load lowers both alike. What it buys is the comparison
   * ACROSS rows — a rung distribution or a units/ms column from a row that ran
   * beside two other wall-clock rows is not the same measurement as one from an
   * idle box, and until now `manifest.loadavg` recorded the load at the run's
   * START only, one sample for a run of hours.
   *
   * Both fields are OPTIONAL and additive: a row written before this landed
   * carries neither, and `computeMetrics` reports `loadAvgMean: null` for such
   * a run rather than a 0 that would read as an idle box.
   */
  loadAvgStart?: number;
  loadAvgEnd?: number;
  /**
   * The six ENGINE FALLBACK counts for this game (Gate 0 item 6 of
   * `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`; see
   * `ladder/fallbacks.ts` for where each one comes from). A fallback means the
   * game was partly V2 vs V2, so any non-zero field voids the row —
   * `computeMetrics` sums them and `summary.md` prints them.
   *
   * OPTIONAL and additive, like `loadAvgStart`: a row written before this
   * landed carries none, and the run then reports `fallbacksRecorded: false`
   * rather than six zeros it cannot vouch for.
   */
  fallbacks?: FallbackCounts;
}

export interface PairRow {
  pairIndex: number;
  /** `"<openingId>:<handicap>:<pairIndex>"`; the only identity metrics/resume key on. */
  pairId: string;
  opening: string;
  seed: number;
  handicap: number;
  scoreA: number; // pairScore, A's perspective, ∈ {0, 0.5, 1, 1.5, 2}
  aWhiteWinType: string;
  bWhiteWinType: string;
}

/** One `failures.jsonl` row: a game that threw instead of finishing. */
export interface FailureRow {
  pairId: string;
  orientation: Orientation;
  opening: string;
  handicap: number;
  seed: number;
  shardIndex: number;
  error: string;
  /** Tail of the stack trace, capped so one broken game cannot bloat the artifact. */
  stackTail: string;
  at: string;
}

/**
 * `<pairId>-<orientation>.json`, the per-game replay filename (EPIC-PLAN E0.4),
 * with the `pairId`'s `:` separators rewritten to `_`. `:` is not a portable
 * filename character (Windows and SMB reject it, Finder shows it as `/`) and an
 * evidence directory is the artifact most likely to be zipped and passed
 * around. The true `pairId` is unchanged inside the replay JSON and in the game
 * row's `replayPath`; the rewrite is injective because a `pairId`'s last two
 * fields are always integers and an opening id may not contain `:`.
 */
export function replayFileName(pairId: string, orientation: Orientation): string {
  return `${pairId.replace(/:/g, '_')}-${orientation}.json`;
}

/**
 * One shard's row file. Synchronous by design — see the module doc: a row that
 * is only in a stream's buffer is lost when the shard is killed, which is the
 * one failure this file is supposed to survive.
 */
class JsonlSink {
  private readonly fd: number;
  private rows = 0;

  constructor(filePath: string) {
    this.fd = fs.openSync(filePath, 'w');
  }

  write(row: unknown): void {
    fs.writeSync(this.fd, JSON.stringify(row) + '\n');
    this.rows++;
  }

  get count(): number {
    return this.rows;
  }

  close(): void {
    fs.closeSync(this.fd);
  }
}

/** What `status-<i>.json` says about a shard; `run.ts` polls it to tell "still working" from "died". */
export interface ShardStatus {
  shardIndex: number;
  /** OS pid of the shard process, so a reader can ask whether it is still alive. */
  pid: number;
  startedAt: string;
  /** True once the shard has written every row it will ever write. */
  done: boolean;
  /** True when the shard stopped early because the sequential SPRT decided (`SPRT_STOP_FILE`). */
  stoppedForSprt?: boolean;
  /** Pairs this shard set out to play (after `--resume` skipping). */
  pairsPlanned: number;
  pairsCompleted: number;
  games: number;
  failures: number;
  finishedAt: string | null;
}

export function shardStatusPath(shardsDir: string, shardIndex: number): string {
  return path.join(shardsDir, `status-${shardIndex}.json`);
}

/** Reads a shard's status, or null when it has not written one (or is mid-rename). */
export function readShardStatus(shardsDir: string, shardIndex: number): ShardStatus | null {
  const p = shardStatusPath(shardsDir, shardIndex);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as ShardStatus;
  } catch {
    return null;
  }
}

/** Replaces the status file atomically, so a concurrent reader never sees half a document. */
export function writeShardStatus(shardsDir: string, status: ShardStatus): void {
  const target = shardStatusPath(shardsDir, status.shardIndex);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(status) + '\n');
  fs.renameSync(tmp, target);
}

/**
 * This game's share of the process-wide hard-bot counters. Games run
 * sequentially inside a shard, so the difference over one game belongs to that
 * game — the same snapshot-and-subtract the divergence count uses.
 *
 * `maxTurnMs` is the one field that is not a sum: it is a high-water mark, so
 * subtracting would be meaningless. It is reported as this game's worst turn
 * only when that turn beat every earlier turn in the process, and 0 otherwise
 * ("no turn here beat the mark"). The per-turn truth a metric should use is
 * `PlayerGameStats.turnMs`, which is per game and per seat by construction.
 */
export function hardTimingDelta(before: HardBotTiming, after: HardBotTiming): HardBotTiming {
  return {
    turns: after.turns - before.turns,
    searches: after.searches - before.searches,
    reSearches: after.reSearches - before.reSearches,
    totalSearchMs: after.totalSearchMs - before.totalSearchMs,
    totalAdapterMs: after.totalAdapterMs - before.totalAdapterMs,
    overruns: after.overruns - before.overruns,
    maxTurnMs: after.maxTurnMs > before.maxTurnMs ? after.maxTurnMs : 0,
    budgetExhausted: after.budgetExhausted - before.budgetExhausted,
    emptyPlans: after.emptyPlans - before.emptyPlans,
    // A16: how often the deadline, not the work rung, ended a search — and
    // whether this game's FIRST search (the cold profile) was one of them.
    abortedSearches: after.abortedSearches - before.abortedSearches,
    firstSearchAborted: after.firstSearchAborted - before.firstSearchAborted,
  };
}

async function playOneGame(
  args: WorkerArgs,
  spec: GameSpec,
  runId: string,
  opening: OpeningSpec,
  config: ShardConfig,
): Promise<GameRow> {
  const matchOptions: MatchOptions = {
    ...DEFAULT_MATCH_OPTIONS,
    legality: args.legality,
    blackCrystalHandicap: spec.handicap,
    recordReplay: config.replays,
    checkInvariants: true,
  };
  // Replayed fresh for every game (and refused unless legal all the way), so
  // both orientations of a pair start from the identical opening position. The
  // replay is given THIS game's rules, not whatever the previous game's
  // finally-block left installed in the module globals: an opening containing
  // an ATTACK or an upkeep payment must resolve under the rules the game that
  // follows it will be played under (`openings.ts#withOpeningRules`).
  //
  // RULES-BOUND. `applyLadderOpening` replays a P1 row through
  // `openings/phasing.ts` — a `ruleset: 'phasing'` initial state, the `p1-` id
  // check, and the harness invariants — and REFUSES a historical Standard id,
  // so a run pointed at `e1-dev.jsonl` cannot relabel an E0/E1 opening as
  // Phasing. A zero-action row (`initial`) names no position to replay, so the
  // harness builds its own Phasing initial state and `initialState` stays
  // undefined, exactly as before.
  const initialState = opening.actions.length === 0 ? undefined : applyLadderOpening(opening, {
    blackCrystalHandicap: matchOptions.blackCrystalHandicap,
    actionsPerTurn: matchOptions.actionsPerTurn,
    resourceLayout: matchOptions.resourceLayout,
    elementGraph: matchOptions.elementGraph,
    upkeep: matchOptions.upkeep,
    handicap: matchOptions.handicap,
  });
  const fallbacksBefore = ladderFallbackCounts();
  const divergencesBefore = hardBotDivergences();
  const timingBefore = hardBotTiming();
  const loadAvgStart = os.loadavg()[0];
  const engineA = resolveEngine(args.a);
  const engineB = resolveEngine(args.b);
  const whiteEngine = spec.white === 'A' ? engineA : engineB;
  const blackEngine = spec.black === 'A' ? engineA : engineB;
  const white = whiteEngine.createBot(args.work);
  const black = blackEngine.createBot(args.work);
  const { record, replay } = await playGame({
    bots: { white, black },
    seed: spec.seed,
    engineHash: `${whiteEngine.configHash(args.work)}__vs__${blackEngine.configHash(args.work)}`,
    runId,
    initialState,
    options: matchOptions,
  });
  record.fixedWork = args.work.mode === 'fixed' ? args.work.units : undefined;
  record.decisionMs = args.work.mode === 'wall' ? args.work.ms : undefined;
  record.engineConfigHash = `white=${whiteEngine.configHash(args.work)}|black=${blackEngine.configHash(args.work)}`;
  // A `hard@*` seat that proposed an action the canonical engine refused counts
  // as a REPLICA DIVERGENCE (DESIGN §7.7's bot adapter). The count is
  // process-wide and games run sequentially inside a shard, so the delta over
  // one game belongs to that game; `ladder/run.ts` sums these anomalies into
  // `metrics.replicaDivergences`.
  const divergences = hardBotDivergences() - divergencesBefore;
  for (let i = 0; i < divergences; i++) record.anomalies.push(HARD_DIVERGENCE_ANOMALY);
  record.hardTiming = hardTimingDelta(timingBefore, hardBotTiming());

  // Gate 0 item 6: the six engine-fallback counts for THIS game. Three sources,
  // all process-wide and monotonic, so each is snapshot-and-subtracted around
  // the game (games run sequentially inside a shard):
  //   - the adapter's replica divergences, the same delta the anomalies above
  //     record, under the browser's `divergence` name;
  //   - the adapter's empty plans, which `hardTimingDelta` has just computed
  //     per game for this record;
  //   - `ladder/fallbacks.ts`'s registry, which the `aiv2` adapters and any
  //     future worker-backed engine report into.
  // Summed rather than merged: an `emptyPlan` noted by a v2 seat and one
  // counted by a hard seat are two different turns that fell back.
  const fallbacks = fallbackCountsDelta(ladderFallbackCounts(), fallbacksBefore);
  fallbacks.divergence += divergences;
  fallbacks.emptyPlan += record.hardTiming.emptyPlans ?? 0;

  const row: GameRow = {
    ...record,
    pairId: spec.pairId,
    orientation: spec.orientation,
    opening: spec.openingId,
    loadAvgStart,
    loadAvgEnd: os.loadavg()[0],
    fallbacks,
  };
  if (replay) {
    fs.mkdirSync(config.replaysDir, { recursive: true });
    const file = replayFileName(spec.pairId, spec.orientation);
    // The replay's steps start at the opening position, so the opening that
    // produced it travels with the file — a loss analysis never has to guess.
    fs.writeFileSync(path.join(config.replaysDir, file), JSON.stringify({ ...replay, opening }) + '\n');
    row.replayPath = path.posix.join('replays', file);
  }
  return row;
}

function failureRow(spec: GameSpec, shardIndex: number, err: unknown): FailureRow {
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return {
    pairId: spec.pairId,
    orientation: spec.orientation,
    opening: spec.openingId,
    handicap: spec.handicap,
    seed: spec.seed,
    shardIndex,
    error: err instanceof Error ? err.message : String(err),
    stackTail: stack.slice(-2000),
    at: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = readShardConfig(args.out);
  const openings = config.openings.length > 0 ? config.openings : [INITIAL_OPENING];
  const openingById = new Map<string, OpeningSpec>(openings.map(o => [o.id, o]));
  const completed = new Set(config.completedPairIds);
  const runId = `ladder-${args.a}-vs-${args.b}-${workKey(args.work)}-${args.seed}`;
  const allPairs = buildPairs(args.pairs, args.seed, args.handicaps, openings.map(o => o.id));
  const { start, end } = shardRange(args.pairs, args.shardCount, args.shardIndex);
  const myPairs = allPairs.slice(start, end).filter(p => !completed.has(p.pairId));

  fs.mkdirSync(args.out, { recursive: true });
  const gamesSink = new JsonlSink(path.join(args.out, `games-${args.shardIndex}.jsonl`));
  const pairsSink = new JsonlSink(path.join(args.out, `pairs-${args.shardIndex}.jsonl`));
  const failuresSink = new JsonlSink(path.join(args.out, `failures-${args.shardIndex}.jsonl`));
  const status: ShardStatus = {
    shardIndex: args.shardIndex,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    done: false,
    pairsPlanned: myPairs.length,
    pairsCompleted: 0,
    games: 0,
    failures: 0,
    finishedAt: null,
  };
  const publishStatus = (): void => {
    status.pairsCompleted = pairsSink.count;
    status.games = gamesSink.count;
    status.failures = failuresSink.count;
    writeShardStatus(args.out, status);
  };
  publishStatus(); // pid on disk before the first game, so `run.ts` can see this shard is alive

  for (const pair of myPairs) {
    // The sequential SPRT has decided: play no NEW pair. The pair already in
    // flight, if any, finished above, so no half-played pair is left behind.
    if (sprtStopRequested(args.out)) {
      status.stoppedForSprt = true;
      break;
    }
    const specs = expandPair(pair);
    const opening = openingById.get(pair.openingId);
    if (opening === undefined) throw new Error(`ladder/worker: pair ${pair.pairId} names unknown opening "${pair.openingId}"`);
    const played: Array<GameRow | null> = [];
    for (const spec of specs) {
      try {
        const row = await playOneGame(args, spec, runId, opening, config);
        gamesSink.write(row);
        played.push(row);
      } catch (err) {
        // EPIC-PLAN E0.4: a thrown game is recorded, never fatal to the shard.
        failuresSink.write(failureRow(spec, args.shardIndex, err));
        played.push(null);
      }
    }
    const [recA, recB] = played;
    if (!recA || !recB) {
      publishStatus();
      continue; // incomplete pair: no pair row, so `--resume` replays it
    }

    const scoreAInGameA = gameScoreFor('A', recA.winner === 'white' ? 'A' : recA.winner === 'black' ? 'B' : null);
    const scoreAInGameB = gameScoreFor('A', recB.winner === 'white' ? 'B' : recB.winner === 'black' ? 'A' : null);
    const row: PairRow = {
      pairIndex: pair.pairIndex,
      pairId: pair.pairId,
      opening: pair.openingId,
      seed: pair.seed,
      handicap: pair.handicap,
      scoreA: pairScore(scoreAInGameA, scoreAInGameB),
      aWhiteWinType: recA.winType,
      bWhiteWinType: recB.winType,
    };
    pairsSink.write(row);
    publishStatus();
  }

  gamesSink.close();
  pairsSink.close();
  failuresSink.close();
  status.done = true;
  status.finishedAt = new Date().toISOString();
  publishStatus(); // `done: true` is the shard's promise that its files are final
}

// `run.ts` imports this module for `SHARD_CONFIG_FILE` and the row types, so
// the shard only runs when this file IS the entry point `shard.ts` spawned.
const INVOKED_DIRECTLY =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (INVOKED_DIRECTLY) {
  main().catch(err => {
    console.error(`ladder/worker: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

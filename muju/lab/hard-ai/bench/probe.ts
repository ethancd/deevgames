/**
 * `node --import tsx lab/hard-ai/bench/probe.ts --engine <name>
 *   --work wall:<ms> --turns <k> --out <file> [--opponent <bot>] [--seed <n>]`
 *
 * E0.5's resource and timing probe. It answers three questions the ladder's
 * aggregate `meanTurnMs` cannot:
 *
 *   1. COLD vs WARM. The first turn pays for the replica's tables, the packed
 *      state and the WASM tactics kernel; every later turn does not. A campaign
 *      budget sized on the warm number under-books its first turn per process,
 *      and EPIC-PLAN E0.2 asks explicitly for "total elapsed time including
 *      packing/tables/startup as well as search time". Turn 1 here is that
 *      total; turns 2..k are the warm cost.
 *   2. BUDGET vs ACTUAL. `wall:<ms>` funds a whole TURN (`ladder/engines.ts`),
 *      so a turn is an OVERRUN when the seat's decisions together exceed `ms`.
 *      The count and the worst ratio are reported rather than averaged away.
 *   3. MEMORY AND LOAD. RSS and heapUsed before and after, their peak sampled
 *      every 250 ms, and `os.loadavg()` before and after — so a number measured
 *      on a machine that was already at load 8 says so in its own artifact.
 *
 * The probe holds one slot of the machine-wide heavy queue (`ladder/heavy.ts`)
 * for the whole measurement, so it cannot be timed against another lane's
 * benchmark or ladder shard.
 *
 * This is an engineering PROBE, not a calibration: one game, one seed, one
 * opponent, on a shared laptop. It sizes budgets and catches order-of-magnitude
 * surprises. It does not set `WORK_COST` (that is `bench/run.ts --calibrate`)
 * and it is not evidence about strength.
 *
 * WHICH ENGINE IT MEASURED. A probe number is only usable next to the engine
 * version it came from, so the artifact carries the same identity a ladder run's
 * manifest does: the adapter's `configHash`, `identity.ts`'s
 * `resolvedConfigHash` and the resolved configuration itself, plus the git
 * revision and whether the tree was dirty. A number measured on an uncommitted
 * tree says so rather than being attributed to the commit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { playGame } from '../../harness/runner';
import { createBot as createScriptedBot } from '../../harness/bots/index';
import { resolveEngine, parseWorkSpec, workKey, type WorkSpec } from '../ladder/engines';
import { resolvedConfig, resolvedConfigHash, type ResolvedConfig } from '../ladder/identity';
import { acquireHeavySlot } from '../ladder/heavy';
import type { Bot, GameRecord } from '../../harness/types';
import type { GameState, PlayerId } from '../../../src/game/types';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const SAMPLE_INTERVAL_MS = 250;

export interface TurnSample {
  /** 1-based game turn number this seat played. */
  turn: number;
  /** Wall-clock ms the seat spent inside its bot for this whole turn. */
  elapsedMs: number;
  /** How many `nextAction` calls the turn cost (1 for a whole-turn engine). */
  decisions: number;
  /** `elapsedMs / budgetMs`; > 1 is an overrun. */
  budgetRatio: number;
}

export interface MemorySample {
  rssBytes: number;
  heapUsedBytes: number;
}

export interface ProbeArtifact {
  schema: 'muju-hard-ai-probe-v1';
  engine: string;
  /** `LadderEngine.configHash(work)`: the adapter's own hash, the same string a ladder manifest reports. */
  engineConfigHash: string;
  /** `identity.ts#resolvedConfigHash(engine, work)`: the hash of the configuration the adapter actually applies. */
  resolvedConfigHash: string;
  /** The configuration behind that hash, so an artifact can be read without re-resolving it. */
  resolvedConfig: ResolvedConfig;
  opponent: string;
  work: string;
  budgetMs: number;
  seed: number;
  requestedTurns: number;
  measuredTurns: number;
  /** Turn 1: search plus tables, packing and WASM instantiation. */
  coldTurnMs: number;
  /** Mean of turns 2..k, or null when only one turn was measured. */
  warmMeanTurnMs: number | null;
  warmMaxTurnMs: number | null;
  /** `coldTurnMs / warmMeanTurnMs`, null when there is no warm sample. */
  coldOverWarm: number | null;
  /** Wall-clock ms to construct the bot, before any search. */
  botCreateMs: number;
  turns: TurnSample[];
  overrunTurns: number;
  worstBudgetRatio: number;
  memory: {
    before: MemorySample;
    after: MemorySample;
    /** Highest value seen by the 250 ms sampler (including before/after). */
    peak: MemorySample;
    samples: number;
    sampleIntervalMs: number;
  };
  load: {
    before: [number, number, number];
    after: [number, number, number];
  };
  device: string;
  cpus: number;
  totalMemBytes: number;
  node: string;
  git: string | null;
  /** True when the tree had uncommitted changes, so `git` alone does not identify what ran. */
  gitDirty: boolean | null;
  gameWallMs: number;
  gameTurns: number;
  gameWinType: GameRecord['winType'];
  at: string;
  note: string;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** True when the working tree has uncommitted changes; null outside a git checkout. */
function gitDirty(): boolean | null {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return null;
  }
}

function deviceString(): string {
  return `${os.cpus()[0]?.model ?? 'unknown-cpu'} x${os.cpus().length} (${os.platform()}/${os.arch()})`;
}

function memorySample(): MemorySample {
  const m = process.memoryUsage();
  return { rssBytes: m.rss, heapUsedBytes: m.heapUsed };
}

/**
 * Wraps the probed engine so every `nextAction` is timed and the times are
 * accumulated per GAME TURN — the unit `wall:<ms>` actually funds. A per-action
 * engine (`aiv2-hard`) contributes several decisions to one turn; a whole-turn
 * engine (`hard@*`) contributes one.
 */
function instrument(bot: Bot, into: Map<number, { ms: number; decisions: number }>, afterDecision: () => Promise<void>): Bot {
  if (bot.kind !== 'engine') throw new Error(`probe: --engine must name an engine bot, "${bot.name}" is scripted`);
  return {
    kind: 'engine',
    name: bot.name,
    onGameStart(player: PlayerId, seed: number): void {
      bot.onGameStart(player, seed);
    },
    async nextAction(state: GameState, player: PlayerId) {
      const turn = state.turn.turnNumber;
      const startedAt = performance.now();
      const action = await bot.nextAction(state, player);
      const elapsed = performance.now() - startedAt;
      const acc = into.get(turn) ?? { ms: 0, decisions: 0 };
      acc.ms += elapsed;
      acc.decisions += 1;
      into.set(turn, acc);
      // A search is synchronous CPU work and `await` on an already-settled
      // promise only drains microtasks, so without an explicit macrotask yield
      // the 250 ms memory sampler would never get the event loop and would
      // report zero samples. One hop per decision costs nothing and is outside
      // the timed region above.
      await afterDecision();
      return action;
    },
  };
}

export interface ProbeArgs {
  engine: string;
  opponent: string;
  work: WorkSpec;
  turns: number;
  seed: number;
}

export async function runProbe(args: ProbeArgs): Promise<ProbeArtifact> {
  if (args.work.mode !== 'wall') throw new Error(`probe: --work must be wall:<ms> (a turn budget), got ${workKey(args.work)}`);
  const budgetMs = args.work.ms;

  const perTurn = new Map<number, { ms: number; decisions: number }>();
  const createStartedAt = performance.now();
  const probed = resolveEngine(args.engine).createBot(args.work);
  const botCreateMs = performance.now() - createStartedAt;

  const before = memorySample();
  const loadBefore = os.loadavg() as [number, number, number];
  const peak: MemorySample = { ...before };
  let samples = 0;
  const take = (): void => {
    const s = memorySample();
    samples++;
    peak.rssBytes = Math.max(peak.rssBytes, s.rssBytes);
    peak.heapUsedBytes = Math.max(peak.heapUsedBytes, s.heapUsedBytes);
  };
  const sampler = setInterval(take, SAMPLE_INTERVAL_MS);
  sampler.unref();
  // Sample at every decision boundary as well, then hand the loop back so the
  // interval above can fire at all (see `instrument`).
  const afterDecision = async (): Promise<void> => {
    take();
    await new Promise<void>(resolve => setImmediate(resolve));
  };

  const gameStartedAt = performance.now();
  let record: GameRecord;
  try {
    ({ record } = await playGame({
      bots: { white: instrument(probed, perTurn, afterDecision), black: createScriptedBot(args.opponent) },
      seed: args.seed,
      engineHash: `probe:${args.engine}:${workKey(args.work)}`,
      runId: `probe-${args.engine}-${workKey(args.work)}`,
      options: {
        // The probe wants exactly `--turns` turns of the engine, not a finished
        // game: the turn cap ends it by adjudication once they are played.
        maxTurns: args.turns,
        legality: 'as-shipped',
        recordReplay: false,
        checkInvariants: true,
      },
    }));
  } finally {
    clearInterval(sampler);
  }
  const gameWallMs = performance.now() - gameStartedAt;

  const after = memorySample();
  peak.rssBytes = Math.max(peak.rssBytes, after.rssBytes);
  peak.heapUsedBytes = Math.max(peak.heapUsedBytes, after.heapUsedBytes);

  const turns: TurnSample[] = [...perTurn.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([turn, acc]) => ({ turn, elapsedMs: acc.ms, decisions: acc.decisions, budgetRatio: acc.ms / budgetMs }));
  if (turns.length === 0) throw new Error('probe: the engine never moved; nothing to measure');

  const warm = turns.slice(1).map(t => t.elapsedMs);
  const warmMean = warm.length === 0 ? null : warm.reduce((a, b) => a + b, 0) / warm.length;

  return {
    schema: 'muju-hard-ai-probe-v1',
    engine: args.engine,
    engineConfigHash: resolveEngine(args.engine).configHash(args.work),
    resolvedConfigHash: resolvedConfigHash(args.engine, args.work),
    resolvedConfig: resolvedConfig(args.engine, args.work),
    opponent: args.opponent,
    work: workKey(args.work),
    budgetMs,
    seed: args.seed,
    requestedTurns: args.turns,
    measuredTurns: turns.length,
    coldTurnMs: turns[0].elapsedMs,
    warmMeanTurnMs: warmMean,
    warmMaxTurnMs: warm.length === 0 ? null : Math.max(...warm),
    coldOverWarm: warmMean === null || warmMean === 0 ? null : turns[0].elapsedMs / warmMean,
    botCreateMs,
    turns,
    overrunTurns: turns.filter(t => t.budgetRatio > 1).length,
    worstBudgetRatio: Math.max(...turns.map(t => t.budgetRatio)),
    memory: { before, after, peak, samples, sampleIntervalMs: SAMPLE_INTERVAL_MS },
    load: { before: loadBefore, after: os.loadavg() as [number, number, number] },
    device: deviceString(),
    cpus: os.cpus().length,
    totalMemBytes: os.totalmem(),
    node: process.version,
    git: gitRevision(),
    gitDirty: gitDirty(),
    gameWallMs,
    gameTurns: record.turns,
    gameWinType: record.winType,
    at: new Date().toISOString(),
    note: 'First engineering probe (E0.5). One game, one seed, shared laptop under other load: use it to size budgets, not to calibrate work costs or claim strength.',
  };
}

export function formatProbe(a: ProbeArtifact): string {
  const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const lines = [
    `probe ${a.engine} vs ${a.opponent} at ${a.work} (${a.measuredTurns}/${a.requestedTurns} turns measured)`,
    `device: ${a.device}, node ${a.node}, git ${a.git ?? 'unknown'}${a.gitDirty === true ? ' (DIRTY tree)' : ''}`,
    `engine config: ${a.engineConfigHash}, resolved ${a.resolvedConfigHash}`,
    `load: ${a.load.before.map(n => n.toFixed(2)).join('/')} before -> ${a.load.after.map(n => n.toFixed(2)).join('/')} after`,
    `bot construction: ${a.botCreateMs.toFixed(1)} ms`,
    `cold turn: ${a.coldTurnMs.toFixed(0)} ms  warm mean: ${a.warmMeanTurnMs === null ? 'n/a' : a.warmMeanTurnMs.toFixed(0) + ' ms'}  cold/warm: ${a.coldOverWarm === null ? 'n/a' : a.coldOverWarm.toFixed(2) + 'x'}`,
    `budget ${a.budgetMs} ms: ${a.overrunTurns} overrun turn(s), worst ratio ${a.worstBudgetRatio.toFixed(2)}x`,
    ...a.turns.map(t => `  turn ${t.turn}: ${t.elapsedMs.toFixed(0)} ms over ${t.decisions} decision(s) = ${t.budgetRatio.toFixed(2)}x budget`),
    `rss: ${mb(a.memory.before.rssBytes)} -> ${mb(a.memory.after.rssBytes)} (peak ${mb(a.memory.peak.rssBytes)} over ${a.memory.samples} samples)`,
    `heapUsed: ${mb(a.memory.before.heapUsedBytes)} -> ${mb(a.memory.after.heapUsedBytes)} (peak ${mb(a.memory.peak.heapUsedBytes)})`,
    `game: ${a.gameTurns} turns, ${(a.gameWallMs / 1000).toFixed(1)} s, ended ${a.gameWinType}`,
  ];
  return lines.join('\n');
}

function parseArgs(argv: string[]): { probe: ProbeArgs; out: string | null } {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
  };
  const engine = get('--engine');
  const work = get('--work');
  const turns = get('--turns');
  if (engine === null || work === null || turns === null) {
    throw new Error('usage: probe.ts --engine <name> --work wall:<ms> --turns <k> [--opponent <bot>] [--seed <n>] [--out <file>]');
  }
  const turnCount = Number(turns);
  if (!Number.isInteger(turnCount) || turnCount < 1) throw new Error(`probe: --turns must be a positive integer, got "${turns}"`);
  return {
    probe: {
      engine,
      opponent: get('--opponent') ?? 'Rush',
      work: parseWorkSpec(work),
      turns: turnCount,
      seed: Number(get('--seed') ?? '1'),
    },
    out: get('--out'),
  };
}

async function main(): Promise<void> {
  const { probe, out } = parseArgs(process.argv.slice(2));
  const release = await acquireHeavySlot(`probe ${probe.engine} ${workKey(probe.work)}`);
  let artifact: ProbeArtifact;
  try {
    artifact = await runProbe(probe);
  } finally {
    release();
  }
  console.log(formatProbe(artifact));
  if (out !== null) {
    const resolved = path.resolve(REPO_ROOT, out);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(artifact, null, 2) + '\n');
    console.log(`probe: wrote ${resolved}`);
  }
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main().catch(err => {
    console.error(`probe: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}

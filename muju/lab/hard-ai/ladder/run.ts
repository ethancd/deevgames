/**
 * `npm run hard:ladder -- --a <engine> --b <engine> --work fixed:<units>|wall:<ms>
 *   --handicaps 0,3 --pairs <n> --seed <s> --shards <k>
 *   [--sprt elo0,elo1,alpha,beta] [--legality as-shipped|strict] [--profile <name>]
 *   --out <dir>` (DESIGN §7.7).
 *
 * Orchestrates a full ladder run: builds the seed-mirrored pair list
 * (`pairing.ts`), fans it out across `shard.ts`'s child processes, merges
 * every shard's `games-<i>.jsonl`/`pairs-<i>.jsonl` (shards own disjoint,
 * ordered pair-index ranges, so straight concatenation in shard order
 * already yields pair-index order — no re-sort needed), computes SPRT/Elo,
 * and writes the run's artifacts: `manifest.json`, `games.jsonl`,
 * `pairs.jsonl`, `sprt.json`, `elo.json`, `summary.md`, and `metrics.json`
 * (a flat, gate-criterion-friendly digest; `hard:determinism` auto-merges
 * any `<out>/metrics.json` it finds in a sibling `<stem>-<label>` directory
 * next to its own `--out` file, under the key `<label>` — see
 * `verify/determinism.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import type { GameRecord } from '../../harness/types';
import type { PlayerId } from '../../../src/game/types';
import { buildPairs, expandGames, type GameSpec } from './pairing';
import type { PairRow } from './worker';
import { HARD_DIVERGENCE_ANOMALY } from '../bots/hard';
import { resolveEngine, parseWorkSpec, workKey, engineHasWork, type WorkSpec } from './engines';
import { runSharded } from './shard';
import { sprt, type SprtParams, type SprtResult } from './sprt';
import { eloEstimate, type EloEstimate } from './elo';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

interface CliArgs {
  a: string;
  b: string;
  work: WorkSpec;
  handicaps: number[];
  pairs: number;
  seed: number;
  shards: number;
  sprt: SprtParams | null;
  legality: 'as-shipped' | 'strict';
  profile: string | null;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };
  const require = (flag: string): string => {
    const v = get(flag);
    if (v === null) throw new Error(`hard:ladder: missing ${flag}`);
    return v;
  };
  const sprtRaw = get('--sprt');
  let sprtParams: SprtParams | null = null;
  if (sprtRaw) {
    const [elo0, elo1, alpha, beta] = sprtRaw.split(',').map(Number);
    if ([elo0, elo1, alpha, beta].some(n => Number.isNaN(n))) throw new Error(`hard:ladder: invalid --sprt "${sprtRaw}", expected elo0,elo1,alpha,beta`);
    sprtParams = { elo0, elo1, alpha, beta };
  }
  return {
    a: require('--a'),
    b: require('--b'),
    work: parseWorkSpec(require('--work')),
    handicaps: require('--handicaps').split(',').map(Number),
    pairs: Number(require('--pairs')),
    seed: Number(require('--seed')),
    shards: Number(get('--shards') ?? '1'),
    sprt: sprtParams,
    legality: (get('--legality') ?? 'as-shipped') as 'as-shipped' | 'strict',
    profile: get('--profile'),
    out: path.resolve(REPO_ROOT, require('--out')),
  };
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function wasmSha256(): string | null {
  const wasmPath = path.join(REPO_ROOT, 'src/ai/wasm/tactics.wasm');
  if (!fs.existsSync(wasmPath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
}

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l) as T);
}

/** Concatenates every shard's file, in shard order, into one merged file (each shard is already internally pair-index-ordered — see module doc). Fully synchronous so the caller can read the merged file back immediately (no stream-flush race). */
function mergeShardFiles(shardsDir: string, prefix: string, shardCount: number, outPath: string): void {
  let merged = '';
  for (let i = 0; i < shardCount; i++) {
    const p = path.join(shardsDir, `${prefix}-${i}.jsonl`);
    if (fs.existsSync(p)) merged += fs.readFileSync(p, 'utf8');
  }
  fs.writeFileSync(outPath, merged);
}

interface RunMetrics {
  a: string;
  b: string;
  work: string;
  handicaps: number[];
  pairs: number;
  games: number;
  seed: number;
  shards: number;
  adjudicationRate: number;
  illegalActions: number;
  /** `hard@*` seats whose plan the canonical engine refused mid-turn
   * (M14; `lab/hard-ai/bots/hard.ts`, recorded per game by `worker.ts`). */
  replicaDivergences: number;
  bothSeatsPlayed: boolean;
  voided: boolean;
  meanTurnMs: { a: number; b: number };
  /** Elo point estimate (A vs B), `NaN` when there are no pairs to estimate from. */
  elo: number;
  eloLo: number;
  eloHi: number;
  los: number;
  eloDetail: EloEstimate | null;
  sprt: (Omit<SprtResult, 'decision'> & { decision: SprtResult['decision'] | 'void' }) | null;
  decision: string | null;
}

function computeMetrics(args: CliArgs, games: GameRecord[], pairs: PairRow[]): RunMetrics {
  const specsByPair = new Map<number, [GameSpec, GameSpec]>();
  for (const p of buildPairs(args.pairs, args.seed, args.handicaps)) {
    const [gA, gB] = expandGames([p]);
    specsByPair.set(p.pairIndex, [gA, gB]);
  }
  let aWhiteGames = 0, bWhiteGames = 0;
  // Per-ENGINE latency: `GameRecord.durationMs` is the whole game's wall clock
  // and is identical for both seats, so attributing it to A and B (as this did
  // before) made `meanTurnMs.a === meanTurnMs.b` by construction and any
  // criterion comparing the two vacuous. `PlayerGameStats.decisionMs` /
  // `.turnsTaken` (harness v3) are per-seat, so each engine's ms-per-turn is
  // read off the seat it actually played.
  const latencyByEngine: { a: { ms: number; turns: number }; b: { ms: number; turns: number } } =
    { a: { ms: 0, turns: 0 }, b: { ms: 0, turns: 0 } };
  let adjudicated = 0;
  let illegalActions = 0;
  let replicaDivergences = 0;
  for (let i = 0; i < games.length; i++) {
    const rec = games[i];
    const spec = specsByPair.get(i >> 1)?.[i % 2]; // shard files interleave A-white, B-white per pair in pair-index order
    if (rec.winType === 'adjudication') adjudicated++;
    illegalActions += rec.players.white.illegalActions + rec.players.black.illegalActions;
    for (const anomaly of rec.anomalies) if (anomaly === HARD_DIVERGENCE_ANOMALY) replicaDivergences++;
    if (spec) {
      if (spec.white === 'A') aWhiteGames++; else bWhiteGames++;
      const seatOfA: PlayerId = spec.white === 'A' ? 'white' : 'black';
      const seatOfB: PlayerId = seatOfA === 'white' ? 'black' : 'white';
      // Pre-v3 records (no per-seat timing) fall back to the game clock split
      // evenly, which is the best this metric can say about them.
      const fallbackMs = rec.durationMs / 2;
      const fallbackTurns = Math.max(1, Math.ceil(rec.turns / 2));
      latencyByEngine.a.ms += rec.players[seatOfA].decisionMs ?? fallbackMs;
      latencyByEngine.a.turns += rec.players[seatOfA].turnsTaken ?? fallbackTurns;
      latencyByEngine.b.ms += rec.players[seatOfB].decisionMs ?? fallbackMs;
      latencyByEngine.b.turns += rec.players[seatOfB].turnsTaken ?? fallbackTurns;
    }
  }
  const pairScores = pairs.map(p => p.scoreA);
  const adjudicationRate = games.length === 0 ? 0 : adjudicated / games.length;
  const voided = adjudicationRate > 0.01;
  const eloDetail = pairScores.length > 0 ? eloEstimate(pairScores) : null;
  let sprtResult: (Omit<SprtResult, 'decision'> & { decision: SprtResult['decision'] | 'void' }) | null = null;
  if (args.sprt) {
    const raw = sprt(pairScores, args.sprt);
    sprtResult = { ...raw, decision: voided ? 'void' : raw.decision };
  }
  const msPerTurn = (l: { ms: number; turns: number }): number => (l.turns === 0 ? 0 : l.ms / l.turns);
  return {
    a: args.a,
    b: args.b,
    work: workKey(args.work),
    handicaps: args.handicaps,
    pairs: args.pairs,
    games: games.length,
    seed: args.seed,
    shards: args.shards,
    adjudicationRate,
    illegalActions,
    replicaDivergences,
    bothSeatsPlayed: aWhiteGames > 0 && bWhiteGames > 0,
    voided,
    meanTurnMs: { a: msPerTurn(latencyByEngine.a), b: msPerTurn(latencyByEngine.b) },
    elo: eloDetail?.elo ?? NaN,
    eloLo: eloDetail?.eloLo ?? NaN,
    eloHi: eloDetail?.eloHi ?? NaN,
    los: eloDetail?.los ?? NaN,
    eloDetail,
    sprt: sprtResult,
    decision: sprtResult?.decision ?? null,
  };
}

function writeManifest(args: CliArgs, outDir: string): void {
  const manifest = {
    a: args.a,
    b: args.b,
    aConfigHash: engineHasWork(args.a) ? resolveEngine(args.a).configHash(args.work) : `scripted:${args.a}`,
    bConfigHash: engineHasWork(args.b) ? resolveEngine(args.b).configHash(args.work) : `scripted:${args.b}`,
    work: workKey(args.work),
    seed: args.seed,
    pairs: args.pairs,
    shards: args.shards,
    handicaps: args.handicaps,
    legality: args.legality,
    profile: args.profile,
    sprt: args.sprt,
    rules: { elementGraph: 'double-thick', upkeep: 'shipped', inactivityRule: 'on' },
    git: gitRevision(),
    wasmSha256: wasmSha256(),
    node: process.version,
    device: `${os.cpus()[0]?.model ?? 'unknown-cpu'} x${os.cpus().length} (${os.platform()}/${os.arch()})`,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function writeSummary(outDir: string, metrics: RunMetrics): void {
  const lines = [
    `# Ladder: ${metrics.a} vs ${metrics.b}`,
    '',
    `- work: \`${metrics.work}\`, handicaps: \`${metrics.handicaps.join(',')}\`, seed: ${metrics.seed}, shards: ${metrics.shards}`,
    `- pairs: ${metrics.pairs}, games: ${metrics.games}`,
    `- adjudicationRate: ${(metrics.adjudicationRate * 100).toFixed(2)}%${metrics.voided ? ' — **VOIDED** (> 1%, SU addendum 2)' : ''}`,
    `- illegalActions: ${metrics.illegalActions}`,
    `- bothSeatsPlayed: ${metrics.bothSeatsPlayed}`,
    metrics.eloDetail ? `- Elo (A vs B): ${metrics.elo.toFixed(1)} [${metrics.eloLo.toFixed(1)}, ${metrics.eloHi.toFixed(1)}], LOS ${(metrics.los * 100).toFixed(1)}%` : '- Elo: n/a (no pairs)',
    metrics.sprt ? `- SPRT: elo0=${metrics.sprt.elo0} elo1=${metrics.sprt.elo1} alpha=${metrics.sprt.alpha} beta=${metrics.sprt.beta} → LLR=${metrics.sprt.llr.toFixed(4)} bounds=[${metrics.sprt.lowerBound.toFixed(4)}, ${metrics.sprt.upperBound.toFixed(4)}] decision=${metrics.sprt.decision}` : '- SPRT: not requested',
    `- meanTurnMs: a=${metrics.meanTurnMs.a.toFixed(1)} b=${metrics.meanTurnMs.b.toFixed(1)}`,
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.out, { recursive: true });
  const shardsDir = path.join(args.out, '.shards');
  fs.mkdirSync(shardsDir, { recursive: true });

  const effectiveShards = Math.max(1, Math.min(args.shards, args.pairs));
  await runSharded({
    a: args.a,
    b: args.b,
    work: args.work,
    handicaps: args.handicaps,
    seed: args.seed,
    pairs: args.pairs,
    shardCount: args.shards,
    legality: args.legality,
    out: shardsDir,
  });

  mergeShardFiles(shardsDir, 'games', effectiveShards, path.join(args.out, 'games.jsonl'));
  mergeShardFiles(shardsDir, 'pairs', effectiveShards, path.join(args.out, 'pairs.jsonl'));
  fs.rmSync(shardsDir, { recursive: true, force: true });

  const games = readJsonl<GameRecord>(path.join(args.out, 'games.jsonl'));
  const pairs = readJsonl<PairRow>(path.join(args.out, 'pairs.jsonl'));
  const metrics = computeMetrics(args, games, pairs);

  writeManifest(args, args.out);
  if (metrics.sprt) fs.writeFileSync(path.join(args.out, 'sprt.json'), JSON.stringify(metrics.sprt, null, 2) + '\n');
  if (metrics.eloDetail) fs.writeFileSync(path.join(args.out, 'elo.json'), JSON.stringify(metrics.eloDetail, null, 2) + '\n');
  writeSummary(args.out, metrics);
  fs.writeFileSync(path.join(args.out, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

  console.log(`hard:ladder: wrote ${args.out}`);
  console.log(JSON.stringify(metrics));
}

main().catch(err => {
  console.error(`hard:ladder: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
});

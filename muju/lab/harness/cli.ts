/**
 * Balance-lab match runner CLI.
 *
 * Run a quick pairing:
 *   npx tsx lab/harness/cli.ts --white Rush --black AntiRush --games 20 --seed 7
 *
 * Run an experiment config:
 *   npx tsx lab/harness/cli.ts --config lab/experiments/e2-ladder.json
 *
 * Outputs (under --out, default lab/results/<name>):
 *   games.jsonl    one GameRecord per line (gitignored if large; summaries are canon)
 *   summary.csv    per-pairing aggregates with Wilson CIs
 *   replays/       sampled replays + every anomalous game (replay-viewer.html)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { PlayerId } from '../../src/game/types';
import { playGame } from './runner';
import type { Bot, GameRecord, MatchOptions } from './types';
import { createBot } from './bots/index';
import { summarize, summaryToCsv, printSummary } from './summary';
import { deriveSeed, mulberry32 } from './rng';

interface Pairing {
  white: string;
  black: string;
  games: number;
  /** also run the seat-swapped pairing with the same seeds */
  mirror?: boolean;
  options?: Partial<MatchOptions>;
}

interface ExperimentConfig {
  name: string;
  seed: number;
  pairings: Pairing[];
  options?: Partial<MatchOptions>;
  /** fraction of games whose full replay is kept (anomalies always kept) */
  replaySample?: number;
  out?: string;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

function engineHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function runExperiment(config: ExperimentConfig): Promise<GameRecord[]> {
  const hash = engineHash();
  const runId = `${config.name}-${Date.now().toString(36)}`;
  const outDir = config.out ?? path.join('lab', 'results', config.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'replays'), { recursive: true });
  const jsonlPath = path.join(outDir, 'games.jsonl');
  const replaySample = config.replaySample ?? 0.01;
  const sampleRng = mulberry32(deriveSeed(config.seed, 999));

  const records: GameRecord[] = [];
  let gameIndex = 0;
  const t0 = Date.now();

  // expand mirrored pairings
  const pairings: Pairing[] = [];
  for (const p of config.pairings) {
    pairings.push(p);
    if (p.mirror && p.white !== p.black) {
      pairings.push({ ...p, white: p.black, black: p.white, mirror: false });
    }
  }

  const totalGames = pairings.reduce((n, p) => n + p.games, 0);
  console.log(`[${config.name}] ${pairings.length} pairings, ${totalGames} games, engine ${hash.slice(0, 10)}`);

  for (const pairing of pairings) {
    for (let g = 0; g < pairing.games; g++) {
      const seed = deriveSeed(config.seed, gameIndex);
      gameIndex++;

      // fresh bot instances per game (engine bots carry belief state)
      const bots: Record<PlayerId, Bot> = {
        white: createBot(pairing.white),
        black: createBot(pairing.black),
      };

      const { record, replay } = await playGame({
        bots,
        seed,
        engineHash: hash,
        runId,
        experiment: config.name,
        options: {
          ...config.options,
          ...pairing.options,
          recordReplay: true, // cheap; we decide below whether to keep it
        },
      });
      records.push(record);
      fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n');

      const anomalous =
        record.winType === 'invariant-violation' ||
        record.anomalies.length > 0 ||
        record.players.white.illegalActions + record.players.black.illegalActions > 0;
      if (replay && (anomalous || sampleRng() < replaySample)) {
        const tag = anomalous ? 'anomaly' : 'sample';
        const file = path.join(outDir, 'replays', `${tag}-${pairing.white}-vs-${pairing.black}-${seed}.json`);
        fs.writeFileSync(file, JSON.stringify(replay));
      }

      if (gameIndex % 25 === 0 || gameIndex === totalGames) {
        const rate = gameIndex / ((Date.now() - t0) / 1000);
        console.log(`  ${gameIndex}/${totalGames} games (${rate.toFixed(1)} games/s)`);
      }
    }
  }

  const rows = summarize(records);
  fs.writeFileSync(path.join(outDir, 'summary.csv'), summaryToCsv(rows));
  printSummary(rows);
  console.log(`[${config.name}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outDir}`);
  return records;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let config: ExperimentConfig;
  if (args.config) {
    config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  } else if (args.white && args.black) {
    config = {
      name: args.name ?? `adhoc-${args.white}-vs-${args.black}`,
      seed: Number(args.seed ?? 1),
      pairings: [
        {
          white: args.white,
          black: args.black,
          games: Number(args.games ?? 10),
          mirror: args.mirror === 'true',
        },
      ],
      options: {
        ...(args['max-turns'] ? { maxTurns: Number(args['max-turns']) } : {}),
        ...(args.legality ? { legality: args.legality as MatchOptions['legality'] } : {}),
      },
      replaySample: args['replay-sample'] ? Number(args['replay-sample']) : 0.01,
      out: args.out,
    };
  } else {
    console.error('Usage: cli.ts --config <file> | --white <bot> --black <bot> [--games N] [--seed N] [--mirror true]');
    process.exit(1);
  }

  await runExperiment(config);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

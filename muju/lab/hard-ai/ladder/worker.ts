/**
 * `node --import tsx lab/hard-ai/ladder/worker.ts --a <engine> --b <engine>
 *   --work fixed:<units>|wall:<ms> --handicaps <csv> --seed <n> --pairs <n>
 *   --shard-index <i> --shard-count <k> --legality as-shipped|strict --out <dir>`
 *
 * One shard of a ladder run (DESIGN §7.7): owns a contiguous slice of pair
 * indices (`pairing.ts#shardRange`) and plays them sequentially — games
 * inside a process must run sequentially because `setUpkeepVariant`,
 * `setElementGraph`, `setCombatHandicap` are module globals (`runner.ts`).
 * Writes its own `games-<i>.jsonl` and `pairs-<i>.jsonl` under `--out`
 * (`shard.ts` merges every shard's files after all exit). Exits non-zero on
 * an uncaught error so `shard.ts` can fail the whole run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { playGame } from '../../harness/runner';
import type { GameRecord } from '../../harness/types';
import { buildPairs, expandPair, shardRange, gameScoreFor, pairScore, type GameSpec } from './pairing';
import { resolveEngine, parseWorkSpec, workKey, type WorkSpec } from './engines';
import { HARD_DIVERGENCE_ANOMALY, hardBotDivergences } from '../bots/hard';

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

export interface PairRow {
  pairIndex: number;
  seed: number;
  handicap: number;
  scoreA: number; // pairScore, A's perspective, ∈ {0, 0.5, 1, 1.5, 2}
  aWhiteWinType: string;
  bWhiteWinType: string;
}

async function playOneGame(args: WorkerArgs, spec: GameSpec, runId: string): Promise<GameRecord> {
  const divergencesBefore = hardBotDivergences();
  const engineA = resolveEngine(args.a);
  const engineB = resolveEngine(args.b);
  const whiteEngine = spec.white === 'A' ? engineA : engineB;
  const blackEngine = spec.black === 'A' ? engineA : engineB;
  const white = whiteEngine.createBot(args.work);
  const black = blackEngine.createBot(args.work);
  const { record } = await playGame({
    bots: { white, black },
    seed: spec.seed,
    engineHash: `${whiteEngine.configHash(args.work)}__vs__${blackEngine.configHash(args.work)}`,
    runId,
    options: {
      legality: args.legality,
      blackCrystalHandicap: spec.handicap,
      recordReplay: false,
      checkInvariants: true,
    },
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
  return record;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = `ladder-${args.a}-vs-${args.b}-${workKey(args.work)}-${args.seed}`;
  const allPairs = buildPairs(args.pairs, args.seed, args.handicaps);
  const { start, end } = shardRange(args.pairs, args.shardCount, args.shardIndex);
  const myPairs = allPairs.slice(start, end);

  fs.mkdirSync(args.out, { recursive: true });
  const gamesPath = path.join(args.out, `games-${args.shardIndex}.jsonl`);
  const pairsPath = path.join(args.out, `pairs-${args.shardIndex}.jsonl`);
  const gamesStream = fs.createWriteStream(gamesPath, { flags: 'w' });
  const pairsStream = fs.createWriteStream(pairsPath, { flags: 'w' });

  for (const pair of myPairs) {
    const [gA, gB] = expandPair(pair);
    const recA = await playOneGame(args, gA, runId); // A-white
    const recB = await playOneGame(args, gB, runId); // B-white
    gamesStream.write(JSON.stringify(recA) + '\n');
    gamesStream.write(JSON.stringify(recB) + '\n');

    const scoreAInGameA = gameScoreFor('A', recA.winner === 'white' ? 'A' : recA.winner === 'black' ? 'B' : null);
    const scoreAInGameB = gameScoreFor('A', recB.winner === 'white' ? 'B' : recB.winner === 'black' ? 'A' : null);
    const row: PairRow = {
      pairIndex: pair.pairIndex,
      seed: pair.seed,
      handicap: pair.handicap,
      scoreA: pairScore(scoreAInGameA, scoreAInGameB),
      aWhiteWinType: recA.winType,
      bWhiteWinType: recB.winType,
    };
    pairsStream.write(JSON.stringify(row) + '\n');
  }

  await new Promise<void>(resolve => gamesStream.end(resolve));
  await new Promise<void>(resolve => pairsStream.end(resolve));
}

main().catch(err => {
  console.error(`ladder/worker: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exitCode = 1;
});

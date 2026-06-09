/**
 * Throughput bench: games/sec per ladder tier. Drives experiment sizing
 * (power math in lab/docs/EXPERIMENTS.md must scale to these numbers).
 *
 *   npx tsx lab/harness/bench.ts [--games 10]
 */
import type { PlayerId } from '../../src/game/types';
import { playGame } from './runner';
import type { Bot } from './types';
import { createBot } from './bots/index';
import { deriveSeed } from './rng';

const PAIRINGS: Array<[string, string]> = [
  ['Random', 'Random'],
  ['Greedy', 'Greedy'],
  ['Rush', 'AntiRush'],
  ['Expand', 'Rush'],
  ['AIv2-medium-fast', 'Greedy'],
  ['AIv2-hard-fast', 'Rush'],
];

async function main(): Promise<void> {
  const gamesArg = process.argv.indexOf('--games');
  const games = gamesArg >= 0 ? Number(process.argv[gamesArg + 1]) : 10;

  for (const [w, b] of PAIRINGS) {
    const t0 = Date.now();
    let turns = 0;
    let plies = 0;
    const isEngine = w.startsWith('AIv2') || b.startsWith('AIv2');
    const n = isEngine ? Math.max(2, Math.floor(games / 5)) : games;
    for (let g = 0; g < n; g++) {
      const bots: Record<PlayerId, Bot> = { white: createBot(w), black: createBot(b) };
      const { record } = await playGame({
        bots,
        seed: deriveSeed(12345, g),
        engineHash: 'bench',
        runId: 'bench',
        options: { recordReplay: false },
      });
      turns += record.turns;
      plies += record.plies;
    }
    const secs = (Date.now() - t0) / 1000;
    console.log(
      `${w} vs ${b}: ${n} games in ${secs.toFixed(1)}s = ${(n / secs).toFixed(2)} games/s ` +
        `(avg ${(turns / n).toFixed(0)} turns, ${(plies / n).toFixed(0)} plies)`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

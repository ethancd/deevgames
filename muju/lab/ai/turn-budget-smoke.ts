/**
 * Paired smoke test for the turn-time paces (`src/ai/turnTime.ts`): does the
 * SAME difficulty play better when its turn allowance is longer?
 *
 * Both seats run the shipped whole-turn path — one allowance per turn, debited
 * by what each search spent, `scaleToBudget` on, exactly as `worker/handler.ts`
 * configures the engine for a `mode: 'turn'` v2 request. The only difference
 * between the two seats is the number of milliseconds a turn is funded with.
 *
 * NOT a ladder row: no SPRT, no openings book, no config hash. A handful of
 * games at these budgets is a smell test for "the extra time buys something",
 * and it is reported with its own sample size so nobody can read strength into
 * it. `lab/hard-ai/ladder` is where a real measurement belongs.
 *
 *   node --import tsx lab/ai/turn-budget-smoke.ts [difficulty] [longMs] [shortMs] [games] [maxTurns] [deadlineS]
 */
import { readFileSync } from 'node:fs';
import { instantiateTactics } from '../../src/ai/wasm/kernel';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { isLegalAction } from '../../src/game/legality';
import { playGame } from '../harness/runner';
import type { EngineBot } from '../harness/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { TacticalSolver } from '../../src/ai/wasm/kernel';

const difficulty = (process.argv[2] ?? 'easy') as AIDifficulty;
const longMs = Number(process.argv[3] ?? 3000), shortMs = Number(process.argv[4] ?? 1000);
const games = Number(process.argv[5] ?? 6), maxTurns = Number(process.argv[6] ?? 40);
const deadline = Date.now() + Number(process.argv[7] ?? 540) * 1000;
const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));

/** `useAI.ts`'s whole-turn loop, minus React: search the turn, dispatch its
 * legal actions one by one, re-search from the remainder when they run out. */
function pacedBot(budgetMs: number, solver: TacticalSolver): EngineBot {
  let engine: AIEngineV2 | null = null, seed = 1, queue: AIAction[] = [], remainingMs = 0, turnKey = '';
  return {
    kind: 'engine',
    name: `aiv2-${difficulty}@${budgetMs}ms/turn`,
    onGameStart(_player, gameSeed) { seed = gameSeed; engine = null; queue = []; turnKey = ''; },
    async nextAction(state, player) {
      const key = `${state.turn.turnNumber}:${player}`;
      if (key !== turnKey) { turnKey = key; remainingMs = budgetMs; queue = []; }
      if (!engine) { engine = new AIEngineV2(difficulty); engine.setSeed(seed); engine.setTacticalSolver(solver); }
      // An action the live position no longer accepts is dropped with the rest
      // of its plan, as the hook drops an invalid suffix.
      if (queue.length && !isLegalAction(state, queue[0])) queue = [];
      if (!queue.length) {
        engine.setDifficulty(difficulty); engine.setConfig({ scaleToBudget: true });
        const result = await engine.findBestAction(state, Math.max(1, remainingMs));
        remainingMs = Math.max(0, remainingMs - result.timeMs);
        queue = [...result.plan.actions];
      }
      return queue.shift() ?? null;
    },
  };
}

const rows: Record<string, unknown>[] = [];
let longWins = 0, shortWins = 0, draws = 0;
for (let pair = 0; pair * 2 < games; pair++) {
  for (const longSeat of ['white', 'black'] as const) {
    if (Date.now() > deadline) break;
    const seed = 41 + pair;
    const shortSeat = longSeat === 'white' ? 'black' : 'white';
    const { record } = await playGame({
      bots: { [longSeat]: pacedBot(longMs, solver), [shortSeat]: pacedBot(shortMs, solver) } as never,
      seed, engineHash: `turn-budget-smoke:${difficulty}:${longMs}v${shortMs}`, runId: 'turn-budget-smoke',
      options: { maxTurns, checkInvariants: false },
    });
    if (record.winner === longSeat) longWins++; else if (record.winner === shortSeat) shortWins++; else draws++;
    rows.push({ seed, longSeat, winner: record.winner, winType: record.winType, turns: record.turns, ms: record.durationMs });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
}
console.log(JSON.stringify({ difficulty, longMs, shortMs, played: rows.length, longWins, shortWins, draws }));

/** Direct V2 legality smoke, independent of the T1 harness and worker guard.
 * Usage: node --import tsx lab/ai/phasing-selfplay.ts <new-output-dir> [games-per-difficulty]
 * Fixed-work screening is not Gate 1 strength evidence.
 *
 * The revision this stamps is `LADDER_RULES_VERSION`, never a literal. It said
 * `muju-phasing-1` until 2026-09-19, which under amendment A4 (inactivity clock
 * 20 plies, revision `muju-phasing-2`) would have labelled every NEW screening
 * run with a revision this tree no longer plays — the same drift `gate1-sources.ts`
 * documents, in the one lab/ai file that was outside that lane.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { listSourceFiles } from './source-files';
import { LADDER_RULES_VERSION } from '../hard-ai/ladder/ruleset';
import { AIEngineV2, TURN_BUDGET_MS } from '../../src/ai/engine-v2';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { createInitialGameState } from '../../src/game/board';
import { isLegalAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import type { AIAction, AIDifficulty } from '../../src/ai/types';

export const WORK_PER_TURN = { easy: 1200, medium: 3000, hard: 6000 };
export async function playPhasingSmoke(difficulty: AIDifficulty, seed: number,
  handicap: number, solver: TacticalSolver, workPerTurn = WORK_PER_TURN[difficulty], dispatch: 'plan' | 'first' = 'plan') {
  let state = createInitialGameState(undefined, 4, handicap, 'phasing');
  // Canonical initial UUIDs are presentation identity, not random game content.
  state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
  const engines = { white: new AIEngineV2(difficulty), black: new AIEngineV2(difficulty) };
  for (const [i, engine] of Object.values(engines).entries()) {
    engine.setSeed(seed + i); engine.setTacticalSolver(solver);
  }
  const trace: AIAction[] = [];
  let turns = 0, purchases = 0, promotions = 0, upkeeps = 0, remaining = 0;
  let wallRemaining = 0, turnKey = '', maxTurnMs = 0, turnMs = 0;
  let arrivals = 0, refunds = 0;
  while (state.phase === 'playing') {
    const key = `${state.turn.turnNumber}:${state.turn.currentPlayer}`;
    if (key !== turnKey) {
      maxTurnMs = Math.max(maxTurnMs, turnMs); turnMs = 0;
      if (++turns > 400) throw new Error(`Unterminated game ${difficulty}/${seed}`);
      turnKey = key; remaining = workPerTurn; wallRemaining = TURN_BUDGET_MS[difficulty];
    }
    const player = state.turn.currentPlayer;
    // Reserve slices for upkeep and Prepare in the SAME allowance as Act.
    // Charge each requested work slice in full: total requested <= workPerTurn.
    const decisionsLeft = state.turn.phase === 'action' ? state.turn.actionsRemaining + 3 : state.upkeepPending ? 3 : 2;
    const slice = Math.min(remaining, Math.max(1, Math.floor(remaining / decisionsLeft)));
    engines[player].setConfig({ fixedWork: slice }); remaining -= slice;
    const result = await engines[player].findBestAction(state,
      workPerTurn > 0 ? (slice > 0 ? Infinity : 0) : Math.max(0, wallRemaining / decisionsLeft));
    wallRemaining -= result.timeMs; turnMs += result.timeMs;
    if (!result.plan.actions.length) throw new Error('Empty engine plan');
    for (const action of dispatch === 'first' ? result.plan.actions.slice(0, 1) : result.plan.actions) {
      if (state.phase !== 'playing' || state.turn.currentPlayer !== player) break;
      if (!isLegalAction(state, action)) throw new Error(`Illegal ${JSON.stringify(action)}`);
      const before = state;
      state = applyAction(state, action);
      if (state === before) throw new Error('Legal action made no progress');
      trace.push(action);
      purchases += Number(action.type === 'BUY_UNIT'); promotions += Number(action.type === 'PROMOTE_UNIT');
      upkeeps += Number(action.type === 'PAY_UPKEEP');
      for (const pending of before.pendingSummons ?? []) {
        if (state.pendingSummons?.some(s => s.id === pending.id)) continue;
        if (state.board.units.some(u => u.id === pending.id)) arrivals++; else refunds++;
      }
      if (trace.length > 10000) throw new Error('Action cap exceeded');
    }
  }
  maxTurnMs = Math.max(maxTurnMs, turnMs);
  return { difficulty, seed, handicap, rules: LADDER_RULES_VERSION, workPerTurn, dispatch,
    turns, actions: trace.length, purchases, promotions, upkeeps, arrivals, refunds,
    winner: state.winner, reason: state.victoryReason, illegalActions: 0,
    maxTurnMs, lastTurnWallRemainderMs: wallRemaining,
    traceSha256: sha(JSON.stringify(trace)), trace };
}

const sha = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) throw new Error('Provide a new evidence directory');
  const games = Number(process.argv[3] ?? 3);
  if (!Number.isInteger(games) || games < 1) throw new Error('Invalid game count');
  mkdirSync(out); // Refuse to overwrite previous evidence.
  const bytes = readFileSync('src/ai/wasm/tactics.wasm'), solver = await instantiateTactics(bytes);
  const files = listSourceFiles(['src/ai', 'src/game', 'assembly', 'lab/ai'], '.ts');
  const hashes = Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
  writeFileSync(`${out}/identity.json`, JSON.stringify({ rules: LADDER_RULES_VERSION, abi: 7,
    base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: true, files: hashes, packageLockSha256: sha(readFileSync('package-lock.json')),
    wasmSha256: sha(bytes), workPerTurn: WORK_PER_TURN, node: process.version,
    note: 'Fixed-work legality screening. Not Gate 1; worker Phasing guard stays closed.' }, null, 2) + '\n');
  const rows = [];
  for (const difficulty of ['easy', 'medium', 'hard'] as const) for (let i = 0; i < games; i++) {
    const { trace, ...row } = await playPhasingSmoke(difficulty, 20260918 + i, i % 2 ? 3 : 0, solver,
      WORK_PER_TURN[difficulty], i % 3 === 2 ? 'first' : 'plan');
    writeFileSync(`${out}/${difficulty}-${i}.json`, JSON.stringify({ ...row, trace }, null, 2) + '\n');
    rows.push(row); console.log(JSON.stringify(row));
  }
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const group = rows.filter(r => r.difficulty === difficulty);
    if (!group.every(r => r.purchases > 0)) throw new Error(`No purchases in ${difficulty} smoke`);
  }
  writeFileSync(`${out}/summary.json`, JSON.stringify({ games: rows.length,
    illegalActions: 0, cappedGames: 0, rows,
    note: 'Natural terminations include inactivity draws. No strength or draw-rate gate claim.' }, null, 2) + '\n');
}

/**
 * P8 lane 16: reproduce ONE recorded slow turn at fixed work, with phase
 * attribution. Diagnostic only; imports nothing into the engine.
 *
 * node --import tsx --cpu-prof --cpu-prof-dir=<dir> repro.ts \
 *   --replay <file> --side black --turn-index 22 --engine desktop --work 100000
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadReplay, reconstruct, withMatchRules } from '../../../hard-ai/analyze/replay';
import { hardEnginePatch } from '../../../hard-ai/bots/hard';
import { HardEngine } from '../../../../src/ai/hard/engine';
import { applyAction } from '../../../../src/ai/simulate';
import type { GameState } from '../../../../src/game/types';

interface Args { replay: string; side: 'white' | 'black'; turnIndex: number; engine: string; work: number; wall: number; out: string | null }
const a: Args = { replay: '', side: 'black', turnIndex: 22, engine: 'desktop', work: 100000, wall: 0, out: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const v = argv[i + 1];
  switch (argv[i]) {
    case '--replay': a.replay = v; i++; break;
    case '--side': a.side = v as 'white' | 'black'; i++; break;
    case '--turn-index': a.turnIndex = Number(v); i++; break;
    case '--engine': a.engine = v.replace(/^hard@/, ''); i++; break;
    case '--work': a.work = Number(v); i++; break;
    case '--wall': a.wall = Number(v); i++; break;
    case '--out': a.out = v; i++; break;
    default: throw new Error(`repro: unknown argument ${argv[i]}`);
  }
}

async function main(): Promise<void> {
  const replay = loadReplay(path.resolve(a.replay));
  const recon = reconstruct(replay);
  const turn = recon.bySide[a.side].find(t => t.seatTurnIndex === a.turnIndex);
  if (turn === undefined) throw new Error('turn not found');
  const recorded = replay.meta.players[a.side].turnMs ?? [];
  const patch = hardEnginePatch(a.engine);

  const result: Record<string, unknown> = {
    replay: path.basename(a.replay), side: a.side, turnIndex: a.turnIndex,
    gameTurn: turn.turnNumber, engine: `hard@${a.engine}`,
    mode: a.wall > 0 ? `wall:${a.wall}` : `fixed:${a.work}`,
    recordedMs: recorded[a.turnIndex] ?? null,
  };

  await withMatchRules(replay.options, async () => {
    const engine = new HardEngine(patch);
    engine.setSeed(replay.meta.seed ?? 1);
    const t0 = Date.now();
    const r = a.wall > 0
      ? await engine.searchTurn(turn.startState, { targetMs: a.wall, deadlineMs: a.wall })
      : await engine.searchTurn(turn.startState, { work: a.work });
    const searchTurnMs = Date.now() - t0;
    result.searchTurnMs = searchTurnMs;
    result.statsElapsedMs = Math.round(r.stats.elapsedMs);
    result.stopReason = r.stats.stopReason;
    result.source = r.source;
    result.depth = r.depth;
    result.work = r.work;
    result.nodes = r.stats.nodes;
    result.qnodes = r.stats.qnodes;
    result.turnNodes = r.stats.turnNodes;
    result.evals = r.stats.evals;
    result.proverCalls = r.stats.proverCalls;
    result.replicaDivergences = r.stats.replicaDivergences;
    result.workByClass = [...r.stats.byClass].join(',');
    result.planLength = r.actions.length;
    result.plan = r.actions.map(x => x.type);

    // The canonical cost of the chosen plan, OUTSIDE the engine: exactly what
    // `lab/harness/runner.ts` pays after the adapter returns.
    let st: GameState = turn.startState;
    const perAction: Array<{ type: string; applyMs: number }> = [];
    for (const act of r.actions) {
      const t1 = Date.now();
      st = applyAction(st, act);
      perAction.push({ type: act.type, applyMs: Date.now() - t1 });
    }
    result.canonicalApplyOfReturnedPlan = perAction;
    result.canonicalApplyTotalMs = perAction.reduce((s, x) => s + x.applyMs, 0);

    // The canonical cost of the turn as RECORDED (the harness's own replay).
    let st2: GameState = turn.startState;
    const perRecorded: Array<{ type: string; applyMs: number }> = [];
    for (const act of turn.actions) {
      const t1 = Date.now();
      st2 = applyAction(st2, act);
      perRecorded.push({ type: act.type, applyMs: Date.now() - t1 });
    }
    result.canonicalApplyOfRecordedTurn = perRecorded;
    result.canonicalApplyRecordedTotalMs = perRecorded.reduce((s, x) => s + x.applyMs, 0);
  });

  console.log(JSON.stringify(result, null, 2));
  if (a.out !== null) {
    fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
    fs.writeFileSync(path.resolve(a.out), JSON.stringify(result, null, 2) + '\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

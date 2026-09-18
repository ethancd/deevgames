/** Cost probes for the gate commands the three designs specify.
 *  Read-only. node --import tsx docs/hard-ai/design/feasibility/gate-cost.ts */
import { createInitialGameState } from '../../../../src/game/board';
import { generateAllActions } from '../../../../src/ai/moves';
import { applyAction } from '../../../../src/ai/simulate';
import { AIEngineV2 } from '../../../../src/ai/engine-v2';
import { seededRandom } from '../../../../src/ai/runtime';
import type { GameState } from '../../../../src/game/types';

const rng = seededRandom(11);
function randomGame(targetUnits: number): GameState {
  let s: GameState = createInitialGameState();
  let guard = 0;
  while (s.phase === 'playing' && s.board.units.length < targetUnits && guard++ < 3000) {
    const acts = generateAllActions(s, s.turn.currentPlayer);
    if (!acts.length) break;
    const buys = acts.filter(a => a.type === 'BUY_UNIT');
    const pool = buys.length && rng() < 0.8 ? buys : acts;
    const n = applyAction(s, pool[Math.floor(rng() * pool.length)]);
    s = n === s ? applyAction(s, acts[acts.length - 1]) : n;
  }
  return s;
}

// --- (1) cost of one exhaustive 4-action turn enumeration on a mid-game position
const mid = randomGame(16);
console.log(JSON.stringify({ probe: 'position', units: mid.board.units.length, turn: mid.turn.turnNumber, phase: mid.turn.phase }));
const me = mid.turn.currentPlayer;
let nodes = 0, seqs = 0;
const LIMIT = 3_000_000;
let capped = false;
const t0 = performance.now();
function dfs(s: GameState) {
  if (capped) return;
  if (++nodes > LIMIT) { capped = true; return; }
  for (const a of generateAllActions(s, me)) {
    const n = applyAction(s, a);
    if (n === s) continue;
    if (a.type === 'END_ACTION_PHASE') { seqs++; continue; }
    dfs(n);
    if (capped) return;
  }
}
dfs(mid);
const ms = performance.now() - t0;
console.log(JSON.stringify({ probe: 'bruteForceTurn', nodes, sequences: seqs, capped, ms: +ms.toFixed(0),
  nodesPerSec: Math.round(nodes / (ms / 1000)) }));

// --- (2) cost of one AIEngineV2 decision at various fixedWork levels
for (const work of [1200, 20000, 200000]) {
  const e = new AIEngineV2('hard');
  e.setSeed(1); e.setConfig({ fixedWork: work });
  const t = performance.now();
  const r = await e.findBestAction(mid);
  console.log(JSON.stringify({ probe: 'aiv2Decision', fixedWork: work, ms: +(performance.now() - t).toFixed(0),
    iterations: r.stats?.iterations, candidates: r.stats?.candidates, stopReason: r.stats?.stopReason }));
}

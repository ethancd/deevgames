/** Read-only feasibility probe: reproduce the perft / throughput numbers the
 *  three Hard-AI designs cite. Run: node --import tsx docs/hard-ai/design/feasibility/perft.ts */
import { createInitialGameState } from '../../../../src/game/board';
import { generateAllActions } from '../../../../src/ai/moves';
import { applyAction } from '../../../../src/ai/simulate';
import { evaluatePosition } from '../../../../src/ai/evaluation';
import { getAllSpawnPositions } from '../../../../src/game/spawning';
import type { GameState } from '../../../../src/game/types';

function stateKey(s: GameState): string {
  return s.turn.phase + '|' + s.turn.actionsRemaining + '|' + s.players.white.resources + '/' + s.players.black.resources + '|' +
    [...s.board.units].map(u => `${u.definitionId}@${u.position.x},${u.position.y}#${u.damageTaken}:${u.owner}`).sort().join(';');
}
function posKey(s: GameState): string {
  return s.players.white.resources + '/' + s.players.black.resources + '|' +
    [...s.board.units].map(u => `${u.definitionId}@${u.position.x},${u.position.y}:${u.owner}`).sort().join(';') + '|' +
    s.board.cells.flat().map(c => c.resourceLayers).join(',');
}

const t0 = performance.now();
const root = createInitialGameState();
const me = root.turn.currentPlayer;
let sequences = 0;
const mid = new Set<string>();
const ends = new Set<string>();
function dfs(s: GameState) {
  mid.add(stateKey(s));
  for (const a of generateAllActions(s, me)) {
    const n = applyAction(s, a);
    if (n === s) continue;
    if (a.type === 'END_ACTION_PHASE') { sequences++; ends.add(posKey(n)); continue; }
    dfs(n);
  }
}
dfs(root);
const t1 = performance.now();
console.log(JSON.stringify({
  perftActions_initial_4: sequences,
  perftMidStates: mid.size,
  perftTurns_endPositions: ends.size,
  ms: +(t1 - t0).toFixed(1),
}));

// throughput of the canonical evaluator and of getAllSpawnPositions
let sink = 0;
const N = 20000;
const t2 = performance.now();
for (let i = 0; i < N; i++) sink += evaluatePosition(root, 'white');
const t3 = performance.now();
for (let i = 0; i < N; i++) sink += getAllSpawnPositions('white', root.board).length;
const t4 = performance.now();
// applyAction throughput on a legal move
const mv = generateAllActions(root, me).find(a => a.type === 'MOVE')!;
const t5 = performance.now();
for (let i = 0; i < N; i++) sink += applyAction(root, mv).turn.actionsRemaining;
const t6 = performance.now();
console.log(JSON.stringify({
  evaluatePosition_us: +((t3 - t2) * 1000 / N).toFixed(2),
  getAllSpawnPositions_us: +((t4 - t3) * 1000 / N).toFixed(2),
  applyAction_move_us: +((t6 - t5) * 1000 / N).toFixed(2),
  sink: sink > 0 ? 'ok' : 'ok',
}));

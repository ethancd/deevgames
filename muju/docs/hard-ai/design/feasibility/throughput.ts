/** Throughput on a LIVE ~16-unit mid-game position, the basis of ET §1.4's 71.9 us claim. */
import { createInitialGameState } from '../../../../src/game/board';
import { generateAllActions } from '../../../../src/ai/moves';
import { applyAction } from '../../../../src/ai/simulate';
import { evaluatePosition } from '../../../../src/ai/evaluation';
import { getAllSpawnPositions } from '../../../../src/game/spawning';
import { seededRandom } from '../../../../src/ai/runtime';
import type { GameState } from '../../../../src/game/types';

const rng = seededRandom(7);
let s: GameState = createInitialGameState();
let plies = 0;
while (s.phase === 'playing' && s.board.units.length < 16 && plies < 4000) {
  const acts = generateAllActions(s, s.turn.currentPlayer);
  if (!acts.length) break;
  // bias toward buys so the board fills
  const buys = acts.filter(a => a.type === 'BUY_UNIT');
  const pick = (buys.length && rng() < 0.85 ? buys : acts)[Math.floor(rng() * (buys.length && rng() < 0.85 ? buys.length : acts.length)) % (buys.length && true ? Math.max(1, (buys.length && rng() < 0.85 ? buys.length : acts.length)) : acts.length)];
  const n = applyAction(s, pick ?? acts[0]);
  if (n === s) { s = applyAction(s, acts[acts.length - 1]); } else s = n;
  plies++;
}
console.log(JSON.stringify({ units: s.board.units.length, turn: s.turn.turnNumber, plies, phase: s.phase }));
if (s.phase !== 'playing') { console.log('game ended; aborting'); process.exit(0); }

let sink = 0;
const N = 20000;
let t = performance.now();
for (let i = 0; i < N; i++) sink += evaluatePosition(s, 'white');
const evalUs = (performance.now() - t) * 1000 / N;
t = performance.now();
for (let i = 0; i < N; i++) sink += getAllSpawnPositions('white', s.board).length + getAllSpawnPositions('black', s.board).length;
const spawn2Us = (performance.now() - t) * 1000 / N;
const acts = generateAllActions(s, s.turn.currentPlayer);
const mv = acts.find(a => a.type === 'MOVE') ?? acts[0];
t = performance.now();
for (let i = 0; i < N; i++) sink += applyAction(s, mv).turn.actionsRemaining;
const applyUs = (performance.now() - t) * 1000 / N;
t = performance.now();
for (let i = 0; i < N; i++) sink += generateAllActions(s, s.turn.currentPlayer).length;
const genUs = (performance.now() - t) * 1000 / N;
console.log(JSON.stringify({
  units: s.board.units.length,
  evaluatePosition_us: +evalUs.toFixed(2),
  sixSpawnCalls_us: +(spawn2Us * 3).toFixed(2),
  spawnShareOfEval: +((spawn2Us * 3) / evalUs).toFixed(2),
  applyAction_us: +applyUs.toFixed(2),
  generateAllActions_us: +genUs.toFixed(2),
  legalActions: acts.length,
  evalsIn3s: Math.round(3_000_000 / evalUs),
  sink: sink ? 'ok' : 'ok',
}));

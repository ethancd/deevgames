/**
 * E4.3 candidate A: write ONE reconstructed seat-turn start position out as
 * plain `GameState` JSON, so `tests/ai/hard/p8-rescue-cap.test.ts` needs
 * neither the E3 run artifacts nor the lab to replay it — the shape
 * `tests/ai/hard/p6-g2-black-t20.json` already has. Diagnostic only.
 *
 * node --import tsx dump-position.ts --replay <file> --side white \
 *   --turn-index 24 --out ../../../../tests/ai/hard/p8-white-t25.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadReplay, reconstruct } from '../../../hard-ai/analyze/replay';

const a = { replay: '', side: 'black' as 'white' | 'black', turnIndex: 22, out: '' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const v = argv[i + 1];
  switch (argv[i]) {
    case '--replay': a.replay = v; i++; break;
    case '--side': a.side = v as 'white' | 'black'; i++; break;
    case '--turn-index': a.turnIndex = Number(v); i++; break;
    case '--out': a.out = v; i++; break;
    default: throw new Error(`dump-position: unknown argument ${argv[i]}`);
  }
}

const replay = loadReplay(path.resolve(a.replay));
const recon = reconstruct(replay);
const turn = recon.bySide[a.side].find(t => t.seatTurnIndex === a.turnIndex);
if (turn === undefined) throw new Error('turn not found');
fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
fs.writeFileSync(path.resolve(a.out), JSON.stringify(turn.startState) + '\n');
const board = turn.startState.board as { units?: unknown[] };
const units = Array.isArray(board.units) ? board.units.length : -1;
console.log(
  JSON.stringify({
    out: a.out, side: a.side, turnIndex: a.turnIndex, gameTurn: turn.turnNumber,
    current: turn.startState.turn.currentPlayer, phase: turn.startState.turn.phase,
    actionsRemaining: turn.startState.turn.actionsRemaining, units,
  }),
);

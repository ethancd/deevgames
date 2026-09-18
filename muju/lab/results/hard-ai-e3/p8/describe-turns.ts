/** P8 lane 16: reconstruct the slow game's late turns and describe them. */
import path from 'node:path';
import fs from 'node:fs';
import { loadReplay, reconstruct } from '../../../hard-ai/analyze/replay';
import type { GameState } from '../../../../src/game/types';

function describe(state: GameState): string {
  const units: Record<string, string[]> = { white: [], black: [] };
  const at: string[] = [];
  for (const u of state.board.units) {
    units[u.owner]?.push(u.definitionId);
    at.push(`${u.owner}:${u.definitionId}@${u.position.x},${u.position.y}`);
  }
  const tally = (list: string[]): string => {
    const by = new Map<string, number>();
    for (const d of list) by.set(d, (by.get(d) ?? 0) + 1);
    return [...by.entries()].sort().map(([d, n]) => `${n}x${d}`).join(' ');
  };
  return [
    `turn ${state.turn.turnNumber}, ${state.turn.currentPlayer} to move, phase "${state.turn.phase}", actionsRemaining ${state.turn.actionsRemaining}, upkeepPending ${state.upkeepPending === true}`,
    `white: ${units.white.length} [${tally(units.white)}] bank ${state.players.white.resources}`,
    `black: ${units.black.length} [${tally(units.black)}] bank ${state.players.black.resources}`,
    `units: ${at.join(' ')}`,
  ].join('\n    ');
}

const file = process.argv[2];
const t0 = Date.now();
const replay = loadReplay(path.resolve(file));
const recon = reconstruct(replay);
console.log(`reconstruct ms=${Date.now() - t0} plies=${recon.plies} winner=${recon.winner}`);
for (const side of ['white', 'black'] as const) {
  const recorded = replay.meta.players[side].turnMs ?? [];
  const turns = recon.bySide[side];
  console.log(`\n== ${side} (${replay.meta.players[side].bot}) seatTurns=${turns.length}`);
  for (const t of turns) {
    const ms = recorded[t.seatTurnIndex] ?? 0;
    if (ms < 20000) continue;
    console.log(`  seatTurnIndex ${t.seatTurnIndex} (game turn ${t.turnNumber}) recorded ${ms} ms, ${t.actions.length} actions, noops ${t.noops}`);
    console.log('    ' + describe(t.startState));
    console.log('    actions: ' + t.actions.map(a => a.type).join(','));
  }
}
const out = process.argv[3];
if (out !== undefined) {
  const dump: Record<string, unknown> = {};
  for (const side of ['white', 'black'] as const) {
    const recorded = replay.meta.players[side].turnMs ?? [];
    for (const t of recon.bySide[side]) {
      if ((recorded[t.seatTurnIndex] ?? 0) < 20000) continue;
      dump[`${side}-${t.seatTurnIndex}`] = t.startState;
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify(dump));
}

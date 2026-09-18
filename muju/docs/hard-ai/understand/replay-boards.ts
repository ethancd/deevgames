/** Read-only: prints reserve maps + unit maps at chosen revisions of the archived match.
 * Run: node --import tsx docs/hard-ai/understand/replay-boards.ts 5 17 26 34 */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction } from '../../../src/ai/simulate';
import { getUnitDefinition } from '../../../src/game/units';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';

const want = new Set((process.argv.slice(2).length ? process.argv.slice(2) : ['5','17','26','34']).map(Number));
let state = structuredClone(match.initialState) as GameState;
const show = (rev: number) => {
  console.log(`===== revision ${rev} — ${state.turn.turnNumber}${state.turn.currentPlayer} bank W${state.players.white.resources}/B${state.players.black.resources}`);
  const glyph = new Map<string,string>();
  for (const u of state.board.units) {
    const d = getUnitDefinition(u.definitionId);
    glyph.set(`${u.position.x},${u.position.y}`, (u.owner === 'white' ? d.element[0].toUpperCase() : d.element[0]) + d.tier);
  }
  console.log('    ' + [...'ABCDEFGHIJ'].map(c => c.padStart(4)).join(''));
  for (let y = 0; y < 10; y++) {
    let line = String(y + 1).padStart(3) + ' ';
    for (let x = 0; x < 10; x++) {
      const r = state.board.cells[y][x].resourceLayers;
      line += ((glyph.get(`${x},${y}`) ?? '··') + ':' + r).padStart(4);
    }
    console.log(line);
  }
  const total = state.board.cells.flat().reduce((n,c)=>n+c.resourceLayers,0);
  console.log('board reserves total', total);
};
if (want.has(match.recordingStart.revision)) show(match.recordingStart.revision);
for (const c of (match.commands as any[]).filter(c => c.revision > match.recordingStart.revision)) {
  for (const a of c.actions as AIAction[]) state = applyAction(state, a);
  if (want.has(c.revision)) show(c.revision);
}

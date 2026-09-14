import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { searchTurn, describeEvidence } from '../../../server/analysis/tactics';
import { WorkBudget } from '../../../server/analysis/core';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getMoveCost } from '../../../src/game/movement';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getHomeOccupier } from '../../../src/game/victory';
import type { GameState, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
const parse = (s: string) => ({ x: s.charCodeAt(0) - 65, y: parseInt(s.slice(1), 10) - 1 });
const sq = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
const base = structuredClone(match.initialState) as GameState;

console.log('BFS distances from White spawn squares to J10 / I10 / H10 (Radi speed 3, 4 AP => 12 squares max):');
for (const s of getAllSpawnPositions('white', base.board)) {
  const d = (t: string) => getMoveCost(s, parse(t), 1, base.board);
  console.log(`  ${sq(s)}: ->J10 ${d('J10')}  ->I10 ${d('I10')}  ->H10 ${d('H10')}`);
}
console.log('\nblockPurchases witness in full:');
{
  const b = new WorkBudget(400000, 45000);
  const r = searchTurn(base, b, { categories: ['combined'], objective: 'blockPurchases', quota: 40000 });
  console.log(' proof', r.proof, 'bestScore', r.bestScore, 'nodes', r.search.nodes);
  if (r.best) { const d: any = describeEvidence(base, r.best, undefined, true); console.log(' witness:', JSON.stringify(d.witness)); 
    console.log(' black spawn after:', getAllSpawnPositions('black', (r.best as any).after.board).map(sq).join(' ') || 'NONE');
    console.log(' white occupies black home?', !!getHomeOccupier((r.best as any).after.board, 'white'));
    console.log(' phase after:', (r.best as any).after.phase, (r.best as any).after.victoryReason ?? ''); }
}
console.log('\nHome-occupation attempt: Radi@H1 racing to J10');
{
  let s: GameState = base;
  const seq: AIAction[] = [{ type: 'BUY_UNIT', definitionId: 'lightning_1', position: parse('H1') }, { type: 'END_PLACE_PHASE' }];
  for (const a of seq) { if (!isLegalAction(s, a)) { console.log('  illegal', JSON.stringify(a)); break; } s = applyAction(s, a); }
  const id = 'unit-white-3-0';
  for (const step of ['I1','I10','J10']) {
    const a: AIAction = { type: 'MOVE', unitId: id, to: parse(step) };
    console.log(`  MOVE ->${step} legal=${isLegalAction(s, a)} cost=${getMoveCost(s.board.units.find(u=>u.id===id)!.position, parse(step), 3, s.board)} ap=${s.turn.actionsRemaining}`);
    if (isLegalAction(s, a)) s = applyAction(s, a);
  }
  console.log('  radi at', sq(s.board.units.find(u=>u.id===id)!.position), 'ap left', s.turn.actionsRemaining);
}

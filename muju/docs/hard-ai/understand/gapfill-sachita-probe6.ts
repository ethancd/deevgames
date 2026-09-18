import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getActionsPerTurn } from '../../../src/game/rules';
import type { GameState, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
const parse = (s: string) => ({ x: s.charCodeAt(0) - 65, y: parseInt(s.slice(1), 10) - 1 });
const sq = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
let s = structuredClone(match.initialState) as GameState;
console.log('victoryRule on the fixture state:', JSON.stringify((s as any).victoryRule), '| actionsPerTurn', getActionsPerTurn(s), '| fixture actionsPerTurn field', (s as any).actionsPerTurn);
console.log('fixture finalState victoryReason:', (match.finalState as any).victoryReason, 'winner', (match.finalState as any).winner, 'victoryRule', JSON.stringify((match.finalState as any).victoryRule));
const seq: AIAction[] = [
  { type: 'BUY_UNIT', definitionId: 'lightning_1', position: parse('G1') },
  { type: 'END_PLACE_PHASE' },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('G4') },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('G7') },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('G10') },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('J10') },
];
for (const a of seq) {
  const legal = isLegalAction(s, a);
  const before = s;
  s = applyAction(s, a);
  console.log(` ${legal ? 'ok ' : 'ILLEGAL '} ${a.type}${(a as any).to ? ' ->' + sq((a as any).to) : ''}${(a as any).position ? ' @' + sq((a as any).position) : ''}` +
    `  ap=${s.turn.actionsRemaining} bank=${s.players.white.resources} phase=${s.phase}${(s as any).victoryReason ? ' victoryReason=' + (s as any).victoryReason + ' winner=' + s.winner : ''}`);
  if (s === before && !legal) break;
}
console.log('\nBlack spawn squares with a White unit on J10:', getAllSpawnPositions('black', s.board).map(sq).join(' ') || 'NONE');
const pre = seq.slice(0, -1).reduce((st, a) => applyAction(st, a), structuredClone(match.initialState) as GameState);
const landed = transitionWithoutCheckmate(pre, seq[seq.length - 1]);
const ev = analyzeHomeDefenseEvidence(landed, 'white', transitionWithoutCheckmate);
console.log('analyzeHomeDefense:', JSON.stringify({ result: ev.result, nodes: ev.nodes, method: ev.method, cutoffReason: ev.cutoffReason }));

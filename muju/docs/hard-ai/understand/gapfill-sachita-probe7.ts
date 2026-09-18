/** How long was White's turn-3 home-race window open? (gapfill 2026-09-14)
 * Run: node --import tsx docs/hard-ai/understand/gapfill-sachita-probe7.ts
 * Pure reachability: is the enemy corner empty, and can any affordable purchase
 * (or existing unit) reach it inside the 4-AP budget? */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction } from '../../../src/ai/simulate';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getAffordablePurchases } from '../../../src/game/building';
import { getMoveCost } from '../../../src/game/movement';
import { getUnitAt } from '../../../src/game/board';
import { getUnitDefinition } from '../../../src/game/units';
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
const sq = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
const CORNER: Record<PlayerId, Position> = { white: { x: 9, y: 9 }, black: { x: 0, y: 0 } };

function homeRace(s: GameState, side: PlayerId) {
  const goal = CORNER[side];
  const sitting = getUnitAt(s.board, goal);
  if (sitting) return `enemy corner ${sq(goal)} plugged by a ${sitting.owner} ${getUnitDefinition(sitting.definitionId).name}`;
  const out: string[] = [];
  for (const u of s.board.units.filter(u => u.owner === side)) {
    const c = getMoveCost(u.position, goal, getUnitDefinition(u.definitionId).speed, s.board);
    if (c !== null && c <= 4) out.push(`existing ${getUnitDefinition(u.definitionId).name}@${sq(u.position)} reaches in ${c} AP`);
  }
  if (s.turn.phase === 'place') for (const d of getAffordablePurchases(s.players[side].resources))
    for (const p of getAllSpawnPositions(side, s.board)) {
      const st = applyAction(s, { type: 'BUY_UNIT', definitionId: d.id, position: p });
      if (st === s) continue;
      const c = getMoveCost(p, goal, d.speed, st.board);
      if (c !== null && c <= 4) out.push(`BUY ${d.name}(${d.cost}c)@${sq(p)} reaches in ${c} AP`);
    }
  return out.length ? out.join(' | ') : 'no unit and no purchase reaches it in 4 AP';
}

let s = structuredClone(match.initialState) as GameState;
console.log(`turn ${s.turn.turnNumber} ${s.turn.currentPlayer} (fixture start): ${homeRace(s, 'white')}`);
for (const c of (match.commands as any[]).filter(c => c.revision > 5)) {
  for (const a of c.actions as AIAction[]) s = applyAction(s, a);
  if (s.phase !== 'playing' || s.turn.turnNumber > 8) break;
  const side = s.turn.currentPlayer as PlayerId;
  console.log(`after rev ${c.revision} (${c.player}) -> turn ${s.turn.turnNumber} ${side}: ${homeRace(s, side)}`);
}

/** Read-only replay of the archived Codex–Claude match.
 * Run: node --import tsx docs/hard-ai/understand/replay-codex-claude.ts
 * Writes nothing; prints a per-command ledger to stdout as JSON lines. */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getUnitDefinition } from '../../../src/game/units';
import { projectedIncome, getTotalBoardResources } from '../../../src/game/mining';
import { upkeepDue } from '../../../src/game/upkeep';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';

const sq = (p: {x:number;y:number}) => `${String.fromCharCode(65+p.x)}${p.y+1}`;
const army = (s: GameState, p: PlayerId) => s.board.units.filter(u => u.owner === p);
const armyValue = (s: GameState, p: PlayerId) => army(s,p).reduce((n,u)=>n+getUnitDefinition(u.definitionId).cost,0);
const roster = (s: GameState, p: PlayerId) => army(s,p).map(u=>`${getUnitDefinition(u.definitionId).name}@${sq(u.position)}`).sort().join(' ');

let state = structuredClone(match.initialState) as GameState;
const rows: any[] = [];
const snap = (label: string, revision: number) => ({
  revision, label,
  turn: `${state.turn.turnNumber}${state.turn.currentPlayer==='white'?'w':'b'}`,
  phase: state.phase, turnPhase: state.turn.phase,
  bankW: state.players.white.resources, bankB: state.players.black.resources,
  gainedW: state.players.white.resourcesGained, gainedB: state.players.black.resourcesGained,
  upkeepPaidW: state.players.white.resourcesUpkeep, upkeepPaidB: state.players.black.resourcesUpkeep,
  incomeW: projectedIncome(state,'white'), incomeB: projectedIncome(state,'black'),
  dueW: upkeepDue(state,'white'), dueB: upkeepDue(state,'black'),
  unitsW: army(state,'white').length, unitsB: army(state,'black').length,
  valueW: armyValue(state,'white'), valueB: armyValue(state,'black'),
  boardCrystals: getTotalBoardResources(state.board),
  rosterW: roster(state,'white'), rosterB: roster(state,'black'),
});
rows.push(snap('start(rev5)', match.recordingStart.revision));
for (const command of match.commands.filter((c:any) => c.revision > match.recordingStart.revision)) {
  const before = state;
  for (const action of command.actions as AIAction[]) {
    if (!isLegalAction(state, action, command.player as PlayerId)) throw new Error(`rev ${command.revision}: illegal ${action.type}`);
    state = applyAction(state, action);
  }
  const row: any = snap(`after rev ${command.revision} (${command.player})`, command.revision);
  row.mover = command.player;
  row.actions = (command.actions as any[]).map(a => a.type === 'BUY_UNIT' ? `BUY ${getUnitDefinition(a.definitionId).name}@${sq(a.position)}`
    : a.type === 'MOVE' ? `MOVE ${getUnitDefinition(before.board.units.find(u=>u.id===a.unitId)?.definitionId ?? 'fire_1').name} ${sq(before.board.units.find(u=>u.id===a.unitId)?.position ?? {x:0,y:0})}->${sq(a.to)}`
    : a.type === 'ATTACK' ? `ATK ->${sq(a.targetPosition)}`
    : a.type === 'PROMOTE_UNIT' ? `PROMOTE ${a.unitId}` : a.type);
  row.lastIncome = state.lastIncome ? { player: state.lastIncome.player, turn: state.lastIncome.turnNumber, total: state.lastIncome.total } : null;
  row.lastUpkeep = state.lastUpkeep ? { player: state.lastUpkeep.player, turn: state.lastUpkeep.turnNumber, paid: state.lastUpkeep.paid, released: state.lastUpkeep.released.length } : null;
  rows.push(row);
}
const expected = match.finalState as any;
const same = JSON.stringify(state) === JSON.stringify(expected);
console.log(JSON.stringify({ replayMatchesArchivedFinalState: same,
  finalPhase: state.phase, winner: (state as any).winner, reason: (state as any).victoryReason }, null, 1));
if (!same) {
  const a = JSON.stringify(state), b = JSON.stringify(expected);
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  console.log('FIRST DIVERGENCE at char', i, '\n  got:', a.slice(Math.max(0,i-120), i+160), '\n  exp:', b.slice(Math.max(0,i-120), i+160));
}
for (const r of rows) console.log(JSON.stringify(r));
